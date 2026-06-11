import SpotOrder from "@/models/SpotOrder.model";
import SpotWallet from "@/models/SpotWallet.model";
import StakingBonusLog from "@/models/StakingBonusLog.model";
import StakingProfitLog from "@/models/StakingProfitLog.model";
import StakingSubscription from "@/models/StakingSubscription.model";
import UserCoinSummary from "@/models/UserCoinSummary.model";
import { Types } from "mongoose";

export async function rebuildUserCoinSummaryForUserSymbol(
  userId: Types.ObjectId,
  symbol: string
): Promise<void> {
  const [stakingAgg, profitAgg, bonusAgg, orderAgg, wallet] = await Promise.all(
    [
      StakingSubscription.aggregate([
        { $match: { userId, symbol } },
        {
          $group: {
            _id: 1,
            customerId: { $first: "$customerId" },
            asset: { $first: "$asset" },
            iconUrl: { $first: "$iconUrl" },
            totalSubscribedQty: { $sum: "$principalQty" },
          },
        },
      ]),
      StakingProfitLog.aggregate([
        { $match: { userId, symbol } },
        {
          $group: {
            _id: 1,
            totalProfitQty: { $sum: "$profitQty" },
          },
        },
      ]),
      StakingBonusLog.aggregate([
        { $match: { toUserId: userId, symbol } },
        {
          $group: {
            _id: 1,
            totalBonusQty: { $sum: "$bonusQty" },
          },
        },
      ]),
      SpotOrder.aggregate([
        { $match: { userId, symbol, status: "filled" } },
        {
          $group: {
            _id: "$side",
            qty: { $sum: "$quantity" },
            notional: { $sum: "$notional" },
            fee: { $sum: "$fee" },
          },
        },
      ]),
      SpotWallet.findOne({ userId, symbol }).select("realizedPnl"),
    ]
  );

  const s = stakingAgg?.[0];
  const p = profitAgg?.[0];
  const b = bonusAgg?.[0];

  let buyQty = 0,
    buyNotional = 0,
    sellQty = 0,
    sellNotional = 0,
    fee = 0;

  for (const row of orderAgg || []) {
    if (row._id === "buy") {
      buyQty = row.qty || 0;
      buyNotional = row.notional || 0;
      fee += row.fee || 0;
    } else if (row._id === "sell") {
      sellQty = row.qty || 0;
      sellNotional = row.notional || 0;
      fee += row.fee || 0;
    }
  }

  const asset = s?.asset ?? symbol.replace("USDT", "");
  const now = new Date();

  await UserCoinSummary.updateOne(
    { userId, symbol },
    {
      $setOnInsert: { userId, symbol },
      $set: {
        customerId: s?.customerId,
        asset,
        iconUrl: s?.iconUrl,

        totalSubscribedQty: s?.totalSubscribedQty ?? 0,
        totalProfitQty: p?.totalProfitQty ?? 0,
        totalBonusQty: b?.totalBonusQty ?? 0,

        totalBuyQty: buyQty,
        totalBuyNotional: buyNotional,
        totalSellQty: sellQty,
        totalSellNotional: sellNotional,
        totalFee: fee,

        simplePnlNotional: (sellNotional || 0) - (buyNotional || 0),
        realizedPnl: (wallet as any)?.realizedPnl ?? 0,

        reconciledAt: now,
      },
    },
    { upsert: true }
  );
}
