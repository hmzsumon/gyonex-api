// src/models/LuckyCard.model.ts
import { model, Schema } from "mongoose";

/* ── Lucky Card ──────────────────────────────────────────────────────────
 * একটা ইস্যু করা কার্ড। কেনার সময় serverSeed + hash + clientSeed + nonce
 * সেভ হয়; খোলার সময় ফলাফল (prizeAmount, revealSymbol) বসে এবং
 * status = "opened" হয়। খোলা কার্ড আবার খুললে আগের ফলাফলই ফেরত।
 *
 * source = "gift" হলে কার্ডটা admin কর্তৃক ইউজারকে বিনামূল্যে দেওয়া — এটা
 * খোলার সময় গ্লোবাল প্রাইজ পুলে কোনো contribution যায় না, pool থেকে ড্রও
 * হয় না। admin আগে থেকেই presetPrizeAmount বসিয়ে দেয় যা সরাসরি খোলার সময়
 * ইউজারকে দেওয়া হয় (0 হলে সেই কার্ডে জেতা নেই)।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyCardSchema = new Schema(
  {
    shortCode: { type: String, unique: true, required: true },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: { type: String },
    purchase: {
      type: Schema.Types.ObjectId,
      ref: "LuckyPurchase",
      required: true,
    },
    cardType: {
      type: Schema.Types.ObjectId,
      ref: "LuckyCardType",
      required: true,
    },
    cardTypeName: { type: String },
    accent: { type: String, default: "#7C5CFC" },
    status: {
      type: String,
      enum: ["unopened", "opened"],
      default: "unopened",
    },
    // "purchase" = normal buy flow → global pool draw. "gift" = admin gifted,
    // preset prize, pool untouched.
    source: {
      type: String,
      enum: ["purchase", "gift"],
      default: "purchase",
    },
    presetPrizeAmount: { type: Number, default: 0 },
    // ===== global prize-pool result =====
    // "" = no win; নাহলে যে পুল থেকে জিতেছে তার code ("A".."I")
    prizePoolCode: { type: String, default: "" },
    // এই কার্ড স্ক্র্যাচে পুলগুলোতে কত USDT অবদান গেল (unit offer price)
    contribution: { type: Number, default: 0 },
    // স্ক্র্যাচের পর সব পুলের অবস্থা (স্বচ্ছতা / verify-এর জন্য)
    poolSnapshot: [
      {
        _id: false,
        code: String,
        balance: Number,
        amount: Number,
      },
    ],
    prizeAmount: { type: Number, default: 0 },
    prizeLabel: { type: String, default: "" },
    revealSymbol: { type: String, default: "" },
    serverSeed: { type: String, required: true },
    serverSeedHash: { type: String, required: true },
    clientSeed: { type: String, required: true },
    nonce: { type: Number, required: true },
    openedAt: { type: Date },
  },
  { timestamps: true },
);

LuckyCardSchema.index({ user: 1, status: 1 });

export default model("LuckyCard", LuckyCardSchema);
