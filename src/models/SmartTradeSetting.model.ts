import { Schema, model } from "mongoose";

const schema = new Schema({
  key: { type: String, default: "global", unique: true },
  cancellationFeePercent: { type: Number, default: 10, min: 0, max: 100 },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export const SmartTradeSetting = model("SmartTradeSetting", schema);
export const getSmartTradeSettings = () => SmartTradeSetting.findOneAndUpdate(
  { key: "global" }, { $setOnInsert: { key: "global" } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
