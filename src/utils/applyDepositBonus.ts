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

export interface ApplyDepositBonusResult {
  applied: boolean;
  bonus: number;
  reason?: string;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const isDev = process.env.NODE_ENV !== "production";

export const applyDepositBonus = async ({
  userName,
  sponsorId,
  amount,
  plan,
}: ApplyDepositBonusOptions): Promise<ApplyDepositBonusResult> => {
  try {
    /* ────────── Validate deposit amount ────────── */
    if (!Number.isFinite(amount) || amount <= 0) {
      return { applied: false, bonus: 0, reason: "Invalid deposit amount" };
    }

    /* ────────── Load sponsor and related summary documents ────────── */
    const sponsor = await User.findById(sponsorId);
    if (!sponsor) {
      console.error(`Sponsor not found for user ${userName}`);
      return { applied: false, bonus: 0, reason: "Sponsor not found" };
    }

    if (!sponsor.is_active_aiTrade) {
      console.error(`Sponsor ${sponsor.customerId} is not active.`);
      return { applied: false, bonus: 0, reason: "Sponsor is not active" };
    }

    const [wallet, userTeam, agentStatus] = await Promise.all([
      UserWallet.findOne({ userId: sponsor._id }),
      UserTeamSummary.findOne({ userId: sponsor._id }).select(
        "totalReferralBonus",
      ),
      AgentStatus.findOne({ agentId: sponsor.agentId }),
    ]);

    if (!wallet) {
      console.error(`Wallet not found for sponsor ${sponsor.customerId}`);
      return { applied: false, bonus: 0, reason: "Sponsor wallet not found" };
    }

    if (!userTeam) {
      console.error(`Team not found for sponsor ${sponsor.customerId}`);
      return {
        applied: false,
        bonus: 0,
        reason: "Sponsor team summary not found",
      };
    }

    if (!agentStatus) {
      console.error(`Agent status not found for sponsor ${sponsor.customerId}`);
      return {
        applied: false,
        bonus: 0,
        reason: "Sponsor agent status not found",
      };
    }

    /* ────────── Calculate 4% sponsor deposit bonus ────────── */
    const bonus = round2(amount * 0.04);

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
          bonusPercent: "4%",
          bonusAmount: bonus,
          sponsorActive: "YES",
        },
      ]);
    }

    /* ────────── Update sponsor main balance ────────── */
    sponsor.m_balance = round2((sponsor.m_balance ?? 0) + bonus);
    await sponsor.save();

    /* ────────── Update sponsor wallet earnings ────────── */
    wallet.totalEarning = round2((wallet.totalEarning ?? 0) + bonus);
    wallet.todayEarning = round2((wallet.todayEarning ?? 0) + bonus);
    wallet.thisMonthEarning = round2((wallet.thisMonthEarning ?? 0) + bonus);
    wallet.totalReferralBonus = round2(
      (wallet.totalReferralBonus ?? 0) + bonus,
    );
    await wallet.save();

    /* ────────── Update sponsor team referral summary ────────── */
    userTeam.totalReferralBonus = round2(
      (userTeam.totalReferralBonus ?? 0) + bonus,
    );
    await userTeam.save();

    /* ────────── Update sponsor agent referral summary ────────── */
    agentStatus.totalReferralBonus = round2(
      (agentStatus.totalReferralBonus ?? 0) + bonus,
    );
    agentStatus.toDayReferralBonus = round2(
      (agentStatus.toDayReferralBonus ?? 0) + bonus,
    );
    await agentStatus.save();

    /* ────────── Create sponsor cash-in transaction ────────── */
    const txManager = new TransactionManager();
    await txManager.createTransaction({
      userId: (sponsor._id as Types.ObjectId).toString(),
      customerId: sponsor.customerId,
      transactionType: "cashIn",
      amount: bonus,
      purpose: "Deposit Bonus",
      description: `You received a 4% deposit referral bonus of ${bonus.toFixed(
        2,
      )} USDT from ${userName}'s ${plan} deposit.`,
    });

    if (isDev) {
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

    return { applied: true, bonus };
  } catch (error) {
    console.error("🔴 Failed to apply sponsor bonus:", error);
    return {
      applied: false,
      bonus: 0,
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
