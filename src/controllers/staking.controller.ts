import { getStakingSettings, publicStakingSettings } from "@/models/StakingSetting.model";
import { cancellationAmounts } from "@/utils/stakingPolicy";
// src/controllers/staking.controller.ts
import SpotWallet from "@/models/SpotWallet.model";
import StakingPlan from "@/models/StakingPlan.model";
import StakingProfitLog from "@/models/StakingProfitLog.model";
import StakingSubscription from "@/models/StakingSubscription.model";
import StakingSummary from "@/models/StakingSummary.model";
import Transaction, {
  TransactionPurpose,
  TransactionType,
} from "@/models/Transaction.model";
import { User } from "@/models/user.model";
import { rebuildStakingSummaryForUserSymbol } from "@/services/stakingSummary.service";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { Types } from "mongoose";

const round8 = (v: number) => +Number(v).toFixed(8);

const genUniqueId10 = () =>
  (Math.floor(Math.random() * 9000000000) + 1000000000).toString();

async function createMainBalanceTransaction(opts: {
  userId: Types.ObjectId;
  customerId?: string;
  transactionType: TransactionType;
  amount: number;
  purpose: TransactionPurpose;
  description: string;
}) {
  const u = await User.findById(opts.userId).select("m_balance");
  if (!u) return;

  const current = round8(Number((u as any).m_balance ?? 0));
  const amount = round8(Number(opts.amount));
  const previous =
    opts.transactionType === "cashIn"
      ? round8(current - amount)
      : round8(current + amount);

  await Transaction.create({
    userId: opts.userId,
    customerId: opts.customerId,
    unique_id: genUniqueId10(),
    amount,
    transactionType: opts.transactionType,
    purpose: opts.purpose,
    description: opts.description,
    isCashIn: opts.transactionType === "cashIn",
    isCashOut: opts.transactionType === "cashOut",
    previous_m_balance: previous,
    current_m_balance: current,
  });
}

const dayKey = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getNiceMongoError = (e: any) => {
  if (e?.name === "ValidationError" && e?.errors) {
    return Object.values(e.errors)
      .map((x: any) => x?.message)
      .filter(Boolean)
      .join(", ");
  }
  if (e?.code === 11000) return "Duplicate entry (unique constraint).";
  return e?.message || "Unknown error";
};

const toObjectId = (v: unknown) => {
  const s = String(v ?? "");
  if (!Types.ObjectId.isValid(s)) throw new ApiError(400, "Invalid user id");
  return new Types.ObjectId(s);
};

// ✅ GET /staking/plans
export const getStakingPlans = catchAsync(async (_req, res) => {
  const plans = await StakingPlan.find({ isActive: true }).sort({
    termDays: 1,
  });
  res.status(200).json({ success: true, items: plans, settings: publicStakingSettings(await getStakingSettings()) });
});

