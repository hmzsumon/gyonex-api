// src/models/LuckyPurchase.model.ts
import { model, Schema } from "mongoose";

/* ── Lucky Purchase ──────────────────────────────────────────────────────
 * একটা কেনার রেকর্ড — কোন প্যাকেজ, কয়টা কার্ড, কত USDT কাটা হলো। admin
 * কোনো ইউজারকে গিফট করলে source = "gift", totalPrice = 0 (balance কাটা হয় না)।
 * ────────────────────────────────────────────────────────────────────── */
const LuckyPurchaseSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: { type: String },
    cardType: {
      type: Schema.Types.ObjectId,
      ref: "LuckyCardType",
      required: true,
    },
    cardTypeName: { type: String },
    package: { type: Schema.Types.ObjectId, ref: "LuckyPackage" },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    source: {
      type: String,
      enum: ["purchase", "gift"],
      default: "purchase",
    },
    giftedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    giftNote: { type: String, default: "" },
    giftPrizeAmount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

LuckyPurchaseSchema.index({ user: 1, createdAt: -1 });

export default model("LuckyPurchase", LuckyPurchaseSchema);
