import { IUser, User as IUserModel } from "@/models/user.model";
import Team, { IUserTeamSummary } from "@/models/UserTeamSummary.model";
import { Types } from "mongoose";

const updateTeamAiTradeInfo = async (
  userId: Types.ObjectId | string,
  amount: number
): Promise<void> => {
  try {
    const user: IUser | null = await IUserModel.findById(userId);
    if (!user || !user.parents?.length) return;

    // console.log("👤 User:", user.name, user.is_new);

    for (let level = 0; level < user.parents.length && level < 10; level++) {
      const parentId = user.parents[level];
      const team: IUserTeamSummary | null = await Team.findOne({
        userId: parentId,
      });
      if (!team) continue;

      const parent: IUser | null = await IUserModel.findById(parentId);
      if (!parent || parent.is_block) continue;

      // console.log("👤 Parent:", parent.name);

      // Total updates
      team.teamTotalAiTradeBalance += amount;

      // Level-based updates
      const levelKey = `level_${level + 1}`;
      if (team[levelKey]) {
        team[levelKey].aiTradeBalance += amount;
      }

      await team.save();

      //   console.log(
      //     `✅ Updated team Ai Trade Balance for level ${level + 1}: Parent ${
      //       parent.customerId
      //     }`,
      //     `Total Sales: ${team.teamTotalAiTradeBalance}`
      //   );
    }
  } catch (err: any) {
    console.error("❌ Error updating team sales:", err.message);
  }
};

export default updateTeamAiTradeInfo;
