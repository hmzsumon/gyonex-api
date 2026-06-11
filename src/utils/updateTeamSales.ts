import { User as IUserModel } from "@/models/user.model";
import Team from "@/models/UserTeamSummary.model";
import { Types } from "mongoose";

interface IUser {
  _id: Types.ObjectId;
  name: string;
  parents?: Types.ObjectId[];
  is_block?: boolean;
  is_active?: boolean;
}

interface ITeamLevel {
  sales?: number;
  this_month_sales?: number;
  today_sales?: number;
  today_sales_count?: number;
  [key: string]: any;
}

interface ITeam {
  user_id: Types.ObjectId;
  total_sales?: number;
  today_sales?: number;
  this_month_sales?: number;
  today_sales_count?: number;

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

const updateTeamSales = async (
  userId: Types.ObjectId | string,
  amount: number
): Promise<void> => {
  try {
    const user: IUser | null = await IUserModel.findById(userId);
    if (!user || !user.parents?.length) return;

    for (let level = 0; level < user.parents.length && level < 10; level++) {
      const parentId = user.parents[level];
      const team: ITeam | null = await Team.findOne({ userId: parentId });
      if (!team) continue;

      const parent: IUser | null = await IUserModel.findById(parentId);
      if (!parent || parent.is_block) continue;

      // console.log("👤 Parent:", parent.name);

      // Total updates
      team.totalTeamDeposit += amount;
      team.totalTeamActiveDeposit += amount;
      team.thisMonthSales += amount;

      // Level-based updates
      const levelKey = `level_${level + 1}`;
      if (team[levelKey]) {
        team[levelKey].deposit += amount;
        team[levelKey].activeDeposit += amount;
        team[levelKey].thisMonthSales += amount;
      }

      await team.save();

      //   console.log(
      //     `✅ Updated team sales for level ${level + 1}: user ${parentId}`,
      //     `Total Sales: ${team.total_sales}`
      //   );
    }
  } catch (err: any) {
    console.error("❌ Error updating team sales:", err.message);
  }
};

export default updateTeamSales;
