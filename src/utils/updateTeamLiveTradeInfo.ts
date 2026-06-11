/* ───────────────────────────────────────────────────────────
   utils/updateTeamLiveTradeInfo.ts
   - main → account  : +amount
   - account → main  : -amount
   - Prevent negative for:
     - wallet.totalLiveTradeBalance
     - team.teamTotalLiveTradeBalance
     - team[level_X].liveTradeBalance
─────────────────────────────────────────────────────────── */

import SystemStats from "@/models/SystemStats.model";
import { IUser, User as IUserModel } from "@/models/user.model";
import Team, { IUserTeamSummary } from "@/models/UserTeamSummary.model";
import UserWallet from "@/models/UserWallet.model";
import { Types } from "mongoose";

/* ────────── helpers ────────── */
const round2 = (n: number) => +Number(n).toFixed(2);
const clamp0 = (n: number) => (n < 0 ? 0 : n);

const updateTeamLiveTradeInfo = async (
  userId: Types.ObjectId | string,
  amount: number,
  fromId: string
): Promise<void> => {
  try {
    /* ────────── validate amount ────────── */
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return; // invalid or no-op

    /* ────────── load user & upline ────────── */
    const user: IUser | null = await IUserModel.findById(userId);
    if (!user || !user.parents?.length) return;

    /* ────────── load wallet ────────── */
    const wallet = await UserWallet.findOne({ userId });
    if (!wallet) return;

    /* ────────── compute delta ──────────
     * main → account = +amt
     * account → main = -amt
     */
    const delta = fromId === "main" ? amt : -amt;

    /* ────────── update team (up to 10 levels) ────────── */
    for (let level = 0; level < user.parents.length && level < 10; level++) {
      const parentId = user.parents[level];

      const team: IUserTeamSummary | null = await Team.findOne({
        userId: parentId,
      });
      if (!team) continue;

      const parent: IUser | null = await IUserModel.findById(parentId);
      if (!parent || parent.is_block) continue;

      // Ensure numeric defaults
      team.teamTotalLiveTradeBalance = Number(
        team.teamTotalLiveTradeBalance || 0
      );

      /* ────────── total update (round → clamp) ────────── */
      const totalNext = round2(team.teamTotalLiveTradeBalance + delta);
      team.teamTotalLiveTradeBalance = clamp0(totalNext);

      /* ────────── level update (round → clamp) ────────── */
      const levelKey = `level_${level + 1}` as keyof IUserTeamSummary;
      // @ts-ignore dynamic access for level_X
      if (team[levelKey]) {
        // @ts-ignore
        const curLevel = Number(team[levelKey].liveTradeBalance || 0);
        const levelNext = round2(curLevel + delta);
        // @ts-ignore
        team[levelKey].liveTradeBalance = clamp0(levelNext);
      }

      await team.save();
    }

    /* ────────── update wallet.totalLiveTradeBalance (round → clamp) ────────── */
    const curWalletTotal = Number(wallet.totalLiveTradeBalance || 0);
    const walletNext = round2(curWalletTotal + delta);
    wallet.totalLiveTradeBalance = clamp0(walletNext);

    /* ────────── company stats (round → clamp) ────────── */
    const companyWallet = await SystemStats.findOne();
    if (companyWallet) {
      const curTotal = Number(companyWallet.totalLiveTradeBalance || 0);
      const curToday = Number(companyWallet.todayLiveTradeBalance || 0);

      companyWallet.totalLiveTradeBalance = clamp0(round2(curTotal + delta));
      companyWallet.todayLiveTradeBalance = clamp0(round2(curToday + delta));

      await companyWallet.save();
    }

    await wallet.save();
  } catch (err: any) {
    console.error("❌ Error updating team live trade:", err.message);
  }
};

export default updateTeamLiveTradeInfo;
