import { AdminNotification } from "@/models/AdminNotification.model";
import AgentStatus from "@/models/AgentStatus.model";
import { Deposit } from "@/models/Deposit.model";
import { Notification } from "@/models/Notification.model";
import SystemStats from "@/models/SystemStats.model";
import { User } from "@/models/user.model";
import UserWallet from "@/models/UserWallet.model";
import { createPayment } from "@/services/blockbee.service";
import { sendEmail } from "@/services/email/emailService";
import { depositTemplate } from "@/services/email/templates/depositTemplate";
import { sendPushToAdmins, sendPushToUser } from "@/services/push.service";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import TransactionManager from "@/utils/TransactionManager";
import updateTeamSales from "@/utils/updateTeamSales";
import crypto from "crypto";
import mongoose, { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";

// Extend NodeJS global type to include 'io'
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

// Create Deposit wWith BlockBee
export const createDepositWithBlockBee: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }
    const { chain, network, sourceAddress } = req.body;

    // check if user has any pending deposits
    const pendingDeposit = await Deposit.findOne({
      userId: userId,
      status: "pending",
    });

    let deposit = {};

    if (pendingDeposit) {
      deposit = pendingDeposit;
    } else {
      const rawUuid = uuidv4();
      const orderId = rawUuid.replace(/-/g, "");

      const callbackUrl = `https://gyonex-api-8bd965ca374f.herokuapp.com/api/v1/callback/${orderId}`;
      // console.log(`Callback URL: ${callbackUrl}`);

      const payment = await createPayment({
        myAddress: sourceAddress,
        callback: callbackUrl,
      });

      if (!payment) return next(new ApiError(500, "Failed to create payment"));

      deposit = await Deposit.create({
        userId: userId,
        orderId: orderId,
        name: user.name,
        phone: user.phone,
        email: user.email,
        customerId: user.customerId,
        chain,
        network,
        status: "pending",
        destinationAddress: payment.address_in,
        qrCode: payment.qrCode,
        callbackUrl,
      });
    }

    // console.log("Deposit created:", deposit);

    res.status(201).json({
      success: true,
      message: "Deposit created successfully",
      deposit,
    });
  },
);

