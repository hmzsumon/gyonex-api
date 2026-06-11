// src/services/stakingSummary.service.ts
import StakingProfitLog from "@/models/StakingProfitLog.model";
import StakingSubscription from "@/models/StakingSubscription.model";
import StakingSummary from "@/models/StakingSummary.model";
import { Types } from "mongoose";

type Key = string;
const FAR_FUTURE = new Date("9999-12-31T00:00:00.000Z");

export async function rebuildAllStakingSummaries(): Promise<void> {
  const subsAgg = await StakingSubscription.aggregate([
    {
      $group: {
        _id: { userId: "$userId", symbol: "$symbol" },
        customerId: { $first: "$customerId" },
        asset: { $first: "$asset" },
        iconUrl: { $first: "$iconUrl" },

        activePrincipalQty: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, "$principalQty", 0] },
        },
        activeCount: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
        },

        totalSubscribedQty: { $sum: "$principalQty" },
        totalCompletedPrincipalQty: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, "$principalQty", 0],
          },
        },

        lastSubscribedAt: { $max: "$createdAt" },

        nextMaturityAtTmp: {
          $min: {
            $cond: [{ $eq: ["$status", "active"] }, "$endAt", FAR_FUTURE],
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        customerId: 1,
        asset: 1,
        iconUrl: 1,
        activePrincipalQty: 1,
        activeCount: 1,
        totalSubscribedQty: 1,
        totalCompletedPrincipalQty: 1,
        lastSubscribedAt: 1,
        nextMaturityAt: {
          $cond: [
            { $eq: ["$nextMaturityAtTmp", FAR_FUTURE] },
            null,
            "$nextMaturityAtTmp",
          ],
        },
      },
    },
  ]);

  const profitAgg = await StakingProfitLog.aggregate([
    {
      $group: {
        _id: { userId: "$userId", symbol: "$symbol" },
        totalProfitQty: { $sum: "$profitQty" },
        lastProfitAt: { $max: "$createdAt" },
      },
    },
  ]);

  const map = new Map<Key, any>();

  for (const s of subsAgg) {
    const userId = String(s._id.userId);
    const symbol = String(s._id.symbol);
    const k = `${userId}:${symbol}`;
    map.set(k, {
      userId: new Types.ObjectId(userId),
      symbol,
      customerId: s.customerId,
      asset: s.asset,
      iconUrl: s.iconUrl,

      activePrincipalQty: s.activePrincipalQty ?? 0,
      activeCount: s.activeCount ?? 0,
      totalSubscribedQty: s.totalSubscribedQty ?? 0,
      totalCompletedPrincipalQty: s.totalCompletedPrincipalQty ?? 0,

      totalProfitQty: 0,
      lastProfitAt: undefined,

      lastSubscribedAt: s.lastSubscribedAt,
      nextMaturityAt: s.nextMaturityAt,
    });
  }

  for (const p of profitAgg) {
    const userId = String(p._id.userId);
    const symbol = String(p._id.symbol);
    const k = `${userId}:${symbol}`;
    const existing = map.get(k);

    if (existing) {
      existing.totalProfitQty = p.totalProfitQty ?? 0;
      existing.lastProfitAt = p.lastProfitAt;
    } else {
      map.set(k, {
        userId: new Types.ObjectId(userId),
        symbol,
        asset: symbol.replace("USDT", ""),
        activePrincipalQty: 0,
        activeCount: 0,
        totalSubscribedQty: 0,
        totalCompletedPrincipalQty: 0,
        totalProfitQty: p.totalProfitQty ?? 0,
        lastProfitAt: p.lastProfitAt,
      });
    }
  }

  const now = new Date();

  const ops = Array.from(map.values()).map((row) => ({
    updateOne: {
      filter: { userId: row.userId, symbol: row.symbol },
      update: {
        // ✅ $setOnInsert এ asset আর দিব না
        $setOnInsert: { userId: row.userId, symbol: row.symbol },
        // ✅ asset এখানে থাকবে
        $set: {
          customerId: row.customerId,
          asset: row.asset,
          iconUrl: row.iconUrl,

          activePrincipalQty: row.activePrincipalQty,
          activeCount: row.activeCount,

          totalSubscribedQty: row.totalSubscribedQty,
          totalCompletedPrincipalQty: row.totalCompletedPrincipalQty,
          totalProfitQty: row.totalProfitQty,

          lastSubscribedAt: row.lastSubscribedAt,
          lastProfitAt: row.lastProfitAt,
          nextMaturityAt: row.nextMaturityAt,

          reconciledAt: now,
        },
      },
      upsert: true,
    },
  }));

  const batchSize = 500;
  for (let i = 0; i < ops.length; i += batchSize) {
    await StakingSummary.bulkWrite(ops.slice(i, i + batchSize), {
      ordered: false,
    });
  }
}

export async function rebuildStakingSummaryForUserSymbol(
  userId: Types.ObjectId,
  symbol: string
): Promise<void> {
  const [subs, profit] = await Promise.all([
    StakingSubscription.aggregate([
      { $match: { userId, symbol } },
      {
        $group: {
          _id: { userId: "$userId", symbol: "$symbol" },
          customerId: { $first: "$customerId" },
          asset: { $first: "$asset" },
          iconUrl: { $first: "$iconUrl" },

          activePrincipalQty: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, "$principalQty", 0],
            },
          },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },

          totalSubscribedQty: { $sum: "$principalQty" },
          totalCompletedPrincipalQty: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, "$principalQty", 0],
            },
          },

          lastSubscribedAt: { $max: "$createdAt" },

          nextMaturityAtTmp: {
            $min: {
              $cond: [{ $eq: ["$status", "active"] }, "$endAt", FAR_FUTURE],
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          customerId: 1,
          asset: 1,
          iconUrl: 1,
          activePrincipalQty: 1,
          activeCount: 1,
          totalSubscribedQty: 1,
          totalCompletedPrincipalQty: 1,
          lastSubscribedAt: 1,
          nextMaturityAt: {
            $cond: [
              { $eq: ["$nextMaturityAtTmp", FAR_FUTURE] },
              null,
              "$nextMaturityAtTmp",
            ],
          },
        },
      },
    ]),
    StakingProfitLog.aggregate([
      { $match: { userId, symbol } },
      {
        $group: {
          _id: 1,
          totalProfitQty: { $sum: "$profitQty" },
          lastProfitAt: { $max: "$createdAt" },
        },
      },
    ]),
  ]);

  const s = subs?.[0];
  const p = profit?.[0];
  const now = new Date();

  const asset = s?.asset ?? symbol.replace("USDT", "");

  await StakingSummary.updateOne(
    { userId, symbol },
    {
      // ✅ $setOnInsert এ asset দিব না
      $setOnInsert: { userId, symbol },
      // ✅ asset এখানে থাকবে
      $set: {
        customerId: s?.customerId,
        asset,
        iconUrl: s?.iconUrl,

        activePrincipalQty: s?.activePrincipalQty ?? 0,
        activeCount: s?.activeCount ?? 0,

        totalSubscribedQty: s?.totalSubscribedQty ?? 0,
        totalCompletedPrincipalQty: s?.totalCompletedPrincipalQty ?? 0,

        totalProfitQty: p?.totalProfitQty ?? 0,
        lastProfitAt: p?.lastProfitAt,

        lastSubscribedAt: s?.lastSubscribedAt,
        nextMaturityAt: s?.nextMaturityAt,

        reconciledAt: now,
      },
    },
    { upsert: true }
  );
}
