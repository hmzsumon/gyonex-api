import mongoose, { Schema } from 'mongoose';

const generationRewardConfigSchema = new Schema(
	{
		userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
		customerId: { type: String, required: true }, // e.g. 'cus_1234567890'
		tierName: { type: String, default: '' }, // e.g. Bronze Tier
		lastRewardAmount: { type: Number, default: 0 }, // e.g. 10
		totalRewards: { type: Number, default: 0 },
		isClaimed: { type: Boolean, default: false },
		claimedAt: { type: Date, default: Date.now },
		claimedLevels: [],
	},
	{ timestamps: true }
);

const GenerationRewardConfig =
	mongoose.models.VipRewardClaim ||
	mongoose.model('VipRewardClaim', generationRewardConfigSchema);

export default GenerationRewardConfig;
