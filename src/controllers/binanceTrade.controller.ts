// src/controllers/binanceTrade.controller.ts
import SpotOrder, { SpotOrderType, SpotSide } from "@/models/SpotOrder.model";
import SpotWallet from "@/models/SpotWallet.model";
import TradingPair from "@/models/TradingPair.model"; // ✅ NEW
import { User } from "@/models/user.model";
import { getTradeTopOfBook } from "@/services/tradeQuote.service";

import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import TransactionManager from "@/utils/TransactionManager";

const FEE_RATE = 0.00075; // 0.075% (qty * rate) => feeBase

interface PlaceSpotOrderBody {
  symbol: string; // "BTCUSDT"
  side: SpotSide; // "buy" | "sell"
  orderType: SpotOrderType; // "market" | "limit"
  quantity: number; // base asset amount
  price?: number;
  maxSlippageBps?: number;
}

const round = (v: number, d = 8) => +v.toFixed(d);

/* ────────── POST /binance-trade/order ────────── */
export const placeSpotOrder: typeHandler = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const {
    symbol,
    side,
    orderType,
    quantity,
    price: clientPrice,
    maxSlippageBps = 50,
  } = req.body as PlaceSpotOrderBody;

  if (!symbol || !side || !orderType || !quantity) {
    throw new ApiError(400, "Missing required fields");
  }

  if (!["buy", "sell"].includes(side)) throw new ApiError(400, "Invalid side");
  if (!["market", "limit"].includes(orderType))
    throw new ApiError(400, "Invalid order type");

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError(400, "Invalid quantity");
  }

  const normalizedSymbol = String(symbol).toUpperCase().trim();
  if (!normalizedSymbol.endsWith("USDT")) {
    throw new ApiError(400, "Only *USDT pairs are supported");
  }

  // ✅ TradingPair থেকে validate + icon/base/quote নাও
  const pair = await TradingPair.findOne({
    symbol: normalizedSymbol,
    enabled: true,
  }).lean();

  if (!pair) {
    throw new ApiError(400, "Trading pair not supported or disabled");
  }

  const baseAsset = String(
    pair.baseAsset || normalizedSymbol.replace("USDT", "")
  ).toUpperCase();
  const quoteAsset = String(pair.quoteAsset || "USDT").toUpperCase();
  const iconUrl: string | undefined = pair.iconUrl || undefined;

  // Binance থেকে লাইভ bid/ask
  const { bid, ask } = await getTradeTopOfBook(normalizedSymbol);

  const serverPrice = side === "buy" ? ask : bid;

  if (!serverPrice || !Number.isFinite(serverPrice)) {
    throw new ApiError(500, "Price unavailable");
  }

  let priceToUse = serverPrice;
  console.log("priceToUse", priceToUse);
  console.log("clientPrice", clientPrice);
  console.log("orderType", req.body);

  // limit হলে client price ইউজ
  if (orderType === "limit") {
    if (clientPrice == null)
      throw new ApiError(400, "Limit order requires price");
    const p = Number(clientPrice);
    if (!Number.isFinite(p) || p <= 0) throw new ApiError(400, "Invalid price");
    priceToUse = p;
  }

  const price = round(priceToUse, 8);
  const notional = round(price * qty, 8); // USDT
  const feeBase = round(qty * FEE_RATE, 8); // base asset fee (আগের মতোই)

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const txManager = new TransactionManager();

  if (side === "buy") {
    // ⚠️ NOTE: feeBase base-asset এ, কিন্তু totalCost-এ add করা আছে (তোমার আগের মতোই রেখে দিলাম)
    const totalCost = notional + feeBase;

    if (user.m_balance < totalCost) {
      throw new ApiError(400, "Insufficient USDT balance");
    }

    // ✅ 1) ইউজারের ব্যালেন্স ডেবিট
    user.last_m_balance = user.m_balance;
    user.m_balance = Math.max(0, user.m_balance - totalCost);
    await user.save();

    // ✅ 2) ট্রান্সঅ্যাকশন লগ
    await txManager.createTransaction({
      userId: user._id as string,
      customerId: user.customerId,
      transactionType: "cashOut",
      amount: totalCost,
      purpose: "Buy Spot Wallet",
      description: `Spot BUY ${qty} ${baseAsset} @ ${price} ${quoteAsset}`,
    });

    // ✅ 3) Spot wallet আপডেট
    let wallet = await SpotWallet.findOne({ userId, symbol: normalizedSymbol });

    if (!wallet) {
      wallet = await SpotWallet.create({
        userId,
        customerId: user.customerId,
        asset: baseAsset,
        symbol: normalizedSymbol,
        qty,
        avgPrice: price,
        iconUrl, // ✅ TradingPair থেকে
      });
    } else {
      const totalQty = wallet.qty + qty;
      const newAvg =
        totalQty <= 0
          ? price
          : (wallet.qty * wallet.avgPrice + qty * price) / totalQty;

      wallet.qty = round(totalQty);
      wallet.avgPrice = round(newAvg);

      // ✅ wallet icon যদি নাই থাকে তাহলে set করো
      if (!wallet.iconUrl && iconUrl) wallet.iconUrl = iconUrl;

      await wallet.save();
    }
  } else {
    // SELL
    const wallet = await SpotWallet.findOne({
      userId,
      symbol: normalizedSymbol,
    });

    if (!wallet || wallet.qty < qty) {
      throw new ApiError(400, `Not enough ${baseAsset} to sell`);
    }

    // ✅ 1) spot wallet থেকে কয়েন কমাও
    wallet.qty = round(wallet.qty - qty);
    await wallet.save();

    // ✅ 2) বিক্রির টাকা user.m_balance এ ক্রেডিট
    const receiveAmount = notional; // আগের মতোই
    user.last_m_balance = user.m_balance;
    user.m_balance = user.m_balance + receiveAmount;
    await user.save();

    // ✅ 3) ট্রান্সঅ্যাকশন লগ
    await txManager.createTransaction({
      userId: user._id as string,
      customerId: user.customerId,
      transactionType: "cashIn",
      amount: receiveAmount,
      purpose: "Sell Spot Wallet",
      description: `Spot SELL ${qty} ${baseAsset} @ ${price} ${quoteAsset}`,
    });
  }

  const order = await SpotOrder.create({
    userId,
    customerId: user.customerId,
    symbol: normalizedSymbol,
    side,
    type: orderType,
    price,
    quantity: qty,
    notional,
    fee: feeBase,
    status: "filled",
    filledAt: new Date(),
    iconUrl, // ✅ TradingPair থেকে
  });

  return res.status(201).json({ success: true, order });
});

/* ────────── GET /binance-trade/balances ────────── */
export const getSpotBalances: typeHandler = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const wallets = await SpotWallet.find({ userId }).sort({ asset: 1 });
  res.status(200).json({ success: true, items: wallets });
});

/* ────────── GET /binance-trade/orders ────────── */
export const getSpotOrders: typeHandler = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const orders = await SpotOrder.find({ userId })
    .sort({ createdAt: -1 })
    .limit(200);
  res.status(200).json({ success: true, items: orders });
});
