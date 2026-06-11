import { Document, Schema, Types, model } from "mongoose";

export interface IStakingBonusLog extends Document {
  userId: Types.ObjectId;
  customerId: string;
  subscriptionId: Types.ObjectId;
  fromUserId: Types.ObjectId; // staker
  toUserId: Types.ObjectId; // parent
  symbol: string;
  dayKey: string; // YYYY-MM-DD
  level: number; // 1..5
  bonusQty: number;
  createdAt: Date;
  updatedAt: Date;
}

const stakingBonusLogSchema = new Schema<IStakingBonusLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: { type: String },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    fromUserId: { type: Schema.Types.ObjectId, required: true, index: true },
    toUserId: { type: Schema.Types.ObjectId, required: true, index: true },
    symbol: { type: String, required: true, index: true },
    dayKey: { type: String, required: true },
    level: { type: Number, required: true },
    bonusQty: { type: Number, required: true },
  },
  { timestamps: true }
);

// ✅ idempotent per subscription per day per level
stakingBonusLogSchema.index(
  { subscriptionId: 1, dayKey: 1, level: 1 },
  { unique: true }
);

const StakingBonusLog = model<IStakingBonusLog>(
  "StakingBonusLog",
  stakingBonusLogSchema
);
export default StakingBonusLog;
