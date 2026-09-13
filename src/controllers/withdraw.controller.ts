import AgentStatus from "@/models/AgentStatus.model";
import { Notification } from "@/models/Notification.model";
import SystemStats from "@/models/SystemStats.model";
import { User } from "@/models/user.model";
import UserWallet from "@/models/UserWallet.model";
import UserWithdrawSummary from "@/models/UserWithdrawSummary.model";
import Withdraw from "@/models/Withdraw.model";
import WithdrawSetting from "@/models/WithdrawSetting.model";
import { sendEmail } from "@/services/email/emailService";
import { withdrawApprovalTemplate } from "@/services/email/templates/withdrawtemplate";
import { notifyAdmins, notifyUser } from "@/services/notify.service";
import { sendPushToUser } from "@/services/push.service";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import TransactionManager from "@/utils/TransactionManager";
import updateTeamWithdraw from "@/utils/updateTeamWithdraw";

/* ── withdraw settings (client-safe shape) ──────────────────────────────
 * fee/min/max/quick-amounts/daily-limit/networks — এডমিন প্যানেলের
 * "Withdraw Management" পেজ থেকে এডিট হয়, এখানে সরাসরি ডাটাবেস থেকে
 * পড়া হয় — কোনো হার্ডকোড ভ্যালু নেই।
 * ────────────────────────────────────────────────────────────────────── */
const publicSettingsShape = (s: any) => ({
  feePercent: s.feePercent,
  minAmount: s.minAmount,
  maxAmount: s.maxAmount,
  quickAmounts: s.quickAmounts,
  dailyLimitCount: s.dailyLimitCount,
  networks: s.networks,
});

// ===== GET /withdraw/settings (যেকোনো লগইন করা ইউজার) =====
export const getWithdrawSettings: typeHandler = catchAsync(
  async (_req, res) => {
    const settings = await WithdrawSetting.getSingleton();
    res.status(200).json({ success: true, settings: publicSettingsShape(settings) });
  },
);

// ===== GET /admin/withdraw/settings =====
export const getAdminWithdrawSettings: typeHandler = catchAsync(
  async (_req, res) => {
    const settings = await WithdrawSetting.getSingleton();
    res.status(200).json({ success: true, settings });
  },
);

// ===== PUT /admin/withdraw/settings =====
export const updateAdminWithdrawSettings: typeHandler = catchAsync(
  async (req, res, next) => {
    const { feePercent, minAmount, maxAmount, quickAmounts, dailyLimitCount, networks } =
      req.body;

    if (feePercent != null && (Number(feePercent) < 0 || Number(feePercent) > 100)) {
      return next(new ApiError(400, "Fee percent must be between 0 and 100"));
    }
    if (minAmount != null && Number(minAmount) < 0) {
      return next(new ApiError(400, "Minimum amount cannot be negative"));
    }
    if (maxAmount != null && Number(maxAmount) < 0) {
      return next(new ApiError(400, "Maximum amount cannot be negative"));
    }
    if (
      minAmount != null &&
      maxAmount != null &&
      Number(maxAmount) > 0 &&
      Number(maxAmount) < Number(minAmount)
    ) {
      return next(
        new ApiError(400, "Maximum amount cannot be less than minimum amount"),
      );
    }
    if (dailyLimitCount != null && Number(dailyLimitCount) < 1) {
      return next(new ApiError(400, "Daily limit must be at least 1"));
    }
    if (quickAmounts != null && !Array.isArray(quickAmounts)) {
      return next(new ApiError(400, "quickAmounts must be an array of numbers"));
    }
    if (networks != null && (!Array.isArray(networks) || networks.length === 0)) {
      return next(new ApiError(400, "At least one network is required"));
    }

    const settings = await WithdrawSetting.getSingleton();
    if (feePercent != null) settings.feePercent = Number(feePercent);
    if (minAmount != null) settings.minAmount = Number(minAmount);
    if (maxAmount != null) settings.maxAmount = Number(maxAmount);
    if (quickAmounts != null)
      settings.quickAmounts = quickAmounts
        .map((n: any) => Number(n))
        .filter((n: number) => n > 0)
        .sort((a: number, b: number) => a - b);
    if (dailyLimitCount != null) settings.dailyLimitCount = Number(dailyLimitCount);
    if (networks != null)
      settings.networks = networks.map((n: any) => String(n).trim().toUpperCase());
    settings.updatedBy = req.user?._id as any;
    await settings.save();

    res.status(200).json({
      success: true,
      message: "Withdraw settings updated successfully",
      settings,
    });
  },
);

