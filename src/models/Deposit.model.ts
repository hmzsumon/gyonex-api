import mongoose, { Document, Schema } from "mongoose";

export interface IDeposit extends Document {
  userId: mongoose.Types.ObjectId;
  orderId: string;
  name: string;
  phone: string;
  email: string;
  customerId: string;
  amount: number;
  isDemo: boolean;
  charge: number;
  receivedAmount: number;
  txId: string;
  sourceAddress: string; // BlockBee sender wallet address
  destinationAddress: string; // Our receiving wallet (BlockBee generated)
  qrCode: string; // BlockBee QR code URL
  chain: string; // Blockchain name (e.g., 'BTC', 'ETH')
  currency: string;
  status: "pending" | "confirmed" | "expired" | "failed" | "approved";
  isApproved?: boolean;
  isExpired?: boolean;
  approvedAt?: Date;
  updatedAt?: Date;
  confirmations?: number;
  createdAt?: Date;
  callbackReceivedAt?: Date;
  isManual?: boolean;
  callbackUrl: string;
  note: string;
}

const depositSchema = new Schema<IDeposit>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
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
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
    charge: {
      type: Number,
      default: 0,
    },
    receivedAmount: {
      type: Number,
      default: 0,
    },
    txId: {
      type: String,
    },

    sourceAddress: {
      type: String,
    },

    destinationAddress: {
      type: String,
    },
    qrCode: {
      type: String,
    },

    chain: {
      type: String,
    },

    status: {
      type: String,
      default: "pending",
    },

    isApproved: {
      type: Boolean,
      default: false,
    },
    isExpired: {
      type: Boolean,
      default: false,
    },
    approvedAt: {
      type: Date,
    },
    confirmations: {
      type: Number,
      default: 0,
    },
    callbackReceivedAt: {
      type: Date,
    },
    isManual: {
      type: Boolean,
      default: false, // Indicates if the deposit is manual
      required: true,
    },
    callbackUrl: {
      type: String,
      required: true, // URL to receive callback notifications
    },

    note: {
      type: String,
      default: "", // Additional notes for the deposit
    },
  },
  {
    timestamps: true,
  },
);

export const Deposit = mongoose.model<IDeposit>("Deposit", depositSchema);
