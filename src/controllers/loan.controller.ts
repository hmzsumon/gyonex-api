import mongoose from "mongoose";

import { AdminNotification } from "@/models/AdminNotification.model";
import { AdminLog } from "@/models/index";
import { Loan } from "@/models/Loan.model";
import LoanSetting from "@/models/LoanSetting.model";
import { Notification } from "@/models/Notification.model";
import { User } from "@/models/user.model";
import UserWallet from "@/models/UserWallet.model";

import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import TransactionManager from "@/utils/TransactionManager";

/* ─────────────────────────────────────────────────────────────────────────
   Global socket type
   deposit.controller এর মত global.io safe ভাবে use করা হবে।
───────────────────────────────────────────────────────────────────────── */
declare global {
  // eslint-disable-next-line no-var
  var io:
    | {
        to: (room: string) => {
          emit: (event: string, data: any) => void;
        };
        emit: (event: string, data: any) => void;
      }
    | undefined;
}

/* ─────────────────────────────────────────────────────────────────────────
   Auth helper
   Project auth middleware req.user set করে।
───────────────────────────────────────────────────────────────────────── */
function getAuthUserId(req: any): mongoose.Types.ObjectId | string {
  const userId = req.user?._id || req.authUser?.userId;

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  return userId as mongoose.Types.ObjectId | string;
}

/* ─────────────────────────────────────────────────────────────────────────
   ObjectId helper
   Mongoose document _id অনেক সময় TypeScript unknown ধরে।
───────────────────────────────────────────────────────────────────────── */
function asObjectId(id: unknown): mongoose.Types.ObjectId {
  return id as mongoose.Types.ObjectId;
}

/* ─────────────────────────────────────────────────────────────────────────
   Money helper
───────────────────────────────────────────────────────────────────────── */
function toMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ─────────────────────────────────────────────────────────────────────────
   Socket room helper
   আপনার socket/index.ts এ user room হচ্ছে u:${userId}
   deposit.controller এ String(userId) room use করা আছে।
   তাই দুই room-এই emit করা হবে।
───────────────────────────────────────────────────────────────────────── */
function getUserSocketRooms(
  userId: mongoose.Types.ObjectId | string,
): string[] {
  const uid = String(userId);
  return [uid, `u:${uid}`];
}

