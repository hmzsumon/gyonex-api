// src/models/LoanSetting.model.ts
import { Model, model, Schema } from "mongoose";

/* ── Loan Setting (singleton) ────────────────────────────────────────────
 * লোন রিপেমেন্টের সময় চার্জ করা service fee % — অ্যাডমিন প্যানেল থেকে
 * এডিট হয়। ইউজার $X রিপে করলে অতিরিক্ত (X * feePercent/100) ফি তার
 * main balance থেকে কাটা হয়, কিন্তু লোনের totalPaid-এ শুধু $X-ই যোগ হয়
 * (ফি লোনের দেনা কমায় না, এটা প্ল্যাটফর্মের আলাদা চার্জ)।
 * সবসময় key = "global" ডকুমেন্টটাই ব্যবহার হয়।
 * ────────────────────────────────────────────────────────────────────── */
export interface ILoanSetting {
  key: string;
  repaymentFeePercent: number;
  updatedBy?: Schema.Types.ObjectId | null;
}

const loanSettingSchema = new Schema<ILoanSetting>(
  {
    key: { type: String, default: "global", unique: true },
    repaymentFeePercent: { type: Number, default: 0, min: 0, max: 100 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// সবসময় একটাই সেটিং ডক — না থাকলে ডিফল্ট দিয়ে তৈরি করে
loanSettingSchema.statics.getSingleton = async function () {
  let cfg = await this.findOne({ key: "global" });
  if (!cfg) cfg = await this.create({ key: "global" });
  return cfg;
};

interface LoanSettingModel extends Model<ILoanSetting> {
  getSingleton(): Promise<any>;
}

export default model<ILoanSetting>(
  "LoanSetting",
  loanSettingSchema,
) as unknown as LoanSettingModel;
