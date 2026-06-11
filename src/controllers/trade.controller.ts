/* ────────────────────────────────────────────────────────────
   Market/Demo trade controller
   - Place market order (server price)
   - Close position (server price)
   - List positions (uniform shape)
──────────────────────────────────────────────────────────── */
import Account from "@/models/Account.model";
import Position from "@/models/position.model";
import { getTopOfBook } from "@/services/quote.service";
import { getContractSpec, isValidLot } from "@/services/specs.service";
import { closePositionCore } from "@/services/trade.service";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import mongoose from "mongoose";

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/* util */

const normalizeSymbol = (sym: string) => {
  let s = sym.trim().toUpperCase().replace("/", "");
  if (s.endsWith("USD")) s = s.replace("USD", "USDT"); // UI BTC/USD -> BTCUSDT
  return s;
};

// ---- helpers
const round = (n: number, d = 2) =>
  Number.isFinite(n) ? Number(n.toFixed(d)) : n;

const tickFromDigits = (d: number) => Number((1 / 10 ** d).toFixed(d));
const roundToTick = (n: number, t: number) => Math.round(n / t) * t;

/* types */
type PlaceOrderBody = {
  accountId: string;
  symbol: string; // UI or raw
  side: "buy" | "sell";
  lots: number;
  price: number; // optional client hint
  maxSlippageBps?: number; // optional, e.g. 20 = 0.20%
};

/* ── Place market order ───────────────────────────── */
export const placeMarketOrder: typeHandler = catchAsync(async (req, res) => {
  const userId = (req as any).user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const {
    accountId,
    symbol: uiSymbol,
    side,
    lots,
    price,
    maxSlippageBps,
  } = (req.body || {}) as PlaceOrderBody;

  if (!accountId || !uiSymbol || !side || !lots)
    throw new ApiError(400, "Missing required fields");
  if (side !== "buy" && side !== "sell")
    throw new ApiError(400, "Invalid side");
  if (!(typeof lots === "number" && lots > 0))
    throw new ApiError(400, "Invalid lot size");

  // ---- ownership + active
  const acc = await Account.findOne({ _id: accountId, userId });
  if (!acc) throw new ApiError(404, "Account not found");
  if (acc.status !== "active") throw new ApiError(400, "Account not active");

  // ---- normalize + spec + lot validation
  const symbol = normalizeSymbol(uiSymbol);
  const spec = getContractSpec(symbol); // crypto => contractSize=1
  if (!isValidLot(lots, spec.minLot, spec.stepLot, spec.maxLot))
    throw new ApiError(400, "Invalid lot size");

  // ---- server quote (for sanity guard only)
  const q = await getTopOfBook(symbol);
  const qSide = side === "buy" ? q.ask : q.bid;
  if (!Number.isFinite(qSide) || qSide <= 0)
    throw new ApiError(503, "Price unavailable");

  // ---- client price => authoritative entry (rounded to tick)
  if (!Number.isFinite(price) || price <= 0)
    throw new ApiError(400, "Invalid client price");
  const tick = tickFromDigits(spec.digits);
  const entryPrice = roundToTick(price, tick);

  // ---- drift/tolerance vs server quote (rounded entry used)
  const tolBps = Number(process.env.UI_PRICE_TOL_BPS ?? 50); // e.g. 0.50%
  const drift = Math.abs(entryPrice - qSide) / qSide;

  console.log("[order] symbol", symbol, "side", side);
  console.log("[order] client price", price, "entryPrice", entryPrice);
  console.log("[order] quote", q);
  console.log("[order] qSide", qSide, "tolBps", tolBps, "drift", drift);

  if (drift > tolBps / 10_000)
    throw new ApiError(400, "Client price out of range");

  // ---- optional extra slippage guard (redundant but ok)
  if (maxSlippageBps && maxSlippageBps > 0) {
    const diff = Math.abs(qSide - entryPrice) / entryPrice;
    const max = maxSlippageBps / 10_000;
    if (diff > max)
      throw new ApiError(400, "Price changed (slippage exceeded)");
  }

  // ---- margin/commission (✅ entryPrice-based)
  const leverage = Math.max(1, acc.leverage || 1);
  const notional = entryPrice * spec.contractSize * lots;
  const margin = notional / leverage;
  const commissionOpen = spec.commissionPerLot * lots;

  const equity = acc.equity ?? acc.balance ?? 0;
  const marginUsed = acc.marginUsed ?? 0;
  const freeMargin = equity - marginUsed;
  if (freeMargin < margin + commissionOpen)
    throw new ApiError(400, "Insufficient margin");

  // ---- create position
  const pos = await Position.create({
    accountId: acc._id,
    userId,
    customerId: (req as any).user?.customerId,
    symbol,
    side,
    lots,
    contractSize: spec.contractSize,
    entryPrice, // ✅ UI authoritative
    margin,
    commissionOpen,
    status: "open",
    openedAt: new Date(),
  });

  // ---- demo snapshot
  acc.marginUsed = round(marginUsed + margin, 2);
  acc.balance = round((acc.balance ?? 0) - commissionOpen, 2);
  acc.equity = acc.balance;
  await acc.save();

  // ---- response
  res.status(201).json({
    success: true,
    position: {
      _id: pos._id,
      accountId: pos.accountId,
      userId: pos.userId,
      customerId: pos.customerId,
      symbol: pos.symbol,
      side: pos.side,
      lots: pos.lots,
      contractSize: pos.contractSize,
      entryPrice: +pos.entryPrice.toFixed(spec.digits),
      margin: round(pos.margin, 2),
      openedAt: pos.openedAt,
      status: pos.status,
    },
    account: {
      balance: acc.balance,
      equity: acc.equity,
      marginUsed: acc.marginUsed,
      leverage: acc.leverage,
      currency: acc.currency,
    },
    quote: { bid: q.bid, ask: q.ask, ts: q.ts }, // telemetry
  });
});

