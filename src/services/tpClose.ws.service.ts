// src/services/tpClose.ws.service.ts
// WebSocket-driven TP auto-close engine
// - Keeps an in-memory cache of open TP positions per symbol
// - Subscribes to per-symbol quote stream (bid/ask)
// - On every quote, checks whether TP is hit and closes atomically

import AiPosition, { IAiPosition } from "@/models/AiPosition.model";
import { normalizeSymbol } from "@/services/quote.service";
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
  const qty = (pos.lots || 0) * (pos.contractSize || 1);
  if (!(qty > 0)) return NaN;

  const fees = (pos.commissionOpen || 0) + (pos.commissionClose || 0);
  const tpUsd = Number(pos.takeProfit) || 0;
  if (!(tpUsd > 0)) return NaN;

  const delta = (tpUsd + fees) / qty;
  return pos.side === "buy" ? pos.entryPrice + delta : pos.entryPrice - delta;
}

/* ──────────────────────────────────────────────────────────
 * Core: try to close a single position with the given quote
 * ────────────────────────────────────────────────────────── */

async function tryCloseIfTpHitWithQuote(
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
  const eps = tick; // tolerance = one tick

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
      },
    }
  ).exec();

  const applied = res.modifiedCount > 0;

  /* ── distribute funds + replicate per-plan once closed ─────────────────── */
  if (applied) {
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
export function startTpWsEngine(): void {
  if (refreshTimer) return; // already running

  // Initial load immediately
  refreshCache().catch(() => {});

  // Periodic rebuild of symbol-set & cache
  refreshTimer = setInterval(() => {
    refreshCache().catch(() => {});
  }, REFRESH_MS);
}

/** Stops the WS-driven TP engine and cleans up. */
export function stopTpWsEngine(): void {
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
