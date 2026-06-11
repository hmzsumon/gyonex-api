import express from "express";
import Redis from "ioredis";
import mongoose from "mongoose";
import os from "os";

const router = express.Router();

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

function getMongoState() {
  const state = mongoose.connection.readyState;
  switch (state) {
    case 0:
      return "disconnected";
    case 1:
      return "connected";
    case 2:
      return "connecting";
    case 3:
      return "disconnecting";
    default:
      return "unknown";
  }
}

// Simple health
router.get("/health", async (_req, res): Promise<any> => {
  return res.status(200).json({
    success: true,
    service: "upbit-api",
    status: "ok",
    time: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
  });
});

// Deep health
router.get("/health/deep", async (_req, res): Promise<any> => {
  let redisStatus = "down";
  let redisError: string | null = null;

  let mongoStatus = getMongoState();
  let mongoError: string | null = null;

  let realtimeWorker = "unknown";
  let cronWorker = "unknown";

  try {
    await redis.connect();
  } catch {
    // ignore if already connected
  }

  try {
    const pong = await redis.ping();
    redisStatus = pong === "PONG" ? "up" : "down";
  } catch (error: any) {
    redisStatus = "down";
    redisError = error?.message || "Redis ping failed";
  }

  try {
    mongoStatus = getMongoState();
    if (mongoStatus !== "connected") {
      mongoError = `MongoDB is ${mongoStatus}`;
    }
  } catch (error: any) {
    mongoError = error?.message || "MongoDB check failed";
  }

  // Heartbeat check from Redis
  try {
    const realtimeTs = await redis.get("heartbeat:realtime");
    const cronTs = await redis.get("heartbeat:cron");

    const now = Date.now();
    const maxAgeMs = 90 * 1000; // 90 sec

    if (realtimeTs) {
      realtimeWorker = now - Number(realtimeTs) < maxAgeMs ? "up" : "stale";
    }

    if (cronTs) {
      cronWorker = now - Number(cronTs) < maxAgeMs ? "up" : "stale";
    }
  } catch {
    // keep unknown
  }

  const allOk =
    mongoStatus === "connected" &&
    redisStatus === "up" &&
    (realtimeWorker === "up" || realtimeWorker === "unknown") &&
    (cronWorker === "up" || cronWorker === "unknown");

  return res.status(allOk ? 200 : 503).json({
    success: allOk,
    status: allOk ? "ok" : "degraded",
    service: "upbit-api",
    time: new Date().toISOString(),
    checks: {
      api: "up",
      mongodb: {
        status: mongoStatus,
        error: mongoError,
      },
      redis: {
        status: redisStatus,
        error: redisError,
      },
      workers: {
        realtime: realtimeWorker,
        cron: cronWorker,
      },
    },
    system: {
      uptime_seconds: process.uptime(),
      memory: process.memoryUsage(),
      hostname: os.hostname(),
      platform: os.platform(),
      loadavg: os.loadavg(),
    },
  });
});

export default router;
