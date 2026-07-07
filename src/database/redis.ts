import Redis from "ioredis";
import { logger } from "../utils/logger";

let redisClient: Redis;

export const connectRedis = async (): Promise<void> => {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const isTlsRedis =
      redisUrl.startsWith("rediss://") || process.env.REDIS_TLS === "true";

    redisClient = new Redis(redisUrl, {
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: false,
      tls: isTlsRedis
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });

    redisClient.on("connect", () => logger.info("✅ Redis connected"));
    redisClient.on("error", (err) => logger.error("Redis error:", err));
    redisClient.on("reconnecting", () => logger.warn("Redis reconnecting..."));

    await redisClient.ping();
  } catch (error) {
    logger.error("Redis connection failed:", error);
    // Non-fatal — app continues without Redis cache
  }
};

export const getRedis = (): Redis => redisClient;

export const cacheSet = async (
  key: string,
  value: unknown,
  ttl = 300,
): Promise<void> => {
  try {
    await redisClient.setex(key, ttl, JSON.stringify(value));
  } catch {
    /* silent fail */
  }
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const cacheDel = async (key: string): Promise<void> => {
  try {
    await redisClient.del(key);
  } catch {
    /* silent fail */
  }
};

export const cacheFlushPattern = async (pattern: string): Promise<void> => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) await redisClient.del(...keys);
  } catch {
    /* silent fail */
  }
};