/* ──── handle callback from BlockBee ──────────────────────── */
export const handleBlockBeeCallback: typeHandler = catchAsync(
  async (req, res, next) => {
    const depositId = req.params.id;
    const { confirmations, txid_in, value_coin, result, value_forwarded_coin } =
      req.query;

    /* ────────── validate query ────────── */
    if (
      !confirmations ||
      !txid_in ||
      !value_coin ||
      !result ||
      !value_forwarded_coin
    ) {
      return next(new ApiError(400, "Missing required query parameters"));
    }

    /* ────────── load deposit ────────── */
    const deposit = await Deposit.findOne({ orderId: depositId });
    if (!deposit) return next(new ApiError(404, "Deposit not found"));
    if (deposit.isApproved) return res.status(200).send("✅ Already approved");

    /* ────────── approve path ────────── */
    if (result === "sent" && Number(confirmations) >= 1) {
      const amount = Number(value_coin);
      const forwarded = Number(value_forwarded_coin);
      const charge = amount - forwarded;

      /* ────────── mark deposit approved ────────── */
      deposit.status = "approved";
      deposit.amount = amount;
      deposit.isApproved = true;
      deposit.approvedAt = new Date();
      deposit.txId = Array.isArray(txid_in)
        ? (txid_in[0] as string)
        : String(txid_in);
      deposit.confirmations = Number(confirmations);
      deposit.callbackReceivedAt = new Date();
      deposit.charge = charge;
      deposit.receivedAmount = amount - charge;
      await deposit.save();

      /* ────────── load user + wallet + company + agent ────────── */
      const user = await User.findById(deposit.userId);
      if (!user) return next(new ApiError(404, "User not found"));

      const wallet = await UserWallet.findOne({ userId: user._id });
      if (!wallet) return next(new ApiError(404, "Wallet not found"));

      const company = await SystemStats.findOne();
      if (!company) return next(new ApiError(404, "Company stats not found"));

      const agent = await AgentStatus.findOne({ agentId: user.agentId });
      if (!agent) return next(new ApiError(404, "Agent not found"));

      /* ────────── user balances + activation ────────── */
      const activeAmount = user.m_balance + amount;
      user.m_balance += amount;
      user.d_balance = (user.d_balance ?? 0) + amount;
      await user.save();

      /* ────────── wallet + team + company aggregates ────────── */
      wallet.totalDeposit += amount;
      await wallet.save();
      await updateTeamSales(user._id as string, amount);

      company.deposits.total += amount;
      company.deposits.today += amount;
      company.deposits.blockbeeReceivedTotal += forwarded;
      company.deposits.blockbeeReceivedToday += forwarded;
      company.deposits.blockbeeFee += charge;
      company.costs.total += charge;
      company.costs.charge += charge;
      await company.save();

      agent.totalDeposits += amount;
      agent.toDayDeposits += amount;
      await agent.save();

      /* ────────── notifications (user + admin) ────────── */
      const admin = await User.findOne({ role: "admin" });
      const notifyText = `You have successfully deposited ${amount} USDT.`;

      const userNotification = await Notification.create({
        user_id: user._id,
        role: user.role,
        title: "USDT Deposit Successful",
        category: "deposit",
        message: notifyText,
        url: `/deposit-history`,
      });

      const adminNotification =
        admin &&
        (await AdminNotification.create({
          user_id: admin._id,
          role: admin.role,
          title: "New Deposit",
          category: "deposit",
          message: `New deposit of ${amount} from ${user.name}`,
          url: `/deposits/all-deposits`,
        }));

      /* ────────── transaction log ────────── */
      const txManager = new TransactionManager();
      await txManager.createTransaction({
        userId: user._id as string,
        customerId: user.customerId,
        transactionType: "cashIn",
        amount,
        purpose: "Deposit",
        description: notifyText,
      });

      /* ────────── socket emit ────────── */
      const uid = String(user._id);
      if (global?.io?.to) {
        global.io.to(String(user._id)).emit("deposit-update", {
          success: true,
          message: "Deposit confirmed ✅",
          amount,
          txId: txid_in,
          depositId: deposit._id,
        });

        global.io.to(String(uid)).emit("notifications:new", userNotification);
        const unreadCount = await Notification.countDocuments({
          user_id: uid,
          is_read: false,
        });
        global.io
          .to(String(uid))
          .emit("notifications:count", { count: unreadCount });

        global.io.to(String(user._id)).emit("user-notification", {
          success: true,
          message: "Deposit confirmed ✅",
          notification: userNotification,
        });

        if (adminNotification && admin?._id) {
          global.io.emit("admin-notification", {
            success: true,
            message: "New Deposit",
            notification: adminNotification,
          });
        }
      }

      /* ────────── web push (admins): broadcast new deposit ────────── */
      try {
        const adminIds = (await User.find({ role: "admin" }, "_id").lean()).map(
          (a) => String(a._id),
        );
        if (adminIds.length) {
          await sendPushToAdmins(adminIds, {
            title: "New Deposit",
            body: `New deposit of ${amount} from ${user.name}`,
            url: "/deposits/all-deposits",
            tag: "admin-deposit",
            renotify: true,
          });
        }
      } catch {}

      /* ────────── email to user ────────── */
      const html = depositTemplate(user.name, amount, depositId);
      await sendEmail({
        email: user.email,
        subject: "Deposit Confirmation",
        html,
      });

      /* ────────── done ────────── */
      return res.status(200).send("✅ Deposit confirmed and balance updated");
    }

    /* ────────── noop path ────────── */
    res.status(200).json({
      success: true,
      message: "Callback processed successfully",
    });
  },
);

// get my deposits
export const getMyDeposits: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;

  if (!userId) {
    return next(new ApiError(401, "User not authenticated"));
  }

  const deposits = await Deposit.find({ userId: userId }).sort({
    createdAt: -1,
  });
  // Count total deposits for the partner
  const totalDeposits = await Deposit.countDocuments({
    user_id: userId,
  });

  res.status(200).json({
    success: true,
    deposits,
    totalDeposits,
    message: "Deposits retrieved successfully",
  });
});

// test socket connection
export const testSocketConnection: typeHandler = catchAsync(
  async (req, res, next) => {
    if (!global.io) {
      return next(new ApiError(500, "Socket.io not initialized"));
    }

    const userId = req.user?._id;
    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    // get user by ID
    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    const notifyText = `You have successfully deposited 100 USDT.`;

    const userNotification = await Notification.create({
      user_id: user._id,
      role: user.role,
      title: "USDT Deposit Successful",
      category: "deposit",
      message: notifyText,
      url: `/deposit-history`,
    });

    global.io.to(String(user._id)).emit("user-notification", {
      success: true,
      message: "Deposit confirmed ✅",
      notification: userNotification,
    });

    console.log(`Socket connection test successful for user ${userId}`);

    res.status(200).json({
      success: true,
      message: "Socket connection test successful",
    });
  },
);

