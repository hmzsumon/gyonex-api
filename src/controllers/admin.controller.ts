import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { NextFunction, Request, Response } from "express";

import SystemStats from "@/models/SystemStats.model";
import TireProfitRate from "@/models/TireProfitRate.model";
import { User, UserRole } from "@/models/user.model";
import UserAddress from "@/models/UserAddress.model";
import UserDepositSummary from "@/models/UserDepositSummary.model";
import UserGameSummary from "@/models/UserGameSummary.model";
import UserRankSummary from "@/models/UserRankSummary.model";
import UserTeamSummary from "@/models/UserTeamSummary.model";
import UserTransferSummary from "@/models/UserTransferSummary.model";
import UserWalletModel from "@/models/UserWallet.model";
import UserWithdrawSummary from "@/models/UserWithdrawSummary.model";
import { typeHandler } from "@/types/express";
import { agents } from "@/utils/agents";
import { generateUniqueId } from "@/utils/generateCustomerId";

import AgentStatus from "@/models/AgentStatus.model";
import AiAccount from "@/models/AiAccount.model";
import AiPlan from "@/models/AiPlan.model";
import PaymentMethod from "@/models/PaymentMethod.model";
import VipTierLog from "@/models/VipTierLog.model";
import { AI_PLAN_SEEDS } from "@/utils/aiPlans";
import distributeGenerationBonus from "@/utils/distributeGenarationBonus";
import { generateAccountNumber } from "@/utils/generateAccountNumber";
import { sendTokenWithRefresh } from "@/utils/sendTokenWithRefresh";

export const initialSetup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const systemState = await SystemStats.findOne();
    if (systemState) {
      return next(new ApiError(400, "System is already initialized"));
    }

    // 🔹 1. Create System Stats
    const systemStats = await SystemStats.create({
      companyName: "Upbit Trade",
      shortName: "Upbit Trade",
      email: "upbittrade17@gmail.com",
      phone: "1234567890",
      website: "https://www.spainwin99.com",
      address: "123 Main St, City, Country",
      city: "City",
      state: "State",
      zip: "12345",
      country: "Country",
      about: "Welcome to CGFX, your ultimate gaming platform.",
    });

    // 🔹 2. Seed AI Plans
    await AiPlan.insertMany(AI_PLAN_SEEDS);

    // 🔹 3. Create Admin User
    const adminUser = await User.create({
      name: "Admin User",
      email: "upbitadmin@gmail.com",
      phone: "1234567890",
      role: UserRole.Admin,
      password: "@SMUPBIT@5050",
      text_password: "@SMUPBIT@5050",
      customerId: await generateUniqueId(),
      country: "Country",
      is_active: true,
      email_verified: true,
      kyc_verified: true,
      is_active_aiTrade: true,
      is_new: false,
      activeAt: new Date(),
      m_balance: 20000,
    });

    // 🔹 4. Create Admin Summaries / Wallet
    await Promise.all([
      UserWalletModel.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserWithdrawSummary.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserDepositSummary.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserTransferSummary.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserRankSummary.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserTeamSummary.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserAddress.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      UserGameSummary.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
      }),
      VipTierLog.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
        vipTier: "VIP0",
      }),
    ]);

    // 🔹 5. Create One AI Account For Admin In Every Plan
    const allPlans = await AiPlan.find({ isActive: true }).sort({
      sortOrder: 1,
    });

    let totalAdminAiBalance = 0;

    for (const plan of allPlans) {
      const accountNumber = await generateAccountNumber();

      await AiAccount.create({
        userId: adminUser._id,
        customerId: adminUser.customerId,
        accountNumber,
        plan: plan.key,
        balance: plan.amount,
        equity: plan.amount,
        role: adminUser.role,
        planPrice: plan.amount,
        status: "active",
        mode: "ai",
        is_active: true,
      });

      totalAdminAiBalance += plan.amount;
    }

    // 🔹 6. Update Admin Wallet After Default AI Accounts
    await UserWalletModel.updateOne(
      { userId: adminUser._id },
      {
        $inc: {
          totalAiTradeBalance: totalAdminAiBalance,
        },
      },
    );

    // 🔹 7. Update Company Stats After Default AI Accounts
    systemStats.totalAiTradeBalance += totalAdminAiBalance;
    systemStats.todayAiTradeBalance += totalAdminAiBalance;
    systemStats.users.total += 1;
    systemStats.users.todayNew += 1;
    systemStats.users.activeTotal += 1;
    systemStats.users.activeToday += 1;
    systemStats.email = "upbittrade17@gmail.com";
    await systemStats.save();

    // 🔹 8. Seed Agents
    for (const agent of agents) {
      const agentUser = await User.create({
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        role: UserRole.Agent,
        password: agent.password,
        text_password: agent.password,
        customerId: await generateUniqueId(),
        is_active: true,
        email_verified: true,
        kyc_verified: true,
      });

      await AgentStatus.create({
        agentId: agentUser._id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        customerId: agentUser.customerId,
      });
    }

    // 🔹 9. Seed Users under Agents
    for (const agent of agents) {
      const agentUser = await User.findOne({ email: agent.email });
      if (!agentUser) {
        throw new ApiError(404, `Agent with email ${agent.email} not found`);
      }

      const user = await User.create({
        name: agent.user.name,
        email: agent.user.email,
        phone: agent.user.phone,
        role: UserRole.User,
        password: agent.user.password,
        text_password: agent.user.password,
        customerId: await generateUniqueId(),
        country: "Bangladesh",
        is_active: true,
        email_verified: true,
        kyc_verified: true,
        agentId: agentUser._id,
        agentName: agentUser.name,
      });

      const customerId = user.customerId;

      await Promise.all([
        UserWalletModel.create({ userId: user._id, customerId }),
        UserWithdrawSummary.create({ userId: user._id, customerId }),
        UserDepositSummary.create({ userId: user._id, customerId }),
        UserTransferSummary.create({ userId: user._id, customerId }),
        UserRankSummary.create({ userId: user._id, customerId }),
        UserTeamSummary.create({ userId: user._id, customerId }),
        UserAddress.create({ userId: user._id, customerId }),
        UserGameSummary.create({ userId: user._id, customerId }),
        VipTierLog.create({
          userId: user._id,
          customerId,
          vipTier: "VIP0",
        }),
      ]);
    }

    // 🔹 10. Create TireProfitRate
    await TireProfitRate.create({
      VIP1: 0.02,
      VIP2: 0.025,
      VIP3: 0.028,
      VIP4: 0.032,
      VIP5: 0.036,
      VIP6: 0.05,
    });

    // ✅ Final response
    res.status(201).json({
      success: true,
      message:
        "System initialized with admin, agents, users and AI plans successfully.",
    });
  },
);
// admin login
export const adminLogin: typeHandler = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ApiError(400, "Please enter both email and password"));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  // Check if the user is verified
  if (!user.email_verified) {
    return next(new ApiError(402, "Email not verified"));
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  sendTokenWithRefresh(user, 200, res);
});

