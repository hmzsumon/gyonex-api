import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAgentSummary extends Document {
	agentId: Types.ObjectId; // Ref to User or Agent
	name: string;
	phone: string;
	customerId: string; // Optional, if needed for agent identification

	totalUsers: number;

	totalDeposit: number;
	totalWithdraw: number;

	todayDeposit: number;
	todayWithdraw: number;

	lastDepositDate?: Date;
	lastWithdrawDate?: Date;
}

const agentSummarySchema = new Schema<IAgentSummary>(
	{
		agentId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			unique: true,
		},
		name: { type: String, required: true, trim: true },
		phone: { type: String, required: true, trim: true },
		customerId: { type: String, trim: true },

		totalUsers: { type: Number, default: 0 },

		totalDeposit: { type: Number, default: 0 },
		totalWithdraw: { type: Number, default: 0 },

		todayDeposit: { type: Number, default: 0 },
		todayWithdraw: { type: Number, default: 0 },

		lastDepositDate: { type: Date },
		lastWithdrawDate: { type: Date },
	},
	{ timestamps: true }
);

const AgentSummary = mongoose.model<IAgentSummary>(
	'AgentSummary',
	agentSummarySchema
);

export default AgentSummary;
