import mongoose, { Document, Types } from "mongoose";

export interface IAgentStatus extends Document {
  agentId: Types.ObjectId;
  customerId: string;
  name: string;
  status: string;
  totalDeposits: number;
  toDayDeposits: number;

  totalWithdrawals: number;
  toDayWithdrawals: number;

  totalCommissions: number;
  toDayCommissions: number;

  totalTakeCommissions: number;
  toDayTakeCommissions: number;

  totalPlayers: number;
  toDayPlayers: number;

  totalBets: number;
  toDayBets: number;

  totalProfit: number;
  toDayProfit: number;

  totalLoss: number;
  toDayLoss: number;

  totalActiveUsers: number;
  toDayActiveUsers: number;

  totalAiTradeBalance: number;
  toDayAiTradeBalance: number;

  totalAiTradeCommission: number;
  toDayAiTradeCommission: number;

  totalAiTradeProfit: number;
  toDayAiTradeProfit: number;

  totalLiveTradeBalance: number;
  toDayLiveTradeBalance: number;

  totalLiveTradeCommission: number;
  toDayLiveTradeCommission: number;

  totalLiveTradeProfit: number;
  toDayLiveTradeProfit: number;

  totalReferralBonus: number;
  toDayReferralBonus: number;

  createdAt: Date;
  updatedAt: Date;
}

const agentStatusSchema = new mongoose.Schema<IAgentStatus>(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    customerId: { type: String, required: true },
    name: { type: String, required: true },
    status: { type: String, default: "active" },

    totalDeposits: { type: Number, default: 0 },
    toDayDeposits: { type: Number, default: 0 },

    totalWithdrawals: { type: Number, default: 0 },
    toDayWithdrawals: { type: Number, default: 0 },

    totalCommissions: { type: Number, default: 0 },
    toDayCommissions: { type: Number, default: 0 },

    totalTakeCommissions: { type: Number, default: 0 },
    toDayTakeCommissions: { type: Number, default: 0 },

    totalPlayers: { type: Number, default: 0 },
    toDayPlayers: { type: Number, default: 0 },

    totalBets: { type: Number, default: 0 },
    toDayBets: { type: Number, default: 0 },

    totalProfit: { type: Number, default: 0 },
    toDayProfit: { type: Number, default: 0 },

    totalLoss: { type: Number, default: 0 },
    toDayLoss: { type: Number, default: 0 },

    totalActiveUsers: { type: Number, default: 0 },
    toDayActiveUsers: { type: Number, default: 0 },

    totalAiTradeBalance: { type: Number, default: 0 },
    toDayAiTradeBalance: { type: Number, default: 0 },

    totalAiTradeCommission: { type: Number, default: 0 },
    toDayAiTradeCommission: { type: Number, default: 0 },

    totalAiTradeProfit: { type: Number, default: 0 },
    toDayAiTradeProfit: { type: Number, default: 0 },

    totalLiveTradeBalance: { type: Number, default: 0 },
    toDayLiveTradeBalance: { type: Number, default: 0 },

    totalLiveTradeCommission: { type: Number, default: 0 },
    toDayLiveTradeCommission: { type: Number, default: 0 },

    totalLiveTradeProfit: { type: Number, default: 0 },
    toDayLiveTradeProfit: { type: Number, default: 0 },

    totalReferralBonus: { type: Number, default: 0 },
    toDayReferralBonus: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const AgentStatus = mongoose.model<IAgentStatus>(
  "AgentStatus",
  agentStatusSchema
);

export default AgentStatus;