// ✅ POST /staking/subscribe
export const subscribeStaking = catchAsync(async (req, res, next) => {
  const settings = await getStakingSettings();
  if (!settings.stakingEnabled) return next(new ApiError(400, "Staking is currently paused"));
  const rawUserId = req.user?._id;
  const customerId = req.user?.customerId;

  if (!rawUserId) return next(new ApiError(401, "User not authenticated"));

  const userId = Types.ObjectId.isValid(String(rawUserId))
    ? new Types.ObjectId(String(rawUserId))
    : null;

  if (!userId) return next(new ApiError(400, "Invalid user id"));

  let { symbol, amount, termDays, iconUrl } = req.body as {
    symbol: string;
    amount: number;
    termDays: number;
    iconUrl?: string;
  };

  const rawSym = String(symbol || "")
    .toUpperCase()
    .trim();
  if (!rawSym) return next(new ApiError(400, "symbol is required"));

  const isUSDT = rawSym === "USDT" || rawSym === "USDTUSDT";
  symbol = isUSDT ? "USDT" : rawSym.endsWith("USDT") ? rawSym : `${rawSym}USDT`;

  const qty = Number(amount);
  const days = Number(termDays);

  if (!Number.isFinite(qty) || qty <= 0)
    return next(new ApiError(400, "Invalid amount"));
  if (!Number.isFinite(days) || days <= 0)
    return next(new ApiError(400, "Invalid termDays"));

  const plan = await StakingPlan.findOne({ termDays: days, isActive: true });
  if (!plan) return next(new ApiError(400, "Invalid plan"));

  const minAmount = plan.minAmount ?? 1;
  if (qty < minAmount)
    return next(new ApiError(400, `Minimum amount is ${minAmount}`));

  const asset = isUSDT ? "USDT" : symbol.replace("USDT", "");

  // ✅ atomic debit (USDT => main balance, others => SpotWallet)
  let debitedWallet: any = null;
  if (isUSDT) {
    const debitedUser = await User.findOneAndUpdate(
      { _id: userId, m_balance: { $gte: qty } },
      { $inc: { m_balance: -qty } },
      { new: true }
    ).select("_id");

    if (!debitedUser)
      return next(new ApiError(400, "Insufficient main balance"));
  } else {
    debitedWallet = await SpotWallet.findOneAndUpdate(
      { userId, symbol, qty: { $gte: qty } },
      { $inc: { qty: -qty } },
      { new: true }
    );
    if (!debitedWallet)
      return next(new ApiError(400, "Insufficient spot balance"));
  }

  const startedAt = new Date();
  const endAt = new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000);

  // ✅ dailyPercent fallback = totalProfitPercent / termDays
  const totalProfitPercent = Number((plan as any).totalProfitPercent);
  const dailyProfitPercent = Number(
    (plan as any).dailyProfitPercent ?? totalProfitPercent / days
  );

  if (!Number.isFinite(dailyProfitPercent) || dailyProfitPercent < 0) {
    if (isUSDT) {
      await User.updateOne({ _id: userId }, { $inc: { m_balance: +qty } });
    } else {
      await SpotWallet.updateOne({ userId, symbol }, { $inc: { qty: +qty } });
    }
    return next(new ApiError(400, "Plan dailyProfitPercent is invalid"));
  }

  let sub: any = null;

  try {
    sub = await StakingSubscription.create({
      userId,
      customerId,
      asset,
      symbol,
      iconUrl: iconUrl || (debitedWallet as any)?.iconUrl,

      principalQty: round8(qty),
      termDays: days,

      dailyProfitPercent,
      totalProfitPercent,
      userSharePercent: plan.userSharePercent,
      profitTimezone: "Asia/Dhaka",

      paidDays: 0,
      totalProfitQty: 0,
      status: "active",

      startedAt,
      endAt,

      lastPaidDayKey: undefined,
      principalReturnLocked: false,
      principalReturned: false,

      cancelLocked: false,
    });

    await rebuildStakingSummaryForUserSymbol(userId, symbol);

    // ✅ USDT stake => write main-balance cashOut transaction
    if (isUSDT) {
      await createMainBalanceTransaction({
        userId,
        customerId,
        transactionType: "cashOut",
        amount: round8(qty),
        purpose: "Subscribe",
        description: `Staking subscribe: ${round8(qty)} USDT for ${days} days`,
      });
    }

    return res.status(201).json({ success: true, subscription: sub });
  } catch (e: any) {
    // if we created a subscription but later failed (e.g. tx), revert it
    if (sub?._id) {
      await StakingSubscription.deleteOne({ _id: sub._id }).catch(() => {});
    }
    if (isUSDT) {
      await User.updateOne({ _id: userId }, { $inc: { m_balance: +qty } });
    } else {
      await SpotWallet.updateOne({ userId, symbol }, { $inc: { qty: +qty } });
    }
    console.error("❌ subscribeStaking failed:", e);
    return next(
      new ApiError(500, `Subscription failed: ${getNiceMongoError(e)}`)
    );
  }
});

// ✅ GET /staking/me
export const getMySubscriptions = catchAsync(async (req, res, next) => {
  if (!req.user?._id) return next(new ApiError(401, "User not authenticated"));
  const userId = toObjectId(req.user._id);

  const items = await StakingSubscription.find({ userId }).sort({
    createdAt: -1,
  });
  res.status(200).json({ success: true, items });
});

// ✅ GET /staking/summary
export const getMyStakingSummary = catchAsync(async (req, res, next) => {
  if (!req.user?._id) return next(new ApiError(401, "User not authenticated"));
  const userId = toObjectId(req.user._id);

  const items = await StakingSummary.find({ userId }).sort({ updatedAt: -1 });
  res.status(200).json({ success: true, items });
});

// ✅ GET /staking/subscriptions/:id (details)
export const getMySubscriptionById = catchAsync(async (req, res, next) => {
  if (!req.user?._id) return next(new ApiError(401, "User not authenticated"));
  const userId = toObjectId(req.user._id);

  const id = String(req.params.id || "");
  if (!Types.ObjectId.isValid(id)) return next(new ApiError(400, "Invalid id"));

  const item = await StakingSubscription.findOne({ _id: id, userId });
  if (!item) return next(new ApiError(404, "Not found"));

  res.json({ success: true, item });
});

