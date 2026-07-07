import IORedis from "ioredis";

const isProd = process.env.NODE_ENV === "production";

const localUrl = "redis://127.0.0.1:6379";
const prodUrl = process.env.REDIS_URL;

const redisUrl = isProd ? prodUrl : localUrl;

if (isProd && !redisUrl) {
  throw new Error("[redis] REDIS_URL is required in production");
}

const isTlsRedis =
  redisUrl?.startsWith("rediss://") || process.env.REDIS_TLS === "true";

export const redis = new IORedis(redisUrl!, {
  lazyConnect: true,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
  tls: isTlsRedis
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
});

redis.on("connect", () => {
  console.log("[redis] connected");
});

redis.on("ready", () => {
  console.log("[redis] ready");
});

redis.on("error", (error) => {
  console.error("[redis] error", error?.message || error);
});
