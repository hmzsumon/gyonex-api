import { getStakingSettings } from "@/models/StakingSetting.model";
import { isStakingProfitDay, stakingDayKey } from "@/utils/stakingPolicy";
import SpotWallet from "@/models/SpotWallet.model";
import StakingProfitLog from "@/models/StakingProfitLog.model";
import StakingSubscription from "@/models/StakingSubscription.model";
import Transaction, {
  TransactionPurpose,
  TransactionType,
} from "@/models/Transaction.model";
import { User } from "@/models/user.model";
import { rebuildStakingSummaryForUserSymbol } from "@/services/stakingSummary.service";
import { rebuildUserCoinSummaryForUserSymbol } from "@/services/userCoinSummary.service";
import { distributeStakingBonusAndSystemCut } from "@/utils/distributeStakingBonus";
import mongoose, { Types } from "mongoose";

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
  session?: mongoose.ClientSession;
}) {
  const q = User.findById(opts.userId).select("m_balance");
  if (opts.session) q.session(opts.session);
  const u = await q;
  if (!u) return;

  const current = round8(Number((u as any).m_balance ?? 0));
  const amount = round8(Number(opts.amount));
  const previous =
    opts.transactionType === "cashIn"
      ? round8(current - amount)
      : round8(current + amount);

  const doc = {
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
  };

  if (opts.session) {
    await Transaction.create([doc as any], { session: opts.session });
  } else {
    await Transaction.create(doc as any);
  }
}

const dayKey = stakingDayKey;

// Existing subscriptions must retain their original ledger keys to avoid
// paying the same calendar slot twice after introducing Dhaka scheduling.
const legacyDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

// ✅ termDays -> user share %
const USER_SHARE = new Map<number, number>([
  [1, 1.0],
  [7, 0.45],
  [15, 0.4636],
  [30, 0.4692],
  [90, 0.4929],
  [180, 0.4938],
  [360, 0.4944],
]);

function getUserShare(termDays: number) {
  return USER_SHARE.get(termDays) ?? 1.0;
}

function isTxnNotSupportedError(err: any) {
  const msg = String(err?.message || err || "");
  return (
    msg.includes("Transaction numbers are only allowed") ||
    msg.includes("replica set member") ||
    msg.includes("not supported") ||
    msg.includes("IllegalOperation")
  );
}

type RunProfitOptions = {
  runAt?: Date;
  dryRun?: boolean;
  limit?: number;
};

