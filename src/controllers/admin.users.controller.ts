/* ────────── imports ────────── */
import Transaction, { ITransaction } from "@/models/Transaction.model";
import UserWalletModel from "@/models/UserWallet.model";
import { IUser, User } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { NextFunction, Request, Response } from "express";
import mongoose, { ProjectionType } from "mongoose";

/* ────────── helpers ────────── */
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ────────── allowlists ────────── */
const USER_SORT_ALLOW = new Set([
  "createdAt",
  "updatedAt",
  "name",
  "email",
  "customerId",
  "m_balance",
  "w_balance",
  "d_balance",
  "is_active",
]);

const TX_SORT_ALLOW = new Set([
  "createdAt",
  "updatedAt",
  "amount",
  "transactionType",
  "unique_id",
]);

/* ────────── GET /admin/users ────────── */
export const getAllUsersPaginated = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    /* ────────── parse query ────────── */
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
    const rawSearch = String(req.query.search ?? "").trim();
    const role = req.query.role ? String(req.query.role) : undefined;
    const isActiveParam =
      typeof req.query.is_active === "string" ? req.query.is_active : undefined;

    let sortBy = String(req.query.sortBy ?? "createdAt");
    if (!USER_SORT_ALLOW.has(sortBy)) sortBy = "createdAt";
    const sortOrder = String(req.query.sortOrder ?? "desc") === "asc" ? 1 : -1;

    /* ────────── build filter ────────── */
    const filter: any = {};
    if (rawSearch) {
      const rx = new RegExp(escapeRegex(rawSearch), "i");
      filter.$or = [
        { name: rx },
        { email: rx },
        { phone: rx },
        { customerId: rx },
      ];
    }
    if (role) filter.role = role;
    if (isActiveParam === "true") filter.is_active = true;
    if (isActiveParam === "false") filter.is_active = false;

    /* ────────── projection (no sensitive fields) ────────── */
    const projection: ProjectionType<IUser> = {
      _id: 1,
      name: 1,
      email: 1,
      phone: 1,
      customerId: 1,
      country: 1,
      role: 1,
      rank: 1,
      generationRewardTier: 1,
      vipTier: 1,
      is_active: 1,
      is_block: 1,
      is_withdraw_block: 1,
      email_verified: 1,
      two_factor_enabled: 1,
      kyc_verified: 1,
      kyc_request: 1,
      kyc_step: 1,
      is_active_aiTrade: 1,
      m_balance: 1,
      w_balance: 1,
      d_balance: 1,
      last_m_balance: 1,
      s_bonus: 1,
      sponsorId: 1,
      sponsorName: 1,
      agentId: 1,
      agentName: 1,
      parents: 1,
      generationRewardLevels: 1,
      activeAt: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    /* ────────── count + fetch ────────── */
    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter, projection)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    /* ────────── respond ────────── */
    res.status(200).json({
      success: true,
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
        sortBy,
        sortOrder: sortOrder === 1 ? "asc" : "desc",
        search: rawSearch || undefined,
        role: role || undefined,
        is_active: isActiveParam ?? undefined,
      },
    });
  },
);

