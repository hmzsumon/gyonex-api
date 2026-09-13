// src/models/LuckyPrizePool.model.ts
import { model, Schema } from "mongoose";

/* ── Lucky Prize Pool (global) ───────────────────────────────────────────
 * A–I পর্যন্ত ৯টা শেয়ার্ড জ্যাকপট পুল (USDT)। যেকোনো লাকি কার্ড টাইপের
 * বিক্রি এই একই পুলে জমা হয়। প্রতিবার একজন ইউজার সিঙ্গেল কার্ড স্ক্র্যাচ
 * করলে ওই কার্ডের অফার-প্রাইস (per card) percent অনুপাতে সব পুলে যোগ হয়।
 * কোনো পুলের balance তার target `amount` ছুঁলে ওই ইউজার সেই প্রাইজ জেতে,
 * balance থেকে amount বিয়োগ হয় (বাকিটা পরের বারের জন্য জমা থাকে)।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyPrizePoolSchema = new Schema(
  {
    code: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      required: true,
    }, // "A".."I"
    label: { type: String, trim: true, required: true }, // "Prize A"
    symbol: { type: String, default: "🎁" },
    // target — এই USDT জমলে একজন জিতবে
    amount: { type: Number, required: true, min: 0 },
    // প্রতিটা কার্ড বিক্রির টাকা থেকে এই পুলে কত % জমা হবে
    percent: { type: Number, required: true, min: 0, default: 0 },
    // চলমান জমা (কারো জেতার পর amount বাদ দিয়ে বাকিটা এখানেই থাকে)
    balance: { type: Number, default: 0, min: 0 },
    timesWon: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },
    totalContributed: { type: Number, default: 0 },
    lastWonAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LuckyPrizePoolSchema.index({ sortOrder: 1 });

export default model("LuckyPrizePool", LuckyPrizePoolSchema);
