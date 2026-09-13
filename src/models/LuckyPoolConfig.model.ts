// src/models/LuckyPoolConfig.model.ts
import { Model, model, Schema } from "mongoose";

/* ── Lucky Pool Config (singleton) ──────────────────────────────────────
 * গ্লোবাল প্রাইজ পুল সিস্টেমের কোম্পানি ফান্ড শতাংশ (USDT) + সর্বমোট হিসাব।
 * সবসময় key = "global" ডকুমেন্টটাই ব্যবহার হয়।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyPoolConfigSchema = new Schema(
  {
    key: { type: String, default: "global", unique: true },
    // কার্ড বিক্রির টাকা থেকে কোম্পানি ফান্ডে কত % যাবে (প্রাইজে যায় না)
    companyFundPercent: { type: Number, default: 3.999, min: 0 },
    companyFundCollected: { type: Number, default: 0 },
    // সিস্টেমে সর্বমোট কত USDT ঢুকেছে (সব কার্ড স্ক্র্যাচের অবদান)
    totalContributed: { type: Number, default: 0 },
    // সর্বমোট প্রাইজ পে-আউট
    totalPaidOut: { type: Number, default: 0 },
    lastConfirmedAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// সবসময় একটাই কনফিগ ডক — না থাকলে ডিফল্ট দিয়ে তৈরি করে
LuckyPoolConfigSchema.statics.getSingleton = async function () {
  let cfg = await this.findOne({ key: "global" });
  if (!cfg) cfg = await this.create({ key: "global" });
  return cfg;
};

interface LuckyPoolConfigModel extends Model<any> {
  getSingleton(): Promise<any>;
}

export default model("LuckyPoolConfig", LuckyPoolConfigSchema) as unknown as LuckyPoolConfigModel;