/* ── Create New Withdraw Request ───────────────────────────────── */
export const newWithdrawRequest: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    const { amount, withdrawAddress, network } = req.body;

    if (!amount || !withdrawAddress || !network) {
      return next(new ApiError(400, "All fields are required"));
    }

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    /* ── admin-configurable withdraw settings ────────────────────────── */
    const settings = await WithdrawSetting.getSingleton();
    const numAmountCheck = Number(amount);

    if (!Number.isFinite(numAmountCheck) || numAmountCheck <= 0) {
      return next(new ApiError(400, "Enter a valid amount"));
    }
    if (numAmountCheck < settings.minAmount) {
      return next(
        new ApiError(400, `Minimum withdrawal amount is ${settings.minAmount} USDT`),
      );
    }
    if (settings.maxAmount > 0 && numAmountCheck > settings.maxAmount) {
      return next(
        new ApiError(400, `Maximum withdrawal amount is ${settings.maxAmount} USDT`),
      );
    }
    if (settings.networks.length && !settings.networks.includes(String(network))) {
      return next(
        new ApiError(400, `Unsupported network. Allowed: ${settings.networks.join(", ")}`),
      );
    }

    /* 🔒 Daily limit check: per day max `settings.dailyLimitCount` requests */
    const now = new Date();

    // সার্ভারের লোকাল ডে ধরে নিচ্ছি, চাইলে এখানে টাইমজোন কাস্টমাইজ করতে পারেন
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(), // আজকের তারিখ, 00:00:00
      0,
      0,
      0,
      0,
    );

    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1, // আগামী দিনের 00:00:00
      0,
      0,
      0,
      0,
    );

    const todayWithdrawCount = await Withdraw.countDocuments({
      userId: user._id,
      createdAt: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    if (todayWithdrawCount >= settings.dailyLimitCount) {
      return next(
        new ApiError(
          400,
          `You can only create ${settings.dailyLimitCount} withdraw request(s) per day. Please try again tomorrow.`,
        ),
      );
    }
    /* 🔒 Daily limit check end */

    const admin = await User.findOne({ role: "admin" });
    if (!admin) {
      return next(new ApiError(404, "Admin user not found"));
    }

    const fee = Number(amount) * (settings.feePercent / 100);
    const withdrawFee = Number(fee.toFixed(2));
    const netAmount = Number(amount) - withdrawFee;

    /* ────────── get agent status by user agentId ────────── */
    let agentStatus = await AgentStatus.findOne({
      agentId: user.agentId,
    }).select("toDayDeposits totalDeposits");
    if (!agentStatus) {
      return next(new ApiError(404, "Agent status not found"));
    }

    /* ────────── user withdraw summary ────────── */
    const userWithdrawSummary = await UserWithdrawSummary.findOne({
      userId: userId,
    });
    if (!userWithdrawSummary) {
      return next(new ApiError(404, "User withdraw summary not found"));
    }

    /* ────────── balance checks ──────────
       Loan disbursed amount main balance-এ থাকলেও withdraw করা যাবে না।
       Withdrawable balance = m_balance - remainingLoanAmount.
    ───────────────────────────────────────────────────────────── */
    const numAmount = Number(amount);
    const userBalance = user.m_balance || 0;

    const loanWalletSummary = await UserWallet.findOne({
      userId: user._id,
    }).select("remainingLoanAmount");

    const remainingLoanAmount = Math.max(
      0,
      loanWalletSummary?.remainingLoanAmount || 0,
    );

    const withdrawableBalance = Math.max(0, userBalance - remainingLoanAmount);

    if (userBalance < 0 || withdrawableBalance < numAmount) {
      return next(
        new ApiError(
          400,
          `Insufficient withdrawable balance. Available: ${withdrawableBalance.toFixed(2)}. Loan locked: ${remainingLoanAmount.toFixed(2)}`,
        ),
      );
    }

    /* ────────── company ────────── */
    const company = await SystemStats.findOne();
    if (!company) {
      return next(new ApiError(404, "Company not found"));
    }

    /* ────────── deduct balance ────────── */
    user.m_balance = Math.max(0, user.m_balance - numAmount);

    /* ────────── create withdraw ────────── */
    const withdrawCount = await Withdraw.countDocuments();
    const withdraw = await Withdraw.create({
      userId: userId,
      sl_no: `WD-${withdrawCount + 1}`,
      name: user.name,
      phone: user.phone,
      email: user.email,
      customerId: user.customerId,
      amount: numAmount,
      netAmount: netAmount,
      netWork: network,
      netWorkAddress: withdrawAddress,
      charge: withdrawFee,
      agentNumber: user.agentId,
      status: "pending",
    });

    await user.save();

    /* ────────── transaction log ────────── */
    const txManager = new TransactionManager();
    await txManager.createTransaction({
      userId: user._id as string,
      customerId: user.customerId,
      amount: numAmount,
      transactionType: "cashOut",
      purpose: "Withdraw Request",
      description: `Withdraw request created with amount ${numAmount}`,
    });

    /* ────────── notifications (user/admin) ──────────
     * notifyUser/notifyAdmins নিজে থেকেই DB-তে সেভ করে, socket দিয়ে
     * রিয়েল-টাইম পাঠায়, আর অনলাইনে না থাকলে web push পাঠায় —
     * অনলাইন/অফলাইন বিবেচনা এখানে আলাদা করে লিখতে হচ্ছে না।
     */
    await notifyUser(String(user._id), user.role, {
      title: "Withdraw Request Created",
      category: "withdraw",
      message: `Your withdraw request of ${numAmount} has been created successfully.`,
      url: `/withdraw-history`,
    });

    await notifyAdmins({
      title: "New Withdraw Request",
      category: "withdraw",
      message: `New withdraw request of ${numAmount} from ${user.name}`,
      url: `/withdraws/all-withdraws`,
    });

    /* ────────── company pending reserve ────────── */
    company.withdrawals.pendingAmount += numAmount;
    company.withdrawals.pendingNetAmount += amount;
    company.withdrawals.pendingCount += 1;
    await company.save();

    /* ────────── response ────────── */
    res.status(200).json({
      success: true,
      message: "Withdraw request created successfully",
    });
  },
);

