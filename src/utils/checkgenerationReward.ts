import { Types } from 'mongoose';
import { User, IUser } from '@/models/user.model';
import Team from '@/models/UserTeamSummary.model';

interface VipTierConfig {
	name: string;
	requirements: number;
	rewardAmount: number; // Optional for tiers that don't have a reward
}

const rewardTierConfig: VipTierConfig[] = [
	{
		name: 'Bronze Tier',
		requirements: 10,
		rewardAmount: 10,
	},
	{
		name: 'Silver Tier',
		requirements: 20,
		rewardAmount: 20,
	},
	{
		name: 'Gold Tier',
		requirements: 30,
		rewardAmount: 30,
	},
	{
		name: 'Platinum Tier',
		requirements: 40,
		rewardAmount: 40,
	},
	{
		name: 'Diamond Tier',
		requirements: 50,
		rewardAmount: 50,
	},
	{
		name: 'Elite Tier',
		requirements: 60,
		rewardAmount: 60,
	},
];

export const checkGenerationRewardTier = async (
	userId: string
): Promise<string> => {
	try {
		const [user, team] = await Promise.all([
			User.findById(userId),
			Team.findOne({ userId: userId }),
		]);

		if (!user || !team) {
			console.error('❌ User or team not found');
			return 'VIP0';
		}

		const totalActiveTeamMembers = team.totalTeamMember || 0;

		let highestTier = '';
		let rewardAmount = 0;

		for (let i = rewardTierConfig.length - 1; i >= 0; i--) {
			const tier = rewardTierConfig[i];
			const activeTeamMembers = tier.requirements;

			if (totalActiveTeamMembers >= activeTeamMembers) {
				highestTier = tier.name;
				rewardAmount = tier.rewardAmount;
				break;
			}
		}

		return highestTier;
	} catch (err) {
		console.error('❌ Error updating VIP tier:', err);
		return '';
	}
};
