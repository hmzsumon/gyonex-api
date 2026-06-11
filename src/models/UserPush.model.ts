// src/models/UserPush.model.ts
import mongoose from "mongoose";

/* ────────── schema: one row per endpoint (multi-device) ────────── */
const schema = new mongoose.Schema(
  {
    /* who owns the subscription */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: true,
    },
    customerId: { type: String, required: true },

    /* unique device/browser endpoint */
    endpoint: { type: String, required: true, unique: true, index: true },

    /* raw PushSubscription JSON */
    subscription: { type: Object, required: true },

    /* optional device metadata */
    userAgent: { type: String },
    deviceName: { type: String },

    /* telemetry (optional) */
    lastSuccessAt: { type: Date },
    lastFailureAt: { type: Date },
  },
  { timestamps: true }
);

/* ────────── model ────────── */
export const UserPush = mongoose.model("UserPush", schema);
