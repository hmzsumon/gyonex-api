// src/models/StakingPlan.model.ts

import { Document, Schema, model } from "mongoose";

export interface IStakingPlan extends Document {
  termDays: number; // 1, 7, 15...
  dailyProfitPercent: number; // per day %
  totalProfitPercent: number; // whole-term total % (daily * termDays)
  userSharePercent: number;
  minAmount: number; // default 1
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const stakingPlanSchema = new Schema<IStakingPlan>(
  {
    termDays: { type: Number, required: true, unique: true },
    dailyProfitPercent: { type: Number, required: true },
    totalProfitPercent: { type: Number, required: true },
    userSharePercent: { type: Number, required: true },
    minAmount: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const StakingPlan = model<IStakingPlan>("StakingPlan", stakingPlanSchema);
export default StakingPlan;
