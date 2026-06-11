// src/models/StakingProfitLog.model.ts
import { Document, Schema, Types, model } from "mongoose";

export type StakingLogType = "profit" | "cancel" | "principal_return";

export interface IStakingProfitLog extends Document {
  type: StakingLogType;

  subscriptionId: Types.ObjectId;
  userId: Types.ObjectId;

  asset?: string; // BTC (optional but helpful)
  symbol: string; // BTCUSDT

  dayKey: string; // YYYY-MM-DD

  // ✅ PROFIT (net to user)
  profitQty?: number;

  // ✅ bookkeeping (profit split)
  grossProfitQty?: number;
  userSharePercent?: number;
  remainderQty?: number;
  parentsBonusQty?: number;
  systemQty?: number;

  // ✅ CANCEL / RETURN history fields
  principalQty?: number;
  paidDays?: number;

  fixedDailyPercent?: number; // subscription.dailyProfitPercent
  baseDailyPercent?: number; // flex daily (e.g. 0.32)
  penaltyPercent?: number;
  penaltyQty?: number;
  principalReturnQty?: number;

  note?: string;

  createdAt: Date;
  updatedAt: Date;
}

const stakingProfitLogSchema = new Schema<IStakingProfitLog>(
  {
    type: {
      type: String,
      enum: ["profit", "cancel", "principal_return"],
      required: true,
      index: true,
    },

    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "StakingSubscription",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    asset: { type: String },
    symbol: { type: String, required: true, index: true },

    dayKey: { type: String, required: true, index: true },

    profitQty: { type: Number, default: 0 },

    grossProfitQty: { type: Number, default: 0 },
    userSharePercent: { type: Number, default: 100 },
    remainderQty: { type: Number, default: 0 },
    parentsBonusQty: { type: Number, default: 0 },
    systemQty: { type: Number, default: 0 },

    principalQty: { type: Number, default: 0 },
    paidDays: { type: Number, default: 0 },

    fixedDailyPercent: { type: Number, default: 0 },
    baseDailyPercent: { type: Number, default: 0 },
    penaltyPercent: { type: Number, default: 0 },
    penaltyQty: { type: Number, default: 0 },
    principalReturnQty: { type: Number, default: 0 },

    note: { type: String },
  },
  { timestamps: true }
);

// ✅ PROFIT idempotency: one profit per subscription per day
stakingProfitLogSchema.index(
  { subscriptionId: 1, type: 1, dayKey: 1 },
  { unique: true, partialFilterExpression: { type: "profit" } }
);

// ✅ CANCEL idempotency: one cancel per subscription
stakingProfitLogSchema.index(
  { subscriptionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: "cancel" } }
);

// ✅ PRINCIPAL_RETURN idempotency: one return per subscription
stakingProfitLogSchema.index(
  { subscriptionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: "principal_return" } }
);

const StakingProfitLog = model<IStakingProfitLog>(
  "StakingProfitLog",
  stakingProfitLogSchema
);

export default StakingProfitLog;
