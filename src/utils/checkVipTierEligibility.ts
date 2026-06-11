import TireProfitRate from "@/models/TireProfitRate.model";
import { User } from "@/models/user.model";
import Team from "@/models/UserTeamSummary.model";
import { VipTierLog } from "@/models/VipTierLog.model";
import { Types } from "mongoose";

interface VipTierRequirement {
  activeTeamMembers: number;
  balance: number;
  minB: number;
  maxB: number;
}

interface VipTierConfig {
  name: string;
  requirements: VipTierRequirement;
}

const vipTierConfig: VipTierConfig[] = [
  {
    name: "VIP1",
    requirements: { activeTeamMembers: 0, balance: 30, minB: 30, maxB: 499 },
  },
  {
    name: "VIP2",
    requirements: { activeTeamMembers: 5, balance: 500, minB: 500, maxB: 1999 },
  },
  {
    name: "VIP3",
    requirements: {
      activeTeamMembers: 10,
      balance: 2000,
      minB: 2000,
      maxB: 4999,
    },
  },
  {
    name: "VIP4",
    requirements: {
      activeTeamMembers: 15,
      balance: 5000,
      minB: 5000,
      maxB: 9999,
    },
  },
  {
    name: "VIP5",
    requirements: {
      activeTeamMembers: 50,
      balance: 10000,
      minB: 10000,
      maxB: 19999,
    },
  },
  {
    name: "VIP6",
    requirements: {
      activeTeamMembers: 100,
      balance: 20000,
      minB: 20000,
      maxB: Infinity,
    },
  },
];

export const checkAndUpdateVipTier = async (
  userId: string
): Promise<string> => {
  try {
    const [user, team, profitRate] = await Promise.all([
      User.findById(userId),
      Team.findOne({ userId: userId }),
      TireProfitRate.findOne(),
    ]);

    if (!user || !team || !profitRate) {
      console.error("❌ User or team not found");
      return "VIP0";
    }

    const getValidUsers = (ids: Types.ObjectId[] = []) =>
      ids.filter((id) => Types.ObjectId.isValid(id));

    const allMemberIds = [
      ...getValidUsers(team.level_1?.users),
      ...getValidUsers(team.level_2?.users),
      ...getValidUsers(team.level_3?.users),
    ];

    const activeMembers = await User.find({
      _id: { $in: allMemberIds },
      m_balance: { $gte: 100 },
    });
    const totalActiveTeamMembers = activeMembers.length;
    const userBalance = user.m_balance ?? 0;

    let highestTier = "VIP0";
    let taskValue = 0;

    for (let i = vipTierConfig.length - 1; i >= 0; i--) {
      const tier = vipTierConfig[i];
      const { balance, activeTeamMembers } = tier.requirements;

      if (
        userBalance >= balance &&
        totalActiveTeamMembers >= activeTeamMembers
      ) {
        highestTier = tier.name;
        break;
      }
    }

    const lastVipTier = user.vipTier || "VIP0";

    //calculate task value based on user's balance and user's vip tier by profit rate
    if (profitRate) {
      // Cast profitRate to any or define a proper interface for dynamic access
      const rateObj = profitRate as any;
      const vipRate = rateObj[highestTier] || 0;
      const balance = user.m_balance || 0;
      const totalValue = balance * vipRate;
      taskValue = totalValue / 3;
    }

    // console.log(
    // 	`User ${userId} - Balance: ${userBalance}, Active Members: ${totalActiveTeamMembers}, Highest Tier: ${highestTier}, Task Value: ${taskValue}`
    // );

    // Update user's VIP tier only if changed
    if (lastVipTier !== highestTier || taskValue) {
      await User.findByIdAndUpdate(userId, { vipTier: highestTier });

      await VipTierLog.findOneAndUpdate(
        { userId: user._id },
        {
          userId: user._id,
          customerId: user.customerId, // assuming user has `customerId` field
          vipTier: highestTier,
          lastVipTier: lastVipTier,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return highestTier;
  } catch (err) {
    console.error("❌ Error updating VIP tier:", err);
    return "VIP0";
  }
};
