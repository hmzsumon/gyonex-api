import { Document, Schema, Types, model } from "mongoose";

export type TransactionType = "cashIn" | "cashOut";

export type TransactionPurpose =
  | "Deposit"
  | "Withdraw Request"
  | "Withdraw Completed"
  | "Referral Bonus"
  | "Buy Lottery"
  | "Global Bonus"
  | "Generation Bonus"
  | "Level Bonus"
  | "Receive Money"
  | "Send Money"
  | "Transfer"
  | "Company Bonus"
  | "Profit"
  | "Lottery Win"
  | "Rank Bonus"
  | "Rank Reward"
  | "Refund"
  | "Deduct Profit"
  | "Admin Deposit"
  | "Trade Profit"
  | "Buy Trade"
  | "Balance Transfer"
  | "Transfer to Main Balance"
  | "Add balance to live trade"
  | "Rebate Commission"
  | "Live Trade Profit"
  | "Spin Prize"
  | "Deposit Bonus"
  | "Task Profit"
  | "Team Commission"
  | "Withdrawal Refund"
  | "Generation Reward"
  | "Game Betting"
  | "Ai Trade Profit"
  | "Ai Trade Commission"
  | "Create Ai Account"
  | "game:bet"
  | "game:win"
  | "game:refund"
  | "game:bonus"
  | "game:admin_adjustment"
  | "Transfer to Trade"
  | "Transfer to Wallet"
  | "Add funds to Ai Account"
  | "game:payout"
  | "Subscribe"
  | "Unsubscribe"
  | "Daily Profit"
  | "Staking Bonus"
  | "Loan Disbursement"
  | "Loan Repayment"
  | "Buy Spot Wallet"
  | "Sell Spot Wallet"
  | "Transfer to Spot Wallet"
  | "Transfer to Spot Wallet";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  customerId?: string;
  unique_id: string;
  amount: number;
  balance: number;
  transactionType: TransactionType;
  purpose: TransactionPurpose;
  description?: string;
  isCashIn: boolean;
  isCashOut: boolean;
  previous_m_balance: number;
  current_m_balance: number;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: {
      type: String,
    },
    unique_id: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },

    transactionType: {
      type: String,
      enum: ["cashIn", "cashOut"],
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        "Deposit",
        "Withdraw Request",
        "Withdraw Completed",
        "Referral Bonus",
        "Buy Lottery",
        "Global Bonus",
        "Generation Bonus",
        "Level Bonus",
        "Receive Money",
        "Send Money",
        "Transfer",
        "Company Bonus",
        "Profit",
        "Lottery Win",
        "Rank Bonus",
        "Rank Reward",
        "Refund",
        "Deduct Profit",
        "Admin Deposit",
        "Trade Profit",
        "Buy Trade",
        "Balance Transfer",
        "Transfer to Main Balance",
        "Add balance to live trade",
        "Rebate Commission",
        "Live Trade Profit",
        "Spin Prize",
        "Deposit Bonus",
        "Task Profit",
        "Team Commission",
        "Withdrawal Refund",
        "Generation Reward",
        "Game Betting",
        "game:bet",
        "game:win",
        "game:refund",
        "game:bonus",
        "game:admin_adjustment",
        "game:payout",
        "Ai Trade Profit",
        "Ai Trade Commission",
        "Create Ai Account",
        "Transfer to Trade",
        "Transfer to Wallet",
        "Add funds to Ai Account",
        "Subscribe",
        "Unsubscribe",
        "Daily Profit",
        "Staking Bonus",
        "Loan Disbursement",
        "Loan Repayment",
        "Buy Spot Wallet",
        "Sell Spot Wallet",
        "Transfer to Spot Wallet",
        "Transfer to Spot Wallet",
      ],
      required: true,
    },
    description: {
      type: String,
      default: "Transaction",
    },
    isCashIn: {
      type: Boolean,
      default: false,
    },
    isCashOut: {
      type: Boolean,
      default: false,
    },
    previous_m_balance: {
      type: Number,
      default: 0,
    },
    current_m_balance: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const Transaction = model<ITransaction>(
  "Transaction",
  transactionSchema,
);

export default Transaction;