/* ────────── get my withdraws ────────── */
export const geMyWithdraws: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;

  if (!userId) {
    return next(new ApiError(401, "User not authenticated"));
  }

  const user = await User.findById(userId);
  if (!user) {
    return next(new ApiError(404, "User not found"));
  }

  const withdraws = await Withdraw.find({ userId: userId })
    .sort({ createdAt: -1 })
    .populate("userId", "name email phone");

  res.status(200).json({
    success: true,
    withdraws,
  });
});

// get all withdraws for admin
export const getAllWithdrawsForAdmin: typeHandler = catchAsync(
  async (req, res, next) => {
    // find all withdraws
    const withdraws = await Withdraw.find({}).sort({ createdAt: -1 });

    if (!withdraws || withdraws.length === 0) {
      return next(new ApiError(404, "No withdraws found"));
    }

    res.status(200).json({
      success: true,
      withdraws,
    });
  },
);

//get all pending withdraws for admin
export const getAllPendingWithdrawsForAdmin: typeHandler = catchAsync(
  async (req, res, next) => {
    // find all pending withdraws
    const withdraws = await Withdraw.find({ status: "pending" });

    if (!withdraws || withdraws.length === 0) {
      return next(new ApiError(404, "No pending withdraws found"));
    }

    res.status(200).json({
      success: true,
      withdraws,
    });
  },
);

