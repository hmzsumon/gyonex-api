/* ────────── lottery model imports ────────── */
import mongoose, { Document, Schema, Types } from "mongoose";

/* ────────── Lottery winner type definitions ────────── */
/* ────────── lottery winner document interface ────────── */
export interface ILotteryWinner extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  ticketId: Types.ObjectId;
  userId: Types.ObjectId;
  ticketNo: string;
  prizeTitle: string;
  prizeRank: number;
  prizeAmount: number;
  prizeAsset: string;
  winnerName: string;
  maskedName: string;
  country: string;
  drawnBy?: Types.ObjectId;
  drawnAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/* ────────── Lottery winner schema fields ────────── */
const LotteryWinnerSchema = new Schema<ILotteryWinner>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "LotteryEvent",
      required: true,
      index: true,
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "LotteryTicket",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ticketNo: { type: String, required: true },
    prizeTitle: { type: String, required: true, default: "Prize" },
    prizeRank: { type: Number, required: true, min: 1, default: 1 },
    prizeAmount: { type: Number, required: true, min: 1 },
    prizeAsset: { type: String, default: "USDT" },
    winnerName: { type: String, default: "User" },
    maskedName: { type: String, default: "U***r" },
    country: { type: String, default: "🌍" },
    drawnBy: { type: Schema.Types.ObjectId, ref: "User" },
    drawnAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/* ────────── lottery winner query indexes ────────── */
LotteryWinnerSchema.index({ eventId: 1, ticketId: 1 }, { unique: true });
LotteryWinnerSchema.index({ drawnAt: -1 });

/* ────────── lottery winner model export ────────── */
export const LotteryWinner =
  (mongoose.models.LotteryWinner as mongoose.Model<ILotteryWinner>) ||
  mongoose.model<ILotteryWinner>("LotteryWinner", LotteryWinnerSchema);
