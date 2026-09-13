// src/services/slClose.ws.service.ts

import AiAccount from "@/models/AiAccount.model";
import AiPosition, { IAiPosition } from "@/models/AiPosition.model";
import { Notification } from "@/models/Notification.model";
import { normalizeSymbol } from "@/services/quote.service";
import { subscribeQuote } from "@/services/quoteHub";
import { getContractSpec } from "@/services/specs.service";
import { netPnlAt, round2 } from "@/utils/takeProfit";

/* ---------------- Helpers ---------------- */

function tickFromDigits(d: number): number {
  return Number((1 / 10 ** d).toFixed(d));
}

/* ---------------- StopLoss Close Logic ---------------- */

async function tryCloseIfSlHitWithQuote(
  pos: IAiPosition,
  bid: number,
  ask: number,
  specDigits: number,
  ts?: number
) {
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return { closed: false };

  const stopLoss = Number(pos.stopLoss) || 0;
  if (!(stopLoss > 0)) return { closed: false };

  const closePxRaw = pos.side === "buy" ? bid : ask;
  const closePrice = +closePxRaw.toFixed(specDigits);

  const pnl = round2(
    netPnlAt({
      entryPrice: pos.entryPrice,
      closePrice,
      side: pos.side as any,
      lots: pos.lots,
      contractSize: pos.contractSize,
      commissionOpen: pos.commissionOpen,
      commissionClose: pos.commissionClose,
    })
  );

  if (!(pnl <= -stopLoss)) return { closed: false };

  const res = await AiPosition.updateOne(
    { _id: pos._id, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt: new Date(),
        closePrice,
        pnl,
        closeQuoteTs: ts ?? Date.now(),
        closeReason: "stopLoss_usd_ws",
        is_loss: true,
      },
    }
  );

  const applied = res.modifiedCount > 0;

  if (applied) {
    try {
      const acc = await AiAccount.findById(pos.accountId);
      if (acc && acc.role !== "admin") {
        const curBal = Number(acc.balance ?? 0);
        const curEq = Number(acc.equity ?? curBal);

        const afterLossBal = Math.max(0, round2(curBal - stopLoss));
        const afterLossEq = Math.max(0, round2(curEq - stopLoss));

        /* REFUND = 50% OF PLAN PRICE */
        const refund = round2((Number(acc.planPrice) || 0) * 0.5);

        acc.balance = round2(afterLossBal + refund);
        acc.equity = round2(afterLossEq + refund);

        acc.is_active = false;
        acc.status = "inactive";
        acc.is_stop_loss = false;

        await acc.save();

        /* --- Notification --- */
        const notifyText = `You received a refund of ${refund} USDT.`;

        const notif = await Notification.create({
          user_id: acc.userId,
          role: "user",
          category: "refund",
          title: "AI StopLoss Refund Issued",
          message: notifyText,
          url: "/ai-accounts",
        });

        if (global?.io?.to) {
          // ⚠️ socket/index.ts-এ ইউজার রুমের নাম "u:<id>" — এখানেও একই ফরম্যাট।
          const uid = String(acc.userId);
          const room = `u:${uid}`;

          global.io.to(room).emit("notifications:new", notif);

          const unread = await Notification.countDocuments({
            user_id: uid,
            is_read: false,
          });

          global.io.to(room).emit("notifications:count", { count: unread });
        }
      }
    } catch (err) {
      console.error("[SL-WS] account/refund update error:", err);
    }

    if (global?.io) {
      global.io.emit("position:closed", {
        _id: String(pos._id),
        symbol: pos.symbol,
        closePrice,
        pnl,
        reason: "stopLoss_usd_ws",
        stopLoss,
      });
    }
  }

  return { closed: applied, price: closePrice, pnl };
}

/* ---------------- WS Cache Engine ---------------- */

type SlEntry = IAiPosition & { _sym: string; _digits: number };

const cache = new Map<string, SlEntry[]>();
const unsubMap = new Map<string, () => void>();
const processing = new Map<string, boolean>();
let refreshTimer: NodeJS.Timeout | null = null;

async function refreshCache() {
  const items: IAiPosition[] = await AiPosition.find({
    status: "open",
    isStopLoss: true,
    stopLoss: { $gt: 0 },
  });

  const bySym = new Map<string, SlEntry[]>();

  for (const p of items) {
    const s = normalizeSymbol(p.symbol);
    const spec = getContractSpec(s);
    const entry: SlEntry = Object.assign(p, {
      _sym: s,
      _digits: spec.digits,
    });

    if (!bySym.has(s)) bySym.set(s, []);
    bySym.get(s)!.push(entry);
  }

  const next = new Set(bySym.keys());
  const curr = new Set(cache.keys());

  for (const s of curr)
    if (!next.has(s)) {
      cache.delete(s);
      const off = unsubMap.get(s);
      off?.();
      unsubMap.delete(s);
      processing.delete(s);
    }

  for (const s of next) {
    cache.set(s, bySym.get(s)!);

    if (!unsubMap.has(s)) {
      const off = subscribeQuote(s, async (q) => {
        if (processing.get(s)) return;
        processing.set(s, true);

        try {
          const arr = cache.get(s) || [];
          await Promise.all(
            arr.map((pos) =>
              tryCloseIfSlHitWithQuote(
                pos,
                q.bid,
                q.ask,
                pos._digits,
                q.ts
              ).then((r) => {
                if (r?.closed) {
                  cache.set(
                    s,
                    (cache.get(s) || []).filter(
                      (x) => String(x._id) !== String(pos._id)
                    )
                  );
                }
              })
            )
          );
        } finally {
          processing.set(s, false);
        }
      });

      unsubMap.set(s, off);
    }
  }
}

/* ---------------- Public API ---------------- */

export function startSlWsEngine() {
  if (refreshTimer) return;
  refreshCache();
  refreshTimer = setInterval(refreshCache, 4000);
}

export function stopSlWsEngine() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;

  for (const off of unsubMap.values()) off?.();
  cache.clear();
  unsubMap.clear();
  processing.clear();
}
