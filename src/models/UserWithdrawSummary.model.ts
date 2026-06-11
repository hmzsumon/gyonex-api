import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserWithdrawSummary extends Document {
	userId: Types.ObjectId;
	username: string;
	customerId: string;

	isWithdrawBlock: boolean;

	totalWithdraw: number;
	lastWithdrawAmount: number;
	lastWithdrawDate?: Date;

	totalCancelledWithdraw: number;
	lastCancelledWithdrawAmount: number;
	lastCancelledWithdrawDate?: Date;
}

const userWithdrawSummarySchema = new Schema<IUserWithdrawSummary>(
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

		isWithdrawBlock: {
			type: Boolean,
			default: true,
		},

		// Withdraw History
		totalWithdraw: { type: Number, default: 0 },
		lastWithdrawAmount: { type: Number, default: 0 },
		lastWithdrawDate: { type: Date },

		// Cancelled Withdraws
		totalCancelledWithdraw: { type: Number, default: 0 },
		lastCancelledWithdrawAmount: { type: Number, default: 0 },
		lastCancelledWithdrawDate: { type: Date },
	},
	{ timestamps: true }
);

export default mongoose.model<IUserWithdrawSummary>(
	'UserWithdrawSummary',
	userWithdrawSummarySchema
);
