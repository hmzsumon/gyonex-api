import { Document, Schema, Types, model } from "mongoose";

export interface IUserCoinSummary extends Document {
  userId: Types.ObjectId;
  customerId?: string;

  asset: string;
  symbol: string;
  iconUrl?: string;

  // staking
  totalSubscribedQty: number; // “cost” হিসেবে (staking principal lifetime)
  totalProfitQty: number; // staking profit (net user share)
  totalBonusQty: number; // bonus received as parent

  // trading (SpotOrder থেকে)
  totalBuyQty: number;
  totalBuyNotional: number;
  totalSellQty: number;
  totalSellNotional: number;
  totalFee: number;

  // pnl (simple)
  simplePnlNotional: number; // sellNotional - buyNotional
  realizedPnl: number; // SpotWallet.realizedPnl snapshot

  reconciledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const userCoinSummarySchema = new Schema<IUserCoinSummary>(
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
    iconUrl: { type: String },

    totalSubscribedQty: { type: Number, default: 0 },
    totalProfitQty: { type: Number, default: 0 },
    totalBonusQty: { type: Number, default: 0 },

    totalBuyQty: { type: Number, default: 0 },
    totalBuyNotional: { type: Number, default: 0 },
    totalSellQty: { type: Number, default: 0 },
    totalSellNotional: { type: Number, default: 0 },
    totalFee: { type: Number, default: 0 },

    simplePnlNotional: { type: Number, default: 0 },
    realizedPnl: { type: Number, default: 0 },

    reconciledAt: { type: Date },
  },
  { timestamps: true }
);

userCoinSummarySchema.index({ userId: 1, symbol: 1 }, { unique: true });

const UserCoinSummary = model<IUserCoinSummary>(
  "UserCoinSummary",
  userCoinSummarySchema
);
export default UserCoinSummary;
