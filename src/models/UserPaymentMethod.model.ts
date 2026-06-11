import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserPaymentMethod extends Document {
	userId: Types.ObjectId;
	customerId: string;
	name: string;
	method: string;
	accountNumber: string;
	createdAt: Date;
	updatedAt: Date;
}

const userPaymentMethodSchema = new Schema<IUserPaymentMethod>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		customerId: {
			type: String,
			required: true,
		},
		name: {
			type: String,
			required: true,
		},
		method: {
			type: String,
			enum: ['bkash', 'nagad', 'bank_transfer', 'rocket'],
			required: true,
		},
		accountNumber: {
			type: String,
			required: true,
		},
	},
	{ timestamps: true }
);

const UserPaymentMethod = mongoose.model<IUserPaymentMethod>(
	'UserPaymentMethod',
	userPaymentMethodSchema
);

export default UserPaymentMethod;
