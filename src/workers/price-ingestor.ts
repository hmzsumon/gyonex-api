// src/workers/price-ingestor.ts
import { redis } from "@/lib/redis";
import { requestStopoutForSymbol } from "@/workers/stopout-engine";
import WebSocket from "ws";

export function normalizeSymbol(sym: string) {
  let s = String(sym || "")
    .toUpperCase()
    .replace("/", "");
  if (s.endsWith("USD")) s = s.replace("USD", "USDT");
  return s;
}

const toFixed = (n: number, d = 8) => Number(n.toFixed(d));

let wsRef: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

function buildBinanceWsUrl(base: string, symbols: string[]) {
  const streams = symbols
    .map((s) => `${normalizeSymbol(s).toLowerCase()}@bookTicker`)
    .join("/");

  // ✅ multiple streams => /stream?streams=
  if (symbols.length > 1) return `${base}/stream?streams=${streams}`;

  // ✅ single stream => /ws/
  return `${base}/ws/${streams}`;
}

export function startPriceIngestor(symbols: string[]) {
  if (!symbols.length) return;

  const base = process.env.BINANCE_WS || "wss://stream.binance.com:9443";
  const url = buildBinanceWsUrl(base, symbols);

  // ensure redis connected (lazyConnect)
  (async () => {
    try {
      if ((redis as any).status !== "ready") {
        await (redis as any).connect?.().catch(() => {});
      }
    } catch {}
  })();

  // cleanup old ws (safety)
  try {
    wsRef?.removeAllListeners();
    wsRef?.terminate();
  } catch {}
  wsRef = null;

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const ws = new WebSocket(url, { perMessageDeflate: false });
  wsRef = ws;

  ws.on("open", () => console.log("[ingestor] connected:", url));

  ws.on("message", (buf: WebSocket.RawData) => {
    try {
      const txt = Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf);
      const msg = JSON.parse(txt);

      // ✅ combined stream payload => { stream, data }
      const m = msg?.data ?? msg;

      const sym = normalizeSymbol(String(m.s || ""));
      const bid = Number(m.b);
      const ask = Number(m.a);
      if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= bid) return;

      const ts = Date.now();

      redis
        .hset(`q:${sym}`, {
          bid: String(toFixed(bid, 8)),
          ask: String(toFixed(ask, 8)),
          ts: String(ts),
        })
        .catch(() => {});

      requestStopoutForSymbol(sym);
    } catch (e: any) {
      console.error("[ingestor] message error", e?.message || e);
    }
  });

  ws.on("close", () => {
    console.warn("[ingestor] closed; reconnecting...");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => startPriceIngestor(symbols), 1500);
  });

  ws.on("error", (e) => {
    console.error("[ingestor] ws error:", (e as any)?.message || e);
    try {
      ws.close();
    } catch {}
  });
}
