import { rebuildAllStakingSummaries } from "@/services/stakingSummary.service";
import cron from "node-cron";

export const setupStakingSummaryReconcileCron = () => {
  // প্রতি ঘন্টায় 15 মিনিটে
  cron.schedule("15 * * * *", async () => {
    try {
      console.log("🟡 [staking-summary] reconcile start");
      await rebuildAllStakingSummaries();
      console.log("✅ [staking-summary] reconcile done");
    } catch (e: any) {
      console.error("❌ [staking-summary] reconcile failed:", e?.message || e);
    }
  });
};
