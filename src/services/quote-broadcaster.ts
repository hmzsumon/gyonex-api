// src/services/quote-broadcaster.ts
import { redis } from "@/lib/redis";
import { emitQuote } from "@/socket";

type LastQuote = {
  bid: number;
  ask: number;
};

const QUOTE_MAX_AGE_MS = Number(process.env.QUOTE_MAX_AGE_MS ?? 10_000);

function isFreshTs(ts: number) {
  return Number.isFinite(ts) && ts > 0 && Date.now() - ts <= QUOTE_MAX_AGE_MS;
}

export function startQuoteBroadcaster(
  symbols: string[],
  intervalMs: number = 300,
) {
  if (!symbols.length) return;
  console.log("[quote-broadcaster] starting for symbols:", symbols.join(", "));

  const upperSyms = symbols.map((s) => s.toUpperCase());
  const last: Record<string, LastQuote> = {};

  // ✅ ensure connection (lazyConnect=true হলে এটা দরকার)
  (async () => {
    try {
      if (redis.status !== "ready") {
        await redis.connect();
      }
      console.log("[quote-broadcaster] redis status:", redis.status);
    } catch (e: any) {
      console.warn(
        "[quote-broadcaster] redis connect failed:",
        e?.message || e,
      );
    }
  })();

  const tick = async () => {
    try {
      // redis not ready হলে এই tick এ emit না করাই ভালো
      if (redis.status !== "ready") {
        // ছোট log (চাইলে কমেন্ট করো)
        // console.warn("[quote-broadcaster] redis not ready, status =", redis.status);
        return;
      }

      for (const sym of upperSyms) {
        const key = `q:${sym}`;
        const data = await redis.hgetall(key);
        if (!data || !data.bid || !data.ask || !data.ts) continue;

        const bid = Number(data.bid);
        const ask = Number(data.ask);
        const ts = Number(data.ts);

        if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= bid)
          continue;

        // ✅ stale quote বাদ
        if (!isFreshTs(ts)) continue;

        const prev = last[sym];
        if (prev && prev.bid === bid && prev.ask === ask) continue;

        last[sym] = { bid, ask };
        emitQuote(sym, { symbol: sym, bid, ask, ts });
      }
    } catch (e: any) {
      console.error("[quote-broadcaster] tick error:", e?.message || e);
    } finally {
      setTimeout(tick, intervalMs);
    }
  };

  tick();
}