// check utility function to check if the system is initialized
export const checkUtilityFunction: typeHandler = catchAsync(
  async (req, res, next) => {
    const { customerId, amount } = req.body;
    if (!customerId || !amount) {
      return next(new ApiError(400, "User ID and amount are required"));
    }

    const user = await User.findOne({ customerId });
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    await distributeGenerationBonus(user._id as string, amount);

    res.status(200).json({
      success: true,
      message: "Successfully checked system initialization",
    });
  },
);

// update all users task report
export const updateAllUsersTaskReport: typeHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    res.status(200).json({
      success: true,
      message: "All users task reports updated successfully",
    });
  },
);

// get admin dashboard summary
export const getAdminDashboardSummary: typeHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const company = await SystemStats.findOne();
    if (!company) {
      return next(new ApiError(404, "System stats not found"));
    }

    const dashboardData = {
      totalDeposits: company.deposits.total || 0,
      todayDeposits: company.deposits.today || 0,
      totalBlockBeeDepDeposits: company.deposits.blockbeeReceivedTotal || 0,
      todayBlockBeeDepDeposits: company.deposits.blockbeeReceivedToday || 0,
      totalDepositFee: company.deposits.blockbeeFee || 0,
      totalWithdraw: company.withdrawals.total || 0,
      todayWithdraw: company.withdrawals.today || 0,
      totalNetWithdraw: company.withdrawals.netTotal || 0,
      totalWithdrawFee: company.withdrawals.totalCharge || 0,
      totalUsers: company.users.total || 0,
      todayNewUsers: company.users.todayNew || 0,
      totalActiveUsers: company.users.activeTotal || 0,
      todayActiveUsers: company.users.activeToday || 0,

      totalLiveTradeBalance: company.totalLiveTradeBalance || 0,
      todayLiveTradeBalance: company.todayLiveTradeBalance || 0,

      todayAiTradeBalance: company.todayAiTradeBalance || 0,
      totalAiTradeBalance: company.totalAiTradeBalance || 0,

      totalAiTradeCommission: company.totalAiTradeCommission || 0,
      todayAiTradeCommission: company.todayAiTradeCommission || 0,

      totalAiTradeProfit: company.totalAiTradeProfit || 0,
      todayAiTradeProfit: company.todayAiTradeProfit || 0,
    };

    res.status(200).json({
      success: true,
      message: "Admin dashboard summary retrieved successfully",
      dashboardData,
    });
  },
);

