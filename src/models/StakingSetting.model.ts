import { Schema, model } from "mongoose";
import { ProfitPolicy } from "@/utils/stakingPolicy";

interface StakingSettings {
  key: string;
  stakingEnabled: boolean;
  profitEnabled: boolean;
  cancellationFeePercent: number;
  profitDays: number[];
  policyHistory: ProfitPolicy[];
}

const schema = new Schema<StakingSettings>({
  key: { type: String, default: "global", unique: true },
  stakingEnabled: { type: Boolean, default: true },
  profitEnabled: { type: Boolean, default: true },
  cancellationFeePercent: { type: Number, default: 0, min: 0, max: 100 },
  profitDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  policyHistory: { type: [{
    _id: false,
    effectiveDay: { type: String, required: true },
    profitEnabled: { type: Boolean, required: true },
    profitDays: { type: [Number], required: true },
  }], default: [] },
}, { timestamps: true });

const StakingSetting = model<StakingSettings>("StakingSetting", schema);
export default StakingSetting;

export const getStakingSettings = () => StakingSetting.findOneAndUpdate(
  { key: "global" }, { $setOnInsert: { key: "global" } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);

export const publicStakingSettings = (settings: StakingSettings) => ({
  stakingEnabled: settings.stakingEnabled,
  profitEnabled: settings.profitEnabled,
  cancellationFeePercent: settings.cancellationFeePercent,
  profitDays: settings.profitDays,
  timezone: "Asia/Dhaka",
});
