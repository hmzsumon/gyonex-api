// specs.service.ts
/* ──────────────────────────────────────────────────────────────
   Per-symbol trading specs (demo defaults)
   - CRYPTO (…USDT): 1 lot = 1 coin
   - METALS (XAU/XAG): 1 lot = 100 oz
   - FX: 1 lot = 100,000
────────────────────────────────────────────────────────────── */

export type ContractSpec = {
  symbol: string;
  contractSize: number;
  minLot: number;
  stepLot: number;
  maxLot: number;
  digits: number; // price precision for UI/rounding
  commissionPerLot: number; // demo: 0
};

/** Optional helper if you accept BTC/USD on the client. */
export function normalizeSymbol(sym: string) {
  let s = sym.trim().toUpperCase().replace("/", "");
  if (s.endsWith("USD")) s = s.replace(/USD$/, "USDT");
  return s;
}

export function getContractSpec(rawSymbol: string): ContractSpec {
  const s = rawSymbol.toUpperCase();

  // ── Metals
  if (s.includes("XAU") || s.includes("XAG")) {
    return {
      symbol: s,
      contractSize: 100, // 1 lot = 100 oz
      minLot: 0.01,
      stepLot: 0.01,
      maxLot: 1000,
      digits: 2,
      commissionPerLot: 0,
    };
  }

  // ── Crypto (USDT quoted) → 1 lot = 1 coin
  if (/USDT$/.test(s)) {
    // choose UI digits by base asset
    // (feel free to extend this list)
    const base = s.replace(/USDT$/, "");
    const digits = /(BTC|ETH|SOL|BNB|XRP)/.test(base)
      ? 2
      : /(DOGE|SHIB|PEPE|BONK)/.test(base)
      ? 5
      : 3; // default

    return {
      symbol: s,
      contractSize: 1, // ✅ 1 lot = 1 coin
      minLot: 0.01,
      stepLot: 0.01,
      maxLot: 10_000,
      digits,
      commissionPerLot: 0,
    };
  }

  // ── FX (fallback)
  return {
    symbol: s,
    contractSize: 100_000, // 1 lot = 100k
    minLot: 0.01,
    stepLot: 0.01,
    maxLot: 100,
    digits: 5,
    commissionPerLot: 0,
  };
}

export function isValidLot(
  lots: number,
  min: number,
  step: number,
  max: number
) {
  if (!(lots >= min && lots <= max)) return false;
  const n = Math.round((lots - min) / step);
  return Math.abs(min + n * step - lots) < 1e-8;
}
