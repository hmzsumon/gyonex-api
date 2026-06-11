// src/crons/resetDailyStats.ts
import SystemStats from "@/models/SystemStats.model";
import { User } from "@/models/user.model";
import UserTeamSummary from "@/models/UserTeamSummary.model";
import UserWallet from "@/models/UserWallet.model";
import { ApiError } from "@/utils/ApiError";
import cron from "node-cron";

/** ──────────────────────────────────────────────────────────────────────────
 *  BATCH CONFIG
 *  Adjust BATCH_SIZE if you notice memory spikes or long query times.
 *  500 is a safe starting point for most production MongoDB clusters.
 *  ────────────────────────────────────────────────────────────────────────── */
const BATCH_SIZE = 500;

/** Reset all user-level “today” fields in manageable chunks. */
const processUsersInBatches = async (): Promise<void> => {
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const users = await User.find({ is_active: true })
      .select("_id")
      .skip(skip)
      .limit(BATCH_SIZE);

    if (users.length === 0) break;

    const userIds = users.map((u) => u._id);

    await Promise.all([
      UserTeamSummary.updateMany(
        { userId: { $in: userIds } },
        {
          $set: {
            todayTeamCommission: 0,
            "level_1.todayCommission": 0,
            "level_2.todayCommission": 0,
            "level_3.todayCommission": 0,
          },
        }
      ),
      UserWallet.updateMany(
        { userId: { $in: userIds } },
        { $set: { todayEarning: 0 } }
      ),
    ]);

    skip += BATCH_SIZE;
    hasMore = users.length === BATCH_SIZE;
  }
};

/** Register the cron job that clears daily counters every midnight (server time). */
export const setupDailyStatsResetCron = (): void => {
  // ───────── “0 0 * * *” = every day at 00:00 ─────────
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 [Cron] Starting daily stats reset...");

    try {
      /* 1. Reset system-wide statistics */
      const company = await SystemStats.findOne();
      if (!company) throw new ApiError(404, "SystemStats document not found");

      company.users.todayNew = 0;
      company.users.activeToday = 0;

      company.withdrawals.today = 0;
      company.withdrawals.countToday = 0;
      company.withdrawals.netToday = 0;

      company.deposits.today = 0;
      company.deposits.blockbeeReceivedToday = 0;

      await company.save();

      /* 2. Reset user-specific values in batches */
      await processUsersInBatches();

      console.log("✅ [Cron] Daily stats reset completed");
    } catch (err) {
      console.error("❌ [Cron] Daily stats reset failed:", err);
    }
  });
};
