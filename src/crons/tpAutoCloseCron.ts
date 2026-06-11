// src/crons/tpAutoCloseCron.ts
import { tpTickOnce } from "@/services/tpClose.service";

/**
 * Simple interval-based worker.
 * ENV দিয়ে কনফিগ: TP_CRON_MS (default: 1500), TP_BATCH (default: 200)
 */
export function setupTpAutoCloseCron() {
  const ms = Number(process.env.TP_CRON_MS ?? 1500);
  const batch = Number(process.env.TP_BATCH ?? 200);

  setInterval(async () => {
    try {
      const { scanned, closed } = await tpTickOnce(batch);
      if (closed > 0) {
        console.log(`[TP] scanned=${scanned} closed=${closed}`);
      }
    } catch (e: any) {
      console.error("[TP] tick error:", e?.message || e);
    }
  }, ms);

  console.log(`🕒 TP Auto-Close Cron started: every ${ms}ms (batch=${batch})`);
}
