// src/models/LuckyPrizeTier.model.ts
import { model, Schema } from "mongoose";

/* ── Lucky Prize Tier (legacy / display only) ───────────────────────────
 * প্রতি card type-এ weighted আউটকাম টেবিল — শুধু admin panel-এ "theoretical
 * RTP" দেখানোর জন্য রাখা হয়েছে। আসল কার্ড ফলাফল এখন গ্লোবাল প্রাইজ পুল
 * (LuckyPrizePool) সিস্টেম থেকেই আসে, এই টায়ার থেকে সরাসরি ড্র হয় না।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyPrizeTierSchema = new Schema(
  {
    cardType: {
      type: Schema.Types.ObjectId,
      ref: "LuckyCardType",
      required: true,
    },
    label: { type: String, trim: true, required: true },
    symbol: { type: String, default: "💰" },
    amount: { type: Number, required: true, min: 0 },
    weight: { type: Number, required: true, min: 0 },
    stockLimit: { type: Number, default: null },
    stockUsed: { type: Number, default: 0 },
    isJackpot: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LuckyPrizeTierSchema.index({ cardType: 1, sortOrder: 1 });

export default model("LuckyPrizeTier", LuckyPrizeTierSchema);
