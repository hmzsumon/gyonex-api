// src/services/quoteHub.ts
import { EventEmitter } from "node:events";

// Binance public WS endpoint (browser-incompatible ping; but Node OK)
const BINANCE_WS = process.env.BINANCE_WS ?? "wss://stream.binance.com:9443";

type Quote = { bid: number; ask: number; ts: number };
type Sub = {
  ws: WebSocket | null;
  symbol: string; // UPPER (e.g., BTCUSDT)
  listeners: Set<(q: Quote) => void>;
  retry: number;
  hb?: NodeJS.Timeout | null;
  connecting?: boolean;
};

const subs = new Map<string, Sub>(); // key = symbol (UPPER)
const bus = new EventEmitter(); // optional: broadcast to all

function lower(sym: string) {
  return String(sym || "").toLowerCase();
}

function connect(sub: Sub) {
  if (sub.connecting) return;
  sub.connecting = true;
  const path = `${lower(sub.symbol)}@bookTicker`;
  const url = `${BINANCE_WS}/ws/${path}`;

  const ws = new (require("ws"))(url);
  sub.ws = ws;

  ws.on("open", () => {
    sub.retry = 0;
    // পিং/হার্টবিট—Binance ব্রাউজার-পিং মানে না, তবে টায়মার রাখলে স্টল ডিটেক্ট সাহায্য করে
    if (sub.hb) clearInterval(sub.hb);
    sub.hb = setInterval(() => {
      if (!sub.ws || sub.ws.readyState !== ws.OPEN) return;
      // no-op heartbeat
    }, 25_000);
    sub.connecting = false;
  });

  ws.on("message", (raw: Buffer) => {
    try {
      const json = JSON.parse(raw.toString());
      // bookTicker shape: { b: "bidPrice", a: "askPrice", ... }
      const bid = Number(json?.b ?? json?.bidPrice);
      const ask = Number(json?.a ?? json?.askPrice);
      if (!Number.isFinite(bid) || !Number.isFinite(ask)) return;

      const q: Quote = { bid, ask, ts: Date.now() };
      // per-symbol listeners
      for (const fn of sub.listeners) {
        try {
          fn(q);
        } catch {}
      }
      // optional global bus
      bus.emit(`quote:${sub.symbol}`, q);
    } catch {}
  });

  const cleanup = () => {
    if (sub.hb) clearInterval(sub.hb);
    sub.hb = null;
    sub.ws = null;
    sub.connecting = false;

    // backoff reconnect
    const delay = Math.min(5000, 300 * Math.pow(2, sub.retry++));
    setTimeout(() => connect(sub), delay);
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

export function subscribeQuote(symbol: string, onQuote: (q: Quote) => void) {
  const sym = String(symbol || "").toUpperCase();
  let sub = subs.get(sym);
  if (!sub) {
    sub = { ws: null, symbol: sym, listeners: new Set(), retry: 0, hb: null };
    subs.set(sym, sub);
    connect(sub);
  }
  sub.listeners.add(onQuote);
  return () => {
    const s = subs.get(sym);
    if (!s) return;
    s.listeners.delete(onQuote);
    if (s.listeners.size === 0 && s.ws) {
      try {
        s.ws.close();
      } catch {}
      subs.delete(sym);
    }
  };
}

// Optional global listen by symbol
export function onQuote(sym: string, handler: (q: Quote) => void) {
  bus.on(`quote:${String(sym).toUpperCase()}`, handler);
  return () => bus.off(`quote:${String(sym).toUpperCase()}`, handler);
}