// ✅ GET /staking/subscriptions/:id/logs?limit=50
export const getMySubscriptionLogs = catchAsync(async (req, res, next) => {
  if (!req.user?._id) return next(new ApiError(401, "User not authenticated"));
  const userId = toObjectId(req.user._id);

  const id = String(req.params.id || "");
  if (!Types.ObjectId.isValid(id)) return next(new ApiError(400, "Invalid id"));

  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);

  const sub = await StakingSubscription.findOne({ _id: id, userId }).select(
    "_id"
  );
  if (!sub) return next(new ApiError(404, "Not found"));

  const items = await StakingProfitLog.find({ subscriptionId: id, userId })
    .sort({ dayKey: -1, createdAt: -1 })
    .limit(limit);

  res.json({ success: true, items });
});

// ✅ POST /staking/subscriptions/:id/cancel
export const cancelMySubscription = catchAsync(async (req, res, next) => {
  if (!req.user?._id) return next(new ApiError(401, "User not authenticated"));
  const userId = toObjectId(req.user._id);

  const id = String(req.params.id || "");
  if (!Types.ObjectId.isValid(id)) return next(new ApiError(400, "Invalid id"));
  // console.log("cancelMySubscription", id);

  const settings = await getStakingSettings();

  // ✅ lock to prevent double cancel
  const sub = await StakingSubscription.findOneAndUpdate(
    { _id: id, userId, status: "active", principalReturnLocked: { $ne: true }, cancelLocked: { $ne: true } },
    { $set: { cancelLocked: true, cancelLockedAt: new Date() } },
    { new: true }
  );

  if (!sub)
    return next(new ApiError(400, "Subscription not found or not active"));

  const baseDaily = 0;
  const paidDays = Number(sub.paidDays || 0);
  const fixedDaily = Number(sub.dailyProfitPercent || 0);
  const penaltyPercent = settings.cancellationFeePercent;
  const principalQty = Number(sub.principalQty || 0);
  const { penaltyQty, returnQty } = cancellationAmounts(principalQty, penaltyPercent);

  // console.log({
  //   principalQty: principalQty,
  //   fixedDaily: fixedDaily,
  //   baseDaily: baseDaily,
  //   paidDays: paidDays,
  //   penaltyPercent: penaltyPercent,
  //   penaltyQty: penaltyQty,
  //   returnQty: returnQty,
  // });

  const today = dayKey(new Date());

  const isUSDT = String(sub.symbol || "").toUpperCase() === "USDT";

  // ✅ credit principal return (USDT => main balance, others => SpotWallet)
  if (isUSDT) {
    await User.updateOne(
      { _id: sub.userId },
      { $inc: { m_balance: +returnQty } }
    );

    // ✅ cashIn transaction for refund
    await createMainBalanceTransaction({
      userId: sub.userId,
      customerId: sub.customerId,
      transactionType: "cashIn",
      amount: returnQty,
      purpose: "Unsubscribe",
      description: `Staking cancel refund: ${returnQty} USDT (after penalty)`,
    }).catch((e) => {
      console.error(
        "❌ staking cancel transaction failed:",
        (e as any)?.message || e
      );
    });
  } else {
    await SpotWallet.findOneAndUpdate(
      { userId: sub.userId, symbol: sub.symbol },
      {
        $setOnInsert: {
          userId: sub.userId,
          customerId: sub.customerId,
          asset: sub.asset,
          symbol: sub.symbol,
          avgPrice: 0,
        },
        $inc: { qty: +returnQty },
      },
      { upsert: true }
    );
  }

  // ✅ mark cancelled + prevent cron principal return
  await StakingSubscription.updateOne(
    { _id: sub._id, status: "active", cancelLocked: true },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),

        principalReturned: true,
        principalReturnedAt: new Date(),

        cancelBaseDailyPercent: baseDaily,
        cancelPenaltyPercent: penaltyPercent,
        cancelPenaltyQty: penaltyQty,
        principalReturnQty: returnQty,
      },
    }
  );

  // ✅ cancel history log
  await StakingProfitLog.create({
    type: "cancel",
    subscriptionId: sub._id,
    userId: sub.userId,
    asset: sub.asset,
    symbol: sub.symbol,
    dayKey: today,

    principalQty,
    paidDays,

    fixedDailyPercent: fixedDaily,
    baseDailyPercent: baseDaily,
    penaltyPercent,
    penaltyQty,
    principalReturnQty: returnQty,

    note: "Cancelled by user (principal returned minus penalty)",
  }).catch(() => {});

  await rebuildStakingSummaryForUserSymbol(sub.userId, sub.symbol);

  res.json({
    success: true,
    result: {
      subscriptionId: sub._id,
      symbol: sub.symbol,
      paidDays,
      fixedDaily,
      baseDaily,
      penaltyPercent: +penaltyPercent.toFixed(8),
      penaltyQty,
      principalReturnQty: returnQty,
    },
  });
});
