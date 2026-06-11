// src/services/tradeQuote.service.ts
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

/** Safety: ensure ask > bid and both positive */
function sanitizeBidAsk(bid: number, ask: number) {
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    throw new Error("Invalid raw bid/ask");
  }
  if (ask <= bid) {
    const eps = Math.max(1e-8, bid * 1e-8);
    ask = bid + eps;
  }
  return { bid, ask, ts: Date.now() };
}

/**
 * ✅ Trade quotes: Redis raw first, then Binance REST raw
 * ❌ NO SPREAD, NO MARKUP
 */
export async function getTradeTopOfBook(
  symbol: string
): Promise<{ bid: number; ask: number; ts: number }> {
  const s = normalizeSymbol(symbol);

  // 1) Redis raw (from ingestor)
  try {
    const h = await redis.hgetall(`q:${s}`);
    if (h && h.bid && h.ask) {
      const bid = Number(h.bid);
      const ask = Number(h.ask);
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        return sanitizeBidAsk(bid, ask);
      }
    }
  } catch (e) {
    console.warn(
      "[tradeQuote] redis read failed, fallback to REST:",
      (e as any)?.message || e
    );
  }

  // 2) Binance REST raw
  const raw = await getBookTicker(s);
  const bid = Number(raw?.bidPrice);
  const ask = Number(raw?.askPrice);
  return sanitizeBidAsk(bid, ask);
}
