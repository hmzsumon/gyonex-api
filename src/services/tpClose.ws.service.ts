// src/services/tpClose.ws.service.ts
// WebSocket-driven TP auto-close engine
// - Keeps an in-memory cache of open TP positions per symbol
// - Subscribes to per-symbol quote stream (bid/ask)
// - On every quote, checks whether TP is hit and closes atomically

import { smartTpPrice } from "@/utils/smartTradePolicy";
import AiPosition, { IAiPosition } from "@/models/AiPosition.model";
import { getTopOfBook, normalizeSymbol } from "@/services/quote.service";
import { subscribeQuote } from "@/services/quoteHub";
import { getContractSpec } from "@/services/specs.service";
import { netPnlAt, round2 } from "@/utils/takeProfit";

/* ────────── add: distribution after close ────────── */
import { distributeOnAutoCloseSimple } from "@/services/autoCloseDistributor.service";

/* ──────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────── */

/** Returns tick size from price digits (e.g., digits=2 -> 0.01). */
function tickFromDigits(d: number): number {
  return Number((1 / 10 ** d).toFixed(d));
}

/** Returns the TP trigger price for a position (absolute USD TP). */
function calcTpTriggerPrice(pos: IAiPosition): number {
  return smartTpPrice(pos);
}

/* ──────────────────────────────────────────────────────────
 * Core: try to close a single position with the given quote
 * ────────────────────────────────────────────────────────── */

export async function tryCloseIfTpHitWithQuote(
  pos: IAiPosition,
  bid: number,
  ask: number,
  specDigits: number,
  ts?: number
): Promise<{ closed: boolean; price?: number; pnl?: number }> {
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    return { closed: false };
  }

  const tick = tickFromDigits(specDigits);
  const eps = tick * 1e-6; // floating point tolerance only

  const trigger = calcTpTriggerPrice(pos);
  if (!Number.isFinite(trigger)) return { closed: false };

  const closePxRaw = pos.side === "buy" ? bid : ask;
  const hit =
    pos.side === "buy"
      ? closePxRaw + eps >= trigger
      : closePxRaw - eps <= trigger;

  if (!hit) return { closed: false };

  const closePrice = +closePxRaw.toFixed(specDigits);
  const pnl = round2(
    netPnlAt({
      entryPrice: pos.entryPrice,
      closePrice,
      side: pos.side as any,
      lots: pos.lots,
      contractSize: pos.contractSize || 1,
      commissionOpen: pos.commissionOpen || 0,
      commissionClose: pos.commissionClose || 0,
    })
  );

  // Atomic close (only if still open)
  const res = await AiPosition.updateOne(
    { _id: pos._id, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt: new Date(),
        closePrice,
        pnl,
        closeQuoteTs: ts ?? Date.now(),
        closeReason: "takeProfit_usd_ws",
        distributionPending: true,
        userProfitCredited: 0,
      },
    }
  ).exec();

  const applied = res.modifiedCount > 0;

  /* ── distribute funds + replicate per-plan once closed ─────────────────── */
  if (applied) {
    // The durable pending flag lets recovery finish delivery after a failure.
    // Do not hold quote processing or cache refresh open for ledger transactions.
    void (async () => {
    try {
      const dist = await distributeOnAutoCloseSimple(String(pos._id));

      // Optional: broadcast distribution meta for UI listeners
      if ((global as any).io) {
        (global as any).io.emit("position:distributed", {
          _id: String(pos._id),
          symbol: pos.symbol,
          perUserAmt: dist.perUserAmt,
          perParentsPool: dist.perParentsPool,
          companyTotal: dist.companyTotal,
          replicated: dist.replicated,
          usersAffected: dist.usersAffected,
          parentsAffected: dist.parentsAffected,
          txCount: dist.txCount,
        });
      }
    } catch (e) {
      // keep engine alive; log error for diagnostics
      console.error("[TP-WS] distribution error:", e);
    }
    })();
  }

  // Broadcast close event
  if (applied && (global as any).io) {
    (global as any).io.emit("position:closed", {
      _id: String(pos._id),
      symbol: pos.symbol,
      side: pos.side,
      closePrice,
      pnl,
      takeProfit: pos.takeProfit,
      reason: "takeProfit_usd_ws",
      closedBy: "ai",
    });
  }

  return { closed: applied, price: closePrice, pnl };
}

/* ──────────────────────────────────────────────────────────
 * In-memory cache and subscription management
 * ────────────────────────────────────────────────────────── */

type TpEntry = IAiPosition & {
  _sym: string; // normalized symbol (e.g., BTCUSDT)
  _digits: number; // spec.digits
  _trigger: number; // pre-computed TP trigger price
};

const cache = new Map<string, TpEntry[]>(); // key: symbol (UPPER)
const unsubMap = new Map<string, () => void>(); // key: symbol -> unsubscribe fn
const processing = new Map<string, boolean>(); // key: symbol -> reentrancy lock

// Rebuild interval for symbol-set & cache (tunable)
const REFRESH_MS = Number(process.env.TP_WS_REFRESH_MS ?? 4000);
let refreshTimer: NodeJS.Timeout | null = null;
let distributionTimer: NodeJS.Timeout | null = null;
let retryingDistributions = false;