//get withdraw by id
export const getWithdrawById: typeHandler = catchAsync(
  async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
      return next(new ApiError(400, "Withdraw ID is required"));
    }

    const withdraw = await Withdraw.findById(id);

    if (!withdraw) {
      return next(new ApiError(404, "Withdraw not found"));
    }

    res.status(200).json({
      success: true,
      withdraw,
    });
  },
);

/* ────────── approve withdraw request ────────── */
export const approveWithdrawRequest: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    const { id, txnId, agentNumber } = req.body;

    if (!id) {
      return next(new ApiError(400, "Withdraw ID is required"));
    }

    //get admin user
    const admin = await User.findById(userId);
    if (!admin || admin.role !== "admin") {
      return next(
        new ApiError(403, "Only admin can approve withdraw requests"),
      );
    }

    const withdraw = await Withdraw.findById(id);
    if (!withdraw) {
      return next(new ApiError(404, "Withdraw not found"));
    }

    // check if withdraw request is already approved
    if (withdraw.status === "approved") {
      return next(new ApiError(400, "Withdraw request already approved"));
    }

    // find user
    const user = await User.findById(withdraw.userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    //get user withdraw summary
    const withdrawSummary = await UserWithdrawSummary.findOne({
      userId: withdraw.userId,
    });
    if (!withdrawSummary) {
      return next(new ApiError(404, "User withdraw summary not found"));
    }

    // get user wallet
    const userWallet = await UserWallet.findOne({
      userId: withdraw.userId,
    });
    if (!userWallet) {
      return next(new ApiError(404, "User wallet not found"));
    }

    // find company
    const company = await SystemStats.findOne();
    if (!company) {
      return next(new ApiError(404, "Company not found"));
    }

    /* ────────── Get Agent Status By User AgentId ────────── */
    const agentStatus = await AgentStatus.findOne({
      agentId: user.agentId,
    });
    if (!agentStatus) {
      return next(new ApiError(404, "Agent status not found"));
    }

    // update withdraw status to approved
    withdraw.status = "approved";
    withdraw.isApproved = true;
    withdraw.approvedAt = new Date();
    withdraw.txnId = txnId;
    withdraw.agentNumber = agentNumber;
    withdraw.approvedAt = new Date();
    await withdraw.save();

    // update user balance
    user.w_balance = Math.max(0, user.w_balance + withdraw.amount);
    user.d_balance = Math.max(0, user.d_balance - withdraw.amount);
    await user.save();

    // update user withdraw summary
    withdrawSummary.totalWithdraw += withdraw.amount;
    withdrawSummary.lastWithdrawAmount += withdraw.amount;
    withdrawSummary.lastWithdrawDate = new Date();
    await withdrawSummary.save();

    // update user wallet
    userWallet.totalWithdraw += withdraw.amount;
    await userWallet.save();

    // update company withdraw reserve
    company.withdrawals.total += withdraw.amount;
    company.withdrawals.today += withdraw.amount;
    company.withdrawals.pendingAmount -= withdraw.amount;
    company.withdrawals.pendingNetAmount -= withdraw.netAmount;
    company.withdrawals.pendingCount -= 1;
    company.withdrawals.totalCharge += withdraw.charge;
    company.withdrawals.netTotal += withdraw.netAmount;
    await company.save();

    /* ──────────Call update user team withdraw ────────── */
    await updateTeamWithdraw(withdraw.userId, withdraw.amount);

    // update agent status
    agentStatus.totalWithdrawals += withdraw.amount;
    agentStatus.toDayWithdrawals += withdraw.amount;
    await agentStatus.save();

    // send notification to user
    const userNotification = await Notification.create({
      user_id: user._id,
      role: user.role,
      title: "Withdraw Request Approved",
      category: "withdraw",
      message: `Your withdraw request of ${withdraw.amount} has been approved.`,
      url: `/withdraw-history`,
    });

    if (global?.io?.to) {
      // ⚠️ socket/index.ts-এ ইউজার রুমের নাম "u:<id>" — এখানেও একই ফরম্যাট।
      global.io.to(`u:${String(user._id)}`).emit("user-notification", {
        success: true,
        message: "Withdraw request approved successfully",
        notification: userNotification,
      });
    }

    /* ────────── web push (user): withdraw approved ────────── */
    try {
      await sendPushToUser(String(user._id), {
        title: "Withdraw Request Approved",
        body: `Your withdraw request of ${withdraw.amount} USDT has been approved.`,
        url: "/withdraw-history",
        tag: "withdraw-approved",
        renotify: true,
      });
    } catch {}

    /* ────────── send email to user ────────── */
    const html = withdrawApprovalTemplate({
      name: user.name,
      amount: withdraw.amount,
      txId: withdraw._id as string,
      walletAddress: withdraw.netWorkAddress,
    });

    await sendEmail({
      email: user.email,
      subject: "Withdraw Request Approved",
      html: html,
    });

    console.log(
      `Withdraw request approved for user: ${user.name}, Amount: ${withdraw.amount}`,
    );

    res.status(200).json({
      success: true,
      message: "Withdraw request approved successfully",
      withdraw,
    });
  },
);