// get all deposits for admin
export const getAllDepositsForAdmin: typeHandler = catchAsync(
  async (req, res, next) => {
    const deposits = await Deposit.find().sort({ createdAt: -1 });

    if (!deposits || deposits.length === 0) {
      return next(new ApiError(404, "No deposits found"));
    }

    res.status(200).json({
      success: true,
      deposits,
      message: "All deposits retrieved successfully",
    });
  },
);

// get deposit by ID for admin
export const getDepositByIdForAdmin: typeHandler = catchAsync(
  async (req, res, next) => {
    const depositId = req.params.depositId;

    if (!depositId) {
      return next(new ApiError(400, "Deposit ID is required"));
    }

    const deposit = await Deposit.findById(depositId).select("-qrCode ");

    if (!deposit) {
      return next(new ApiError(404, "Deposit not found"));
    }

    res.status(200).json({
      success: true,
      deposit,
      message: "Deposit retrieved successfully",
    });
  },
);

/* ────────── GET /api/v1/deposits ────────── */
export const getAllDeposits: typeHandler = catchAsync(
  async (req, res, next) => {
    try {
      const {
        status,
        page = "1",
        limit = "50",
      } = req.query as {
        status?: string;
        page?: string;
        limit?: string;
      };

      const query: any = {};
      if (status && ["pending", "approved", "rejected"].includes(status)) {
        query.status = status;
      }

      const pageNum = Math.max(parseInt(page as string, 10) || 1, 1);
      const limitNum = Math.min(
        Math.max(parseInt(limit as string, 10) || 50, 1),
        200,
      );
      const skip = (pageNum - 1) * limitNum;

      const [deposits, total] = await Promise.all([
        Deposit.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
        Deposit.countDocuments(query),
      ]);

      res.json({ deposits, total, page: pageNum, limit: limitNum });
    } catch (err: any) {
      res
        .status(500)
        .json({ message: err.message || "Failed to fetch deposits" });
    }
  },
);

/* ────────── GET /api/v1/deposits/:id ────────── */
export const getSingleDeposit: typeHandler = catchAsync(
  async (req, res, next) => {
    try {
      const { id } = req.params;

      // /* ────────── Guard: validate id ────────── */
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "Invalid deposit id" });
      }

      const deposit = await Deposit.findById(id);
      if (!deposit)
        return res.status(404).json({ message: "Deposit not found" });

      res.json({ deposit });
    } catch (err: any) {
      res
        .status(500)
        .json({ message: err.message || "Failed to fetch deposit" });
    }
  },
);

/* ────────── helpers ────────── */
const uuid = () => crypto.randomBytes(16).toString("hex");
const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/* ────────── GET /api/v1/admin/deposits/preview ────────── */
/* query: customerId, amount */
export const adminPreviewManualDeposit = catchAsync(async (req, res, next) => {
  const customerId = String(req.query.customerId || "").trim();
  const amount = Number(req.query.amount);

  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    return next(new ApiError(400, "customerId এবং amount সঠিকভাবে দিন"));
  }

  const user = await User.findOne({ customerId });
  if (!user) return next(new ApiError(404, "User not found"));

  const wallet = await UserWallet.findOne({ userId: user._id });
  if (!wallet) return next(new ApiError(404, "Wallet not found"));

  /* ────────── preview data ────────── */
  const current = {
    m_balance: user.m_balance ?? 0,
    d_balance: user.d_balance ?? 0,
    totalDeposit: wallet.totalDeposit ?? 0,
  };
  const nextVals = {
    m_balance: current.m_balance + amount,
    d_balance: current.d_balance + amount,
    totalDeposit: current.totalDeposit + amount,
  };

  res.json({
    ok: true,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      customerId: user.customerId,
      phone: user.phone,
      is_active: user.is_active,
    },
    amount,
    current,
    next: nextVals,
  });
});

