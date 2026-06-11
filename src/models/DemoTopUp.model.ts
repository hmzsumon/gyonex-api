/* ──────────────────────────────────────────────────────────────────────────
   DemoTopUp model — audit log for demo deposits
────────────────────────────────────────────────────────────────────────── */
import { Document, model, Schema, Types } from "mongoose";

export interface IDemoTopUp extends Document {
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  amount: number;
  currency: "USD" | "BDT";
  status: "accepted";
}

const schema = new Schema<IDemoTopUp>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      index: true,
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ["USD", "BDT"], default: "USD" },
    status: { type: String, enum: ["accepted"], default: "accepted" },
  },
  { timestamps: true }
);

export default model<IDemoTopUp>("DemoTopUp", schema);
