/* ────────── lottery cron imports ────────── */
import cron from "node-cron";

import { LotteryEvent } from "../models/LotteryEvent.model";
import { drawLotteryEvent } from "../services/lottery.service";

/* ────────── lottery auto draw cron job every five minutes ────────── */
export function startLotteryAutoDrawCron() {
  cron.schedule("*/5 * * * *", async () => {
    const dueEvents = await LotteryEvent.find({
      status: "open",
      isAutoDraw: true,
      drawDate: { $lte: new Date() },
    }).limit(10);

    for (const event of dueEvents) {
      try {
        await drawLotteryEvent(event._id.toString());
      } catch (error) {
        console.error("[LotteryAutoDrawCron]", event._id.toString(), error);
      }
    }
  });
}
