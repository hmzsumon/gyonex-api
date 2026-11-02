import mongoose, { ClientSession } from "mongoose";
import AiAccount from "@/models/AiAccount.model";
import AiPosition from "@/models/AiPosition.model";
import { User } from "@/models/user.model";
import { cancellationDeadline, money, smartTradeCap } from "@/utils/smartTradePolicy";

// Older accounts have no counter. Reconstruct only their own closed, winning
// trades, using the actual credit where recorded and the historical 60% split.
export async function syncSmartAccount(account: any, session?: ClientSession) {
  if (account.role === "admin") return account;
  if (account.earnedProfit == null) {
    const totals = await AiPosition.aggregate([
      { $match: { accountId: new mongoose.Types.ObjectId(String(account._id)), status: "closed", is_loss: { $ne: true } } },
      { $group: { _id: null, earned: { $sum: { $ifNull: ["$userProfitCredited", { $round: [{ $multiply: [{ $max: [0, { $ifNull: ["$takeProfit", 0] }] }, 0.6] }, 2] }] } } } },
    ]).session(session ?? null);
    const earnedProfit = money(Number(totals[0]?.earned || 0));
    await AiAccount.updateOne({ _id: account._id, earnedProfit: { $exists: false } }, { $set: { earnedProfit } }, { session });
    account.earnedProfit = earnedProfit;
  }
  if (account.status === "active" && account.earnedProfit >= smartTradeCap(Number(account.planPrice))) {
    await AiAccount.updateOne({ _id: account._id, status: "active" }, {
      $set: { status: "expired", is_active: false, expiredAt: new Date() },
    }, { session });
    account.status = "expired";
    account.is_active = false;
  }
  return account;
}

export async function hasEligibleSmartAccount(userId: any, session?: ClientSession) {
  const accounts = await AiAccount.find({ userId, role: "user", status: "active", is_active: { $ne: false } }).session(session ?? null).lean();
  for (const account of accounts) {
    const synced = await syncSmartAccount(account, session);
    if (synced.status === "active" && Number(synced.planPrice) > 0) return true;
  }
  return false;
}

export async function refreshSmartEligibility(userId: any, session?: ClientSession) {
  const eligible = await hasEligibleSmartAccount(userId, session);
  await User.updateOne({ _id: userId }, { $set: { is_active_aiTrade: eligible } }, { session });
  return eligible;
}

export function smartAccountView(account: any, feePercent: number, now = new Date()) {
  const principal = Number(account.planPrice || 0);
  const profitCap = smartTradeCap(principal);
  const earnedProfit = Number(account.earnedProfit || 0);
  const cancelUntil = account.createdAt ? cancellationDeadline(new Date(account.createdAt)) : null;
  return {
    ...account,
    earnedProfit,
    profitCap,
    profitMultiplier: principal <= 10000 ? 2.5 : 3.5,
    profitProgress: profitCap > 0 ? Math.min(100, money(earnedProfit / profitCap * 100)) : 0,
    cancellationFeePercent: feePercent,
    cancelUntil,
    canCancel: account.role !== "admin" && account.status === "active" && account.is_active !== false && earnedProfit < profitCap && !!cancelUntil && now < cancelUntil,
  };
}
