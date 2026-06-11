import mongoose, { Document, Schema, model } from 'mongoose';

export interface TireProfitRateValues {
	VIP1?: number;
	VIP2?: number;
	VIP3?: number;
	VIP4?: number;
	VIP5?: number;
	VIP6?: number;
}

export interface ITireProfitRate extends Document, TireProfitRateValues {
	createdAt?: Date;
	updatedAt?: Date;
}

const tireProfitRateSchema: Schema = new Schema(
	{
		VIP1: { type: Number, default: 0.02 },
		VIP2: { type: Number, default: 0.025 },
		VIP3: { type: Number, default: 0.028 },
		VIP4: { type: Number, default: 0.032 },
		VIP5: { type: Number, default: 0.036 },
		VIP6: { type: Number, default: 0.05 },
	},
	{ timestamps: true }
);

const TireProfitRate = model<ITireProfitRate>(
	'TireProfitRate',
	tireProfitRateSchema
);

export default TireProfitRate;