/* ─────────────────────────────────────────────────────────────────────────
   User socket emit helper
   User notification realtime পাঠাবে।
───────────────────────────────────────────────────────────────────────── */
async function emitUserLoanNotification({
  userId,
  notification,
  message,
  event = "loan-update",
  extra = {},
}: {
  userId: mongoose.Types.ObjectId | string;
  notification: any;
  message: string;
  event?: string;
  extra?: Record<string, unknown>;
}) {
  if (!global?.io?.to) return;

  const unreadCount = await Notification.countDocuments({
    user_id: userId,
    is_read: false,
  });

  for (const room of getUserSocketRooms(userId)) {
    global.io.to(room).emit("notifications:new", notification);

    global.io.to(room).emit("notifications:count", {
      count: unreadCount,
    });

    global.io.to(room).emit("user-notification", {
      success: true,
      message,
      notification,
      ...extra,
    });

    global.io.to(room).emit(event, {
      success: true,
      message,
      notification,
      ...extra,
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Admin socket emit helper
   deposit.controller এর মত admin notification broadcast করা হবে।
───────────────────────────────────────────────────────────────────────── */
async function emitAdminLoanNotification({
  notification,
  message,
  event = "loan-admin-update",
  extra = {},
}: {
  notification: any;
  message: string;
  event?: string;
  extra?: Record<string, unknown>;
}) {
  if (!global?.io?.emit) return;

  const unreadCount = await AdminNotification.countDocuments({
    is_read: false,
  });

  global.io.emit("admin-notification", {
    success: true,
    message,
    notification,
    ...extra,
  });

  global.io.emit("admin-notifications:count", {
    count: unreadCount,
  });

  global.io.emit(event, {
    success: true,
    message,
    notification,
    ...extra,
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   Create user notification + socket emit
   Notification model এ user_id required, তাই userId নয় user_id use করা হয়েছে।
───────────────────────────────────────────────────────────────────────── */
async function createLoanUserNotification({
  userId,
  role,
  title,
  message,
  category = "other",
  url = "/loans",
  event,
  extra,
}: {
  userId: mongoose.Types.ObjectId | string;
  role?: string;
  title: string;
  message: string;
  category?:
    | "deposit"
    | "withdraw"
    | "transfer"
    | "admin"
    | "other"
    | "profit"
    | "lottery"
    | "announcement"
    | "payment"
    | "bonus"
    | "package"
    | "kyc"
    | "spin_prize"
    | "refund"
    | "vip_tier";
  url?: string;
  event?: string;
  extra?: Record<string, unknown>;
}) {
  const notification = await Notification.create({
    user_id: userId,
    role,
    title,
    category,
    message,
    url,
  });

  await emitUserLoanNotification({
    userId,
    notification,
    message: title,
    event,
    extra,
  });

  return notification;
}

/* ─────────────────────────────────────────────────────────────────────────
   Create admin notification + socket emit
   AdminNotification model এ user_id নেই, তাই schema অনুযায়ী create করা হয়েছে।
───────────────────────────────────────────────────────────────────────── */
async function createLoanAdminNotification({
  title,
  message,
  category = "admin",
  url = "/loans",
  event,
  extra,
}: {
  title: string;
  message: string;
  category?: string;
  url?: string;
  event?: string;
  extra?: Record<string, unknown>;
}) {
  const notification = await AdminNotification.create({
    title,
    category,
    message,
    url,
  });

  await emitAdminLoanNotification({
    notification,
    message: title,
    event,
    extra,
  });

  return notification;
}

/* ─────────────────────────────────────────────────────────────────────────
   USER: Loan packages
   GET /loans/packages
───────────────────────────────────────────────────────────────────────── */
export const getLoanPackages: typeHandler = catchAsync(async (_req, res) => {
  res.json({
    success: true,
    data: {
      eligibility: {
        kycRequired: true,
        note: "KYC verification is required before applying for a loan.",
      },
      types: {
        trading: {
          label: "Trading Loan",
          rate: 0.06,
          defaultDays: 50,
          maxDays: 50,
          minAmount: 50,
          icon: "📈",
          desc: "Automated trading capital",
        },
        business: {
          label: "Business Loan",
          rate: 0.06,
          defaultDays: 120,
          maxDays: 120,
          minAmount: 500,
          icon: "💼",
          desc: "Business growth and expansion",
        },
        house: {
          label: "Home Loan",
          rate: 0.06,
          defaultDays: 90,
          maxDays: 90,
          minAmount: 1000,
          icon: "🏠",
          desc: "Home purchase or renovation",
        },
        land: {
          label: "Land Loan",
          rate: 0.06,
          defaultDays: 90,
          maxDays: 180,
          minAmount: 1000,
          icon: "🌿",
          desc: "Land purchase or development",
        },
        study: {
          label: "Student Loan",
          rate: 0.06,
          defaultDays: 90,
          maxDays: 90,
          minAmount: 200,
          icon: "📚",
          desc: "Education and tuition fees",
        },
        emergency: {
          label: "Emergency",
          rate: 0.06,
          defaultDays: 14,
          maxDays: 30,
          minAmount: 50,
          icon: "🚨",
          desc: "Urgent financial needs",
        },
      },
      requirements: [
        "KYC approved",
        "Loan amount",
        "Repayment period",
        "Admin review required",
      ],
    },
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   USER: My loans
   GET /loans/my
───────────────────────────────────────────────────────────────────────── */
export const getMyLoans: typeHandler = catchAsync(async (req, res) => {
  const userId = getAuthUserId(req);

  const {
    status,
    page = "1",
    limit = "10",
  } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { userId };
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 10);
  const skip = (pageNum - 1) * limitNum;

  const [loans, total] = await Promise.all([
    Loan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
    Loan.countDocuments(filter),
  ]);

  const all = await Loan.find({ userId });

  const totalBorrowed = all
    .filter((l) => l.status !== "rejected")
    .reduce((s, l) => s + toMoney(l.approvedAmount || l.requestedAmount), 0);

  const totalRepaid = all.reduce((s, l) => s + toMoney(l.totalPaid), 0);
  const activeLoans = all.filter((l) => l.status === "active").length;
  const pendingLoans = all.filter((l) => l.status === "pending").length;

  res.json({
    success: true,
    data: {
      loans,
      total,
      page: pageNum,
      limit: limitNum,
      summary: {
        totalBorrowed,
        totalRepaid,
        activeLoans,
        pendingLoans,
      },
    },
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   USER: Loan countdown
   GET /loans/my/countdown
───────────────────────────────────────────────────────────────────────── */
export const getMyLoanCountdown: typeHandler = catchAsync(async (req, res) => {
  const userId = getAuthUserId(req);
  const activeLoans = await Loan.find({ userId, status: "active" });

  const data = activeLoans.map((loan) => {
    const now = Date.now();
    const due = loan.dueDate ? new Date(loan.dueDate).getTime() : 0;
    const msLeft = Math.max(0, due - now);

    const daysLeft = Math.floor(msLeft / 86400000);
    const hoursLeft = Math.floor((msLeft % 86400000) / 3600000);
    const minsLeft = Math.floor((msLeft % 3600000) / 60000);
    const secsLeft = Math.floor((msLeft % 60000) / 1000);

    const totalDays = loan.repaymentPeriodDays || 1;
    const elapsed = Math.max(0, totalDays - daysLeft);
    const timeProgress = Math.min(100, (elapsed / totalDays) * 100);

    const repayProgress = loan.totalRepayable
      ? (loan.totalPaid / loan.totalRepayable) * 100
      : 0;

    const isOverdue = due > 0 && due < now;

    return {
      loanId: loan._id,
      loanType: loan.loanType,
      status: loan.status,
      requestedAmount: loan.requestedAmount,
      approvedAmount: loan.approvedAmount,
      totalRepayable: loan.totalRepayable,
      totalPaid: loan.totalPaid,
      remainingAmount: Math.max(
        0,
        toMoney(loan.totalRepayable) - toMoney(loan.totalPaid),
      ),
      disbursedAt: loan.disbursedAt,
      dueDate: loan.dueDate,
      repaymentPeriodDays: loan.repaymentPeriodDays,
      daysLeft,
      hoursLeft,
      minsLeft,
      secsLeft,
      timeLeft: `${daysLeft}d ${hoursLeft}h ${minsLeft}m`,
      totalDays,
      elapsedDays: elapsed,
      timeProgress,
      repayProgress,
      isOverdue,
      urgency: isOverdue
        ? "overdue"
        : daysLeft <= 3
          ? "critical"
          : daysLeft <= 7
            ? "warning"
            : "normal",
    };
  });

  res.json({ success: true, data });
});

/* ─────────────────────────────────────────────────────────────────────────
   USER: Apply for loan
   POST /loans/apply
───────────────────────────────────────────────────────────────────────── */
export const applyForLoan: typeHandler = catchAsync(async (req, res) => {
  const userId = getAuthUserId(req);
  const { loanType, requestedAmount, repaymentPeriodDays } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const userObjectId = asObjectId(user._id);

  /* ────────── KYC required ────────── */
  const isKycVerified =
    Boolean((user as any).kyc_verified) ||
    (user as any).kycStatus === "verified" ||
    Boolean((user as any).isKycVerified);

  if (!isKycVerified) {
    throw new ApiError(
      403,
      "Please verify your KYC before applying for a loan.",
    );
  }

  /* ────────── Duplicate pending/active loan block ────────── */
  const existingLoan = await Loan.findOne({
    userId: userObjectId,
    status: { $in: ["pending", "active"] },
  });

  if (existingLoan) {
    throw new ApiError(
      400,
      "You already have a pending or active loan. Please repay it first.",
    );
  }

  /* ────────── Basic validation ────────── */
  const amount = Number(requestedAmount);
  const days = Number(repaymentPeriodDays);

  if (!loanType) {
    throw new ApiError(400, "Loan type is required");
  }

  if (!Number.isFinite(amount) || amount < 50) {
    throw new ApiError(400, "Minimum loan amount is $50");
  }

  if (!Number.isFinite(days) || days < 7) {
    throw new ApiError(400, "Repayment period must be at least 7 days");
  }

  const interestRate = 0.06;
  const totalInterest = amount * interestRate * (days / 30);
  const totalRepayable = amount + totalInterest;

  const loan = await Loan.create({
    userId: userObjectId,
    loanType,
    requestedAmount: amount,
    purpose: "KYC verified loan application",
    repaymentPeriodDays: days,
    interestRate,
    totalRepayable,
    monthlyInstallment: totalRepayable / (days / 30),
    applicantName: user.name || "KYC Verified User",
    applicantEmail: user.email || "",
    nidNumber: "KYC_VERIFIED",
    status: "pending",
  });

  /* ────────── User notification + socket ────────── */
  await createLoanUserNotification({
    userId: userObjectId,
    role: user.role,
    title: "Loan Application Received",
    message: `Your ${loanType} loan application of $${amount} has been submitted and is under review.`,
    category: "other",
    url: "/loans",
    event: "loan-update",
    extra: {
      loanId: loan._id,
      status: "pending",
      amount,
    },
  });

  /* ────────── Admin notification + socket ────────── */
  await createLoanAdminNotification({
    title: "New Loan Application",
    message: `${user.name || user.email} applied for a ${loanType} loan of $${amount}. Review required.`,
    category: "admin",
    url: "/loans",
    event: "loan-admin-update",
    extra: {
      loanId: loan._id,
      status: "pending",
      amount,
      userId: userObjectId,
    },
  });

  await AdminLog.create({
    adminId: userObjectId,
    action: "loan_application",
    targetId: asObjectId(loan._id),
    targetType: "Loan",
    details: {
      amount,
      type: loanType,
      userId: userObjectId,
    },
  });

  res.status(201).json({
    success: true,
    message: "Loan application submitted successfully. Status: Under Review.",
    data: loan,
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   Loan repayment settings (admin-editable fee %)
   GET  /loans/repayment-settings           (any logged-in user, read-only)
   GET  /loans/admin/repayment-settings     (admin)
   PUT  /loans/admin/repayment-settings     (admin)
───────────────────────────────────────────────────────────────────────── */
export const getLoanRepaymentSettings: typeHandler = catchAsync(
  async (_req, res) => {
    const settings = await LoanSetting.getSingleton();
    res.status(200).json({
      success: true,
      settings: { repaymentFeePercent: 0 },
    });
  },
);

export const getAdminLoanRepaymentSettings: typeHandler = catchAsync(
  async (_req, res) => {
    const settings = await LoanSetting.getSingleton();
    res.status(200).json({ success: true, settings: { repaymentFeePercent: 0 } });
  },
);

export const updateAdminLoanRepaymentSettings: typeHandler = catchAsync(
  async (req, res) => {
    const { repaymentFeePercent } = req.body;

    if (
      repaymentFeePercent == null ||
      Number(repaymentFeePercent) !== 0
    ) {
      throw new ApiError(400, "Additional loan repayment fees are disabled");
    }

    const settings = await LoanSetting.getSingleton();
    settings.repaymentFeePercent = Number(repaymentFeePercent);
    settings.updatedBy = req.user?._id as any;
    await settings.save();

    res.status(200).json({
      success: true,
      message: "Loan repayment fee updated successfully",
      settings,
    });
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   USER: Repay loan
   POST /loans/:loanId/repay

   ইউজার $X রিপে করতে চাইলে, তার main balance থেকে $X + (fee%) কাটা হয়,
   কিন্তু লোনের totalPaid-এ শুধু $X-ই যোগ হয় (ফি লোনের দেনা কমায় না —
   এটা প্ল্যাটফর্মের আলাদা সার্ভিস চার্জ, অ্যাডমিন প্যানেল থেকে % কন্ট্রোল হয়)।
───────────────────────────────────────────────────────────────────────── */
export const repayLoan: typeHandler = catchAsync(async (req, res) => {
  const userId = getAuthUserId(req);

  const loan = await Loan.findOne({
    _id: req.params.loanId,
    userId,
    status: "active",
  });

  if (!loan) throw new ApiError(404, "Active loan not found");

  const payAmount = Number(req.body.amount);
  const remaining = Math.max(
    0,
    toMoney(loan.totalRepayable) - toMoney(loan.totalPaid),
  );

  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw new ApiError(400, "Please enter a valid repayment amount");
  }

  if (payAmount > remaining) {
    throw new ApiError(400, `Maximum repayment is $${remaining.toFixed(2)}`);
  }

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const userObjectId = asObjectId(user._id);

  /* ────────── admin-configurable repayment fee ────────── */
  // No additional repayment charge, including for previously saved fee settings.
  const feePercent = 0;
  const repaymentFee = Number(((payAmount * feePercent) / 100).toFixed(2));
  const totalCharge = Number((payAmount + repaymentFee).toFixed(2));

  if (toMoney(user.m_balance) < totalCharge) {
    throw new ApiError(
      400,
      `Insufficient main balance. You need $${totalCharge.toFixed(2)} (repayment $${payAmount.toFixed(2)} + ${feePercent}% fee $${repaymentFee.toFixed(2)}).`,
    );
  }

  /* ────────── Repayment + fee, both from main balance ────────── */
  user.last_m_balance = toMoney(user.m_balance);
  user.m_balance = Math.max(0, toMoney(user.m_balance) - totalCharge);
  await user.save();

  await UserWallet.findOneAndUpdate(
    { userId: userObjectId },
    {
      $setOnInsert: {
        userId: userObjectId,
        customerId: user.customerId || String(userObjectId),
      },
      $inc: {
        totalLoanPay: payAmount,
        remainingLoanAmount: -payAmount,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await UserWallet.findOneAndUpdate(
    { userId: userObjectId, remainingLoanAmount: { $lt: 0 } },
    { $set: { remainingLoanAmount: 0 } },
  );

  // ফি লোনের দেনা কমায় না — শুধু payAmount-ই totalPaid-এ যোগ হয়
  loan.totalPaid = toMoney(loan.totalPaid) + payAmount;

  const txManager = new TransactionManager();
  const tx = await txManager.createTransaction({
    userId: userObjectId,
    customerId: user.customerId,
    amount: totalCharge,
    transactionType: "cashOut",
    purpose: "Transfer",
    description:
      repaymentFee > 0
        ? `Loan repayment of $${payAmount.toFixed(2)} for ${loan.loanType} loan (+ ${feePercent}% fee $${repaymentFee.toFixed(2)})`
        : `Loan repayment for ${loan.loanType} loan`,
  });

  loan.repaymentHistory.push({
    amount: payAmount,
    paidAt: new Date(),
    transactionId: asObjectId(tx._id),
    note:
      repaymentFee > 0
        ? `Loan repayment from main balance (+ $${repaymentFee.toFixed(2)} fee)`
        : "Loan repayment from main balance",
  });

  const isCompleted = loan.totalPaid >= toMoney(loan.totalRepayable);

  if (isCompleted) {
    loan.status = "completed";

    await UserWallet.findOneAndUpdate(
      { userId: userObjectId },
      { $set: { remainingLoanAmount: 0 } },
    );
  }

  await loan.save();

  /* ────────── User notification + socket ────────── */
  await createLoanUserNotification({
    userId: userObjectId,
    role: user.role,
    title: isCompleted ? "Loan Fully Repaid" : "Loan Repayment Successful",
    message: isCompleted
      ? `Congratulations! Your ${loan.loanType} loan has been fully repaid.`
      : `Your repayment of $${payAmount} for ${loan.loanType} loan was successful.`,
    category: "other",
    url: "/loans",
    event: "loan-update",
    extra: {
      loanId: loan._id,
      status: loan.status,
      amount: payAmount,
      remainingAmount: Math.max(
        0,
        toMoney(loan.totalRepayable) - toMoney(loan.totalPaid),
      ),
    },
  });

  /* ────────── Admin notification + socket ────────── */
  await createLoanAdminNotification({
    title: isCompleted ? "Loan Fully Repaid" : "Loan Repayment Received",
    message: isCompleted
      ? `${user.name || user.email} fully repaid the ${loan.loanType} loan.`
      : `${user.name || user.email} repaid $${payAmount} for ${loan.loanType} loan.`,
    category: "admin",
    url: "/loans",
    event: "loan-admin-update",
    extra: {
      loanId: loan._id,
      status: loan.status,
      amount: payAmount,
      userId: userObjectId,
    },
  });

  res.json({
    success: true,
    message:
      repaymentFee > 0
        ? `$${payAmount.toFixed(2)} repayment successful ($${totalCharge.toFixed(2)} charged incl. ${feePercent}% fee)`
        : `$${payAmount.toFixed(2)} repayment successful`,
    data: loan,
    payment: {
      amount: payAmount,
      feePercent,
      fee: repaymentFee,
      totalCharged: totalCharge,
      balance: user.m_balance,
    },
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: All loans
   GET /loans/admin/all
───────────────────────────────────────────────────────────────────────── */
export const getAllLoansForAdmin: typeHandler = catchAsync(async (req, res) => {
  const {
    status,
    page = "1",
    limit = "20",
  } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const skip = (pageNum - 1) * limitNum;

  const [loans, total] = await Promise.all([
    Loan.find(filter)
      .populate(
        "userId",
        "name fullName email phone kyc_verified kycStatus customerId role",
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Loan.countDocuments(filter),
  ]);

  const [pending, active, completed, rejected, totalCount, pendingLoans] =
    await Promise.all([
      Loan.countDocuments({ status: "pending" }),
      Loan.countDocuments({ status: "active" }),
      Loan.countDocuments({ status: "completed" }),
      Loan.countDocuments({ status: "rejected" }),
      Loan.countDocuments(),
      Loan.find({ status: "pending" }),
    ]);

  const stats = {
    pending,
    active,
    completed,
    rejected,
    total: totalCount,
    totalAmountPending: pendingLoans.reduce(
      (s, l) => s + toMoney(l.requestedAmount),
      0,
    ),
  };

  res.json({
    success: true,
    data: {
      loans,
      total,
      page: pageNum,
      limit: limitNum,
      stats,
    },
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Approve loan
   PATCH /loans/admin/:loanId/approve
───────────────────────────────────────────────────────────────────────── */
export const approveLoan: typeHandler = catchAsync(async (req, res) => {
  const adminId = getAuthUserId(req);

  const loan = await Loan.findOne({
    _id: req.params.loanId,
    status: "pending",
  });

  if (!loan) throw new ApiError(404, "Pending loan not found");

  const approvedAmount = req.body.approvedAmount
    ? Number(req.body.approvedAmount)
    : toMoney(loan.requestedAmount);

  if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
    throw new ApiError(400, "Please enter a valid approved amount");
  }

  const rate = 0.06;
  const totalRepayable =
    approvedAmount * (1 + rate * (loan.repaymentPeriodDays / 30));

  const user = await User.findById(loan.userId);
  if (!user) throw new ApiError(404, "User not found");

  const userObjectId = asObjectId(user._id);
  const adminObjectId = asObjectId(adminId);

  /* ────────── Credit loan to user main balance ────────── */
  const previousBalance = toMoney(user.m_balance);
  user.last_m_balance = previousBalance;
  user.m_balance = previousBalance + approvedAmount;
  await user.save();

  /* ────────── Wallet loan summary update ────────── */
  const userWallet = await UserWallet.findOneAndUpdate(
    { userId: userObjectId },
    {
      $setOnInsert: {
        userId: userObjectId,
        customerId: user.customerId || String(userObjectId),
      },
      $inc: {
        totalLoanAmount: approvedAmount,
        remainingLoanAmount: approvedAmount,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  /* ────────── Transaction log ────────── */
  const txManager = new TransactionManager();
  await txManager.createTransaction({
    userId: userObjectId,
    customerId: user.customerId,
    amount: approvedAmount,
    transactionType: "cashIn",
    purpose: "Admin Deposit",
    description: `Loan approved and disbursed for ${loan.loanType}`,
  });

  const updatedLoan = await Loan.findByIdAndUpdate(
    loan._id,
    {
      status: "active",
      approvedAmount,
      disbursedAmount: approvedAmount,
      totalRepayable,
      monthlyInstallment: totalRepayable / (loan.repaymentPeriodDays / 30),
      approvedBy: adminObjectId,
      approvedAt: new Date(),
      disbursedAt: new Date(),
      dueDate: new Date(Date.now() + loan.repaymentPeriodDays * 86400000),
      adminNote: req.body.adminNote || "",
      walletId: userWallet?._id,
    },
    { new: true },
  );

  /* ────────── User notification + socket ────────── */
  await createLoanUserNotification({
    userId: userObjectId,
    role: user.role,
    title: "Loan Approved & Disbursed",
    message: `Your ${loan.loanType} loan of $${approvedAmount} has been approved and credited to your main balance.`,
    category: "other",
    url: "/loans",
    event: "loan-update",
    extra: {
      loanId: loan._id,
      status: "active",
      amount: approvedAmount,
      totalRepayable,
      m_balance: user.m_balance,
    },
  });

  /* ────────── Admin notification + socket ────────── */
  await createLoanAdminNotification({
    title: "Loan Approved",
    message: `${user.name || user.email} loan approved and $${approvedAmount} disbursed.`,
    category: "admin",
    url: "/loans",
    event: "loan-admin-update",
    extra: {
      loanId: loan._id,
      status: "active",
      amount: approvedAmount,
      userId: userObjectId,
    },
  });

  await AdminLog.create({
    adminId: adminObjectId,
    action: "loan_approved",
    targetId: asObjectId(loan._id),
    targetType: "Loan",
    details: {
      approvedAmount,
      adminNote: req.body.adminNote || "",
      userId: userObjectId,
    },
  });

  res.json({
    success: true,
    message: `Loan approved and $${approvedAmount} added to user main balance`,
    data: updatedLoan,
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Reject loan
   PATCH /loans/admin/:loanId/reject
───────────────────────────────────────────────────────────────────────── */
export const rejectLoan: typeHandler = catchAsync(async (req, res) => {
  const adminId = getAuthUserId(req);

  const loan = await Loan.findOneAndUpdate(
    { _id: req.params.loanId, status: "pending" },
    {
      status: "rejected",
      adminNote: req.body.reason || "",
      rejectedAt: new Date(),
    },
    { new: true },
  );

  if (!loan) throw new ApiError(404, "Pending loan not found");

  const user = await User.findById(loan.userId).select(
    "_id name email role customerId",
  );

  if (user) {
    const userObjectId = asObjectId(user._id);

    /* ────────── User notification + socket ────────── */
    await createLoanUserNotification({
      userId: userObjectId,
      role: user.role,
      title: "Loan Application Rejected",
      message: `Your ${loan.loanType} loan application was rejected. Reason: ${
        req.body.reason || "Not specified"
      }`,
      category: "other",
      url: "/loans",
      event: "loan-update",
      extra: {
        loanId: loan._id,
        status: "rejected",
        reason: req.body.reason || "",
      },
    });

    /* ────────── Admin notification + socket ────────── */
    await createLoanAdminNotification({
      title: "Loan Rejected",
      message: `${user.name || user.email} loan request was rejected.`,
      category: "admin",
      url: "/loans",
      event: "loan-admin-update",
      extra: {
        loanId: loan._id,
        status: "rejected",
        userId: userObjectId,
      },
    });
  }

  await AdminLog.create({
    adminId: asObjectId(adminId),
    action: "loan_rejected",
    targetId: asObjectId(loan._id),
    targetType: "Loan",
    details: {
      reason: req.body.reason || "",
      userId: loan.userId,
    },
  });

  res.json({
    success: true,
    message: "Loan rejected successfully",
    data: loan,
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Run daily defaults
   POST /loans/admin/run-defaults
───────────────────────────────────────────────────────────────────────── */
export const runLoanDefaults: typeHandler = catchAsync(async (_req, res) => {
  const now = new Date();

  const overdue = await Loan.find({
    status: "active",
    dueDate: { $lt: now },
  });

  let defaulted = 0;

  for (const loan of overdue) {
    const updatedLoan = await Loan.findByIdAndUpdate(
      loan._id,
      { status: "defaulted" },
      { new: true },
    );

    if (!updatedLoan) continue;

    const user = await User.findById(loan.userId).select("_id name email role");

    if (user) {
      const userObjectId = asObjectId(user._id);

      await createLoanUserNotification({
        userId: userObjectId,
        role: user.role,
        title: "Loan Defaulted",
        message: `Your ${loan.loanType} loan of $${loan.requestedAmount} has been marked as defaulted due to missed repayment deadline.`,
        category: "other",
        url: "/loans",
        event: "loan-update",
        extra: {
          loanId: loan._id,
          status: "defaulted",
        },
      });

      await createLoanAdminNotification({
        title: "Loan Defaulted",
        message: `${user.name || user.email} ${loan.loanType} loan has been marked as defaulted.`,
        category: "admin",
        url: "/loans",
        event: "loan-admin-update",
        extra: {
          loanId: loan._id,
          status: "defaulted",
          userId: userObjectId,
        },
      });
    }

    defaulted++;
  }

  res.json({
    success: true,
    data: {
      checked: overdue.length,
      defaulted,
    },
  });
});
