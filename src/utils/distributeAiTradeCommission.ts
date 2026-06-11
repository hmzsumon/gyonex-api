import Company, { ISystemStats } from "@/models/SystemStats.model";
import { IUser, User } from "@/models/user.model";
import Team, { IUserTeamSummary } from "@/models/UserTeamSummary.model";
import Wallet from "@/models/UserWallet.model";
import TransactionManager from "@/utils/TransactionManager";
import { Types } from "mongoose";

const transactionManager = new TransactionManager();

const distributeAiTradeCommission = async (
  userId: string | Types.ObjectId,
  amount: number
): Promise<void> => {
  let total_cost = 0;

  try {
    const user = await User.findById(userId);

    if (!user) {
      console.error("❌ User not found:", userId);
      return;
    }

    const parents: IUser[] = await User.find({
      _id: { $in: user.parents },
    }).select("_id name customerId  m_balance is_active");
    parents.reverse();

    const bonusRates: number[] = [0.12, 0.08, 0.04]; // level 1 to 3

    for (let i = 0; i < Math.min(parents.length, 3); i++) {
      const parent = parents[i];
      if (!parent) continue;

      //check if parent is active
      if (!parent.is_active) {
        console.log(`❌ Parent ${parent.name} is not active, skipping...`);
        continue;
      }

      const parentWallet = await Wallet.findOne({ userId: parent._id });
      const parentTeam: IUserTeamSummary | null = await Team.findOne({
        userId: parent._id,
      });

      if (!parentWallet) continue;

      const rate = bonusRates[i];
      const bonusAmount = amount * rate;

      // update parent balance
      parent.m_balance += bonusAmount;

      // Update wallet
      parentWallet.totalEarning += bonusAmount;
      parentWallet.thisMonthEarning += bonusAmount;
      parentWallet.generationEarning += bonusAmount;

      // Update team commission
      if (parentTeam) {
        if (i === 0) {
          parentTeam.level_1.aiTradeCommission += bonusAmount;
        } else if (i === 1) {
          parentTeam.level_2.aiTradeCommission += bonusAmount;
        } else if (i === 2) {
          parentTeam.level_3.aiTradeCommission += bonusAmount;
        }

        parentTeam.totalTeamCommission += bonusAmount;
        parentTeam.todayTeamCommission += bonusAmount;
        parentTeam.thisMonthCommission += bonusAmount;

        await parentTeam.save();
      }

      await parentWallet.save();
      await parent.save();

      total_cost += bonusAmount;

      console.log(
        `✅ Distributed ${bonusAmount.toFixed(4)} to ${parent.name} for level ${
          i + 1
        }`
      );

      await transactionManager.createTransaction({
        userId: parent._id as string,
        customerId: parent.customerId,
        amount: bonusAmount,
        transactionType: "cashIn",
        purpose: "Team Commission",
        description: `Team commission for (${user.customerId})`,
      });
    }

    const company = (await Company.findOne()) as ISystemStats | null;
    if (company) {
      company.costs.total += total_cost;
      await company.save();
    }

    console.log("✅ Generation rebates distributed");
  } catch (error) {
    console.error("❌ Error distributing rebates:", error);
    throw error;
  }
};

export default distributeAiTradeCommission;
