import mongoose, { Document, Schema } from 'mongoose';

export interface IDepositBDT extends Document {
	userId: mongoose.Types.ObjectId;
	orderId: string;
	name: string;
	phone: string;
	email: string;
	customerId: string;
	amount: number;
	requestAmount: number;
	txId: string;
	sourceNumber: string; // User's wallet Number (bkaash, nagad, rocket, etc.)
	destinationNumber: string; // Merchant's wallet Number (bkaash, nagad, rocket, etc.)

	walletTitle: string; // Wallet title (bkaash, nagad, rocket, etc.)
	walletType: string; // Wallet type (personal, business, etc.)
	currency: string;
	status: 'pending' | 'confirmed' | 'expired' | 'failed' | 'approved';
	isApproved?: boolean;
	isExpired?: boolean;
	approvedAt?: Date;
	updatedAt?: Date;
	createdAt?: Date;
	isManual?: boolean;
	callbackUrl: string;
	note: string;
}

const depositBDTSchema = new Schema<IDepositBDT>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		orderId: {
			type: String,
			unique: true,
			required: true,
			index: true,
		},
		name: {
			type: String,
		},
		phone: {
			type: String,
			required: true,
		},
		email: {
			type: String,
		},
		customerId: {
			type: String,
		},
		amount: {
			type: Number,
			default: 0,
		},
		requestAmount: {
			type: Number,
			required: true,
		},

		txId: {
			type: String,
			required: true,
		},

		sourceNumber: {
			type: String,
		},

		destinationNumber: {
			type: String,
		},
		walletTitle: {
			type: String,
		},
		walletType: {
			type: String,
		},
		status: {
			type: String,
			default: 'pending',
		},

		isApproved: {
			type: Boolean,
			default: false,
		},
		isExpired: {
			type: Boolean,
			default: false,
		},
		approvedAt: {
			type: Date,
		},

		isManual: {
			type: Boolean,
			default: false, // Indicates if the deposit is manual
		},
		callbackUrl: {
			type: String,
			// URL to receive callback notifications
		},

		note: {
			type: String,
			default: '', // Additional notes for the deposit
		},
	},
	{
		timestamps: true,
	}
);

const DepositBDT = mongoose.model<IDepositBDT>('DepositBDT', depositBDTSchema);
export default DepositBDT;
