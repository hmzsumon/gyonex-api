// services/liquidation.service.ts
/* ─────────────────────────────────────────────────────────────
   Liquidation Service (demo)
   - maybeLiquidateAccount(accountId, opts?)
   - calculates live equity using latest quotes (grouped per symbol)
   - if equity <= 0 (or <= stopOut threshold), market-close all open positions
   - concurrency-safe (lightweight Mongo "liquidating" flag)
────────────────────────────────────────────────────────────── */

import Account from "@/models/Account.model";
import Position from "@/models/position.model";
import { getTopOfBook } from "@/services/quote.service";
import { getContractSpec } from "@/services/specs.service";

const round = (n: number, d = 2) =>
  Number.isFinite(n) ? Number(n.toFixed(d)) : n;

type LiquidationOpts = {
  /** will liquidate if equity <= 0 always; but you can also add a stop-out like 20% of marginUsed */
  stopOutPctOfUsed?: number; // e.g. 0.2 → 20% of marginUsed
  dryRun?: boolean; // for testing: compute but don't close
};

/* ────────── group helpers ────────── */
function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K) {
  const map = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = map.get(k);
    if (arr) arr.push(r);
    else map.set(k, [r]);
  }
  return map;
}

/* ────────── compute live PnL for account (grouped by symbol) ────────── */
async function computeLivePnlForAccount(accountId: string) {
  const open = await Position.find({ accountId, status: "open" })
    .select("_id symbol side entryPrice lots contractSize status")
    .lean();

  if (open.length === 0) {
    return {
      totalPnl: 0,
      bySymbol: new Map<string, number>(),
      positions: open,
    };
  }

  const bySym = groupBy(open, (p) => String(p.symbol).toUpperCase());
  const symbols = Array.from(bySym.keys());

  // fetch quotes per symbol
  const quotes = await Promise.all(
    symbols.map(async (s) => {
      try {
        const q = await getTopOfBook(s);
        return { s, q };
      } catch {
        return { s, q: { bid: NaN, ask: NaN, ts: Date.now() } };
      }
    })
  );

  const quoteMap = new Map<string, { bid: number; ask: number }>();
  for (const { s, q } of quotes) quoteMap.set(s, { bid: q.bid, ask: q.ask });

  // sum PnL
  let totalPnl = 0;
  const bySymbolPnl = new Map<string, number>();

  for (const s of symbols) {
    const list = bySym.get(s)!;
    const q = quoteMap.get(s) ?? { bid: NaN, ask: NaN };
    if (!Number.isFinite(q.bid) || !Number.isFinite(q.ask)) {
      // if price missing → treat as 0 contribution (conservative)
      bySymbolPnl.set(s, 0);
      continue;
    }
    let acc = 0;
    for (const p of list) {
      const lots = Number(p.lots ?? 0);
      const entry = Number(p.entryPrice ?? 0);
      const csize = Number(p.contractSize ?? 1);
      if (![lots, entry, csize].every(Number.isFinite)) continue;
      const close = p.side === "buy" ? q.bid : q.ask;
      const diff = p.side === "buy" ? close - entry : entry - close;
      const v = diff * csize * lots;
      if (Number.isFinite(v)) acc += v;
    }
    bySymbolPnl.set(s, acc);
    totalPnl += acc;
  }

  return {
    totalPnl: round(totalPnl, 2),
    bySymbol: bySymbolPnl,
    positions: open,
  };
}

/* ────────── close one position at market (bid/ask) ────────── */
async function closePositionAtMarket(p: any) {
  const q = await getTopOfBook(String(p.symbol));
  const closePx = p.side === "buy" ? Number(q.bid) : Number(q.ask);
  if (!Number.isFinite(closePx) || closePx <= 0) {
    throw new Error("Price unavailable for liquidation");
  }
  const spec = getContractSpec(String(p.symbol));
  const lots = Number(p.lots ?? 0);
  const entry = Number(p.entryPrice ?? 0);
  const csize = Number(p.contractSize ?? spec.contractSize ?? 1);

  const diff = p.side === "buy" ? closePx - entry : entry - closePx;
  const gross = diff * csize * lots;
  const commissionClose = 0;
  const net = round(gross - commissionClose, 2);

  const closed = await Position.findOneAndUpdate(
    { _id: p._id, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt: new Date(),
        closePrice: closePx,
        commissionClose,
        pnl: net,
      },
    },
    { new: true }
  );
  return { closed, pnl: net, closePrice: closePx };
}

/* ────────── main: check & liquidate ────────── */
export async function maybeLiquidateAccount(
  accountId: string,
  opts: LiquidationOpts = {}
) {
  // lightweight lock to avoid concurrent liquidation on same account
  const lock = await Account.findOneAndUpdate(
    { _id: accountId, liquidating: { $ne: true } as any },
    { $set: { liquidating: true } },
    { new: true }
  ).lean();

  if (!lock || (lock as any).liquidating !== true) {
    return { ok: false, reason: "locked_or_missing" };
  }

  try {
    const acc = await Account.findById(accountId);
    if (!acc) return { ok: false, reason: "account_not_found" };

    const balance = Number(acc.balance ?? 0);
    const marginUsed = Number(acc.marginUsed ?? 0);

    const { totalPnl, positions } = await computeLivePnlForAccount(accountId);
    const equity = round(balance + totalPnl, 2);

    const stopOutHit =
      typeof opts.stopOutPctOfUsed === "number" && marginUsed > 0
        ? equity <= round(marginUsed * opts.stopOutPctOfUsed, 2)
        : false;

    // core rule: equity <= 0 OR stop-out threshold
    if (equity > 0 && !stopOutHit) {
      return { ok: true, liquidated: false, equity, totalPnl, count: 0 };
    }

    if (opts.dryRun) {
      return {
        ok: true,
        liquidated: false,
        equity,
        totalPnl,
        count: positions.length,
        dryRun: true,
      };
    }

    // close all open positions (best-effort; ignore already-closed)
    let realized = 0;
    for (const p of positions) {
      try {
        const { closed, pnl } = await closePositionAtMarket(p);
        if (closed) realized += pnl;
      } catch {
        /* swallow individual failures and continue */
      }
    }

    // update account balances (demo: equity mirrors balance)
    const newMarginUsed = 0; // after closing all, used margin becomes 0
    const newBalance = round(Number(acc.balance ?? 0) + realized, 2);
    const newEquity = newBalance;

    await Account.updateOne(
      { _id: acc._id },
      {
        $set: {
          marginUsed: newMarginUsed,
          balance: newBalance,
          equity: newEquity,
        },
      }
    );

    return {
      ok: true,
      liquidated: true,
      equityBefore: equity,
      pnlRealized: realized,
      newBalance,
      newEquity,
    };
  } finally {
    // release lock
    await Account.updateOne(
      { _id: accountId },
      { $unset: { liquidating: "" } }
    );
  }
}
