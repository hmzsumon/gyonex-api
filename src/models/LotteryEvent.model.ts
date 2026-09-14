/* ────────── lottery model imports ────────── */
import mongoose, { Document, Schema, Types } from "mongoose";

/* ────────── Lottery event type definitions ────────── */
/* ────────── lottery event enum types ────────── */
export type LotteryEventType = "WEEKLY" | "HALF_MONTHLY" | "MONTHLY";
export type LotteryStatus =
  | "draft"
  | "upcoming"
  | "open"
  | "drawn"
  | "cancelled";

/* ────────── lottery prize tier interface ────────── */
export interface ILotteryPrizeTier {
  title: string;
  quantity: number;
  amount: number;
}

/* ────────── lottery event document interface ────────── */
export interface ILotteryEvent extends Document<Types.ObjectId> {
  _id: Types.ObjectId;
  eventType: LotteryEventType;
  title: string;
  description: string;
  prizeAmount: number;
  prizeAsset: string;
  prizeTiers: ILotteryPrizeTier[];
  ticketPrice: number;
  maxTickets: number;
  winnerCount: number;
  startDate: Date;
  endDate: Date;
  drawDate: Date;
  status: LotteryStatus;
  isAutoDraw: boolean;
  drawPreviewToken?: string;
  ticketSequence: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/* ────────── Lottery event schema fields ────────── */
const LotteryEventSchema = new Schema<ILotteryEvent>(
  {
    eventType: {
      type: String,
      enum: ["WEEKLY", "HALF_MONTHLY", "MONTHLY"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    prizeAmount: { type: Number, required: true, min: 1 },
    prizeAsset: { type: String, default: "USDT" },
    prizeTiers: {
      type: [
        {
          title: { type: String, required: true, trim: true },
          quantity: { type: Number, required: true, min: 1 },
          amount: { type: Number, required: true, min: 1 },
        },
      ],
      default: [],
    },
    ticketPrice: { type: Number, required: true, min: 1 },
    maxTickets: { type: Number, required: true, min: 1, default: 10_000 },
    winnerCount: { type: Number, required: true, min: 1, default: 1 },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true, index: true },
    drawDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["draft", "upcoming", "open", "drawn", "cancelled"],
      default: "open",
      index: true,
    },
    isAutoDraw: { type: Boolean, default: true },
    drawPreviewToken: { type: String, select: false },
    ticketSequence: { type: Number, default: 0, min: 0, select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

/* ────────── Lottery event query indexes ────────── */
LotteryEventSchema.index({ status: 1, eventType: 1, drawDate: 1 });
LotteryEventSchema.index({ eventType: 1, status: 1, startDate: -1 });

/* ────────── lottery event model export ────────── */
export const LotteryEvent =
  (mongoose.models.LotteryEvent as mongoose.Model<ILotteryEvent>) ||
  mongoose.model<ILotteryEvent>("LotteryEvent", LotteryEventSchema);
