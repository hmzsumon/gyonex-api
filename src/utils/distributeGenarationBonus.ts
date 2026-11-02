import { hasEligibleSmartAccount } from "@/services/smartTradeLifecycle.service";
import Company, { ISystemStats } from "@/models/SystemStats.model";
import { IUser, User } from "@/models/user.model";
import Team, { IUserTeamSummary } from "@/models/UserTeamSummary.model";
import Wallet from "@/models/UserWallet.model";
import TransactionManager from "@/utils/TransactionManager";
import mongoose, { Types, ClientSession } from "mongoose";

const transactionManager = new TransactionManager();

const distributeGenerationBonus = async (
  userId: string | Types.ObjectId,
  amount: number
): Promise<void> => {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => { await distributeInSession(userId, amount, session); }); }
  finally { await session.endSession(); }
};

async function distributeInSession(userId: string | Types.ObjectId, amount: number, session: ClientSession): Promise<void> {
  let total_cost = 0;

  try {
    const user = await User.findById(userId).session(session);

    if (!user) {
      console.error("❌ User not found:", userId);
      return;
    }

    const parents: IUser[] = await User.find({
      _id: { $in: user.parents },
    }).select("_id name customerId  m_balance is_active").session(session);
    parents.reverse();

    const bonusRates: number[] = [0.12, 0.08, 0.04]; // level 1 to 3

    for (let i = 0; i < Math.min(parents.length, 3); i++) {
      const parent = parents[i];
      if (!parent) continue;

      //check if parent is active
      if (!parent.is_active || !await hasEligibleSmartAccount(parent._id, session)) {
        console.log(`❌ Parent ${parent.name} is not active, skipping...`);
        continue;
      }

      const parentWallet = await Wallet.findOne({ userId: parent._id }).session(session);
      const parentTeam: IUserTeamSummary | null = await Team.findOne({
        userId: parent._id,
      }).session(session);

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

        await parentTeam.save({ session });
      }

      await parentWallet.save({ session });
      await parent.save({ session });

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
        session,
      });
    }

    const company = (await Company.findOne().session(session)) as ISystemStats | null;
    if (company) {
      company.costs.total += total_cost;
      await company.save({ session });
    }

    console.log("✅ Generation rebates distributed");
  } catch (error) {
    console.error("❌ Error distributing rebates:", error);
    throw error;
  }
};

export default distributeGenerationBonus;
