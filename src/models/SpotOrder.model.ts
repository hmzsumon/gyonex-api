// src/models/SpotOrder.model.ts
import { Document, Schema, Types, model } from "mongoose";

export type SpotSide = "buy" | "sell";
export type SpotOrderType = "market" | "limit";

export interface ISpotOrder extends Document {
  userId: Types.ObjectId;
  customerId: string;
  symbol: string; // BTCUSDT
  side: SpotSide; // buy / sell
  type: SpotOrderType; // market / limit
  price: number; // fill price
  quantity: number; // base asset amount (BTC)
  notional: number; // price * quantity (USDT)
  fee: number; // base asset fee (amount * 0.000075)
  status: "filled" | "rejected";
  iconUrl?: string;
  reason?: string;
  filledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const spotOrderSchema = new Schema<ISpotOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: { type: String },
    symbol: { type: String, required: true },
    side: { type: String, enum: ["buy", "sell"], required: true },
    type: { type: String, enum: ["market", "limit"], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    notional: { type: Number, required: true },
    fee: { type: Number, required: true },
    status: {
      type: String,
      enum: ["filled", "rejected"],
      default: "filled",
    },

    iconUrl: { type: String },
    reason: String,
    filledAt: Date,
  },
  { timestamps: true }
);

const SpotOrder = model<ISpotOrder>("SpotOrder", spotOrderSchema);
export default SpotOrder;
