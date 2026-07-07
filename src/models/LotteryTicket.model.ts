/* ────────── lottery model imports ────────── */
import mongoose, { Document, Schema, Types } from "mongoose";

/* ────────── Lottery ticket type definitions ────────── */
/* ────────── lottery ticket document interface ────────── */
export interface ILotteryTicket extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  userId: Types.ObjectId;
  ticketNo: string;
  price: number;
  asset: string;
  status: "active" | "winner" | "expired" | "refunded" | "cancelled";
  purchasedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/* ────────── Lottery ticket schema fields ────────── */
const LotteryTicketSchema = new Schema<ILotteryTicket>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "LotteryEvent",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ticketNo: { type: String, required: true, unique: true, index: true },
    price: { type: Number, required: true, min: 1 },
    asset: { type: String, default: "USDT" },
    status: {
      type: String,
      enum: ["active", "winner", "expired", "refunded", "cancelled"],
      default: "active",
      index: true,
    },
    purchasedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/* ────────── lottery ticket query indexes ────────── */
LotteryTicketSchema.index({ eventId: 1, userId: 1, createdAt: -1 });
LotteryTicketSchema.index({ userId: 1, createdAt: -1 });

/* ────────── lottery ticket model export ────────── */
export const LotteryTicket =
  (mongoose.models.LotteryTicket as mongoose.Model<ILotteryTicket>) ||
  mongoose.model<ILotteryTicket>("LotteryTicket", LotteryTicketSchema);
