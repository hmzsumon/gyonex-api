// src/services/tpClose.service.ts

import AiPosition, { IAiPosition } from "@/models/AiPosition.model";
import { getTopOfBook, normalizeSymbol } from "@/services/quote.service";
import { netPnlAt, round2 } from "@/utils/takeProfit";

/** ওপেন + takeProfit>0 ক্যান্ডিডেট */
export async function getTpCandidates(limit = 200): Promise<IAiPosition[]> {
  return AiPosition.find({
    status: "open",
    takeProfit: { $gt: 0 },
  })
    .sort({ updatedAt: 1 })
    .limit(limit)
    .lean(false)
    .exec();
}

/** বর্তমান কোটে নেট PnL (BUY→bid, SELL→ask) */
function currentNetPnl(pos: IAiPosition, bid: number, ask: number) {
  const closePx = pos.side === "buy" ? bid : ask;
  return netPnlAt({
    entryPrice: pos.entryPrice,
    closePrice: closePx,
    side: pos.side as any,
    lots: pos.lots,
    contractSize: pos.contractSize || 1,
    commissionOpen: pos.commissionOpen || 0,
    commissionClose: pos.commissionClose || 0,
  });
}

/**
 * USD takeProfit লজিক:
 * - যদি currentNetPnl >= takeProfit (USD) → ক্লোজ
 * - একবারেই অ্যাটমিক আপডেট করে closed করা হবে
 */
export async function tryCloseIfTpHit(pos: IAiPosition) {
  const symbol = normalizeSymbol(pos.symbol);
  const { bid, ask } = await getTopOfBook(symbol);

  const tpUsd = Number(pos.takeProfit);
  if (!Number.isFinite(tpUsd) || tpUsd <= 0) {
    return { closed: false };
  }

  const net = currentNetPnl(pos, bid, ask);
  if (!Number.isFinite(net)) return { closed: false };

  if (net < tpUsd) return { closed: false }; // এখনও টার্গেট পৌঁছায়নি

  const closePrice = pos.side === "buy" ? bid : ask;
  const pnl = round2(net);

  // অ্যাটমিক close: শুধুই open হলে পরিবর্তন
  const res = await AiPosition.updateOne(
    { _id: pos._id, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt: new Date(),
        closePrice,
        pnl,
      },
    }
  ).exec();

  const applied = res.modifiedCount > 0;

  if (applied && (global as any).io) {
    (global as any).io.emit("position:closed", {
      _id: String(pos._id),
      symbol: pos.symbol,
      side: pos.side,
      closePrice,
      pnl,
      reason: "takeProfit_usd",
    });
  }

  return { closed: applied, pnl, price: closePrice };
}

/** এক টিক জব */
export async function tpTickOnce(batchSize = 200) {
  const items = await getTpCandidates(batchSize);
  let closed = 0;

  for (const p of items) {
    try {
      const r = await tryCloseIfTpHit(p);
      if (r.closed) closed++;
    } catch (e: any) {
      console.error("[TP] close error:", String(p._id), e?.message || e);
    }
  }

  return { scanned: items.length, closed };
}
