// src/models/LuckyPackage.model.ts
import { model, Schema } from "mongoose";

/* ── Lucky Package ───────────────────────────────────────────────────────
 * একই card type-এর কার্ড বান্ডল করে বিক্রি (৩ / ৫ / ১০ কার্ড ইত্যাদি)।
 * bonusCards = ফ্রি অতিরিক্ত কার্ড। দাম USDT-তে।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyPackageSchema = new Schema(
  {
    cardType: {
      type: Schema.Types.ObjectId,
      ref: "LuckyCardType",
      required: true,
    },
    name: { type: String, trim: true, required: true },
    cardCount: { type: Number, required: true, min: 1 },
    bonusCards: { type: Number, default: 0 },
    // regularPrice = আসল দাম (শপে কাটা অবস্থায় দেখাবে)।
    // price = অফার প্রাইস — ইউজার এটা দিয়েই কার্ড কেনে, এটাই m_balance থেকে কাটা হয়।
    regularPrice: { type: Number, default: 0, min: 0 },
    price: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LuckyPackageSchema.index({ cardType: 1, sortOrder: 1 });

export default model("LuckyPackage", LuckyPackageSchema);
