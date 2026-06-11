/* ────────── comments ────────── */
/* Service layer: derive progress from models and perform claim. */
/* ────────── comments ────────── */
import { RANKS } from "@/core/rankConfig";
import { Notification } from "@/models/Notification.model";
import { User } from "@/models/user.model";
import UserRankSummary from "@/models/UserRankSummary.model";
import UserTeamSummary from "@/models/UserTeamSummary.model";
import UserWallet from "@/models/UserWallet.model";

import { RankKey, RankSummaryItem, RankSummaryResponse } from "@/types/rank";
import TransactionManager from "@/utils/TransactionManager";
import { Types } from "mongoose";

function toTitle(k: string) {
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/* ────────── comments ────────── */
/* Business rules:
   - direct referrals = level_1.users.length
   - invested = totalTeamActiveDeposit
   Change here if you want thisMonthSales or other sources. */
/* ────────── comments ────────── */
export async function getRankSummary(
  userId: string
): Promise<RankSummaryResponse> {
  const uid = new Types.ObjectId(userId);

  const [team, wallet] = await Promise.all([
    UserTeamSummary.findOne({ userId: uid }).lean(),
    UserRankSummary.findOne({ userId: uid }).lean(),
  ]);

  if (!team) throw new Error("UserTeamSummary not found");

  const directRef = team.level_1?.activeUsers ?? 0;
  const invested = team.level_1?.aiTradeBalance ?? 0;

  const claimedMap = new Map(
    (wallet?.rankHistory ?? [])
      .filter((h) => h.approvedAt)
      .map((h) => [
        h.rank,
        { approvedAt: h.approvedAt, bonusAmount: h.bonusAmount },
      ])
  );

  const ranks: RankSummaryItem[] = RANKS.map((r) => {
    const directPct = Math.min(1, directRef / r.directRefTarget);
    const investPct = Math.min(1, invested / r.minInvestTarget);
    const overall = Math.round(((directPct + investPct) / 2) * 100);
    const qualified =
      directRef >= r.directRefTarget && invested >= r.minInvestTarget;

    const claimedInfo = claimedMap.get(r.key);
    const claimed = Boolean(claimedInfo);

    return {
      key: r.key,
      title: toTitle(r.key),
      directRefTarget: r.directRefTarget,
      minInvestTarget: r.minInvestTarget,
      rewardUsd: r.rewardUsd,
      progress: { directRef, invested, directPct, investPct, overall },
      qualified,
      claimed,
      achievedAt: qualified ? new Date().toISOString() : undefined,
      claimedAt: claimedInfo?.approvedAt?.toISOString(),
    };
  });

  return { overall: { directRef, invested }, ranks };
}

/* ────────── comments ────────── */
/* Idempotent claim: writes once; if already claimed, returns ok. */
/* ────────── comments ────────── */
export async function claimRankBonus(userId: string, key: RankKey) {
  /* ──────────  pre-check: qualified/claimed  ────────── */
  const summary = await getRankSummary(userId);
  const item = summary.ranks.find((r) => r.key === key);
  if (!item) throw new Error("Rank not found");
  if (!item.qualified) return { ok: false, message: "Not qualified" as const };
  if (item.claimed) return { ok: true, message: "Already claimed" as const };

  /* ──────────  constants  ────────── */
  const now = new Date();
  const uid = new Types.ObjectId(userId);
  const reward = item.rewardUsd;

  /* ──────────  write claim (idempotent)  ────────── */
  const rankDoc = await UserRankSummary.findOneAndUpdate(
    { userId: uid },
    {
      $setOnInsert: { userId: uid },
      $push: {
        rankHistory: {
          rank: key,
          updatedAt: now,
          approvedAt: now,
          bonusAmount: reward,
        },
      },
      $addToSet: { ranks: key },
      $set: { currentRank: key, currentRankBonus: reward, rankUpdatedAt: now },
      $inc: { monthlySalaryTotal: 0 },
    },
    { new: true, upsert: true }
  ).lean();

  /* ──────────  credit user m_balance  ────────── */
  const user = await User.findByIdAndUpdate(
    uid,
    {
      $inc: { m_balance: reward },
      $set: { rank: key },
    },
    { new: true }
  );
  if (!user) throw new Error("User not found while crediting");

  /* ──────────  ensure user wallet exists  ────────── */
  let userWallet = await UserWallet.findOne({ userId: uid });
  if (!userWallet) {
    userWallet = await UserWallet.create({
      userId: uid,
      customerId: user.customerId, // required by your schema
    });
  }

  /* ──────────  update earnings (total + rank)  ────────── */
  userWallet.totalEarning = (userWallet.totalEarning ?? 0) + reward;
  userWallet.rankEarning = (userWallet.rankEarning ?? 0) + reward;
  await userWallet.save();

  /* ──────────  transaction log  ────────── */
  const txManager = new TransactionManager();
  await txManager.createTransaction({
    userId: String(uid),
    customerId: user.customerId,
    transactionType: "cashIn",
    amount: reward,
    purpose: "Rank Reward",
    description: `Claimed ${key} rank reward of $${reward}`,
  });

  /* ──────────  user notification  ────────── */
  const notification = await Notification.create({
    user_id: uid,
    role: user.role,
    title: "Rank Reward Claimed",
    category: "rank",
    message: `You claimed ${key.toUpperCase()} reward: $${reward}`,
    url: `/rank-reward/${key}`,
  });

  /* ──────────  socket events (best-effort)  ────────── */
  if (global?.io?.to) {
    global.io.to(String(uid)).emit("notifications:new", notification);
    const unreadCount = await Notification.countDocuments({
      user_id: uid,
      is_read: false,
    });
    global.io
      .to(String(uid))
      .emit("notifications:count", { count: unreadCount });

    global.io.to(String(uid)).emit("user-notification", {
      success: true,
      message: "Rank reward credited",
      meta: { key, reward },
    });
    global.io.to(String(uid)).emit("wallet-update", {
      success: true,
      m_balance: user.m_balance,
      rankEarning: userWallet.rankEarning,
      totalEarning: userWallet.totalEarning,
    });
  }

  /* ──────────  done  ────────── */
  return { ok: true as const, rewardUsd: reward, wallet: rankDoc };
}
