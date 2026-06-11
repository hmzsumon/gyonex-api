import mongoose, { Schema } from "mongoose";

const TransferSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // account-only fields (optional)
    fromId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    toId: { type: Schema.Types.ObjectId, ref: "Account", default: null },

    // kind: 'main' | 'account'
    fromKind: { type: String, enum: ["main", "account"], required: true },
    toKind: { type: String, enum: ["main", "account"], required: true },

    amount: { type: Number, required: true },
    currency: { type: String, default: "USDT" },
    status: { type: String, default: "done" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.Transfer ||
  mongoose.model("Transfer", TransferSchema);
