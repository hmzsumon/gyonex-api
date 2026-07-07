import mongoose, { Document, Schema } from "mongoose";

export type LoanType =
  | "trading"
  | "business"
  | "house"
  | "land"
  | "study"
  | "emergency";
export type LoanStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "active"
  | "completed"
  | "defaulted";

export interface ILoan extends Document {
  userId: mongoose.Types.ObjectId;
  loanType: LoanType;
  requestedAmount: number;
  approvedAmount?: number;
  disbursedAmount?: number;
  interestRate: number;
  repaymentPeriodDays: number;
  monthlyInstallment?: number;
  totalRepayable?: number;
  totalPaid: number;
  status: LoanStatus;
  purpose?: string;

  // ── Applicant verification ──────────────────────────────────────────────────
  applicantName?: string;
  applicantEmail?: string;
  nidNumber?: string;
  nidPhotoUrl?: string; // uploaded photo of NID card
  selfieUrl?: string; // selfie with NID

  // ── Admin fields ────────────────────────────────────────────────────────────
  adminNote?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  disbursedAt?: Date;
  dueDate?: Date;
  walletId?: mongoose.Types.ObjectId;

  // ── Repayment history ────────────────────────────────────────────────────────
  repaymentHistory: Array<{
    amount: number;
    paidAt: Date;
    transactionId: mongoose.Types.ObjectId;
    note?: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const LoanSchema = new Schema<ILoan>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    loanType: {
      type: String,
      enum: ["trading", "house", "business", "study", "land", "emergency"],
      required: true,
    },
    requestedAmount: { type: Number, required: true, min: 50 },
    approvedAmount: Number,
    disbursedAmount: Number,
    interestRate: { type: Number, default: 0.02 },
    repaymentPeriodDays: { type: Number, default: 30 },
    monthlyInstallment: Number,
    totalRepayable: Number,
    totalPaid: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "active",
        "completed",
        "defaulted",
      ],
      default: "pending",
      index: true,
    },
    purpose: { type: String, default: "KYC verified loan application" },

    // Applicant identity
    applicantName: { type: String, default: "" },
    applicantEmail: { type: String, default: "" },
    nidNumber: { type: String, default: "KYC_VERIFIED" },
    nidPhotoUrl: String,
    selfieUrl: String,

    adminNote: String,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    rejectedAt: Date,
    disbursedAt: Date,
    dueDate: Date,
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet" },

    repaymentHistory: [
      {
        amount: { type: Number, required: true },
        paidAt: { type: Date, required: true },
        transactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
        note: String,
      },
    ],
  },
  { timestamps: true },
);

LoanSchema.index({ userId: 1, status: 1 });
LoanSchema.index({ status: 1, createdAt: -1 });

// ─── Virtual: days remaining & countdown ─────────────────────────────────────
LoanSchema.virtual("daysRemaining").get(function (this: ILoan) {
  if (!this.dueDate || this.status !== "active") return null;
  const msLeft = new Date(this.dueDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / 86400000));
});

LoanSchema.virtual("hoursRemaining").get(function (this: ILoan) {
  if (!this.dueDate || this.status !== "active") return null;
  const msLeft = new Date(this.dueDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / 3600000));
});

LoanSchema.virtual("progress").get(function (this: ILoan) {
  if (!this.totalRepayable) return 0;
  return Math.min(100, (this.totalPaid / this.totalRepayable) * 100);
});

LoanSchema.virtual("remainingAmount").get(function (this: ILoan) {
  return Math.max(0, (this.totalRepayable || 0) - this.totalPaid);
});

LoanSchema.virtual("isOverdue").get(function (this: ILoan) {
  if (!this.dueDate || this.status !== "active") return false;
  return new Date(this.dueDate) < new Date();
});

LoanSchema.set("toJSON", { virtuals: true });
LoanSchema.set("toObject", { virtuals: true });

export const Loan = mongoose.model<ILoan>("Loan", LoanSchema);