async function retryPendingDistributions(): Promise<void> {
  if (retryingDistributions) return;
  retryingDistributions = true;
  try {
    const pending = await AiPosition.find({ status: "closed", distributionPending: true, distributedAt: { $exists: false } }).select("_id").limit(20).lean();
    for (const position of pending) {
      try { await distributeOnAutoCloseSimple(String(position._id)); }
      catch (error: any) { console.error("[TP] pending distribution failed", String(position._id), error?.message); }
    }
  } catch (error) {
    console.error("[TP] pending distribution scan failed", error);
  } finally {
    retryingDistributions = false;
  }
}

/**
 * Rebuilds the per-symbol TP cache from DB and manages WS subscriptions.
 * - Fetches open positions with TP > 0
 * - Groups by symbol and computes spec digits & trigger price
 * - Subscribes/unsubscribes to per-symbol quote streams as needed
 */
async function refreshCache(): Promise<void> {
  // 1) Fetch open TP positions
  const items: IAiPosition[] = await AiPosition.find({
    status: "open",
    takeProfit: { $gt: 0 },
  })
    .select({
      _id: 1,
      symbol: 1,
      side: 1,
      lots: 1,
      contractSize: 1,
      entryPrice: 1,
      commissionOpen: 1,
      commissionClose: 1,
      takeProfit: 1,
    })
    .lean(false)
    .exec();

  // 2) Build per-symbol groups with precomputed fields
  const bySym = new Map<string, TpEntry[]>();

  for (const p of items) {
    const s = normalizeSymbol(p.symbol);
    const spec = getContractSpec(s);
    const digits = spec.digits;
    const trig = calcTpTriggerPrice(p);
    if (!Number.isFinite(trig)) continue;

    const entry: TpEntry = Object.assign(p, {
      _sym: s,
      _digits: digits,
      _trigger: trig,
    });

    if (!bySym.has(s)) bySym.set(s, []);
    bySym.get(s)!.push(entry);
  }

  // Periodic recovery if a WebSocket disconnects or misses a brief update.
  // One quote per symbol; the open-status guard arbitrates races with WS closes.
  await Promise.all(Array.from(bySym, async ([sym, positions]) => {
    try {
      const q = await getTopOfBook(sym);
      await Promise.all(positions.map(pos =>
        tryCloseIfTpHitWithQuote(pos, Number(q.bid), Number(q.ask), pos._digits)));
    } catch (error) { console.error("[TP-WS] recovery check failed", sym, error); }
  }));

  // 3) Manage subscriptions (unsubscribe removed, subscribe new)
  const nextSymbols = new Set(bySym.keys());
  const currentSymbols = new Set(cache.keys());

  // Unsubscribe symbols no longer needed
  for (const sym of currentSymbols) {
    if (!nextSymbols.has(sym)) {
      cache.delete(sym);
      const off = unsubMap.get(sym);
      if (off) {
        try {
          off();
        } catch {
          /* noop */
        }
      }
      unsubMap.delete(sym);
      processing.delete(sym);
    }
  }

  // Subscribe new symbols and update cache
  for (const sym of nextSymbols) {
    cache.set(sym, bySym.get(sym)!);

    if (!unsubMap.has(sym)) {
      // Per-symbol quote handler
      const off = subscribeQuote(sym, async (q) => {
        if (processing.get(sym)) return;
        processing.set(sym, true);

        try {
          const list = cache.get(sym) || [];
          if (!list.length) return;

          // Try close on each cached position
          await Promise.all(
            list.map((pos) =>
              tryCloseIfTpHitWithQuote(pos, q.bid, q.ask, pos._digits, q.ts)
                .then((r) => {
                  if (r?.closed) {
                    // Remove from cache if closed
                    const remaining = (cache.get(sym) || []).filter(
                      (x) => String(x._id) !== String(pos._id)
                    );
                    cache.set(sym, remaining);
                  }
                })
                .catch(() => {
                  /* noop */
                })
            )
          );
        } finally {
          processing.set(sym, false);
        }
      });

      unsubMap.set(sym, off);
    }
  }
}

/* ──────────────────────────────────────────────────────────
 * Public API
 * ────────────────────────────────────────────────────────── */

/** Starts the WS-driven TP engine (idempotent). */
let refreshing = false;
async function refreshSafely() {
  if (refreshing) return;
  refreshing = true;
  try { await refreshCache(); }
  catch (error) { console.error("[TP-WS] cache refresh failed", error); }
  finally { refreshing = false; }
}

export function startTpWsEngine(): void {
  if (refreshTimer) return; // already running

  // Initial load immediately
  void refreshSafely();
  // Ledger retries can take minutes; they must never block open TP monitoring.
  void retryPendingDistributions();
  distributionTimer = setInterval(() => {
    void retryPendingDistributions();
  }, REFRESH_MS);

  // Periodic rebuild of symbol-set & cache
  refreshTimer = setInterval(() => {
    void refreshSafely();
  }, REFRESH_MS);
}

/** Stops the WS-driven TP engine and cleans up. */
export function stopTpWsEngine(): void {
  if (distributionTimer) {
    clearInterval(distributionTimer);
    distributionTimer = null;
  }
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  for (const off of unsubMap.values()) {
    try {
      off();
    } catch {
      /* noop */
    }
  }

  unsubMap.clear();
  cache.clear();
  processing.clear();
}
