// src/workers/stopout-engine.ts
import { redis } from "@/lib/redis";
import Account from "@/models/Account.model";
import Position from "@/models/position.model";
import { getTopOfBook } from "@/services/quote.service";
import { closePositionCore } from "@/services/trade.service";

/** কনফিগ */
const STOP_OUT_LEVEL_BPS = Number(process.env.STOP_OUT_LEVEL_BPS ?? 300);
const LIQ_LOCK_TTL_MS = Number(process.env.LIQ_LOCK_TTL_MS ?? 5_000);
const BATCH_WAIT_MS = Number(process.env.LIQ_BATCH_MS ?? 150);

const MAX_LIQ_POS_PER_BATCH = Number(process.env.MAX_LIQ_POS_PER_BATCH ?? 10);
const MAX_HARD_LIQ_POS = Number(process.env.MAX_HARD_LIQ_POS ?? 0);

// ✅ NEW: per-symbol debounce (ms)
const SYMBOL_DEBOUNCE_MS = Number(
  process.env.STOPOUT_SYMBOL_DEBOUNCE_MS ?? 350
);

// ✅ accounts queue
const pending = new Set<string>();
let timer: NodeJS.Timeout | null = null;

// ✅ NEW: debounce/inflight for symbol scan (prevents query storm)
const nextAllowedAt = new Map<string, number>();
const inflightSymbols = new Set<string>();

export function startStopoutEngine() {
  console.log(
    "[stopout] engine started. STOP_OUT_LEVEL_BPS =",
    STOP_OUT_LEVEL_BPS
  );
}

/** ✅ call this from ingestor per tick (safe) */
export function requestStopoutForSymbol(symbol: string) {
  const sym = String(symbol || "").toUpperCase();
  const now = Date.now();
  const next = nextAllowedAt.get(sym) ?? 0;
  if (now < next) return;

  nextAllowedAt.set(sym, now + SYMBOL_DEBOUNCE_MS);
  if (inflightSymbols.has(sym)) return;

  inflightSymbols.add(sym);
  scanSymbolAccounts(sym)
    .catch(() => {})
    .finally(() => inflightSymbols.delete(sym));
}

/** actual DB scan (throttled) */
async function scanSymbolAccounts(symbol: string) {
  const accIds = await Position.distinct("accountId", {
    symbol,
    status: "open",
  });

  for (const id of accIds) queueAccountForStopout(String(id));
}

export function queueAccountForStopout(accountId: string) {
  pending.add(String(accountId));
  if (timer) return;
  timer = setTimeout(flushBatch, BATCH_WAIT_MS);
}

async function flushBatch() {
  const batch = Array.from(pending);
  pending.clear();
  if (timer) clearTimeout(timer);
  timer = null;

  for (const accId of batch) {
    try {
      await maybeLiquidate(accId);
    } catch (e) {
      console.error("[stopout] error:", (e as any)?.message || e);
    }
  }
}

async function lockAccount(accId: string) {
  const key = `liq:lock:${accId}`;
  const ok = await redis.set(key, "1", "PX", LIQ_LOCK_TTL_MS, "NX");
  return ok === "OK";
}
async function unlockAccount(accId: string) {
  await redis.del(`liq:lock:${accId}`).catch(() => {});
}

function unrealizedForPos(p: any, closePx: number) {
  const lots = Number(p.lots ?? p.volume ?? 0);
  const entry = Number(p.entryPrice);
  const csize = Number(p.contractSize ?? 1);
  if (![lots, entry, csize, closePx].every(Number.isFinite)) return 0;
  const diff = p.side === "buy" ? closePx - entry : entry - closePx;
  return diff * csize * lots;
}

async function maybeLiquidate(accountId: string) {
  if (!(await lockAccount(accountId))) return;
  try {
    const acc = await Account.findById(accountId);
    if (!acc || acc.status !== "active") return;

    const open = await Position.find({ accountId, status: "open" })
      .select("_id symbol side lots entryPrice contractSize margin")
      .lean();

    if (open.length === 0) return;

    const symbols = Array.from(new Set(open.map((p) => String(p.symbol))));
    const quotes: Record<string, { bid: number; ask: number; mid: number }> =
      {};

    for (const s of symbols) {
      const q = await getTopOfBook(s);
      const mid = (q.bid + q.ask) / 2;
      quotes[s] = { bid: q.bid, ask: q.ask, mid };
    }

    let totalUPnL = 0;
    for (const p of open) {
      const q = quotes[String(p.symbol)];
      if (!q) continue;
      const closePx = p.side === "buy" ? q.bid : q.ask;
      totalUPnL += unrealizedForPos(p, closePx);
    }

    const balance = Number(acc.balance ?? 0);
    const marginUsed = Number(acc.marginUsed ?? 0);
    const equity = balance + totalUPnL;
    const stopLevel = (STOP_OUT_LEVEL_BPS / 10_000) * marginUsed;

    const needHardLiq = equity <= 0;
    const needSoftLiq = !needHardLiq && equity <= stopLevel;

    if (!needHardLiq && !needSoftLiq) return;

    const scored = open.map((p) => {
      const q = quotes[String(p.symbol)]!;
      const closePx = p.side === "buy" ? q.bid : q.ask;
      const u = unrealizedForPos(p, closePx);
      return { p, u, m: Number(p.margin ?? 0) };
    });

    scored.sort((a, b) => {
      if (a.u !== b.u) return a.u - b.u;
      return b.m - a.m;
    });

    if (needHardLiq) {
      let closed = 0;
      for (const row of scored) {
        if (MAX_HARD_LIQ_POS > 0 && closed >= MAX_HARD_LIQ_POS) break;
        await closePositionCore(String(row.p._id));
        closed++;
      }
      return;
    }

    let closedCount = 0;
    for (const row of scored) {
      if (closedCount >= MAX_LIQ_POS_PER_BATCH) break;

      await closePositionCore(String(row.p._id));
      closedCount++;

      const acc2 = await Account.findById(accountId);
      const open2 = await Position.find({ accountId, status: "open" })
        .select("_id symbol side lots entryPrice contractSize margin")
        .lean();

      let up2 = 0;
      for (const p of open2) {
        const q = quotes[String(p.symbol)] || (await getTopOfBook(p.symbol));
        const closePx = p.side === "buy" ? q.bid : q.ask;
        up2 += unrealizedForPos(p, closePx);
      }

      const eq2 = Number(acc2?.balance ?? 0) + up2;
      const mu2 = Number(acc2?.marginUsed ?? 0);
      const lvl2 = (STOP_OUT_LEVEL_BPS / 10_000) * mu2;

      if (eq2 > lvl2) break;
    }
  } finally {
    await unlockAccount(accountId);
  }
}
