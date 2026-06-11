// services/quote.service.ts
import { redis } from "@/lib/redis";
import { getBookTicker } from "@/services/binance.service";

/** Helper: normalize symbols like BTC/USD -> BTCUSDT */
export function normalizeSymbol(sym: string) {
  let s = String(sym || "")
    .toUpperCase()
    .replace("/", "");
  if (s.endsWith("USD")) s = s.replace("USD", "USDT");
  return s;
}

/**
 * Crypto-only spread config (basis points)
 * Default: 10 bps = 0.10% total spread around mid
 *
 * Override:
 *  - SPREAD_DEFAULT_BPS=10
 *  - SPREAD_BPS_SOLUSDT=15
 */
const SPREAD_DEFAULT_BPS = Number(process.env.SPREAD_DEFAULT_BPS ?? 10);

/** Redis quote staleness threshold (ms) */
const QUOTE_MAX_AGE_MS = Number(process.env.QUOTE_MAX_AGE_MS ?? 10_000);

function getSpreadBps(symbol: string) {
  const s = normalizeSymbol(symbol);
  const key = `SPREAD_BPS_${s}`;
  const override = process.env[key];

  const bps =
    override != null && override !== "" ? Number(override) : SPREAD_DEFAULT_BPS;

  if (!Number.isFinite(bps) || bps < 0) return SPREAD_DEFAULT_BPS;
  return bps;
}

function applySpreadBps(rawBid: number, rawAsk: number, symbol: string) {
  if (
    !Number.isFinite(rawBid) ||
    !Number.isFinite(rawAsk) ||
    rawBid <= 0 ||
    rawAsk <= 0
  ) {
    throw new Error("Invalid raw quote");
  }

  const mid = (rawBid + rawAsk) / 2;
  const bps = getSpreadBps(symbol);
  const halfFrac = bps / 10_000 / 2;

  let bid = +(mid * (1 - halfFrac)).toFixed(8);
  let ask = +(mid * (1 + halfFrac)).toFixed(8);

  if (!(ask > bid)) {
    const eps = 1e-8;
    bid = +Math.min(rawBid, rawAsk - eps).toFixed(8);
    ask = +Math.max(rawAsk, rawBid + eps).toFixed(8);
  }

  return { bid, ask, ts: Date.now() };
}

function isFreshTs(ts: number) {
  return Number.isFinite(ts) && ts > 0 && Date.now() - ts <= QUOTE_MAX_AGE_MS;
}

/**
 * One true source of top-of-book:
 *  1) Redis (only if fresh)
 *  2) Binance REST fallback
 * Always apply bps spread (crypto-only)
 */
export async function getTopOfBook(
  symbol: string,
): Promise<{ bid: number; ask: number; ts: number }> {
  const s = normalizeSymbol(symbol);

  // 1) Redis (fresh only)
  try {
    const h = await redis.hgetall(`q:${s}`);
    if (h && h.bid && h.ask) {
      const rawBid = Number(h.bid);
      const rawAsk = Number(h.ask);
      const rawTs = Number(h.ts);

      if (
        Number.isFinite(rawBid) &&
        Number.isFinite(rawAsk) &&
        rawAsk > 0 &&
        rawBid > 0 &&
        isFreshTs(rawTs)
      ) {
        return applySpreadBps(rawBid, rawAsk, s);
      }
    }
  } catch (e) {
    console.warn(
      "[quote] redis read failed, fallback to REST:",
      (e as any)?.message || e,
    );
  }

  // 2) REST fallback (authoritative)
  const raw = await getBookTicker(s);
  const rawBid = Number(raw?.bidPrice);
  const rawAsk = Number(raw?.askPrice);
  return applySpreadBps(rawBid, rawAsk, s);
}