/* ────────── GET /admin/users/:id ────────── */
export const getUserByIdWithWallet = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    /* ────────── validate id ────────── */
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return next(new ApiError(400, "Invalid user id"));

    /* ────────── projection for user (exclude sensitive) ────────── */
    const userProjection: ProjectionType<IUser> = {
      _id: 1,
      name: 1,
      email: 1,
      phone: 1,
      customerId: 1,
      country: 1,
      role: 1,
      rank: 1,
      generationRewardTier: 1,
      vipTier: 1,
      m_balance: 1,
      demo_balance: 1,
      bet_volume: 1,
      w_balance: 1,
      d_balance: 1,
      last_m_balance: 1,
      s_bonus: 1,
      email_verified: 1,
      kyc_verified: 1,
      kyc_request: 1,
      kyc_step: 1,
      is_active: 1,
      activeAt: 1,
      is_new: 1,
      is_winner: 1,
      two_factor_enabled: 1,
      is_block: 1,
      is_withdraw_block: 1,
      is_complete_bet_volume: 1,
      is_bind_wallet: 1,
      is_active_aiTrade: 1,
      sponsorId: 1,
      sponsorName: 1,
      agentId: 1,
      agentName: 1,
      parents: 1,
      generationRewardLevels: 1,
      createdAt: 1,
      updatedAt: 1,
      verify_code: 1,
    };

    /* ────────── fetch user ────────── */
    const user = await User.findById(id, userProjection).lean();
    if (!user) return next(new ApiError(404, "User not found"));

    /* ────────── fetch wallet ────────── */
    const wallet = await UserWalletModel.findOne(
      { userId: user._id },
      {
        userId: 1,
        customerId: 1,
        totalReceive: 1,
        totalSend: 1,
        totalDeposit: 1,
        totalWithdraw: 1,
        totalPay: 1,
        totalWine: 1,
        todayWine: 1,
        totalEarning: 1,
        todayEarning: 1,
        thisMonthEarning: 1,
        totalCommission: 1,
        levelEarning: 1,
        totalSponsorBonus: 1,
        generationEarning: 1,
        totalDepositBonus: 1,
        totalGameBonus: 1,
        totalReferralBonus: 1,
        rankEarning: 1,
        totalAiTradeProfit: 1,
        totalAiTradeCommission: 1,
        totalLiveTradeProfit: 1,
        totalLiveTradeCommission: 1,
        totalTransferToTrade: 1,
        totalTransferToWallet: 1,
        totalAiTradeBalance: 1,
        totalLiveTradeBalance: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ).lean();

    /* ────────── respond ────────── */
    res.status(200).json({ success: true, user, wallet: wallet ?? null });
  },
);

/* ────────── GET /admin/users/:id/transactions ────────── */
export const getUserTransactionsPaginated = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    /* ────────── parse path & validate ────────── */
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return next(new ApiError(400, "Invalid user id"));

    /* ────────── parse query ────────── */
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
    const rawSearch = String(req.query.search ?? "").trim();
    const type = req.query.transactionType
      ? String(req.query.transactionType)
      : undefined;

    let sortBy = String(req.query.sortBy ?? "createdAt");
    if (!TX_SORT_ALLOW.has(sortBy)) sortBy = "createdAt";
    const sortOrder = String(req.query.sortOrder ?? "desc") === "asc" ? 1 : -1;

    const isCashInParam =
      typeof req.query.isCashIn === "string" ? req.query.isCashIn : undefined;
    const isCashOutParam =
      typeof req.query.isCashOut === "string" ? req.query.isCashOut : undefined;

    /* ────────── build filter ────────── */
    const filter: any = { userId: new mongoose.Types.ObjectId(id) };
    if (rawSearch) {
      const rx = new RegExp(escapeRegex(rawSearch), "i");
      filter.$or = [{ unique_id: rx }, { purpose: rx }, { description: rx }];
    }
    if (type) filter.transactionType = type;
    if (isCashInParam === "true") filter.isCashIn = true;
    if (isCashInParam === "false") filter.isCashIn = false;
    if (isCashOutParam === "true") filter.isCashOut = true;
    if (isCashOutParam === "false") filter.isCashOut = false;

    /* ────────── projection ────────── */
    const projection: ProjectionType<ITransaction> = {
      _id: 1,
      userId: 1,
      customerId: 1,
      unique_id: 1,
      amount: 1,
      transactionType: 1,
      purpose: 1,
      description: 1,
      isCashIn: 1,
      isCashOut: 1,
      previous_m_balance: 1,
      current_m_balance: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    /* ────────── count + fetch ────────── */
    const [total, txs] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter, projection)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    /* ────────── respond ────────── */
    res.status(200).json({
      success: true,
      transactions: txs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
        sortBy,
        sortOrder: sortOrder === 1 ? "asc" : "desc",
        search: rawSearch || undefined,
        transactionType: type || undefined,
        isCashIn: isCashInParam ?? undefined,
        isCashOut: isCashOutParam ?? undefined,
      },
    });
  },
);

/* ────────── Get all users and update addNewMember = 0 ────────── */

export const getAllUsersAndUpdateAddNewMember = catchAsync(async (req, res) => {
  const users = await User.find();
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    user.addNewMember = 0;
    await user.save();
  }
  res.json({ success: true });
});
