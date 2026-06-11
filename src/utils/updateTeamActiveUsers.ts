/* ──────────  update active users up to 10 levels (first activation only)  ────────── */
import { User } from "@/models/user.model";
import Team from "@/models/UserTeamSummary.model";
import { Types } from "mongoose";

interface IUser {
  _id: Types.ObjectId;
  parents?: Types.ObjectId[];
}

interface ITeamLevel {
  activeUsers?: number;
  inactiveUsers?: number;
  [k: string]: any;
}

interface ITeamDoc {
  userId: Types.ObjectId;
  teamActiveMember?: number;
  [k: string]: any; // allows level_1 ... level_10
  save: () => Promise<void>;
}

interface ICompany {
  users: {
    total: number; // if you track total registered users here, avoid bumping on activation
    activeTotal: number; // total active users (lifetime)
    activeToday?: number;
  };
  save: () => Promise<void>;
}

const updateTeamActiveUsers = async (
  userId: Types.ObjectId | string
): Promise<void> => {
  try {
    const user: IUser | null = await User.findById(userId);
    if (!user || !user.parents?.length) return;

    /* ──────────  walk parents (max 10 levels)  ────────── */
    for (let level = 0; level < user.parents.length && level < 10; level++) {
      const parentId = user.parents[level];

      const team: ITeamDoc | null = await Team.findOne({ userId: parentId });
      if (!team) continue;

      /* ──────────  aggregate active members  ────────── */
      team.teamActiveMember = (team.teamActiveMember ?? 0) + 1;

      const levelKey = `level_${level + 1}`;
      const lvl = team[levelKey] as ITeamLevel | undefined;

      if (lvl) {
        lvl.activeUsers = (lvl.activeUsers ?? 0) + 1;
        const prevInactive = Number(lvl.inactiveUsers ?? 0);
        lvl.inactiveUsers = Math.max(0, prevInactive - 1);
      }

      await team.save();
    }
  } catch (err: any) {
    console.error("❌ Error updating team actives:", err.message);
  }
};

export default updateTeamActiveUsers;
