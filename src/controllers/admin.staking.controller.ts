import StakingSetting, { getStakingSettings, publicStakingSettings } from "@/models/StakingSetting.model";
import { stakingDayKey } from "@/utils/stakingPolicy";
import { runStakingProfitJob } from "@/crons/stakingProfitJob";
import StakingPlan from "@/models/StakingPlan.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";

type PlanInput = {
  termDays: number;
  dailyProfitPercent?: number;
  totalProfitPercent?: number; // ✅ legacy input: this will be treated as dailyProfitPercent if dailyProfitPercent missing
  minAmount?: number;
  isActive?: boolean;
};

const round8 = (v: number) => +Number(v).toFixed(8);

const parseBool = (v: any): boolean | undefined => {
  if (v == null) return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
};

// GET /admin/staking/plans
export const adminGetAllStakingPlans = catchAsync(async (_req, res) => {
  const items = await StakingPlan.find({}).sort({ termDays: 1 });
  res.status(200).json({ success: true, items });
});

// POST /admin/staking/plan (single upsert)
// ✅ INPUT: dailyProfitPercent (preferred) OR totalProfitPercent (legacy as daily)
// ✅ DB SAVE: dailyProfitPercent + computed totalProfitPercent = daily * termDays
export const adminUpsertStakingPlan = catchAsync(async (req, res, next) => {
  const termDays = Number(req.body?.termDays);

  // ✅ treat incoming totalProfitPercent as dailyProfitPercent if dailyProfitPercent missing
  const dailyProfitPercent = Number(
    req.body?.dailyProfitPercent ?? req.body?.totalProfitPercent
  );

  const totalProfitPercent = round8(dailyProfitPercent * termDays);
  const userSharePercent = Number(req.body?.userSharePercent ?? getUserSharePercent(termDays));
  if (!Number.isFinite(userSharePercent) || userSharePercent < 0 || userSharePercent > 1)
    return next(new ApiError(400, "User share must be between 0 and 1"));

  const minAmount =
    req.body?.minAmount == null ? undefined : Number(req.body?.minAmount);

  const isActive = parseBool(req.body?.isActive);

  if (!Number.isInteger(termDays) || termDays <= 0)
    return next(new ApiError(400, "Invalid termDays"));

  if (!Number.isFinite(dailyProfitPercent) || dailyProfitPercent < 0)
    return next(new ApiError(400, "Invalid dailyProfitPercent"));

  if (!Number.isFinite(totalProfitPercent) || totalProfitPercent < 0)
    return next(new ApiError(400, "Invalid totalProfitPercent"));

  if (minAmount != null && (!Number.isFinite(minAmount) || minAmount < 0))
    return next(new ApiError(400, "Invalid minAmount"));

  const updated = await StakingPlan.findOneAndUpdate(
    { termDays },
    {
      $set: {
        termDays,
        userSharePercent,
        dailyProfitPercent,
        totalProfitPercent,
        ...(minAmount != null ? { minAmount } : {}),
        ...(isActive != null ? { isActive } : {}),
      },
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.status(200).json({ success: true, item: updated });
});

// controllers/admin/stakingPlans.controller.ts

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

const getUserSharePercent = (termDays: number) => {
  const v = USER_SHARE.get(termDays);
  if (v == null) {
    return 1;
  }
  return v;
};

// ✅ POST /admin/staking/plans/bulk
// body: Array<PlanInput> OR { plans: Array<PlanInput> }
// ✅ INPUT: dailyProfitPercent OR legacy totalProfitPercent-as-daily
// ✅ DB SAVE: dailyProfitPercent + computed totalProfitPercent = daily * termDays
// ✅ DB SAVE: userSharePercent from USER_SHARE Map
export const adminBulkUpsertStakingPlans = catchAsync(
  async (req, res, next) => {
    try {
      const raw = Array.isArray(req.body) ? req.body : req.body?.plans;

      if (!Array.isArray(raw) || raw.length === 0) {
        return next(
          new ApiError(400, "Body must be an array or { plans: [...] }")
        );
      }

      const plans = raw.map((p: any) => {
        const termDays = Number(p?.termDays);

        const dailyProfitPercent = Number(
          p?.dailyProfitPercent ?? p?.totalProfitPercent // legacy support
        );

        const totalProfitPercent = round8(dailyProfitPercent * termDays);

        const userSharePercent = Number(p?.userSharePercent ?? getUserSharePercent(termDays));

        const minAmount =
          p?.minAmount == null || p?.minAmount === ""
            ? undefined
            : Number(p?.minAmount);

        const isActive =
          p?.isActive == null ? undefined : parseBool(p?.isActive);

        return {
          termDays,
          dailyProfitPercent,
          totalProfitPercent,
          userSharePercent,
          minAmount,
          isActive,
        };
      });

      // ✅ validation
      for (const p of plans) {
        if (!Number.isInteger(p.termDays) || p.termDays <= 0) {
          return next(new ApiError(400, `Invalid termDays: ${p.termDays}`));
        }

        if (
          !Number.isFinite(p.dailyProfitPercent) ||
          p.dailyProfitPercent < 0
        ) {
          return next(
            new ApiError(400, `Invalid dailyProfitPercent for ${p.termDays}`)
          );
        }

        if (
          !Number.isFinite(p.totalProfitPercent) ||
          p.totalProfitPercent < 0
        ) {
          return next(
            new ApiError(400, `Invalid totalProfitPercent for ${p.termDays}`)
          );
        }

        if (
          !Number.isFinite(p.userSharePercent) ||
          p.userSharePercent < 0 ||
          p.userSharePercent > 1
        ) {
          return next(
            new ApiError(400, `Invalid userSharePercent for ${p.termDays}`)
          );
        }

        if (
          p.minAmount != null &&
          (!Number.isFinite(p.minAmount) || p.minAmount < 0)
        ) {
          return next(new ApiError(400, `Invalid minAmount for ${p.termDays}`));
        }
      }

      // ✅ bulk upsert (NO CONFLICT: minAmount/isActive same field in $set and $setOnInsert)
      const ops = plans.map((p) => {
        const $set: any = {
          termDays: p.termDays,
          dailyProfitPercent: p.dailyProfitPercent,
          totalProfitPercent: p.totalProfitPercent,
          userSharePercent: p.userSharePercent, // ✅ always set
        };

        // only set when provided
        if (p.minAmount != null) $set.minAmount = p.minAmount;
        if (p.isActive != null) $set.isActive = p.isActive;

        // only for insert when NOT provided
        const $setOnInsert: any = {};
        if (p.minAmount == null) $setOnInsert.minAmount = 1;
        if (p.isActive == null) $setOnInsert.isActive = true;

        const update: any = { $set };
        if (Object.keys($setOnInsert).length)
          update.$setOnInsert = $setOnInsert;

        return {
          updateOne: {
            filter: { termDays: p.termDays },
            update,
            upsert: true,
          },
        };
      });

      const result = await StakingPlan.bulkWrite(ops, { ordered: false });

      // ✅ return fresh list
      const items = await StakingPlan.find({
        termDays: { $in: plans.map((p) => p.termDays) },
      }).sort({ termDays: 1 });

      return res.status(200).json({
        success: true,
        bulk: {
          inserted: result.upsertedCount,
          modified: result.modifiedCount,
          matched: result.matchedCount,
        },
        items,
      });
    } catch (err: any) {
      return next(err);
    }
  }
);

export const adminRunStakingProfit = catchAsync(async (req, res, next) => {
  // ✅ header auth (if needed)

  const { date, dryRun, limit } = req.body || {};
  console.log({ date, dryRun, limit });

  const runAt =
    typeof date === "string" && date.trim() ? new Date(date) : new Date();

  if (Number.isNaN(runAt.getTime())) {
    return next(new ApiError(400, "Invalid date format"));
  }

  const result = await runStakingProfitJob({
    runAt,
    dryRun: !!dryRun, // ✅ body থেকে dryRun নেবে
    limit: typeof limit === "number" ? limit : 10000,
  });

  res.status(200).json({ success: true, result });
});

export const adminGetStakingSettings = catchAsync(async (_req, res) => {
  res.json({ success: true, settings: publicStakingSettings(await getStakingSettings()) });
});

export const adminUpdateStakingSettings = catchAsync(async (req, res) => {
  const { stakingEnabled, profitEnabled, cancellationFeePercent, profitDays } = req.body;
  if (typeof stakingEnabled !== "boolean" || typeof profitEnabled !== "boolean" ||
      typeof cancellationFeePercent !== "number" || !Number.isFinite(cancellationFeePercent) ||
      cancellationFeePercent < 0 || cancellationFeePercent > 100 ||
      !Array.isArray(profitDays) || profitDays.some((day: unknown) =>
        typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ApiError(400, "Provide valid switches, a fee from 0 to 100, and weekdays from 0 to 6");
  }
  await getStakingSettings();
  const days = [...new Set<number>(profitDays)].sort();
  const settings = await StakingSetting.findOneAndUpdate({ key: "global" }, {
    $set: { stakingEnabled, profitEnabled, cancellationFeePercent, profitDays: days },
    $push: { policyHistory: { effectiveDay: stakingDayKey(new Date()), profitEnabled, profitDays: days } },
  }, { new: true, runValidators: true });
  res.json({ success: true, settings: publicStakingSettings(settings!) });
});
