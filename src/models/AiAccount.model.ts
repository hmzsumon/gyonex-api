import { Document, model, Schema, Types } from "mongoose";

export interface IAccount extends Document {
  userId: Types.ObjectId;
  customerId: string;
  accountNumber: number;
  currency: "USD" | "BDT";
  balance: number;
  equity: number; // 👈 NEW
  isDefault: boolean;
  status: "active" | "closed" | "inactive" | "expired";
  mode: "ai";
  meta?: Record<string, any>;
  profit: number;
  earnedProfit?: number;
  expiredAt?: Date;
  cancelledAt?: Date;
  cancellationFeePercent?: number;
  cancellationFee?: number;
  cancellationRefund?: number;
  createdAt: Date;
  plan: string;
  amount: number;
  role: string;
  planPrice: number;
  is_active: boolean;
  is_stop_loss: boolean;
}

const aiAccountSchema = new Schema<IAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    customerId: { type: String, required: true },
    accountNumber: { type: Number, unique: true, index: true },
    plan: { type: String, required: true },
    currency: { type: String, enum: ["USD", "BDT"], default: "USD" },
    profit: { type: Number, default: 0 },
    earnedProfit: { type: Number, min: 0 },
    expiredAt: Date,
    cancelledAt: Date,
    cancellationFeePercent: Number,
    cancellationFee: Number,
    cancellationRefund: Number,
    balance: { type: Number, default: 0 },
    equity: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "closed", "inactive", "expired"],
      default: "active",
    },
    mode: {
      type: String,
      enum: ["ai"],
      default: "ai",
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    planPrice: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },
    is_stop_loss: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default model<IAccount>("AiAccount", aiAccountSchema);
