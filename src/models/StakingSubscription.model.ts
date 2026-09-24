// src/models/StakingSubscription.model.ts
import { Document, Schema, Types, model } from "mongoose";

export type StakingStatus = "active" | "completed" | "cancelled";

export interface IStakingSubscription extends Document<Types.ObjectId> {
  userId: Types.ObjectId;
  customerId?: string;

  asset: string; // BTC
  symbol: string; // BTCUSDT
  iconUrl?: string;

  principalQty: number;
  termDays: number;

  totalProfitPercent: number; // snapshot
  dailyProfitPercent: number; // snapshot

  userSharePercent?: number;
  profitTimezone?: "Asia/Dhaka";
  paidDays: number;
  totalProfitQty: number;
  lastPaidDayKey?: string;

  status: StakingStatus;

  startedAt: Date;
  endAt: Date;

  // principal return safety (no double return, recoverable)
  principalReturnLocked?: boolean;
  principalReturnLockedAt?: Date;
  principalReturned?: boolean;
  principalReturnedAt?: Date;

  completedAt?: Date;

  // ✅ CANCEL fields
  cancelLocked?: boolean;
  cancelLockedAt?: Date;
  cancelledAt?: Date;

  cancelBaseDailyPercent?: number;
  cancelPenaltyPercent?: number;
  cancelPenaltyQty?: number;
  principalReturnQty?: number;

  createdAt: Date;
  updatedAt: Date;
}

const stakingSubscriptionSchema = new Schema<IStakingSubscription>(
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

    principalQty: { type: Number, required: true },
    termDays: { type: Number, required: true },

    totalProfitPercent: { type: Number, required: true },
    dailyProfitPercent: { type: Number, required: true },

    userSharePercent: { type: Number, min: 0, max: 1 },
    profitTimezone: { type: String, enum: ["Asia/Dhaka"] },
    paidDays: { type: Number, default: 0 },
    totalProfitQty: { type: Number, default: 0 },
    lastPaidDayKey: { type: String },

    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },

    startedAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    principalReturnLocked: { type: Boolean, default: false },
    principalReturnLockedAt: { type: Date },
    principalReturned: { type: Boolean, default: false },
    principalReturnedAt: { type: Date },

    completedAt: { type: Date },

    // ✅ cancel
    cancelLocked: { type: Boolean, default: false },
    cancelLockedAt: { type: Date },
    cancelledAt: { type: Date },

    cancelBaseDailyPercent: { type: Number },
    cancelPenaltyPercent: { type: Number },
    cancelPenaltyQty: { type: Number },
    principalReturnQty: { type: Number },
  },
  { timestamps: true }
);

stakingSubscriptionSchema.index({ userId: 1, status: 1, createdAt: -1 });
stakingSubscriptionSchema.index({ status: 1, endAt: 1 });

const StakingSubscription = model<IStakingSubscription>(
  "StakingSubscription",
  stakingSubscriptionSchema
);

export default StakingSubscription;