// get all users for a
export const getAllUsers: typeHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const users = await User.find({
      role: "user",
    }).sort({ createdAt: -1 });

    if (!users || users.length === 0) {
      return next(new ApiError(404, "No users found"));
    }

    res.status(200).json({
      success: true,
      users,
      message: "All users retrieved successfully",
    });
  },
);

// get user by id
export const getUserById: typeHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: userId } = req.params;
    // console.log("User ID:", userId);

    if (!userId) {
      return next(new ApiError(400, "User ID is required"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    // find wallet by user ID
    const userWallet = await UserWalletModel.findOne({
      userId: user._id,
    });

    if (!userWallet) {
      return next(new ApiError(404, "User wallet not found"));
    }

    res.status(200).json({
      success: true,
      user,
      wallet: userWallet,

      message: "User retrieved successfully",
    });
  },
);

// reset daily tasks for all users
export const resetDailyTasks: typeHandler = catchAsync(
  async (req, res, next) => {
    // Step 1: Find all users who completed task today
    const users = await User.find({ is_task_completed: true });

    if (!users.length) {
      return next(new ApiError(404, "No users found with completed tasks"));
    }

    res.status(200).json({
      success: true,
      message: `${users.length} users' task status reset successfully.`,
      count: users.length,
    });
  },
);

/* ────────── Create Payment Method ────────── */
export const createPaymentMethod: typeHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { accountNumber, methodName, methodType } = req.body;

    if (!accountNumber || !methodName || !methodType) {
      return next(new ApiError(400, "Please provide all required fields"));
    }

    const paymentMethod = await PaymentMethod.create({
      accountNumber,
      methodName,
      methodType,
    });

    res.status(201).json({
      success: true,
      message: "Payment method created successfully",
      paymentMethod,
    });
  },
);

/* ────────── agentId -> users: email randomize + oldEmail save + user.is_active=false
   and AiAccount: status=onactive + is_active=false ────────── */
export const getAllUsersByAgentIdAndChangeEmail: typeHandler = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { agentId } = req.body;

    if (!agentId) return next(new ApiError(400, "Agent ID is required"));

    const users = await User.find({ agentId }).select("_id email is_active");
    if (!users || users.length === 0) {
      return next(new ApiError(404, "No users found"));
    }

    const insertOptions = ["03", "05", "09"];

    const isValidEmail = (email: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));

    const mutateEmail = (email: string) => {
      const [local, domain] = email.split("@");
      const token =
        insertOptions[Math.floor(Math.random() * insertOptions.length)];
      const pos = Math.floor(Math.random() * (local.length + 1)); // 0..len
      const newLocal = local.slice(0, pos) + token + local.slice(pos);
      return `${newLocal}@${domain}`;
    };

    const bulkOps: any[] = [];
    let updatedEmailUsers = 0;
    let deactivatedUsers = 0;
    let skippedEmailUsers = 0;

    for (const user of users) {
      const currentEmail = user.email;

      // ✅ user is_active সবসময় false হবে
      const updateDoc: any = { $set: { is_active: false } };
      deactivatedUsers++;

      // ✅ email valid হলে: email randomize + oldEmail set
      if (currentEmail && isValidEmail(currentEmail)) {
        let newEmail = "";
        let ok = false;

        for (let attempt = 0; attempt < 12; attempt++) {
          newEmail = mutateEmail(currentEmail);

          const exists = await User.exists({
            email: newEmail,
            _id: { $ne: user._id },
          });

          if (!exists) {
            ok = true;
            break;
          }
        }

        if (ok) {
          updateDoc.$set.email = newEmail;
          updateDoc.$set.oldEmail = currentEmail;
          updatedEmailUsers++;
        } else {
          skippedEmailUsers++;
        }
      } else {
        skippedEmailUsers++;
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: user._id },
          update: updateDoc,
        },
      });
    }

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps, { ordered: false });
    }

    // ✅ AiAccount update (এই agentId এর সব userId ধরে)
    const userIds = users.map((u) => u._id);

    const aiResult = await AiAccount.updateMany(
      { userId: { $in: userIds } },
      {
        $set: {
          status: "inactive", // ✅ আপনার চাহিদামতো
          is_active: false,
        },
      },
    );

    const aiAccountsMatched =
      (aiResult as any).matchedCount ?? (aiResult as any).n ?? 0;
    const aiAccountsUpdated =
      (aiResult as any).modifiedCount ?? (aiResult as any).nModified ?? 0;

    res.status(200).json({
      success: true,
      message:
        "All users deactivated (is_active=false), valid emails randomized (oldEmail saved), and AiAccount updated (status=onactive, is_active=false).",
      totalUsers: users.length,
      usersDeactivated: deactivatedUsers,
      usersEmailUpdated: updatedEmailUsers,
      usersEmailSkipped: skippedEmailUsers,
      aiAccountsMatched,
      aiAccountsUpdated,
    });
  },
);

