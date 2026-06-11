import { runStakingProfitJob } from "@/crons/stakingProfitJob";
import cron from "node-cron";

export const setupStakingProfitCron = () => {
  cron.schedule(
    "0 1 * * *", // 01:00
    async () => {
      await runStakingProfitJob({ dryRun: false });
    },
    {
      timezone: "Asia/Dhaka",
    }
  );
};
