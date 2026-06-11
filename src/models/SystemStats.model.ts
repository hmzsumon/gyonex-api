// src/models/SystemStats.model.ts

import mongoose, { Document, Schema } from "mongoose";

interface IUserStats {
  total: number;
  todayNew: number;
  emailVerified: number;
  kycVerified: number;
  activeTotal: number;
  activeToday: number;
  loggedIn: number;
  demoCount: number;
}

interface ITransactionStats {
  total: number;
  today: number;
  countTotal: number;
  countToday: number;
  pendingAmount: number;
  pendingNetAmount: number;
  pendingCount: number;
  totalCharge: number;
  netTotal: number;
  netToday: number;
  totalBalance: number;
}

interface IDepositStats {
  total: number;
  today: number;
  blockbeeReceivedTotal: number;
  blockbeeReceivedToday: number;
  blockbeeFee: number;
  cryptoAmountTotal: number;
  cryptoAmountToday: number;
  cryptoCountToday: number;
  adminAmountToday: number;
  adminAmountTotal: number;
  totalCharge: number;
}

interface ICostStats {
  total: number;
  referral: number;
  rank: number;
  rebate: number;
  spin: number;
  charge: number;
}

interface IIncomeStats {
  total: number;
  extra: number;
  withdrawCharge: number;
  sendCharge: number;
  totalCharge: number;
  aiTradeCharge: number;
}

interface IKycStatus {
  pending: number;
  verified: number;
  rejected: number;
  new: number;
}

interface ITransferStats {
  enabled: boolean;
  totalAmount: number;
  todayAmount: number;
  totalCharge: number;
  todayCharge: number;
}

export interface ISystemStats extends Document {
  companyName: string;
  shortName?: string;
  email?: string;
  phone?: string;
  website?: string;
  currency: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country: string;
  about?: string;

  stakingSystemCutTotal: number;
  stakingSystemCutBySymbol: Map<string, number>;

  logo: {
    main: string;
    icon: string;
  };

  users: IUserStats;
  withdrawals: ITransactionStats;
  deposits: IDepositStats;
  income: IIncomeStats;
  costs: ICostStats;
  kyc: IKycStatus;
  transfer: ITransferStats;

  withdrawReserve: number;
  maintenanceReserve: number;
  isProfitEnabled: boolean;

  totalUserToUserTransfer: number;
  todayUserToUserTransfer: number;

  totalAiTradeBalance: number;
  todayAiTradeBalance: number;

  totalLiveTradeBalance: number;
  todayLiveTradeBalance: number;

  totalAiTradeCommission: number;
  todayAiTradeCommission: number;

  totalAiTradeProfit: number;
  todayAiTradeProfit: number;

  totalLiveTradeCommission: number;
  todayLiveTradeCommission: number;
}

const systemStatsSchema = new Schema<ISystemStats>(
  {
    companyName: { type: String, required: true, trim: true },
    shortName: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    website: { type: String, trim: true },
    currency: { type: String, default: "USDT" },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zip: { type: String, trim: true },
    country: { type: String, default: "Canada" },
    about: { type: String, trim: true },
    logo: {
      main: { type: String, default: "" },
      icon: { type: String, default: "" },
    },

    users: {
      total: { type: Number, default: 0 },
      todayNew: { type: Number, default: 0 },
      emailVerified: { type: Number, default: 0 },
      kycVerified: { type: Number, default: 0 },
      activeTotal: { type: Number, default: 0 },
      activeToday: { type: Number, default: 0 },
      loggedIn: { type: Number, default: 0 },
      demoCount: { type: Number, default: 0 },
    },

    withdrawals: {
      total: { type: Number, default: 0 },
      today: { type: Number, default: 0 },
      countTotal: { type: Number, default: 0 },
      countToday: { type: Number, default: 0 },
      pendingAmount: { type: Number, default: 0 },
      pendingNetAmount: { type: Number, default: 0 },
      pendingCount: { type: Number, default: 0 },
      totalCharge: { type: Number, default: 0 },
      netTotal: { type: Number, default: 0 },
      netToday: { type: Number, default: 0 },
      totalBalance: { type: Number, default: 0 },
    },

    deposits: {
      total: { type: Number, default: 0 },
      today: { type: Number, default: 0 },
      blockbeeReceivedTotal: { type: Number, default: 0 },
      blockbeeReceivedToday: { type: Number, default: 0 },
      blockbeeFee: { type: Number, default: 0 },
      cryptoAmountTotal: { type: Number, default: 0 },
      cryptoAmountToday: { type: Number, default: 0 },
      cryptoCountToday: { type: Number, default: 0 },
      adminAmountToday: { type: Number, default: 0 },
      adminAmountTotal: { type: Number, default: 0 },
      totalCharge: { type: Number, default: 0 },
      bkashAmountTotal: { type: Number, default: 0 },
      bkashAmountToday: { type: Number, default: 0 },
      rocketAmountTotal: { type: Number, default: 0 },
      rocketAmountToday: { type: Number, default: 0 },
      nagadAmountTotal: { type: Number, default: 0 },
      nagadAmountToday: { type: Number, default: 0 },
    },

    costs: {
      total: { type: Number, default: 0 },
      referral: { type: Number, default: 0 },
      rank: { type: Number, default: 0 },
      rebate: { type: Number, default: 0 },
      spin: { type: Number, default: 0 },
      charge: { type: Number, default: 0 },
    },

    income: {
      total: { type: Number, default: 0 },
      extra: { type: Number, default: 0 },
      withdrawCharge: { type: Number, default: 0 },
      sendCharge: { type: Number, default: 0 },
      aiTradeCharge: { type: Number, default: 0 },
    },

    kyc: {
      pending: { type: Number, default: 0 },
      verified: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
    },

    transfer: {
      enabled: { type: Boolean, default: true },
      totalAmount: { type: Number, default: 0 },
      todayAmount: { type: Number, default: 0 },
      totalCharge: { type: Number, default: 0 },
      todayCharge: { type: Number, default: 0 },
    },

    withdrawReserve: { type: Number, default: 0 },
    maintenanceReserve: { type: Number, default: 0 },

    totalUserToUserTransfer: { type: Number, default: 0 },
    todayUserToUserTransfer: { type: Number, default: 0 },

    totalAiTradeBalance: { type: Number, default: 0 },
    totalLiveTradeBalance: { type: Number, default: 0 },

    todayAiTradeBalance: { type: Number, default: 0 },
    todayLiveTradeBalance: { type: Number, default: 0 },

    totalAiTradeCommission: { type: Number, default: 0 },
    totalLiveTradeCommission: { type: Number, default: 0 },

    todayAiTradeCommission: { type: Number, default: 0 },
    todayLiveTradeCommission: { type: Number, default: 0 },

    totalAiTradeProfit: { type: Number, default: 0 },
    todayAiTradeProfit: { type: Number, default: 0 },

    stakingSystemCutTotal: { type: Number, default: 0 },

    // ✅ per symbol dynamic map (BTCUSDT => amount)
    stakingSystemCutBySymbol: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

const SystemStats = mongoose.model<ISystemStats>(
  "SystemStats",
  systemStatsSchema
);
export default SystemStats;