/* ── Close position (DEMO, no transaction) ───────────────── */
export const closePosition2: typeHandler = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const { id } = req.params as { id: string };

  const pos = await Position.findById(id);
  if (!pos) throw new ApiError(404, "Position not found");
  if (pos.status !== "open") throw new ApiError(400, "Position already closed");

  const acc = await Account.findOne({ _id: pos.accountId, userId });
  if (!acc) throw new ApiError(403, "Not allowed");

  // normalize numbers
  const lots = Number(pos.lots);
  const entry = Number(pos.entryPrice);
  const csize = Number(pos.contractSize ?? 1);
  const usedBefore = Number(acc.marginUsed ?? 0);
  const posMargin = Number(pos.margin ?? 0);
  if (![lots, entry, csize].every(Number.isFinite)) {
    throw new ApiError(400, "Invalid position numbers");
  }

  // opposite-side close price
  const q = await getTopOfBook(String(pos.symbol));
  const closePx = pos.side === "buy" ? Number(q.bid) : Number(q.ask);
  if (!Number.isFinite(closePx) || closePx <= 0) {
    throw new ApiError(503, "Price unavailable");
  }

  // P/L
  const diff = pos.side === "buy" ? closePx - entry : entry - closePx;
  const gross = diff * csize * lots;
  const commissionClose = 0; // demo
  const net = round(gross - commissionClose, 2);

  // try to close position (idempotent)
  const now = new Date();
  const closed = await Position.findOneAndUpdate(
    { _id: pos._id, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt: now,
        closePrice: closePx,
        commissionClose,
        pnl: net,
      },
    },
    { new: true },
  );
  if (!closed) throw new ApiError(400, "Position already closed");

  // update account (no session; last-write-wins)
  const newMarginUsed = round(Math.max(0, usedBefore - posMargin), 2);
  const newBalance = round(Number(acc.balance ?? 0) + net, 2);
  const newEquity = newBalance; // demo: equity == balance (live equity shown on client)

  await Account.updateOne(
    { _id: acc._id, userId },
    {
      $set: {
        marginUsed: newMarginUsed,
        balance: newBalance,
        equity: newEquity,
      },
    },
  );

  const spec = getContractSpec(String(pos.symbol));

  res.json({
    success: true,
    position: {
      _id: closed._id,
      status: closed.status,
      closePrice: +closePx.toFixed(spec.digits),
      pnl: closed.pnl,
      closedAt: closed.closedAt,
    },
    account: {
      balance: newBalance,
      equity: newEquity,
      marginUsed: newMarginUsed,
    },
  });
});

/* ── Close position (uses service layer) ───────────────── */
export const closePosition: typeHandler = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  const { id } = req.params as { id: string };

  // ownership check: ensure the position belongs to this user
  const pos = await Position.findById(id);
  if (!pos) throw new ApiError(404, "Position not found");
  const acc = await Account.findById(pos.accountId);
  if (!acc || String(acc.userId) !== String(userId)) {
    throw new ApiError(403, "Not allowed");
  }

  const result = await closePositionCore(id);
  if (!result) {
    // already closed by race
    return res.json({
      success: true,
      position: { _id: id, status: "closed" },
      account: {
        balance: acc.balance,
        equity: acc.equity,
        marginUsed: acc.marginUsed,
      },
    });
  }

  // digits for UI presentation
  const spec = getContractSpec(String(pos.symbol));

  res.json({
    success: true,
    position: {
      _id: result.closed._id,
      status: result.closed.status,
      closePrice: +Number(result.closed.closePrice).toFixed(spec.digits),
      pnl: result.closed.pnl,
      closedAt: result.closed.closedAt,
    },
    account: result.account,
  });
});

