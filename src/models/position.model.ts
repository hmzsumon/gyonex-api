/* ────────────────────────────────────────────────────────────
   Position model — hedging-style positions (demo/real)
──────────────────────────────────────────────────────────── */
import { Document, model, Schema, Types } from "mongoose";

export interface IPosition extends Document {
  accountId: Types.ObjectId;
  userId: Types.ObjectId;
  customerId: string;
  symbol: string; // e.g. BTCUSDT
  side: "buy" | "sell";
  lots: number; // 0.01 etc.
  contractSize: number; // crypto=1, XAU=100, FX=100000
  entryPrice: number; // number, not string
  margin: number;
  commissionOpen: number;
  commissionClose?: number;
  status: "open" | "closed";
  openedAt: Date;
  closedAt?: Date;
  closePrice?: number;
  pnl?: number; // realized P/L when closed
  meta?: Record<string, any>;
}

const positionSchema = new Schema<IPosition>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      index: true,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    customerId: { type: String },
    symbol: { type: String, required: true, index: true },
    side: { type: String, enum: ["buy", "sell"], required: true },

    // core trading fields
    lots: { type: Number, required: true },
    contractSize: { type: Number, required: true, default: 1 },
    entryPrice: { type: Number, required: true },

    // accounting
    margin: { type: Number, required: true },
    commissionOpen: { type: Number, default: 0 },
    commissionClose: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    openedAt: { type: Date, default: () => new Date() },
    closedAt: Date,
    closePrice: Number,
    pnl: Number,

    meta: { type: Object },
  },
  { timestamps: true }
);

positionSchema.index({ accountId: 1, status: 1, symbol: 1 });

export default model<IPosition>("Position", positionSchema);
