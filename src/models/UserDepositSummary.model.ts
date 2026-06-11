import mongoose, { Schema, Document, Types, mongo } from 'mongoose';

export interface IUserDepositSummary extends Document {
	userId: Types.ObjectId;
	username: string;
	customerId: string;

	totalDeposit: number;
	lastDepositAmount: number;
	lastDepositDate?: Date;

	totalCancelledDeposit: number;
	lastCancelledDepositAmount: number;
	lastCancelledDepositDate?: Date;
}

const userDepositSummarySchema = new Schema<IUserDepositSummary>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},

		customerId: {
			type: String,
			required: true,
			trim: true,
		},

		// Deposit History
		totalDeposit: { type: Number, default: 0 },
		lastDepositAmount: { type: Number, default: 0 },
		lastDepositDate: { type: Date },

		// Cancelled Deposits
		totalCancelledDeposit: { type: Number, default: 0 },
		lastCancelledDepositAmount: { type: Number, default: 0 },
		lastCancelledDepositDate: { type: Date },
	},
	{ timestamps: true }
);

export default mongoose.model<IUserDepositSummary>(
	'UserDepositSummary',
	userDepositSummarySchema
);
