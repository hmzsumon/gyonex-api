import mongoose from "mongoose";
import Account from "@/models/AiAccount.model";
import Position from "@/models/AiPosition.model";
import { ApiError } from "@/utils/ApiError";
import { getTopOfBook } from "@/services/quote.service";
import { netPnlAt, round2 } from "@/utils/takeProfit";
import { distributeOnAutoCloseSimple } from "@/services/autoCloseDistributor.service";

// Closing and delivery are separate: a failed delivery remains retryable.
export async function closeSmartPosition(id: string, userId: string, role: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid position ID");
  const pos = await Position.findById(id);
  if (!pos) throw new ApiError(404, "Position not found");
  const account = await Account.findById(pos.accountId);
  if (!account || (role !== "admin" && String(account.userId) !== userId))
    throw new ApiError(403, "Not allowed");
  if (pos.status !== "open") throw new ApiError(400, "Position already closed");
  const q = await getTopOfBook(pos.symbol);
  const closePrice = Number(pos.side === "buy" ? q.bid : q.ask);
  const pnl = round2(netPnlAt({ ...pos.toObject(), closePrice }));
  if (!(closePrice > 0) || !Number.isFinite(closePrice) || !Number.isFinite(pnl))
    throw new ApiError(503, "Price or position numbers unavailable");
  const position = await Position.findOneAndUpdate({ _id: id, status: "open" }, {
    $set: { status: "closed", closedAt: new Date(), closePrice, pnl,
      closeReason: "manual", is_loss: pnl < 0, userProfitCredited: 0,
      distributionPending: pnl > 0 && !pos.isStopLoss },
  }, { new: true });
  if (!position) throw new ApiError(409, "Position already closed");
  if (pos.isStopLoss) {
    const remaining = await Position.exists({ accountId: pos.accountId, status: "open", isStopLoss: true });
    if (!remaining) await Account.updateOne({ _id: pos.accountId }, { $set: { is_stop_loss: false } });
  }
  let distributionPending = !!position.distributionPending;
  if (distributionPending) {
    try { await distributeOnAutoCloseSimple(id); distributionPending = false; }
    catch (error) { console.error("[SmartTrade] manual distribution pending", id, error); }
  }
  (global as any).io?.emit("position:closed", {
    _id: id, symbol: pos.symbol, side: pos.side, closePrice, pnl,
    reason: "manual", closedBy: "admin",
  });
  return { position, distributionPending, account: { balance: account.balance, equity: account.equity } };
}
