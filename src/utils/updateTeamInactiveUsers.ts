import { Types } from 'mongoose';
import Company from '@/models/SystemStats.model';
import { User } from '@/models/user.model';
import Team from '@/models/UserTeamSummary.model';

interface IUser {
	_id: Types.ObjectId;
	parents?: Types.ObjectId[];
}

interface ITeamLevel {
	activeUsers: number;
	inactiveUsers: number;
	commission: number;
	[key: string]: any;
}

export interface ITeam {
	userId: Types.ObjectId;
	teamActiveMember?: number;
	level_1?: ITeamLevel;
	level_2?: ITeamLevel;
	level_3?: ITeamLevel;
	level_4?: ITeamLevel;
	level_5?: ITeamLevel;
	level_6?: ITeamLevel;
	level_7?: ITeamLevel;
	level_8?: ITeamLevel;
	level_9?: ITeamLevel;
	level_10?: ITeamLevel;
	save: () => Promise<void>;
	[key: string]: any;
}

interface ICompany {
	users: {
		total: number;
		activeTotal: number;
	};
	save: () => Promise<void>;
}

/**
 * Update active users in team hierarchy up to 10 levels.
 * @param userId MongoDB ObjectId or string
 */
const updateTeamInactiveUsers = async (
	userId: Types.ObjectId | string,
	amount: number = 0
): Promise<void> => {
	try {
		const company: ICompany | null = await Company.findOne();
		if (!company) {
			console.error('❌ Company not found');
			return;
		}

		const user: IUser | null = await User.findById(userId);
		if (!user || !user.parents?.length) return;

		for (let level = 0; level < user.parents.length && level < 10; level++) {
			const parentId = user.parents[level];
			const team: ITeam | null = await Team.findOne({ userId: parentId });
			if (!team) continue;
			const currentActiveDeposit = team.totalTeamActiveDeposit || 0;
			const currentActiveMember = team.teamActiveMember || 0;
			team.totalTeamActiveDeposit = Math.max(0, currentActiveDeposit - amount);
			team.teamActiveMember = Math.max(0, currentActiveMember - 1);

			const levelKey = `level_${level + 1}`;
			if (team[levelKey]) {
				const currentActiveUsers = team[levelKey].activeUsers || 0;
				team[levelKey].activeUsers = Math.max(0, currentActiveUsers - 1);
				const currentInactive = team[levelKey].inactiveUsers || 0;
				team[levelKey].inactiveUsers = Math.max(0, currentInactive + 1);
				const currentLevelActiveDeposit = team[levelKey].activeDeposit || 0;
				team[levelKey].activeDeposit = Math.max(
					0,
					currentLevelActiveDeposit - amount
				);
			}

			await team.save();

			company.users.activeTotal -= 1;
			await company.save();

			console.log(
				`✅ Updated team active users for level ${level + 1}: user ${parentId}`,
				`Total Active Users: ${team.total_active_member}, Active Users: ${team[levelKey]?.active_users}`
			);
		}
	} catch (err: any) {
		console.error('❌ Error updating team sales:', err.message);
	}
};

export default updateTeamInactiveUsers;