// reject withdraw request
export const rejectWithdrawRequest: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    const { id, reason } = req.body;

    if (!id) {
      return next(new ApiError(400, "Withdraw ID is required"));
    }

    if (!reason) {
      return next(new ApiError(400, "Reason for rejection is required"));
    }

    //get admin user
    const admin = await User.findById(userId);
    if (!admin || admin.role !== "admin") {
      return next(new ApiError(403, "Only admin can reject withdraw requests"));
    }

    const withdraw = await Withdraw.findById(id);
    if (!withdraw) {
      return next(new ApiError(404, "Withdraw not found"));
    }

    // check if withdraw request is already rejected
    if (withdraw.status === "rejected") {
      return next(new ApiError(400, "Withdraw request already rejected"));
    }

    // find user
    const user = await User.findById(withdraw.userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    withdraw.status = "rejected";
    withdraw.isApproved = false;
    withdraw.isRejected = true;
    withdraw.rejected_reason = reason;
    await withdraw.save();

    // update user balance
    user.m_balance += withdraw.amount;
    await user.save();

    // Create cashIn transaction
    const txManager = new TransactionManager();
    await txManager.createTransaction({
      userId: user._id as string,
      customerId: user.customerId,
      amount: withdraw.amount,
      transactionType: "cashIn",
      purpose: "Withdrawal Refund",
      description: `Withdraw request rejected with amount ${withdraw.amount}`,
    });

    // update company withdraw reserve
    const company = await SystemStats.findOne();
    if (!company) {
      return next(new ApiError(404, "Company not found"));
    }

    company.withdrawals.pendingAmount -= withdraw.amount;
    company.withdrawals.pendingNetAmount -= withdraw.netAmount;
    company.withdrawals.pendingCount -= 1;
    await company.save();

    const userNotification = await Notification.create({
      user_id: user._id,
      role: user.role,
      title: "Withdraw Request Rejected",
      category: "withdraw",
      message: `Your withdraw request of ${withdraw.amount} has been rejected. Reason: ${reason}`,
      url: `/withdraw-history`,
    });

    if (global?.io?.to) {
      // ⚠️ socket/index.ts-এ ইউজার রুমের নাম "u:<id>" — এখানেও একই ফরম্যাট।
      global.io.to(`u:${String(user._id)}`).emit("user-notification", {
        success: true,
        message: "Withdraw request rejected",
        notification: userNotification,
      });
    }

    console.log(
      `Withdraw request rejected for user: ${user.name}, Amount: ${withdraw.amount}, Reason: ${reason}`,
    );

    res.status(200).json({
      success: true,
      message: "Withdraw request rejected successfully",
      withdraw,
    });
  },
);