export async function runStakingProfitJob(opts: RunProfitOptions = {}) {
  const now = opts.runAt ?? new Date();
  const todayKey = dayKey(now);
  const settings = await getStakingSettings();
  const canPayToday = settings.profitEnabled && isStakingProfitDay(now, settings.policyHistory);
  const dryRun = !!opts.dryRun;
  const limit = opts.limit ?? 10000;

  const DEBUG =
    String(process.env.DEBUG_STAKING_PROFIT || "").toLowerCase() === "true";

  console.log("🟡 [staking-profit] running:", todayKey, "dryRun=", dryRun);

  const subs = await StakingSubscription.find({ status: "active", cancelLocked: { $ne: true } }).limit(
    limit
  );

  const touched = new Set<string>(); // userId:symbol (user + parents)

  let paidLogsCreated = 0;
  let totalUserProfitCredited = 0;
  let totalParentsBonusCredited = 0;
  let totalSystemCutAccrued = 0;
  let principalReturnedCount = 0;

  for (const sub of subs) {
    try {
      const startedAt = new Date(sub.startedAt);

      const daysPassed = Math.floor(
        (now.getTime() - startedAt.getTime()) / (24 * 60 * 60 * 1000)
      );

      // ✅ Day0 include (+1)
      const eligiblePayDays = Math.min(daysPassed + 1, sub.termDays);
      // Walk calendar days: paidDays counts payouts, not weekends or paused days.
      const dueDays = eligiblePayDays;

      // 1) profits (catch-up supported)
      if (canPayToday && dueDays > 0) {
        const paidLogs = await StakingProfitLog.find({ subscriptionId: sub._id, type: "profit" }).select("dayKey").lean();
        const paidKeys = new Set(paidLogs.map((log) => log.dayKey));
        for (let i = 0; i < dueDays; i++) {
          const payDayIndex = i; // ✅ can be 0
          const payDate = addDays(startedAt, payDayIndex);
          const payKey = sub.profitTimezone === "Asia/Dhaka" ? dayKey(payDate) : legacyDayKey(payDate);

          if (payKey > todayKey) break;
          if (!isStakingProfitDay(payDate, settings.policyHistory)) continue;
          if (paidKeys.has(payKey)) continue;

          const grossProfitQty = round8(
            Number(sub.principalQty) * (Number(sub.dailyProfitPercent) / 100)
          );
          if (grossProfitQty <= 0) continue;

          const userShare = sub.userSharePercent ?? getUserShare(Number(sub.termDays));
          const userProfitQty = round8(grossProfitQty * userShare);

          const remainderQty = round8(grossProfitQty - userProfitQty);
          const userSharePercent = round8(userShare * 100);

          if (DEBUG) {
            console.log(
              "🟡 [staking-profit] payDayIndex:",
              payDayIndex,
              "payKey:",
              payKey,
              "grossProfitQty:",
              grossProfitQty,
              "userProfitQty:",
              userProfitQty,
              "remainderQty:",
              remainderQty,
              "userSharePercent:",
              userSharePercent
            );
          }

          if (dryRun) {
            paidLogsCreated += 1;
            totalUserProfitCredited = round8(
              totalUserProfitCredited + userProfitQty
            );
            touched.add(`${sub.userId.toString()}:${sub.symbol}`);
            continue;
          }

          // ✅ 실행 함수 (transaction থাকুক/না থাকুক)
          const runOnce = async (session?: mongoose.ClientSession) => {
            // ✅ 1) profit log (idempotent marker)
            try {
              const doc = {
                type: "profit" as const,
                subscriptionId: sub._id,
                userId: sub.userId,
                asset: sub.asset,
                symbol: sub.symbol,
                dayKey: payKey,

                // ✅ net to user
                profitQty: userProfitQty,

                // ✅ bookkeeping
                grossProfitQty,
                userSharePercent,
                remainderQty,
                parentsBonusQty: 0,
                systemQty: 0,
              };

              if (session) {
                await StakingProfitLog.create([doc], { session });
              } else {
                await StakingProfitLog.create(doc);
              }
            } catch (e: any) {
              if (String(e?.code) === "11000") {
                // already paid this day
                return { skipped: true, parentsPaidTotal: 0, systemQty: 0 };
              }
              throw e;
            }

            // ✅ 2) credit user (USDT => main balance, others => SpotWallet)
            const isUSDT = String(sub.symbol || "").toUpperCase() === "USDT";
            if (userProfitQty > 0) {
              if (isUSDT) {
                await User.updateOne(
                  { _id: sub.userId },
                  { $inc: { m_balance: +userProfitQty } },
                  session ? { session } : undefined
                );

                await createMainBalanceTransaction({
                  userId: sub.userId,
                  customerId: sub.customerId,
                  transactionType: "cashIn",
                  amount: userProfitQty,
                  purpose: "Daily Profit",
                  description: `Staking profit: ${userProfitQty} USDT (${payKey})`,
                  session,
                }).catch((e) => {
                  console.error(
                    "❌ [staking-profit] transaction (profit) failed:",
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
                    $inc: { qty: +userProfitQty },
                  },
                  session ? { upsert: true, session } : { upsert: true }
                );
              }
            }

            // ✅ 3) distribute parents + system (from remainder)
            let parentsPaidTotal = 0;
            let systemQty = 0;
            let touchedParents: string[] = [];

            if (remainderQty > 0) {
              const out = await distributeStakingBonusAndSystemCut({
                subscriptionId: sub._id,
                fromUserId: sub.userId,
                symbol: sub.symbol,
                asset: sub.asset,
                dayKey: payKey,
                remainderQty,
                session,
              });

              systemQty = out.systemQty;
              parentsPaidTotal = out.parentsPaidTotal;
              touchedParents = out.touchedParents;

              for (const k of touchedParents) touched.add(k);
            }

            // ✅ 4) update profit log totals (filter must include type="profit")
            await StakingProfitLog.updateOne(
              { subscriptionId: sub._id, type: "profit", dayKey: payKey },
              { $set: { parentsBonusQty: parentsPaidTotal, systemQty } },
              session ? { session } : undefined
            );

            // ✅ 5) update subscription counters (net user profit)
            await StakingSubscription.updateOne(
              { _id: sub._id, status: "active" },
              {
                $inc: { paidDays: 1, totalProfitQty: +userProfitQty },
                $set: { lastPaidDayKey: payKey },
              },
              session ? { session } : undefined
            );

            return { skipped: false, parentsPaidTotal, systemQty };
          };

          // ✅ Try transaction; fallback if local mongo doesn't support transactions
          const session = await mongoose.startSession();
          try {
            let out: {
              skipped: boolean;
              parentsPaidTotal: number;
              systemQty: number;
            } | null = null;

            try {
              await session.withTransaction(async () => {
                out = await runOnce(session);
              });
            } catch (err: any) {
              if (isTxnNotSupportedError(err)) {
                // fallback without transaction
                out = await runOnce(undefined);
              } else {
                throw err;
              }
            }

            if (!out || out.skipped) continue;

            // ✅ counters after success
            paidLogsCreated += 1;
            totalUserProfitCredited = round8(
              totalUserProfitCredited + userProfitQty
            );
            totalParentsBonusCredited = round8(
              totalParentsBonusCredited + out.parentsPaidTotal
            );
            totalSystemCutAccrued = round8(
              totalSystemCutAccrued + out.systemQty
            );

            touched.add(`${sub.userId.toString()}:${sub.symbol}`);
          } finally {
            await session.endSession();
          }
        }
      }

      // 2) principal return if matured
      if (
        now.getTime() >= new Date(sub.endAt).getTime() &&
        !sub.principalReturned
      ) {
        if (dryRun) {
          principalReturnedCount += 1;
          touched.add(`${sub.userId.toString()}:${sub.symbol}`);
          continue;
        }

        const locked = await StakingSubscription.findOneAndUpdate(
          {
            _id: sub._id,
            status: "active",
            principalReturnLocked: { $ne: true },
            cancelLocked: { $ne: true },
          },
          {
            $set: {
              principalReturnLocked: true,
              principalReturnLockedAt: new Date(),
            },
          },
          { new: true }
        );

        if (locked) {
          // return principal (USDT => main balance, others => SpotWallet)
          const isUSDT = String(locked.symbol || "").toUpperCase() === "USDT";
          if (isUSDT) {
            const amt = round8(Number(locked.principalQty));
            await User.updateOne(
              { _id: locked.userId },
              { $inc: { m_balance: +amt } }
            );

            await createMainBalanceTransaction({
              userId: locked.userId,
              customerId: locked.customerId,
              transactionType: "cashIn",
              amount: amt,
              purpose: "Refund",
              description: `Staking principal returned: ${amt} USDT (maturity)`,
            }).catch((e) => {
              console.error(
                "❌ [staking-profit] transaction (principal_return) failed:",
                (e as any)?.message || e
              );
            });
          } else {
            await SpotWallet.findOneAndUpdate(
              { userId: locked.userId, symbol: locked.symbol },
              {
                $setOnInsert: {
                  userId: locked.userId,
                  customerId: locked.customerId,
                  asset: locked.asset,
                  symbol: locked.symbol,

                  avgPrice: 0,
                },
                $inc: { qty: +Number(locked.principalQty) },
              },
              { upsert: true }
            );
          }

          await StakingSubscription.updateOne(
            { _id: locked._id, status: "active" },
            {
              $set: {
                principalReturned: true,
                principalReturnedAt: new Date(),
                status: "completed",
                completedAt: new Date(),
              },
            }
          );

          // ✅ history log (idempotent)
          try {
            await StakingProfitLog.create({
              type: "principal_return",
              subscriptionId: locked._id,
              userId: locked.userId,
              asset: locked.asset,
              symbol: locked.symbol,
              dayKey: todayKey,

              principalQty: Number(locked.principalQty),
              principalReturnQty: Number(locked.principalQty),
              note: "Maturity principal returned",
            });
          } catch (e: any) {
            if (String(e?.code) !== "11000") throw e;
          }

          principalReturnedCount += 1;
          touched.add(`${locked.userId.toString()}:${locked.symbol}`);
        }
      }
    } catch (err: any) {
      console.error(
        "❌ [staking-profit] error:",
        String(sub._id),
        err?.message || err
      );
    }
  }

  // ✅ rebuild summaries
  if (!dryRun) {
    for (const k of touched) {
      const [uid, sym] = k.split(":");
      const oid = new Types.ObjectId(uid);

      await rebuildStakingSummaryForUserSymbol(oid, sym);
      await rebuildUserCoinSummaryForUserSymbol(oid, sym);
    }
  }

  console.log("✅ [staking-profit] done:", todayKey);

  return {
    day: todayKey,
    dryRun,
    scannedSubscriptions: subs.length,
    profitLogsCreated: paidLogsCreated,

    userProfitCreditedQty: +totalUserProfitCredited.toFixed(8),
    parentsBonusCreditedQty: +totalParentsBonusCredited.toFixed(8),
    systemCutAccruedQty: +totalSystemCutAccrued.toFixed(8),

    principalsReturned: principalReturnedCount,
    touchedSummaries: touched.size,
  };
}
