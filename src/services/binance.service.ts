// services/binance.service.ts
const BASE = process.env.BINANCE_REST || "https://api.binance.com";

// ── small helper: fetch with timeout
async function fetchJson(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "cpfx-api/1.0" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Upstream ${res.status} ${res.statusText} — ${text?.slice(0, 200)}`
      );
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

/** 24h টিকার তালিকা */
export async function get24hStats() {
  const url = `${BASE}/api/v3/ticker/24hr`;
  return fetchJson(url) as Promise<any[]>;
}

/** এক্সচেঞ্জ ইন্ফো */
export async function getExchangeInfo() {
  const url = `${BASE}/api/v3/exchangeInfo`;
  return fetchJson(url) as Promise<any>;
}

/** bookTicker টাইপ (সিম্পল) */
export type BookTicker = {
  symbol: string;
  bidPrice: string;
  askPrice: string;
  bidQty?: string;
  askQty?: string;
};

/** Raw bookTicker */
export async function getBookTicker(symbol: string): Promise<BookTicker> {
  const sym = String(symbol || "").toUpperCase();
  const url = `${BASE}/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(
    sym
  )}`;
  const json = (await fetchJson(url)) as any;
  if (
    !json ||
    typeof json.bidPrice !== "string" ||
    typeof json.askPrice !== "string"
  ) {
    throw new Error("Invalid bookTicker payload");
  }
  return {
    symbol: json.symbol ?? sym,
    bidPrice: json.bidPrice,
    askPrice: json.askPrice,
    bidQty: json.bidQty,
    askQty: json.askQty,
  };
}

/** 🔥 Klines (ক্যান্ডেল) – Binance /api/v3/klines */
export async function getKlines(params: {
  symbol: string; // e.g. BTCUSDT
  interval: string; // e.g. 1m, 5m, 1h
  limit?: number; // e.g. 800
}) {
  const q = new URLSearchParams({
    symbol: params.symbol,
    interval: params.interval,
    ...(params.limit ? { limit: String(params.limit) } : {}),
  });
  const url = `${BASE}/api/v3/klines?${q.toString()}`;
  return fetchJson(url) as Promise<any[]>;
}
