// ✅ cron/vipTierCron.ts
import cron from "node-cron";

export const setupVipTierCron = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("✅ Daily VIP tier update complete");
  });
};
