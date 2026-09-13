// src/models/WithdrawSetting.model.ts
import { Model, model, Schema } from "mongoose";

/* ── Withdraw Setting (singleton) ───────────────────────────────────────
 * উইথড্র সিস্টেমের সব globally-configurable নিয়ম এক জায়গায় — fee %,
 * মিনিমাম/ম্যাক্সিমাম amount, কুইক-অ্যামাউন্ট প্রিসেট, দৈনিক রিকোয়েস্ট
 * লিমিট এবং অনুমোদিত নেটওয়ার্ক। সবসময় key = "global" ডকুমেন্টটাই ব্যবহার
 * হয় — অ্যাডমিন প্যানেলের "Withdraw Management" পেজ থেকে এটাই এডিট হয়।
 * ────────────────────────────────────────────────────────────────────── */
export interface IWithdrawSetting {
  key: string;
  feePercent: number;
  minAmount: number;
  // 0 = কোনো সর্বোচ্চ সীমা নেই
  maxAmount: number;
  quickAmounts: number[];
  // একজন ইউজার প্রতিদিন সর্বোচ্চ কতবার withdraw request দিতে পারবে
  dailyLimitCount: number;
  networks: string[];
  updatedBy?: Schema.Types.ObjectId | null;
}

const withdrawSettingSchema = new Schema<IWithdrawSetting>(
  {
    key: { type: String, default: "global", unique: true },
    feePercent: { type: Number, default: 8, min: 0, max: 100 },
    minAmount: { type: Number, default: 50, min: 0 },
    maxAmount: { type: Number, default: 0, min: 0 },
    quickAmounts: { type: [Number], default: [50, 100, 200, 250, 300, 500] },
    dailyLimitCount: { type: Number, default: 1, min: 1 },
    networks: { type: [String], default: ["TRC20", "BEP20"] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// সবসময় একটাই সেটিং ডক — না থাকলে ডিফল্ট দিয়ে তৈরি করে
withdrawSettingSchema.statics.getSingleton = async function () {
  let cfg = await this.findOne({ key: "global" });
  if (!cfg) cfg = await this.create({ key: "global" });
  return cfg;
};

interface WithdrawSettingModel extends Model<IWithdrawSetting> {
  getSingleton(): Promise<any>;
}

export default model<IWithdrawSetting>(
  "WithdrawSetting",
  withdrawSettingSchema,
) as unknown as WithdrawSettingModel;
