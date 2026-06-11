// src/events/positions.ts
import { IAiPosition } from "@/models/AiPosition.model";
import { io as socketIO } from "@/socket";

export type OpenedPayload = {
  _id: string;
  accountId: string;
  userId: string;
  customerId?: string;
  symbol: string;
  side: "buy" | "sell";
  lots: number;
  entryPrice: number;
  contractSize: number;
  margin: number;
  commissionOpen: number;
  status: "open";
  openedAt: string;
  plan?: string;
  planPrice?: number;
  reason?: "manual" | "market" | "api";
};

export function emitPositionOpened(
  pos: IAiPosition,
  reason: OpenedPayload["reason"] = "market"
) {
  const io = socketIO ?? (global as any).io;
  if (!io) return;

  const payload: OpenedPayload = {
    _id: String(pos._id),
    accountId: String(pos.accountId),
    userId: String(pos.userId),
    customerId: pos.customerId,
    symbol: pos.symbol,
    side: pos.side,
    lots: pos.lots,
    entryPrice: pos.entryPrice,
    contractSize: pos.contractSize ?? 1,
    margin: pos.margin ?? 0,
    commissionOpen: pos.commissionOpen ?? 0,
    status: "open",
    openedAt: (pos.openedAt ?? new Date()).toISOString(),
    plan: pos.plan,
    planPrice: pos.planPrice,
    reason,
  };

  // ইউজার রুম
  io.to(String(pos.userId)).emit("position:opened", payload);
  // (ঐচ্ছিক) অ্যাকাউন্ট রুম
  io.to(`account:${String(pos.accountId)}`).emit("position:opened", payload);

  // ✅ add this line
  io.emit("position:opened", payload);

  // (ঐচ্ছিক) গ্লোবাল চ্যানেল (অ্যাডমিন/মনিটরিং)
  io.emit("position:opened:all", payload);
}
