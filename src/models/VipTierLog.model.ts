import e from 'express';
import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IVipTierLog extends Document {
	userId: Types.ObjectId;
	customerId: string; // Assuming customerId is a string
	vipTier: string;
	lastVipTier: string; // Optional field for the last VIP tier
	createdAt: Date;
	updatedAt: Date;
}

const vipTierLogSchema = new Schema<IVipTierLog>(
	{
		userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		customerId: { type: String, required: true },
		vipTier: { type: String, default: 'VIP0' }, // Default to VIP0 if not specified
		lastVipTier: { type: String, default: 'VIP0' }, // Optional field for the last VIP tier
	},
	{ timestamps: true }
);

export const VipTierLog = mongoose.model<IVipTierLog>(
	'VipTierLog',
	vipTierLogSchema
);
export default VipTierLog;
