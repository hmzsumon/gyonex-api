import AgentStatus from "@/models/AgentStatus.model";
import { Deposit } from "@/models/Deposit.model";
import { User } from "@/models/user.model";
import Withdraw from "@/models/Withdraw.model";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { sendTokenWithRefresh } from "@/utils/sendTokenWithRefresh";
import { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";

/* ────────── Agent Login ────────── */
export const agentLogin: typeHandler = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ApiError(400, "Please enter both email and password"));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  /* ────────── check user.role is "agent" or not ────────── */
  if (user.role !== "agent") {
    return next(new ApiError(401, "User is not an agent"));
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  sendTokenWithRefresh(user, 200, res);
});

/* ────────── Get All Agents ────────── */
export const getAllAgents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const agents = await User.find({ role: "agent" }).select(
      "-password -resetPasswordToken -resetPasswordExpire"
    );

    if (!agents || agents.length === 0) {
      return next(new ApiError(404, "No agents found"));
    }

    res.status(200).json({
      success: true,
      data: agents,
    });
  }
);

/* ────────── Create AgentStatus for all agent ────────── */
export const createAgentStatusForAllAgents = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const agents = await User.find({ role: "agent" });

    if (!agents || agents.length === 0) {
      return next(new ApiError(404, "No agents found"));
    }

    const createdStatuses = [];

    for (const agent of agents) {
      const existingStatus = await AgentStatus.findOne({ agentId: agent._id });

      if (!existingStatus) {
        const newStatus = new AgentStatus({
          agentId: agent._id,
          customerId: agent.customerId,
          name: agent.name,
        });
        await newStatus.save();
        createdStatuses.push(newStatus);
      }
    }

    res.status(201).json({
      success: true,
      message: `${createdStatuses.length} AgentStatus records created.`,
      data: createdStatuses,
    });
  }
);

/* ────────── Get my Agent status ────────── */
export const getMyAgentStatus: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const agentStatus = await AgentStatus.findOne({ agentId: userId });
    if (!agentStatus) {
      return next(new ApiError(404, "Agent status not found"));
    }

    res.status(200).json({
      success: true,
      agentStatus,
    });
  }
);

/* ────────── Get all users by agent id────────── */
export const getAllUsersByAgentId: typeHandler = catchAsync(
  async (req, res, next) => {
    const agentId = req.user?._id;

    if (!agentId) {
      return next(new ApiError(400, "Agent ID is required"));
    }

    const users = await User.find({ agentId }).select(
      "-password -resetPasswordToken -resetPasswordExpire"
    );

    if (!users || users.length === 0) {
      return next(new ApiError(404, "No users found"));
    }

    res.status(200).json({
      success: true,
      users,
    });
  }
);

/* ────────── Get all user by agent id and userId────────── */
export const getUserByAgentIdAndUserId: typeHandler = catchAsync(
  async (req, res, next) => {
    const agentId = req.user?._id;
    const { id: userId } = req.params;

    if (!agentId) {
      return next(new ApiError(400, "Agent ID is required"));
    }

    if (!userId) {
      return next(new ApiError(400, "User ID is required"));
    }

    const user = await User.findOne({ agentId, _id: userId }).select(
      "-password -resetPasswordToken -resetPasswordExpire"
    );

    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    res.status(200).json({
      success: true,
      user,
    });
  }
);

/* ────────── Get all user by agent id and all deposits────────── */
export const getAllDepositsForAgent: typeHandler = catchAsync(
  async (req, res, next) => {
    /* ────────── validate agent id ────────── */
    const agentId = req.user?._id;
    if (!agentId) return next(new ApiError(400, "Agent ID is required"));

    /* ────────── pagination params ────────── */
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(Math.max(1, Number(req.query.limit ?? 50)), 200);
    const skip = (page - 1) * limit;

    /* ────────── normalize ids ────────── */
    const agentObjectId = new Types.ObjectId(String(agentId));

    /* ────────── gather user ids for this agent ────────── */
    const userIds = await User.find({ agentId: agentObjectId }).distinct("_id");

    /* ────────── short-circuit when no users ────────── */
    if (userIds.length === 0) {
      return res.status(200).json({
        success: true,
        meta: { page, limit, total: 0 },
        deposits: [],
      });
    }

    /* ────────── build filter ────────── */
    const filter = { userId: { $in: userIds }, status: "approved" as const };

    /* ────────── fetch data + total in parallel ────────── */
    const [deposits, total] = await Promise.all([
      Deposit.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Deposit.countDocuments(filter),
    ]);

    /* ────────── respond ────────── */
    return res.status(200).json({
      success: true,
      meta: { page, limit, total },
      deposits,
    });
  }
);

/* ────────── Get all withdraws by agent id ────────── */

export const getAllWithdrawForAgent: typeHandler = catchAsync(
  async (req, res, next) => {
    /* ────────── validate agent id ────────── */
    const agentId = req.user?._id;
    if (!agentId) return next(new ApiError(400, "Agent ID is required"));

    /* ────────── pagination params ────────── */
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(Math.max(1, Number(req.query.limit ?? 50)), 200);
    const skip = (page - 1) * limit;

    /* ────────── normalize ids ────────── */
    const agentObjectId = new Types.ObjectId(String(agentId));

    /* ────────── gather user ids for this agent ────────── */
    const userIds = await User.find({ agentId: agentObjectId }).distinct("_id");

    /* ────────── short-circuit when no users ────────── */
    if (userIds.length === 0) {
      return res.status(200).json({
        success: true,
        meta: { page, limit, total: 0 },
        withdraws: [],
      });
    }

    /* ────────── build filter (approved only) ────────── */
    const filter = { userId: { $in: userIds }, status: "approved" as const };

    /* ────────── fetch data + total in parallel ────────── */
    const [withdraws, total] = await Promise.all([
      Withdraw.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Withdraw.countDocuments(filter),
    ]);

    /* ────────── respond ────────── */
    return res.status(200).json({
      success: true,
      meta: { page, limit, total },
      withdraws,
    });
  }
);
