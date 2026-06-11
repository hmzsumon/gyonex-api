import mongoose, { Schema, Document, Types } from 'mongoose';

// ✅ Interface
export interface IUserTransferSummary extends Document {
	userId: Types.ObjectId;
	customerId: string;
	username?: string;

	// Send summary
	totalSendAmount: number;
	totalSendCount: number;
	lastSendAmount: number;
	lastSendDate?: Date;
	lastRecipient?: {
		name?: string;
		customerId?: string;
	};

	// Receive summary
	totalReceiveAmount: number;
	totalReceiveCount: number;
	lastReceiveAmount: number;
	lastReceiveDate?: Date;
	lastSender?: {
		name?: string;
		customerId?: string;
	};
}

// ✅ Schema
const userTransferSummarySchema = new Schema<IUserTransferSummary>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
		customerId: {
			type: String,
			required: true,
			trim: true,
		},
		username: {
			type: String,
			trim: true,
		},

		// Send
		totalSendAmount: { type: Number, default: 0 },
		totalSendCount: { type: Number, default: 0 },
		lastSendAmount: { type: Number, default: 0 },
		lastSendDate: { type: Date },
		lastRecipient: {
			name: { type: String },
			customerId: { type: String },
		},

		// Receive
		totalReceiveAmount: { type: Number, default: 0 },
		totalReceiveCount: { type: Number, default: 0 },
		lastReceiveAmount: { type: Number, default: 0 },
		lastReceiveDate: { type: Date },
		lastSender: {
			name: { type: String },
			customerId: { type: String },
		},
	},
	{ timestamps: true }
);

// ✅ Export model
const UserTransferSummary = mongoose.model<IUserTransferSummary>(
	'UserTransferSummary',
	userTransferSummarySchema
);

export default UserTransferSummary;
