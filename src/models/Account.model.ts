import { TAccountType } from "@/config/accountTypes";
import { Document, model, Schema, Types } from "mongoose";

export interface IAccount extends Document {
  userId: Types.ObjectId;
  customerId: string;
  accountNumber: number;
  type: TAccountType; // "standard" | "pro"
  name?: string;
  currency: "USD" | "BDT";
  leverage: number;
  balance: number;
  equity: number; // 👈 NEW
  marginUsed: number; // 👈 NEW
  isDefault: boolean;
  status: "active" | "closed";
  mode: "real";
  meta?: Record<string, any>;
}

const accountSchema = new Schema<IAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    customerId: { type: String, required: true },
    accountNumber: { type: Number, unique: true, index: true },
    type: { type: String, enum: ["standard", "pro"], required: true },
    name: String,
    currency: { type: String, enum: ["USD", "BDT"], default: "USD" },
    leverage: { type: Number, default: 100 },

    balance: { type: Number, default: 0 },
    equity: { type: Number, default: 0 }, // 👈 NEW
    marginUsed: { type: Number, default: 0 }, // 👈 NEW

    isDefault: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    mode: {
      type: String,
      enum: ["real"],
      default: "real",
      index: true,
    },
    meta: { type: Object },
  },
  { timestamps: true }
);

// optional guard so equity/marginUsed never undefined
accountSchema.pre("save", function (next) {
  if (this.equity == null) this.equity = this.balance ?? 0;
  if (this.marginUsed == null) this.marginUsed = 0;
  next();
});

export default model<IAccount>("Account", accountSchema);
