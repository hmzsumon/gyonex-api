// src/lib/redis.ts
import IORedis from "ioredis";

const isProd = process.env.NODE_ENV === "production";

// dev/local এ সবসময় লোকাল redis
const localUrl = "redis://127.0.0.1:6379";

// prod এ env থেকে নেবে
const prodUrl = process.env.REDIS_URL;

const url = isProd ? prodUrl : localUrl;

if (isProd && !url) {
  throw new Error("[redis] REDIS_URL is required in production");
}

const needTls =
  (url ?? "").startsWith("rediss://") || process.env.REDIS_TLS === "true";

export const redis = new IORedis(url!, {
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  ...(needTls ? { tls: {} } : {}),
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
});

redis.on("error", (e) => {
  console.error("[redis] error", e?.message || e);
});