/* ── List positions by accountId (uniform shape) ─────────── */
export const getPositions: typeHandler = catchAsync(async (req, res) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) {
    return res
      .status(400)
      .json({ success: false, message: "accountId is required" });
  }

  // lean + projection for performance
  const docs = await Position.find({ accountId })
    .sort({ createdAt: -1 })
    .select(
      "_id symbol side status lots entryPrice contractSize openedAt closedAt closePrice pnl",
    )
    .lean();

  type Item = {
    _id: string;
    symbol: string;
    side: "buy" | "sell";
    status: "open" | "closed";
    lots: number;
    entryPrice: number;
    contractSize: number;
    openedAt?: string | Date;
    closedAt?: string | Date;
    closePrice?: number;
    pnl?: number;
  };

  const items: Item[] = docs.map((p: any) => ({
    _id: String(p._id),
    symbol: String(p.symbol),
    side: p.side,
    status: p.status,
    lots: Number(p.lots ?? 0), // unified field name
    entryPrice: Number(p.entryPrice ?? 0),
    contractSize: Number(p.contractSize ?? 1), // crypto default = 1
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    closePrice: p.closePrice != null ? Number(p.closePrice) : undefined,
    pnl: p.pnl != null ? Number(p.pnl) : undefined,
  }));

  res.json({ success: true, items });
});

/* ── List closed positions by userId ─────────── */
export const getClosedPositions: typeHandler = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "User not authenticated");

  // lean + projection for performance
  const docs = await Position.find({ userId, status: "closed" })
    .sort({ createdAt: -1 })
    .lean();

  type Item = {
    _id: string;
    symbol: string;
    side: "buy" | "sell";
    status: "open" | "closed";
    lots: number;
    entryPrice: number;
    contractSize: number;
    openedAt?: string | Date;
    closedAt?: string | Date;
    closePrice?: number;
    pnl?: number;
  };

  const items: Item[] = docs.map((p: any) => ({
    _id: String(p._id),
    symbol: String(p.symbol),
    side: p.side,
    status: p.status,
    lots: Number(p.lots ?? 0), // unified field name
    entryPrice: Number(p.entryPrice ?? 0),
    contractSize: Number(p.contractSize ?? 1), // crypto default = 1
    openedAt: p.openedAt,
    closedAt: p.closedAt,
    closePrice: p.closePrice != null ? Number(p.closePrice) : undefined,
    pnl: p.pnl != null ? Number(p.pnl) : undefined,
  }));

  res.json({ success: true, items });
});

/* ── get single position by id ──────────────── */
export const getPositionById = catchAsync(async (req, res) => {
  const { id } = req.params as { id: string };
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid id");

  const p: any = await Position.findById(id).lean();
  if (!p) throw new ApiError(404, "Position not found");

  const item = {
    _id: String(p._id),
    symbol: String(p.symbol),
    side: p.side as "buy" | "sell",
    status: p.status as "open" | "closed",
    lots: num(p.lots ?? p.volume ?? 0),
    entryPrice: num(p.entryPrice ?? 0),
    closePrice: num(p.closePrice ?? 0),
    openedAt: p.openedAt ?? p.openAt ?? null,
    closedAt: p.closedAt ?? null,
    pnl: num(p.pnl ?? 0),
    commissionClose: num(p.commissionClose ?? 0),
    takeProfit: num(p.takeProfit),
    stopLoss: num(p.stopLoss),
  };

  res.json({ success: true, item });
});

/* ── get open positions by accountId and userId ──────────────── */
export const getOpenPositionsByAccountId = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  const accountId = String(req.query.accountId || "").trim();
  if (!userId)
    return res.status(401).json({ success: false, message: "Unauthorized" });
  if (!accountId) {
    return res
      .status(400)
      .json({ success: false, message: "accountId is required" });
  }

  const docs = await Position.find({ accountId, userId, status: "open" })
    .sort({ createdAt: -1 })
    .select("_id symbol side status lots entryPrice contractSize openedAt")
    .lean();

  const items = (docs ?? []).map((p: any) => ({
    _id: String(p._id),
    symbol: String(p.symbol),
    side: p.side as "buy" | "sell",
    status: p.status as "open" | "closed",
    lots: Number(p.lots ?? 0),
    entryPrice: Number(p.entryPrice ?? 0),
    contractSize: Number(p.contractSize ?? 1),
    openedAt: p.openedAt,
  }));

  res.json({ success: true, items });
});