/* ────────── POST /api/v1/admin/deposits/manual ────────── */
/* body: { customerId: string; amount: number; note?: string } */
export const adminCreateManualDeposit = catchAsync(async (req, res, next) => {
  const { customerId, amount, note, isDemo } = req.body as {
    customerId: string;
    amount: number;
    note?: string;
    isDemo: boolean;
  };

  /* ────────── validate ────────── */
  if (!customerId || !Number.isFinite(amount) || amount <= 0 || !isDemo) {
    return next(new ApiError(400, "customerId এবং amount সঠিকভাবে দিন"));
  }

  const user = await User.findOne({ customerId });
  if (!user) return next(new ApiError(404, "User not found"));

  const wallet = await UserWallet.findOne({ userId: user._id });
  if (!wallet) return next(new ApiError(404, "Wallet not found"));

  const company = await SystemStats.findOne();
  if (!company) return next(new ApiError(404, "Company stats not found"));

  const agent = await AgentStatus.findOne({ agentId: user.agentId });
  if (!agent) return next(new ApiError(404, "Agent not found"));

  /* ────────── create deposit doc (approved instantly) ────────── */
  const orderId = uuid();
  const now = new Date();

  const deposit = await Deposit.create({
    userId: user._id as Types.ObjectId,
    orderId,
    name: user.name,
    phone: user.phone,
    email: user.email,
    customerId: user.customerId,
    amount, // full amount
    charge: 0, // manual => no fee
    receivedAmount: amount, // received == amount
    destinationAddress: undefined,
    qrCode: undefined,
    chain: "usdt",
    status: "approved",
    isApproved: true,
    isExpired: false,
    confirmations: 1,
    isManual: true,
    callbackUrl: "manual://no-callback",
    note: note ?? "",
    approvedAt: now,
    callbackReceivedAt: now,
    txId: `MANUAL-${Date.now()}`, // optional trace
    isDemo,
  });

  /* ────────── update user balances ────────── */
  const activeAmount = (user.m_balance ?? 0) + amount;
  user.m_balance = activeAmount;
  user.d_balance = (user.d_balance ?? 0) + amount;
  await user.save();

  /* ────────── wallet & team sales ────────── */
  wallet.totalDeposit = (wallet.totalDeposit ?? 0) + amount;
  await wallet.save();
  await updateTeamSales(user._id as string, amount);

  /* ────────── company aggregates (no blockbee fields) ────────── */
  if (!isDemo) {
    company.deposits.total += amount;
    company.deposits.today += amount;
  }

  await company.save();

  /* ────────── agent stats ────────── */
  agent.totalDeposits += amount;
  agent.toDayDeposits += amount;
  await agent.save();

  /* ────────── notifications (user/admin) ────────── */
  const admin = await User.findOne({ role: "admin" });
  const notifyText = `You have successfully deposited ${amount} USDT.`;

  const userNotification = await Notification.create({
    user_id: user._id,
    role: user.role,
    title: "USDT Deposit Successful",
    category: "deposit",
    message: notifyText,
    url: `/deposit-history`,
  });

  const adminNotification =
    admin &&
    (await AdminNotification.create({
      user_id: admin._id,
      role: admin.role,
      title: "New Deposit",
      category: "deposit",
      message: `New deposit of ${amount} from ${user.name}`,
      url: `/deposits/all-deposits`,
    }));

  /* ────────── transaction log ────────── */
  const txManager = new TransactionManager();
  await txManager.createTransaction({
    userId: user._id as string,
    customerId: user.customerId,
    transactionType: "cashIn",
    amount,
    purpose: "Deposit",
    description: notifyText,
  });

  /* ────────── socket emit ────────── */
  const uid = String(user._id);

  /* ────────── socket emit ────────── */
  if (global?.io?.to) {
    global.io.to(String(user._id)).emit("deposit-update", {
      success: true,
      message: "Deposit confirmed ✅",
      amount,
      txId: deposit.txId,
      depositId: deposit._id,
    });

    global.io.to(String(uid)).emit("notifications:new", userNotification);
    const unreadCount = await Notification.countDocuments({
      user_id: uid,
      is_read: false,
    });
    global.io
      .to(String(uid))
      .emit("notifications:count", { count: unreadCount });

    global.io.to(String(user._id)).emit("user-notification", {
      success: true,
      message: "Deposit confirmed ✅",
      notification: userNotification,
    });

    if (adminNotification && admin?._id) {
      global.io.emit("admin-notification", {
        success: true,
        message: "New Deposit",
        notification: adminNotification,
      });
    }
  }

  /* ────────── web push (user): manual deposit approved ────────── */
  try {
    await sendPushToUser(String(user._id), {
      title: "USDT Deposit Successful",
      body: `You have successfully deposited ${amount} USDT.`,
      url: "/deposit-history",
      tag: "deposit-approved",
      renotify: true,
    });
  } catch {}

  /* ────────── web push (admins): new manual deposit (optional) ────────── */
  try {
    if (admin?._id) {
      await sendPushToAdmins([String(admin._id)], {
        title: "New Deposit",
        body: `New deposit of ${amount} from ${user.name}`,
        url: "/deposits/all-deposits",
        tag: "admin-deposit",
        renotify: true,
      });
    }
  } catch {}

  /* ────────── email to user ────────── */
  const html = depositTemplate(user.name, amount, orderId);
  await sendEmail({
    email: user.email,
    subject: "Deposit Confirmation",
    html,
  });

  /* ────────── response ────────── */
  res.status(201).json({
    ok: true,
    message: "Manual deposit completed",
    deposit,
  });
});
