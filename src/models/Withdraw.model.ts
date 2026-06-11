import mongoose, { Document, Schema } from "mongoose";

export interface IWithdraw extends Document {
  userId: mongoose.Types.ObjectId;
  sl_no: string;
  name: string;
  phone: string;
  email: string;
  customerId: string;
  amount: number;
  netAmount: number; // Amount after deducting fees
  charge: number;
  netWork: string;
  netWorkAddress: string;
  approvedAmount: number;
  txnId: string;
  agentNumber: string;

  note: string;

  status:
    | "pending"
    | "confirmed"
    | "rejected"
    | "failed"
    | "approved"
    | "cancelled";
  isApproved?: boolean;
  isExpired?: boolean;
  isRejected?: boolean;
  approvedAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
  cancelledAt?: Date;
  rejected_reason: string;
}

const withdrawSchema = new Schema<IWithdraw>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sl_no: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    name: {
      type: String,
    },
    phone: {
      type: String,
      required: true,
    },
    email: {
      type: String,
    },
    customerId: {
      type: String,
    },
    amount: {
      type: Number,
      default: 0,
      required: true,
    },
    netAmount: {
      type: Number,
      default: 0,
      required: true,
    },
    charge: {
      type: Number,
      default: 0,
      required: true,
    },

    netWork: {
      type: String,
      required: true,
    },
    netWorkAddress: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "rejected",
        "failed",
        "approved",
        "cancelled",
      ],
      default: "pending",
      required: true,
    },
    approvedAmount: {
      type: Number,
      default: 0,
    },
    txnId: {
      type: String,
    },
    agentNumber: {
      type: String,
    },
    note: {
      type: String,
    },
    isApproved: { type: Boolean, default: false },
    approvedAt: { type: Date },
    isExpired: { type: Boolean, default: false },
    isRejected: { type: Boolean, default: false },
    rejected_reason: { type: String, default: "No reason provided" },
  },
  { timestamps: true }
);

const Withdraw = mongoose.model<IWithdraw>("Withdraw", withdrawSchema);
export default Withdraw;
