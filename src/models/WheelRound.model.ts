// src/models/WheelRound.model.ts
import type { RoundStatus } from "@/types/wheel";
import { model, Schema } from "mongoose";

const BetSchema = new Schema(
  {
    segmentId: { type: Number, required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const OutcomeSchema = new Schema(
  {
    segmentId: { type: Number, required: true },
    baseMulti: { type: Number },
    finalMulti: { type: Number, required: true },
    angle: { type: Number }, // UI helper
  },
  { _id: false }
);

const WheelRoundSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    gameKey: { type: String, required: true, index: true },

    bets: { type: [BetSchema], default: [] },
    totalStake: { type: Number, required: true, min: 1 },

    outcome: { type: OutcomeSchema },
    payout: { type: Number, default: 0 },
    net: { type: Number, default: 0 }, // payout - totalStake

    status: {
      type: String,
      enum: ["open", "settled", "void"],
      default: "open",
      index: true,
    } as unknown as RoundStatus,

    settledAt: { type: Date },
    txIds: [{ type: Schema.Types.ObjectId, ref: "Transaction" }],

    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

WheelRoundSchema.index({ userId: 1, gameKey: 1, createdAt: -1 });

export default model("WheelRound", WheelRoundSchema);
