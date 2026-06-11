import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserAddress extends Document {
	userId: Types.ObjectId;
	customerId?: string;

	address?: string;
	city?: string;
	state?: string;
	zip?: string;
	country?: string;
}

const userAddressSchema = new Schema<IUserAddress>(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		customerId: {
			type: String,
			trim: true,
		},
		address: {
			type: String,
			trim: true,
		},
		city: {
			type: String,
			trim: true,
		},
		state: {
			type: String,
			trim: true,
		},
		zip: {
			type: String,
			trim: true,
		},
		country: {
			type: String,
			trim: true,
		},
	},
	{ timestamps: true }
);

const UserAddress = mongoose.model<IUserAddress>(
	'UserAddress',
	userAddressSchema
);

export default UserAddress;
