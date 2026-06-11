// src/models/StakingSummary.model.ts

import { Document, Schema, Types, model } from "mongoose";

export interface IStakingSummary extends Document {
  userId: Types.ObjectId;
  customerId?: string;

  asset: string;
  symbol: string;
  iconUrl?: string;

  // active
  activePrincipalQty: number;
  activeCount: number;

  // lifetime
  totalSubscribedQty: number;
  totalCompletedPrincipalQty: number;
  totalProfitQty: number;

  lastSubscribedAt?: Date;
  lastProfitAt?: Date;
  nextMaturityAt?: Date;

  reconciledAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const stakingSummarySchema = new Schema<IStakingSummary>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: { type: String },

    asset: { type: String, required: true },
    symbol: { type: String, required: true },
    iconUrl: { type: String },

    activePrincipalQty: { type: Number, default: 0 },
    activeCount: { type: Number, default: 0 },

    totalSubscribedQty: { type: Number, default: 0 },
    totalCompletedPrincipalQty: { type: Number, default: 0 },
    totalProfitQty: { type: Number, default: 0 },

    lastSubscribedAt: { type: Date },
    lastProfitAt: { type: Date },
    nextMaturityAt: { type: Date },

    reconciledAt: { type: Date },
  },
  { timestamps: true }
);

stakingSummarySchema.index({ userId: 1, symbol: 1 }, { unique: true });

const StakingSummary = model<IStakingSummary>(
  "StakingSummary",
  stakingSummarySchema
);
export default StakingSummary;
