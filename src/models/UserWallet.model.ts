import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserWallet extends Document {
  userId: Types.ObjectId;
  customerId: string;

  // Transfers
  totalReceive: number;
  totalSend: number;

  totalDepositBonus: number;
  totalGameBonus: number;

  // Wallet Flow
  totalDeposit: number;
  totalWithdraw: number;
  totalPay: number;
  totalWine: number; // Optional field for total wine balance

  totalInvestment: number;
  todayWine: number; // Optional field for today's wine balance

  // Earnings
  totalEarning: number;
  todayEarning: number; // Optional field for today's earnings
  thisMonthEarning: number; // Optional field for this month's earnings
  totalCommission: number;
  takeProfit: number;
  rankEarning: number;
  levelEarning: number;
  generationEarning: number;
  rebateTotal: number;
  rebateToday: number;
  totalSponsorBonus: number; // Optional field for sponsor bonuses

  totalReferralBonus: number;

  // Ai trade
  totalAiTradeProfit: number;
  totalAiTradeCommission: number;

  //live trade
  totalLiveTradeProfit: number;
  totalLiveTradeCommission: number;

  // transfer
  totalTransferToTrade: number;
  totalTransferToWallet: number;

  totalAiTradeBalance: number;
  totalLiveTradeBalance: number;
}

const walletSchema = new Schema<IUserWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: {
      type: String,
      required: true,
      trim: true,
    },

    // Transfer summary
    totalReceive: { type: Number, default: 0 },
    totalSend: { type: Number, default: 0 },

    // Deposit/Withdraw
    totalDeposit: { type: Number, default: 0 },
    totalWithdraw: { type: Number, default: 0 },
    totalPay: { type: Number, default: 0 },
    totalWine: { type: Number, default: 0 },
    todayWine: { type: Number, default: 0 },

    totalEarning: { type: Number, default: 0 },
    todayEarning: { type: Number, default: 0 }, // Optional field for today's earnings
    thisMonthEarning: { type: Number, default: 0 }, // Optional field for this month's earnings
    totalCommission: { type: Number, default: 0 },
    levelEarning: { type: Number, default: 0 },

    totalSponsorBonus: { type: Number, default: 0 },
    generationEarning: { type: Number, default: 0 },
    totalDepositBonus: { type: Number, default: 0 },
    totalGameBonus: { type: Number, default: 0 },

    totalReferralBonus: { type: Number, default: 0 },
    rankEarning: { type: Number, default: 0 },

    // Ai trade
    totalAiTradeProfit: { type: Number, default: 0 },
    totalAiTradeCommission: { type: Number, default: 0 },

    //live trade
    totalLiveTradeProfit: { type: Number, default: 0 },
    totalLiveTradeCommission: { type: Number, default: 0 },

    // Transfer
    totalTransferToTrade: { type: Number, default: 0 },
    totalTransferToWallet: { type: Number, default: 0 },

    totalAiTradeBalance: { type: Number, default: 0 },
    totalLiveTradeBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IUserWallet>("UserWallet", walletSchema);
