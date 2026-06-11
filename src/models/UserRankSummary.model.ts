import mongoose, { Schema, Document, Types } from 'mongoose';

interface IRankHistory {
	rank: string;
	updatedAt?: Date;
	approvedAt?: Date;
	bonusAmount?: number;
}

interface ISalaryHistory {
	month: string; // '2025-05' format
	rankAtMonth: string;
	paidAt: Date;
	amount: number;
}

export interface IUserRankSummary extends Document {
	userId: Types.ObjectId;
	customerId: string;
	email?: string;

	currentRank?: string;
	currentRankBonus?: number;
	rankUpdatedAt?: Date;

	ranks: string[];
	rankHistory: IRankHistory[];

	monthlySalaryTotal: number;
	salaryHistory: ISalaryHistory[];
}

const rankHistorySchema = new Schema<IRankHistory>(
	{
		rank: { type: String },
		updatedAt: { type: Date },
		approvedAt: { type: Date },
		bonusAmount: { type: Number },
	},
	{ _id: false }
);

const salaryHistorySchema = new Schema<ISalaryHistory>(
	{
		month: { type: String, required: true }, // Example: '2025-05'
		rankAtMonth: { type: String },
		paidAt: { type: Date, required: true },
		amount: { type: Number, required: true },
	},
	{ _id: false }
);

const userRankSummarySchema = new Schema<IUserRankSummary>(
	{
		userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		customerId: { type: String, required: true, trim: true },
		email: { type: String, trim: true },

		currentRank: { type: String },
		currentRankBonus: { type: Number },
		rankUpdatedAt: { type: Date },

		ranks: { type: [String], default: [] },
		rankHistory: { type: [rankHistorySchema], default: [] },

		monthlySalaryTotal: { type: Number, default: 0 },
		salaryHistory: { type: [salaryHistorySchema], default: [] },
	},
	{ timestamps: true }
);

const UserRankSummary = mongoose.model<IUserRankSummary>(
	'UserRankSummary',
	userRankSummarySchema
);

export default UserRankSummary;
