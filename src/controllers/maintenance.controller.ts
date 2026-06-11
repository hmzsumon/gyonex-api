// src/controllers/maintenance.controller.ts
import UserTeamSummary from "@/models/UserTeamSummary.model";
import { User } from "@/models/user.model";
import { typeHandler } from "@/types/express";
import { catchAsync } from "@/utils/catchAsync";
import mongoose, { Types } from "mongoose";
import { ApiError } from "../utils/ApiError";

// ----- Typed level keys (literal tuple) -----
const LEVEL_KEYS = [
  "level_1",
  "level_2",
  "level_3",
  "level_4",
  "level_5",
] as const;
type LevelKey = (typeof LEVEL_KEYS)[number];

type LevelBlock = {
  title: string;
  users: Types.ObjectId[];
  activeUsers: number;
  inactiveUsers: number;
  // ... other fields remain untouched
};

// ✅ mapped-type error এড়াতে intersection ব্যবহার
type TeamDocBase = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  totalTeamMember: number;
  teamActiveMember: number;
};
type TeamDoc = TeamDocBase & Record<LevelKey, LevelBlock>;

// lean() result typing
type LeanUserPick = {
  _id: Types.ObjectId;
  is_active?: boolean;
  is_active_aiTrade?: boolean;
  activeAt?: Date;
};

// POST /maintenance/sync-team-activations?dryRun=true
export const syncTeamActivations: typeHandler = catchAsync(async (req, res) => {
  const dryRun = String(req.query.dryRun ?? "false").toLowerCase() === "true";
  const session = await mongoose.startSession();

  const report = {
    teamsScanned: 0,
    usersScanned: 0,
    usersActivated: 0,
    levelsUpdated: 0,
    teamsUpdated: 0,
    dryRun,
    examples: [] as Array<{
      teamId: string;
      userIdActivated?: string[];
      levelDeltas: Record<
        string,
        { activeUsers: number; inactiveUsers: number }
      >;
    }>,
  };

  try {
    await session.withTransaction(async () => {
      const cursor = UserTeamSummary.find().session(session).cursor();

      for await (const rawTeam of cursor) {
        const team = rawTeam.toObject() as TeamDoc; // টাইপ কনভার্সন
        report.teamsScanned += 1;

        // 1) সব লেভেলের userIds সংগ্রহ
        const levelUserIdsMap: Record<LevelKey, Types.ObjectId[]> =
          {} as Record<LevelKey, Types.ObjectId[]>;

        let totalMembers = 0;
        for (const levelKey of LEVEL_KEYS) {
          const ids = (team[levelKey]?.users ?? []) as Types.ObjectId[];
          levelUserIdsMap[levelKey] = ids;
          totalMembers += ids.length;
        }

        // 2) ইউনিক ইউজার আইডি bulk fetch
        const allIdsUnique = [
          ...new Set(
            LEVEL_KEYS.flatMap((k) => (levelUserIdsMap[k] ?? []).map(String))
          ),
        ].map((s) => new Types.ObjectId(s));

        if (allIdsUnique.length === 0) continue;

        const users = await User.find(
          { _id: { $in: allIdsUnique } },
          { _id: 1, is_active: 1, is_active_aiTrade: 1, activeAt: 1 }
        )
          .session(session)
          .lean<LeanUserPick[]>(); // ✅ generic দিয়ে টাইপ ঠিক করা

        report.usersScanned += users.length;

        // 3) aiTrade=true && is_active!=true => activate
        const toActivateIds: Types.ObjectId[] = users
          .filter((u) => u.is_active_aiTrade === true && u.is_active !== true)
          .map((u) => u._id);

        if (!dryRun && toActivateIds.length > 0) {
          await User.bulkWrite(
            toActivateIds.map((id) => ({
              updateOne: {
                filter: { _id: id },
                update: { $set: { is_active: true, activeAt: new Date() } },
              },
            })),
            { session }
          );
        }
        report.usersActivated += toActivateIds.length;

        // 4) activation-পরবর্তী active স্টেট ম্যাপ
        const toActivateStr = new Set(toActivateIds.map(String));
        const userIsActiveMap = new Map<string, boolean>();
        for (const u of users) {
          userIsActiveMap.set(
            String(u._id),
            Boolean(u.is_active) || toActivateStr.has(String(u._id))
          );
        }

        // 5) লেভেলভিত্তিক active/inactive পুনর্গণনা
        const levelUpdates: Partial<
          Record<LevelKey, { activeUsers: number; inactiveUsers: number }>
        > = {};
        let totalActiveMembers = 0;

        for (const levelKey of LEVEL_KEYS) {
          const ids = levelUserIdsMap[levelKey] ?? [];
          if (ids.length === 0) {
            levelUpdates[levelKey] = { activeUsers: 0, inactiveUsers: 0 };
            continue;
          }

          let activeCount = 0;
          for (const id of ids) {
            if (userIsActiveMap.get(String(id)) === true) activeCount += 1;
          }
          const inactiveCount = ids.length - activeCount;
          totalActiveMembers += activeCount;

          const prevActive = team[levelKey]?.activeUsers ?? 0;
          const prevInactive = team[levelKey]?.inactiveUsers ?? 0;

          if (prevActive !== activeCount || prevInactive !== inactiveCount) {
            levelUpdates[levelKey] = {
              activeUsers: activeCount,
              inactiveUsers: inactiveCount,
            };
            report.levelsUpdated += 1;
          }
        }

        // 6) teamActiveMember / totalTeamMember
        const shouldSetTeamActive =
          (team.teamActiveMember ?? 0) !== totalActiveMembers;
        const shouldSetTotalMembers =
          (team.totalTeamMember ?? 0) !== totalMembers;

        // 7) $set নির্মাণ—শুধু LEVEL_KEYS ব্যবহার (টাইপ-সেইফ)
        const $set: Record<string, unknown> = {};
        for (const levelKey of LEVEL_KEYS) {
          const upd = levelUpdates[levelKey];
          if (upd) {
            $set[`${levelKey}.activeUsers`] = upd.activeUsers;
            $set[`${levelKey}.inactiveUsers`] = upd.inactiveUsers;
          }
        }
        if (shouldSetTeamActive) $set["teamActiveMember"] = totalActiveMembers;
        if (shouldSetTotalMembers) $set["totalTeamMember"] = totalMembers;

        if (!dryRun && Object.keys($set).length > 0) {
          await UserTeamSummary.updateOne(
            { _id: team._id },
            { $set },
            { session }
          );
          report.teamsUpdated += 1;
        }

        if (toActivateIds.length || Object.keys($set).length) {
          const levelDeltas: Record<
            string,
            { activeUsers: number; inactiveUsers: number }
          > = {};
          for (const levelKey of LEVEL_KEYS) {
            const upd = levelUpdates[levelKey];
            if (upd) {
              levelDeltas[levelKey] = {
                activeUsers: upd.activeUsers,
                inactiveUsers: upd.inactiveUsers,
              };
            }
          }
          report.examples.push({
            teamId: String(team._id),
            userIdActivated: toActivateIds.slice(0, 5).map(String),
            levelDeltas,
          });
        }
      }
    });

    return res.json({ success: true, ...report });
  } catch (err: any) {
    throw new ApiError(500, err?.message ?? "Failed to sync team activations");
  } finally {
    session.endSession();
  }
});
