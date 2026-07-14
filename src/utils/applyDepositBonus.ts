import AgentStatus from "@/models/AgentStatus.model";
import { User } from "@/models/user.model";
import UserTeamSummary from "@/models/UserTeamSummary.model";
import UserWallet from "@/models/UserWallet.model";
import TransactionManager from "@/utils/TransactionManager";
import { Types } from "mongoose";

interface ApplyDepositBonusOptions {
  userName: string;
  sponsorId: Types.ObjectId;
  amount: number;
  plan: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isDev = process.env.NODE_ENV !== "production";

export const applyDepositBonus = async ({
  userName,
  sponsorId,
  amount,
  plan,
}: ApplyDepositBonusOptions): Promise<void> => {
  try {
    const sponsor = await User.findById(sponsorId);
    if (!sponsor) {
      console.error(`Sponsor not found for user ${userName}`);
      return;
    }

    /* ────────── Check if sponsor is active ai trade ────────── */
    if (!sponsor.is_active_aiTrade) {
      console.error(`Sponsor ${sponsor.customerId} is not active.`);
      return;
    }

    /* ────────── calculate sponsor bonus ────────── */
    const bonus = round2(amount * 0.04); // 4%

    if (isDev) {
      console.log(
        "\n================ SPONSOR BONUS CALCULATION ================",
      );
      console.table([
        {
          userName,
          sponsorId: String(sponsor._id),
          sponsorCustomerId: sponsor.customerId,
          plan,
          depositAmount: round2(amount),
          bonusPercent: "2%",
          bonusAmount: bonus,
          sponsorActive: sponsor.is_active_aiTrade ? "YES" : "NO",
        },
      ]);
    }

    /* ────────── Apply sponsor bonus ────────── */
    const prevSponsorBalance = round2(sponsor.m_balance ?? 0);
    const prevAddNewMember = sponsor.addNewMember ?? 0;

    sponsor.m_balance = round2((sponsor.m_balance ?? 0) + bonus);
    await sponsor.save();

    if (isDev) {
      console.log("\nSponsor Main Balance Update:");
      console.table([
        {
          sponsorCustomerId: sponsor.customerId,
          previousBalance: prevSponsorBalance,
          bonusAdded: bonus,
          newBalance: round2(sponsor.m_balance ?? 0),
          previousAddNewMember: prevAddNewMember,
          newAddNewMember: sponsor.addNewMember,
        },
      ]);
    }

    /* ────────── Update sponsor wallet ────────── */
    const wallet = await UserWallet.findOne({ userId: sponsor._id });
    if (!wallet) {
      console.error(`Wallet not found for sponsor ${sponsor.customerId}`);
      return;
    }

    const prevWallet = {
      totalEarning: round2(wallet.totalEarning ?? 0),
      todayEarning: round2(wallet.todayEarning ?? 0),
      thisMonthEarning: round2(wallet.thisMonthEarning ?? 0),
      totalReferralBonus: round2(wallet.totalReferralBonus ?? 0),
    };

    wallet.totalEarning = round2((wallet.totalEarning ?? 0) + bonus);
    wallet.todayEarning = round2((wallet.todayEarning ?? 0) + bonus);
    wallet.thisMonthEarning = round2((wallet.thisMonthEarning ?? 0) + bonus);
    wallet.totalReferralBonus = round2(
      (wallet.totalReferralBonus ?? 0) + bonus,
    );
    await wallet.save();

    if (isDev) {
      console.log("\nSponsor Wallet Update:");
      console.table([
        {
          sponsorCustomerId: sponsor.customerId,
          bonus,
          totalEarning_before: prevWallet.totalEarning,
          totalEarning_after: round2(wallet.totalEarning ?? 0),
          todayEarning_before: prevWallet.todayEarning,
          todayEarning_after: round2(wallet.todayEarning ?? 0),
          thisMonthEarning_before: prevWallet.thisMonthEarning,
          thisMonthEarning_after: round2(wallet.thisMonthEarning ?? 0),
          totalReferralBonus_before: prevWallet.totalReferralBonus,
          totalReferralBonus_after: round2(wallet.totalReferralBonus ?? 0),
        },
      ]);
    }

    /* ────────── get Team and Update sponsor team summary ────────── */
    const userTeam = await UserTeamSummary.findOne({
      userId: sponsor._id,
    }).select("totalReferralBonus");
    if (!userTeam) {
      console.error(`Team not found for sponsor ${sponsor.customerId}`);
      return;
    }

    const prevTeamReferralBonus = round2(userTeam.totalReferralBonus ?? 0);
    userTeam.totalReferralBonus = round2(
      (userTeam.totalReferralBonus ?? 0) + bonus,
    );
    await userTeam.save();

    if (isDev) {
      console.log("\nUser Team Summary Update:");
      console.table([
        {
          sponsorCustomerId: sponsor.customerId,
          totalReferralBonus_before: prevTeamReferralBonus,
          bonusAdded: bonus,
          totalReferralBonus_after: round2(userTeam.totalReferralBonus ?? 0),
        },
      ]);
    }

    /* ────────── Create cash-in transaction for sponsor ────────── */
    const txManager = new TransactionManager();
    await txManager.createTransaction({
      userId: (sponsor._id as Types.ObjectId).toString(),
      customerId: sponsor.customerId,
      transactionType: "cashIn",
      amount: bonus,
      purpose: "Deposit Bonus",
      description: `You have received a referral bonus of ${bonus.toFixed(
        2,
      )}$ from ${userName}'s plan ${plan} Trade.`,
    });

    if (isDev) {
      console.log("\nTransaction Created:");
      console.table([
        {
          sponsorCustomerId: sponsor.customerId,
          transactionType: "cashIn",
          purpose: "Deposit Bonus",
          amount: bonus,
          fromUser: userName,
          plan,
        },
      ]);
    }

    /* ────────── get agent status and update totalReferralBonus ────────── */
    const agentStatus = await AgentStatus.findOne({ agentId: sponsor.agentId });
    if (!agentStatus) {
      console.error(`Agent status not found for sponsor ${sponsor.customerId}`);
      return;
    }

    const prevAgentStatus = {
      totalReferralBonus: round2(agentStatus.totalReferralBonus ?? 0),
      toDayReferralBonus: round2(agentStatus.toDayReferralBonus ?? 0),
    };

    agentStatus.totalReferralBonus = round2(
      (agentStatus.totalReferralBonus ?? 0) + bonus,
    );
    agentStatus.toDayReferralBonus = round2(
      (agentStatus.toDayReferralBonus ?? 0) + bonus,
    );
    await agentStatus.save();

    if (isDev) {
      console.log("\nAgent Status Update:");
      console.table([
        {
          sponsorCustomerId: sponsor.customerId,
          agentId: String(sponsor.agentId ?? ""),
          totalReferralBonus_before: prevAgentStatus.totalReferralBonus,
          totalReferralBonus_after: round2(agentStatus.totalReferralBonus ?? 0),
          toDayReferralBonus_before: prevAgentStatus.toDayReferralBonus,
          toDayReferralBonus_after: round2(agentStatus.toDayReferralBonus ?? 0),
        },
      ]);

      console.log(
        "\n================ SPONSOR BONUS FINAL SUMMARY ================",
      );
      console.table([
        {
          sponsorCustomerId: sponsor.customerId,
          userName,
          plan,
          depositAmount: round2(amount),
          referralBonus: bonus,
          sponsorBalanceAfter: round2(sponsor.m_balance ?? 0),
          walletTotalReferralBonus: round2(wallet.totalReferralBonus ?? 0),
          teamTotalReferralBonus: round2(userTeam.totalReferralBonus ?? 0),
          agentTotalReferralBonus: round2(agentStatus.totalReferralBonus ?? 0),
          status: "SUCCESS",
        },
      ]);
      console.log(
        "============================================================\n",
      );
    }
  } catch (error) {
    console.error("🔴 Failed to apply sponsor bonus:", error);
  }
};
