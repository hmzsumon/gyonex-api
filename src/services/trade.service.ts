// src/services/trade.service.ts
import Account from "@/models/Account.model";
import Position from "@/models/position.model";
import { getTopOfBook } from "@/services/quote.service";
import { io } from "@/socket";

/** ছোট util */
const round = (n: number, d = 2) =>
  Number.isFinite(n) ? Number(n.toFixed(d)) : n;

type CloseReason = "manual" | "stopout";

/**
 * Core close logic usable from controllers & workers
 * - Fetches live quote
 * - Computes net P/L
 * - Updates Position + Account (balance/equity/marginUsed)
 * - Emits socket events to keep UI in sync
 */
export async function closePositionCore(
  posId: string,
  reason: CloseReason = "manual"
) {
  const pos = await Position.findById(posId);
  if (!pos) throw new Error("Position not found");
  if (pos.status !== "open") return null; // already closed by someone else

  const acc = await Account.findById(pos.accountId);
  if (!acc) throw new Error("Account not found");

  // numbers
  const lots = Number(pos.lots);
  const entry = Number(pos.entryPrice);
  const csize = Number(pos.contractSize ?? 1);
  if (![lots, entry, csize].every(Number.isFinite)) {
    throw new Error("Invalid position numbers");
  }

  // live quote for exit price
  const q = await getTopOfBook(String(pos.symbol));
  const closePx = pos.side === "buy" ? Number(q.bid) : Number(q.ask);
  if (!Number.isFinite(closePx) || closePx <= 0) {
    throw new Error("Price unavailable");
  }

  // P/L
  const diff = pos.side === "buy" ? closePx - entry : entry - closePx;
  const gross = diff * csize * lots;
  // চাইলে ENV/কনফিগ থেকে কমিশন নিন
  const commissionClose = Number(process.env.COMMISSION_CLOSE ?? 0);
  const net = round(gross - commissionClose, 2);

  // ✅ idempotent close (race-safe)
  const now = new Date();
  const closed = await Position.findOneAndUpdate(
    { _id: pos._id, status: "open" },
    {
      $set: {
        status: "closed",
        closedAt: now,
        closePrice: closePx,
        commissionClose,
        pnl: net,
        closeReason: reason,
      },
    },
    { new: true }
  );
  if (!closed) return null; // someone else closed in between

  // account updates (match your controller behavior)
  const usedBefore = Number(acc.marginUsed ?? 0);
  const posMargin = Number(pos.margin ?? 0);
  const newMarginUsed = round(Math.max(0, usedBefore - posMargin), 2);
  const newBalance = round(Number(acc.balance ?? 0) + net, 2);
  const newEquity = newBalance; // যদি elsewhere আপনি equity আলাদা হিসাব করেন, সেটি ব্যবহার করুন

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

  // 🔔 Push updates to the user's room so UI refreshes immediately
  try {
    const room = String(acc.userId);
    io?.to(room).emit("positions:changed", { accountId: String(acc._id) });
    io?.to(room).emit("position:closed", {
      id: String(closed._id),
      symbol: closed.symbol,
      pnl: net,
      reason,
      closePrice: closePx,
      closedAt: now.toISOString(),
    });
    io?.to(room).emit("account:update", {
      accountId: String(acc._id),
      balance: newBalance,
      equity: newEquity,
      marginUsed: newMarginUsed,
    });
  } catch (e) {
    // শুধু লগ—মূল ক্লোজ সফলই থাকবে
    console.warn(
      "[closePositionCore] socket emit failed:",
      (e as any)?.message || e
    );
  }

  return {
    closed,
    account: {
      id: String(acc._id),
      balance: newBalance,
      equity: newEquity,
      marginUsed: newMarginUsed,
    },
  };
}
