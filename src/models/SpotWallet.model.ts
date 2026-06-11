// src/models/SpotWallet.model.ts
import { Document, Schema, Types, model } from "mongoose";

export interface ISpotWallet extends Document {
  userId: Types.ObjectId;
  customerId: string;
  asset: string; // BTC
  symbol: string; // BTCUSDT
  qty: number; // কত BTC/ACM ইত্যাদি
  avgPrice: number; // average buy price (USDT)
  realizedPnl: number;

  iconUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const spotWalletSchema = new Schema<ISpotWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: { type: String },
    asset: { type: String, required: true },
    symbol: { type: String, required: true },
    qty: { type: Number, required: true, default: 0 },
    avgPrice: { type: Number, required: true, default: 0 },
    realizedPnl: { type: Number, default: 0 },
    iconUrl: { type: String },
  },
  { timestamps: true }
);

// প্রতি ইউজার + symbol ইউনিক
spotWalletSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const SpotWallet = model<ISpotWallet>("SpotWallet", spotWalletSchema);
export default SpotWallet;
