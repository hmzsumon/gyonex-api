/* ────────── lottery server integration ────────── */
// src/server.ts
import dotenv from "dotenv";
import http from "http";
import app from "./app";
import { startLotteryAutoDrawCron } from './crons/lotteryAutoDrawCron';

import { connectDB } from "@/config/db";
import { redis } from "@/lib/redis";
import { startTpWsEngine, stopTpWsEngine } from "@/services/tpClose.ws.service";
import { attach, emitQuote } from "@/socket";
import { startSlWsEngine, stopSlWsEngine } from "./services/slClose.ws.service";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);

const isTrue = (v: any) =>
  String(v || "").toLowerCase() === "true" || String(v || "") === "1";

function normalizeSymbol(sym: string) {
  let s = String(sym || "")
    .toUpperCase()
    .replace("/", "");
  if (s.endsWith("USD")) s = s.replace("USD", "USDT");
  return s;
}

function loadSymbols(): string[] {
  const raw =
    process.env.QUOTE_SYMBOLS ||
    "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,ADAUSDT,XRPUSDT,TWTUSDT,AVAXUSDT,DOTUSDT,LINKUSDT,LTCUSDT,TRXUSDT,ETCUSDT,ATOMUSDT,FTMUSDT,";

  // ✅ normalize + dedupe
  const uniq = new Set<string>();
  for (const part of raw.split(",")) {
    const s = normalizeSymbol(part.trim());
    if (s) uniq.add(s);
  }
  return Array.from(uniq);
}

let redisReadyChecked = false;
async function ensureRedis(): Promise<boolean> {
  // ✅ idempotent: avoid repeated connect attempts on hot reload
  if (redisReadyChecked && (redis as any).status === "ready") return true;

  try {
    if ((redis as any).status !== "ready") {
      await (redis as any).connect?.().catch(() => {});
    }
    const pong = await redis.ping();
    console.log("✅ Redis OK (web):", pong);
    redisReadyChecked = true;
    return true;
  } catch (e: any) {
    console.warn(
      "⚠️  Redis unavailable, running without cache. Reason:",
      e?.message || e,
    );
    return false;
  }
}

/**
 * Redis → Socket.IO quote broadcaster (WEB process only)
 * Worker Binance WS থেকে Redis-এ লেখে,
 * এখানে শুধু Redis থেকে পড়ে ক্লায়েন্টে push করি।
 *
 * ✅ Production-ready: idempotent start/stop + no double timers
 */
let quoteBroadcasterStarted = false;
let quoteBroadcasterTimer: NodeJS.Timeout | null = null;

function stopQuoteBroadcaster() {
  quoteBroadcasterStarted = false;
  if (quoteBroadcasterTimer) {
    clearTimeout(quoteBroadcasterTimer);
    quoteBroadcasterTimer = null;
  }
}

function startQuoteBroadcaster(symbols: string[]) {
  // ✅ prevent double start (nodemon reload, accidental calls, etc.)
  if (quoteBroadcasterStarted) return;
  quoteBroadcasterStarted = true;

  if (!symbols.length) return;

  const intervalMs = Number(process.env.QUOTE_BROADCAST_MS ?? 200);
  const QUOTE_MAX_AGE_MS = Number(process.env.QUOTE_MAX_AGE_MS ?? 10_000);

  console.log("[quote-broadcaster] starting for symbols:", symbols.join(", "));

  let lastWarnAt = 0;

  const scheduleNext = () => {
    if (!quoteBroadcasterStarted) return;
    quoteBroadcasterTimer = setTimeout(tick, intervalMs);
  };

  const tick = async () => {
    try {
      const status = (redis as any).status;

      if (status !== "ready") {
        const now = Date.now();
        if (now - lastWarnAt > 5000) {
          console.warn("[quote-broadcaster] redis not ready, status =", status);
          lastWarnAt = now;
        }

        // status=end হলে reconnect try (lazyConnect=true)
        if (status === "end") {
          try {
            await (redis as any).connect?.().catch(() => {});
          } catch {}
        }

        return;
      }

      for (const sym of symbols) {
        const key = `q:${sym}`;
        const data = await redis.hgetall(key);
        if (!data?.bid || !data?.ask || !data?.ts) continue;

        const bid = Number(data.bid);
        const ask = Number(data.ask);
        const ts = Number(data.ts);

        if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= bid)
          continue;

        // stale quote skip
        if (!Number.isFinite(ts) || Date.now() - ts > QUOTE_MAX_AGE_MS)
          continue;

        emitQuote(sym, { symbol: sym, bid, ask, ts });
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      const now = Date.now();
      if (now - lastWarnAt > 5000) {
        console.warn("[quote-broadcaster] tick error:", msg);
        lastWarnAt = now;
      }
    } finally {
      scheduleNext(); // ✅ only ONE scheduler, and stoppable
    }
  };

  // start loop
  scheduleNext();
}

async function bootstrap() {
  try {
    await connectDB();
    app.set("trust proxy", 1 as any);

    // HTTP + Socket.IO
    const server = http.createServer(app);
    const io = attach(server);
    (global as any).io = io;

    // Redis + broadcaster (WEB only)
    const ENABLE_QUOTE_BROADCASTER = isTrue(
      process.env.ENABLE_QUOTE_BROADCASTER ?? "true",
    );

    const hasRedis = await ensureRedis();
    if (hasRedis && ENABLE_QUOTE_BROADCASTER) {
      const symbols = loadSymbols();
      startQuoteBroadcaster(symbols);
    } else {
      console.log("ℹ️ Quote broadcaster disabled or Redis unavailable.");
    }

    // Listen
    startLotteryAutoDrawCron();

    server.listen(PORT, "0.0.0.0", () => {
      const host = process.env.PUBLIC_HOST || "localhost";
      const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
      const url = `${protocol}://${host}:${PORT}`;

      console.log("\n====================================");
      console.log("🚀 SERVER STARTED SUCCESSFULLY");
      console.log("🌐 API URL:");
      console.log(url); // 👈 copy this line easily
      console.log("====================================\n");

      startTpWsEngine();
      startSlWsEngine();
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("🛑 Shutting down…");

      // stop in-proc loops first (prevents timer double-run after reload)
      stopQuoteBroadcaster();

      try {
        stopTpWsEngine();
        stopSlWsEngine();
      } catch {}

      try {
        if ((redis as any).status === "ready") {
          await redis.quit().catch(() => redis.disconnect());
        }
      } catch {}

      server.close(() => process.exit(0));
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    process.on("unhandledRejection", (err: any) => {
      console.error("❌ Unhandled Rejection:", err?.stack || err);
    });
    process.on("uncaughtException", (err: any) => {
      console.error("❌ Uncaught Exception:", err?.stack || err);
    });
  } catch (err: any) {
    console.error("❌ Boot failed:", err?.stack || err);
  }
}

bootstrap();
