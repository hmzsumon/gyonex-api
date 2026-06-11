// src/workers/boot.ts
import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "@/config/db";
import { setupStakingProfitCron } from "@/crons/stakingProfitCron";
import { setupStakingSummaryReconcileCron } from "@/crons/stakingSummaryReconcileCron";
import { redis } from "@/lib/redis";
import { startPriceIngestor } from "@/workers/price-ingestor";
import { startStopoutEngine } from "@/workers/stopout-engine";

function loadSymbols(): string[] {
  const raw =
    process.env.QUOTE_SYMBOLS || "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT";

  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

const isTrue = (v: any): boolean =>
  String(v || "").toLowerCase() === "true" || String(v || "") === "1";

async function ensureRedis(): Promise<boolean> {
  try {
    if ((redis as any).status !== "ready") {
      await (redis as any).connect?.().catch(() => {});
    }

    const pong = await redis.ping();
    console.log("✅ Redis OK (worker):", pong);
    return true;
  } catch (e: any) {
    console.error("❌ Redis failed in worker:", e?.message || e);
    return false;
  }
}

function getWorkerName(): "realtime" | "cron" {
  const stakingCrons = isTrue(process.env.STAKING_CRONS);
  return stakingCrons ? "cron" : "realtime";
}

function startHeartbeat(workerName: "realtime" | "cron") {
  const heartbeatKey = `heartbeat:${workerName}`;

  const writeHeartbeat = async () => {
    try {
      await redis.set(heartbeatKey, Date.now().toString(), "EX", 120);
    } catch (error: any) {
      console.error(
        `❌ Failed to write heartbeat for ${workerName}:`,
        error?.message || error,
      );
    }
  };

  // app start হওয়ার সাথে সাথেই একবার লিখে দিই
  void writeHeartbeat();

  const interval = setInterval(() => {
    void writeHeartbeat();
  }, 30_000);

  return {
    heartbeatKey,
    stop: async () => {
      clearInterval(interval);
      try {
        await redis.del(heartbeatKey);
      } catch {
        // ignore cleanup error
      }
    },
  };
}

(async () => {
  await connectDB();

  const hasRedis = await ensureRedis();
  if (!hasRedis) {
    console.error("🚫 Worker requires Redis. Exiting.");
    process.exit(1);
  }

  const ENABLE_INGESTOR = isTrue(process.env.ENABLE_INGESTOR);
  const ENABLE_STOPOUT = isTrue(process.env.ENABLE_STOPOUT);
  const STAKING_CRONS = isTrue(process.env.STAKING_CRONS);

  const workerName = getWorkerName();
  const heartbeat = startHeartbeat(workerName);

  console.log(`💓 Heartbeat started for worker: ${workerName}`);

  if (ENABLE_STOPOUT) {
    startStopoutEngine();
    console.log("✅ Stopout engine enabled");
  } else {
    console.log("ℹ️ Stopout engine disabled");
  }

  if (ENABLE_INGESTOR) {
    startPriceIngestor(loadSymbols());
    console.log("✅ Price ingestor enabled");
  } else {
    console.log("ℹ️ Price ingestor disabled");
  }

  if (STAKING_CRONS) {
    setupStakingProfitCron();
    setupStakingSummaryReconcileCron();
    console.log("🧩 Staking crons enabled (profit + summary reconcile).");
  } else {
    console.log("ℹ️ Staking crons disabled (set STAKING_CRONS=true).");
  }

  console.log(`👷 Worker up: ${workerName}`);

  const shutdown = async () => {
    console.log(`👋 Worker exiting: ${workerName}…`);

    try {
      await heartbeat.stop();
    } catch {}

    try {
      await redis.quit().catch(() => redis.disconnect());
    } catch {}

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
})();