/* ──────────────────────────────────────────────────────────────────────────
   AI Plan Management (Admin) — list/create/update/delete
   On create: an active AiAccount for this plan is auto-created for the
   admin who created it (admin-only, not for regular users).
────────────────────────────────────────────────────────────────────────── */

// ── Get All AI Plans (active + inactive) ─────────────────────────────────
export const getAllAiPlansAdmin: typeHandler = catchAsync(async (_req, res) => {
  const items = await AiPlan.find().sort({ sortOrder: 1, amount: 1 });

  res.status(200).json({ success: true, items });
});

// ── Create AI Plan (+ auto-create an active account for the admin) ───────
export const createAiPlan: typeHandler = catchAsync(async (req, res, next) => {
  const { key, title, subtitle, amount, rows, sortOrder, isActive } =
    req.body as {
      key: string;
      title: string;
      subtitle: string;
      amount: number;
      rows?: { label: string; value: string }[];
      sortOrder?: number;
      isActive?: boolean;
    };

  if (!key || !title || !subtitle || amount === undefined) {
    return next(
      new ApiError(400, "key, title, subtitle and amount are required"),
    );
  }

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return next(new ApiError(400, "Invalid amount"));
  }

  const normalizedKey = String(key).trim().toLowerCase();

  const existing = await AiPlan.findOne({ key: normalizedKey });
  if (existing) {
    return next(new ApiError(409, "A plan with this key already exists"));
  }

  const plan = await AiPlan.create({
    key: normalizedKey,
    title,
    subtitle,
    amount: amt,
    rows: rows ?? [],
    sortOrder: sortOrder ?? 0,
    isActive: isActive ?? true,
  });

  // ✅ Auto-activate one account for the admin who created this plan.
  // Admin-only — never applies to regular users.
  let adminAccount = null as any;
  const admin = req.user!;

  if (admin.role === "admin" && plan.isActive) {
    const accountNumber = await generateAccountNumber();

    adminAccount = await AiAccount.create({
      userId: admin._id,
      customerId: admin.customerId,
      accountNumber,
      plan: plan.key,
      balance: plan.amount,
      equity: plan.amount,
      role: "admin",
      planPrice: plan.amount,
      status: "active",
      mode: "ai",
      is_active: true,
    });

    await Promise.all([
      UserWalletModel.updateOne(
        { userId: admin._id },
        { $inc: { totalAiTradeBalance: plan.amount } },
      ),
      SystemStats.updateOne(
        {},
        {
          $inc: {
            totalAiTradeBalance: plan.amount,
            todayAiTradeBalance: plan.amount,
          },
        },
      ),
    ]);
  }

  res.status(201).json({
    success: true,
    message: adminAccount
      ? "AI plan created and an admin account was auto-activated for it."
      : "AI plan created.",
    plan,
    adminAccount,
  });
});

// ── Update AI Plan (price/name/subtitle/rows/order/active state) ─────────
export const updateAiPlan: typeHandler = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  if (!id) return next(new ApiError(400, "Plan id is required"));

  const plan = await AiPlan.findById(id);
  if (!plan) return next(new ApiError(404, "AI plan not found"));

  const { title, subtitle, amount, rows, sortOrder, isActive } = req.body as {
    title?: string;
    subtitle?: string;
    amount?: number;
    rows?: { label: string; value: string }[];
    sortOrder?: number;
    isActive?: boolean;
  };

  // 🔒 `key` is intentionally not editable — existing accounts/positions
  // reference plans by key, renaming it would orphan them.

  if (title !== undefined) plan.title = title;
  if (subtitle !== undefined) plan.subtitle = subtitle;
  if (rows !== undefined) plan.rows = rows;
  if (sortOrder !== undefined) plan.sortOrder = sortOrder;
  if (isActive !== undefined) plan.isActive = isActive;

  if (amount !== undefined) {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return next(new ApiError(400, "Invalid amount"));
    }
    plan.amount = amt;
  }

  await plan.save();

  res.status(200).json({ success: true, message: "AI plan updated.", plan });
});

// ── Delete AI Plan ─────────────────────────────────────────────────────
export const deleteAiPlan: typeHandler = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  if (!id) return next(new ApiError(400, "Plan id is required"));

  const plan = await AiPlan.findById(id);
  if (!plan) return next(new ApiError(404, "AI plan not found"));

  const linkedAccounts = await AiAccount.countDocuments({ plan: plan.key });
  if (linkedAccounts > 0) {
    return next(
      new ApiError(
        400,
        `This plan has ${linkedAccounts} account(s) linked to it and cannot be deleted. Deactivate it instead (set isActive to false).`,
      ),
    );
  }

  await plan.deleteOne();

  res.status(200).json({ success: true, message: "AI plan deleted." });
});
