import mongoose, { Document, Schema, Types } from "mongoose";

// ✅ Embedded level schema type
export interface ITeamLevel {
  title: string;
  users: Types.ObjectId[];
  deposit: number;
  activeDeposit: number; // user current balance
  withdraw: number;

  aiTradeCommission: number;
  todayAiTradeCommission?: number; // optional field for today's commission

  yesterdayCommission?: number; // optional field for yesterday's commission
  lastMonthSales: number;
  thisMonthSales: number;

  activeUsers: number;
  inactiveUsers: number;

  aiTradeBalance: number;
  liveTradeBalance: number;
}

// ✅ Main team interface
export interface IUserTeamSummary extends Document {
  userId: Types.ObjectId;
  customerId: string;

  level_1: ITeamLevel;
  level_2: ITeamLevel;
  level_3: ITeamLevel;
  level_4: ITeamLevel;
  level_5: ITeamLevel;
  level_6: ITeamLevel;
  level_7: ITeamLevel;
  level_8: ITeamLevel;
  level_9: ITeamLevel;
  level_10: ITeamLevel;

  totalTeamDeposit: number;
  totalTeamActiveDeposit: number;
  totalTeamWithdraw: number;
  totalTeamCommission: number;
  todayTeamCommission: number; // optional field for today's team commission
  thisMonthCommission: number; // optional field for this month's team commission
  yesterdayTeamCommission?: number; // optional field for yesterday's team commission
  totalTeamMember: number;
  teamActiveMember: number;

  lastMonthSales: number;
  thisMonthSales: number;

  totalReferralBonus: number;

  teamTotalAiTradeBalance: number;
  teamTotalLiveTradeBalance: number;

  teamTotalAiTradeCommission: number;
  teamTotalLiveTradeCommission: number;

  monthlySalesUpdated?: Date;
  [key: string]: any;
}

// ✅ Level schema definition
const teamLevelSchema = new Schema<ITeamLevel>(
  {
    title: { type: String },
    users: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    deposit: { type: Number, default: 0 },
    activeDeposit: { type: Number, default: 0 }, // user current balance
    withdraw: { type: Number, default: 0 },

    aiTradeCommission: { type: Number, default: 0 },
    todayAiTradeCommission: { type: Number, default: 0 },

    yesterdayCommission: { type: Number, default: 0 },
    lastMonthSales: { type: Number, default: 0 },
    thisMonthSales: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    inactiveUsers: { type: Number, default: 0 },

    aiTradeBalance: { type: Number, default: 0 },
    liveTradeBalance: { type: Number, default: 0 },
  },
  { _id: false }
);

// ✅ Main team schema
const userTeamSummarySchema = new Schema<IUserTeamSummary>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: { type: String, trim: true },

    level_1: { type: teamLevelSchema, default: () => ({ title: "A" }) },
    level_2: { type: teamLevelSchema, default: () => ({ title: "B" }) },
    level_3: { type: teamLevelSchema, default: () => ({ title: "C" }) },
    level_4: { type: teamLevelSchema, default: () => ({ title: "D" }) },
    level_5: { type: teamLevelSchema, default: () => ({ title: "E" }) },
    level_6: { type: teamLevelSchema, default: () => ({ title: "F" }) },
    level_7: { type: teamLevelSchema, default: () => ({ title: "G" }) },
    level_8: { type: teamLevelSchema, default: () => ({ title: "H" }) },
    level_9: { type: teamLevelSchema, default: () => ({ title: "I" }) },
    level_10: { type: teamLevelSchema, default: () => ({ title: "J" }) },

    totalTeamDeposit: { type: Number, default: 0 },
    totalTeamActiveDeposit: { type: Number, default: 0 },
    totalTeamWithdraw: { type: Number, default: 0 },
    totalTeamCommission: { type: Number, default: 0 },
    todayTeamCommission: { type: Number, default: 0 },
    thisMonthCommission: { type: Number, default: 0 },
    yesterdayTeamCommission: { type: Number, default: 0 },

    totalTeamMember: { type: Number, default: 0 },
    teamActiveMember: { type: Number, default: 0 },

    lastMonthSales: { type: Number, default: 0 },
    thisMonthSales: { type: Number, default: 0 },

    totalReferralBonus: { type: Number, default: 0 },

    teamTotalAiTradeBalance: { type: Number, default: 0 },
    teamTotalLiveTradeBalance: { type: Number, default: 0 },

    teamTotalAiTradeCommission: { type: Number, default: 0 },
    teamTotalLiveTradeCommission: { type: Number, default: 0 },

    monthlySalesUpdated: { type: Date },
  },
  { timestamps: true }
);

// ✅ Model export
const UserTeamSummary = mongoose.model<IUserTeamSummary>(
  "UserTeamSummary",
  userTeamSummarySchema
);

export default UserTeamSummary;
