// src/models/LuckyCardType.model.ts
import { model, Schema } from "mongoose";

/* ── Lucky Card Type ─────────────────────────────────────────────────────
 * একেকটা কার্ডের ধরন — নিজস্ব দাম (USDT), RTP লক্ষ্য, রঙ। প্রাইজ টেবিল আলাদা
 * LuckyPrizeTier কালেকশনে (legacy/display), প্যাকেজ আলাদা LuckyPackage-এ।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyCardTypeSchema = new Schema(
  {
    key: { type: String, trim: true, unique: true, required: true },
    name: { type: String, trim: true, required: true },
    price: { type: Number, required: true },
    accent: { type: String, default: "#7C5CFC" },
    targetRtp: { type: Number, default: 80 },
    // শুধু শপে "Top prize" হিসেবে দেখানোর মার্কেটিং সংখ্যা — কোনো প্লেয়ার
    // এটা জেতে না, প্রকৃত ফলাফল গ্লোবাল প্রাইজ পুল থেকে ঠিক হয়। 0 হলে
    // সিস্টেম আসল সর্বোচ্চ প্রাইজ পুল amount দেখায়।
    displayTopPrize: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    // "প্রকৃত RTP" রিপোর্ট এই তারিখের পর খোলা কার্ড থেকে হিসাব হয়।
    statsSince: { type: Date, default: null },
  },
  { timestamps: true },
);

export default model("LuckyCardType", LuckyCardTypeSchema);
