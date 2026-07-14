// ✅ Updated with proper type casting for refreshToken jwt.sign

import AgentStatus from "@/models/AgentStatus.model";
import GenerationRewardConfig from "@/models/GenerationReward.model";
import Kyc from "@/models/kyc.model";
import { Notification } from "@/models/Notification.model";
import SystemStats from "@/models/SystemStats.model";
import Transaction from "@/models/Transaction.model";
import { IUser, User } from "@/models/user.model";
import UserAddress from "@/models/UserAddress.model";
import UserDepositSummary from "@/models/UserDepositSummary.model";
import UserGameSummary from "@/models/UserGameSummary.model";
import UserPaymentMethod from "@/models/UserPaymentMethod.model";
import UserRankSummary from "@/models/UserRankSummary.model";
import UserTeamSummary from "@/models/UserTeamSummary.model";
import UserTransferSummary from "@/models/UserTransferSummary.model";
import UserWallet from "@/models/UserWallet.model";
import UserWithdrawSummary from "@/models/UserWithdrawSummary.model";
import { sendEmail } from "@/services/email/emailService";
import { emailVerificationTemplate } from "@/services/email/templates/emailVerificationTemplate";
import registrationSuccessTemplate from "@/services/email/templates/registrationSuccessTemplate";
import { sendSecurityPinTemplate } from "@/services/email/templates/sendSecurityPinTemplate";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { generateUniqueId } from "@/utils/generateCustomerId";
import { sendTokenWithRefresh } from "@/utils/sendTokenWithRefresh";
import TransactionManager from "@/utils/TransactionManager";

import {
  isEmailLike,
  normalizeCustomerId,
  normalizeEmail,
} from "@/utils/validate";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import mongoose, { ProjectionType, Types } from "mongoose";
import { StringValue } from "ms";

const default_referral_code = "UF119454B4B";

/* ── 🔐 Register user ───────────────────────────────── */
export const registerUser: typeHandler = catchAsync(async (req, res, next) => {
  const {
    email: rawEmail,
    password,
    country,
    partnerCode: referralCode,
    name,
    phone,
  } = req.body;

  const WELCOME_BONUS = 3;

  /* ────────── email to lowercase ────────── */
  const email = String(rawEmail || "")
    .trim()
    .toLowerCase();

  // check email already exists
  const existEmail = await User.findOne({ email });
  if (existEmail) {
    return next(new ApiError(400, "Email already exists"));
  }

  if (!email || !password || !country || !name || !phone) {
    return next(new ApiError(400, "Please provide all required fields"));
  }

  /* ────────── get system stats (company) ────────── */
  const company = await SystemStats.findOne();
  if (!company) {
    return next(new ApiError(400, "System is already initialized"));
  }

  const existUser = await User.findOne({ email });
  if (existUser) return next(new ApiError(404, "User already exists"));
  const sponsor = await User.findOne({
    customerId: referralCode ? referralCode : default_referral_code,
  });
  if (!sponsor) return next(new ApiError(404, "Referral Code is invalid"));

  // get sponsor team
  const sponsorTeam = await UserTeamSummary.findOne({
    userId: sponsor._id,
  });
  if (!sponsorTeam) {
    return next(new ApiError(404, "Sponsor team not found"));
  }

  // find the agent of sponsor
  const agent = await User.findById(sponsor.agentId);
  if (!agent) {
    return next(new ApiError(404, "Agent not found for the sponsor"));
  }

  /* ────────── find AgentStatus ────────── */
  const agentStatus = await AgentStatus.findOne({
    agentId: agent._id,
  }).select("totalPlayers toDayPlayers");

  // generate unique customer ID
  const customerId = await generateUniqueId();

  // 6 digit verification code
  const verify_code = Math.floor(100000 + Math.random() * 900000);

  // Create the user
  const user = await User.create({
    name,
    phone,
    email,
    country,
    password,
    customerId,
    text_password: password,
    sponsorId: sponsor._id,
    sponsorName: sponsor.name,
    agentId: agent._id,
    agentName: agent.name,
    parents: [sponsor._id, ...sponsor.parents.slice(0, 4)],
    verify_code,
    // ✅ Welcome bonus balance
    m_balance: WELCOME_BONUS,
  });

  await Promise.all([
    UserWallet.create({ userId: user._id, customerId }),
    UserWithdrawSummary.create({ userId: user._id, customerId }),
    UserDepositSummary.create({ userId: user._id, customerId }),
    UserTransferSummary.create({ userId: user._id, customerId }),
    UserRankSummary.create({ userId: user._id, customerId }),
    UserTeamSummary.create({ userId: user._id, customerId }),
    UserAddress.create({ userId: user._id, customerId }),
    UserGameSummary.create({ userId: user._id, customerId }),
  ]);

  // ✅ Add user to sponsor's team
  sponsorTeam.level_1.users.push(user._id as Types.ObjectId);
  sponsorTeam.level_1.inactiveUsers += 1;
  sponsorTeam.totalTeamMember += 1;
  await sponsorTeam.save();

  let currentLevel = 2;
  for (let parentId of user.parents.slice(1)) {
    const parentTeam = await UserTeamSummary.findOne({ userId: parentId });
    if (parentTeam) {
      let levelProp = "level_" + currentLevel; // generate the property name dynamically
      if (parentTeam[levelProp]) {
        parentTeam[levelProp].users.push(user._id as Types.ObjectId);
        parentTeam[levelProp].inactiveUsers += 1;
        parentTeam.totalTeamMember += 1;
        await parentTeam.save();
      }
      console.log("Parent team updated:", parentTeam.customerId);
    }
    currentLevel++;
  }

  /* ────────── Update agent  ────────── */
  if (agentStatus) {
    agentStatus.totalPlayers += 1;
    agentStatus.toDayPlayers += 1;
    await agentStatus.save();
  }

  /* ────────── Welcome bonus notification ────────── */
  const welcomeBonusMessage = `Welcome bonus ${WELCOME_BONUS} USDT has been added to your account.`;

  const welcomeBonusNotification = await Notification.create({
    user_id: user._id,
    role: user.role,
    title: "Welcome Bonus Received",
    category: "bonus",
    message: welcomeBonusMessage,
    url: `/transactions`,
  });

  /* ────────── Welcome bonus transaction ────────── */
  const txManager = new TransactionManager();

  await txManager.createTransaction({
    userId: user._id as string,
    customerId: user.customerId,
    transactionType: "cashIn",
    amount: WELCOME_BONUS,
    purpose: "Welcome Bonus",
    description: welcomeBonusMessage,
  });

  // ✅ Optional realtime notification emit
  if (global?.io?.to) {
    const uid = String(user._id);

    global.io.to(uid).emit("notifications:new", welcomeBonusNotification);

    const unreadCount = await Notification.countDocuments({
      user_id: user._id,
      is_read: false,
    });

    global.io.to(uid).emit("notifications:count", {
      count: unreadCount,
    });

    global.io.to(uid).emit("user-notification", {
      success: true,
      message: welcomeBonusMessage,
      notification: welcomeBonusNotification,
    });
  }

  const emailContent = emailVerificationTemplate(String(verify_code));
  await sendEmail({
    email: user.email,
    subject: "Email Verification",
    html: emailContent,
  });

  // update system stats
  company.users.total += 1;
  company.users.todayNew += 1;
  await company.save();

  res.status(200).json({
    success: true,
    message: "Verification email sent. Please check your inbox.",
  });
});

// ── verifyEmail handler ───────────────────────────────────────
export const verifyEmail: typeHandler = catchAsync(async (req, res, next) => {
  const { code, email } = req.body;

  if (!code || !email) {
    return next(new ApiError(400, "Verification code and email are required"));
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) return next(new ApiError(404, "User not found"));

  if (user.email_verified) {
    return next(new ApiError(400, "Email is already verified"));
  }

  if (user.verify_code !== String(code).trim()) {
    return next(new ApiError(400, "Invalid verification code"));
  }

  user.email_verified = true;
  user.verify_code = "";
  await user.save();

  const registrationEmailContent = registrationSuccessTemplate({
    name: user.name,
    email: user.email,
    password: user.text_password, // NOTE: avoid sending plaintext in production
  });

  await sendEmail({
    email: user.email,
    subject: "Welcome to Gyonex - Registration Successful",
    html: registrationEmailContent,
  });

  res.status(200).json({
    success: true,
    message: "Email verified successfully",
  });
});

/* ────────── Verify otp ────────── */
export const verifyOtpForPassword: typeHandler = catchAsync(
  async (req, res, next) => {
    const { otp, email } = req.body;

    if (!otp || !email) {
      return next(new ApiError(400, "OTP and email are required"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    if (user.verify_code !== otp) {
      return next(new ApiError(400, "Invalid OTP"));
    }

    user.email_verified = true;
    user.verify_code = ""; // Clear the verification code after successful verification
    await user.save();

    res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  },
);

// 🔐 check email isExist or not
export const checkEmailExist: typeHandler = catchAsync(
  async (req, res, next) => {
    const { email } = req.query;

    if (!email) {
      return next(new ApiError(400, "Email is required"));
    }

    const user = await User.findOne({ email });
    if (user) {
      return res.status(200).json({
        success: true,
        message: "Email already exists",
        exists: true,
      });
    } else {
      return res.status(200).json({
        success: true,
        message: "Email is available",
        exists: false,
      });
    }
  },
);

/* ────────── resend verification email ────────── */
export const resendVerificationEmail: typeHandler = catchAsync(
  async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
      return next(new ApiError(400, "Email is required"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new ApiError(404, "The user with this email does not exist"));
    }

    if (!user.verify_code) {
      user.verify_code = Math.floor(100000 + Math.random() * 900000).toString();
      await user.save();
    }

    const emailContent = emailVerificationTemplate(String(user.verify_code));
    await sendEmail({
      email: user.email,
      subject: "Email Verification - Gyonex",
      html: emailContent,
    });
    res.status(200).json({
      success: true,
      message: "Verification email resent. Please check your inbox.",
    });
  },
);

/* ────────── resend send otp code to  email ────────── */
export const sendOtpToEmail: typeHandler = catchAsync(
  async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
      return next(new ApiError(400, "Email is required"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new ApiError(404, "The user with this email does not exist"));
    }

    if (!user.verify_code) {
      user.verify_code = Math.floor(100000 + Math.random() * 900000).toString();
      await user.save();
    }

    const emailContent = emailVerificationTemplate(String(user.verify_code));
    await sendEmail({
      email: user.email,
      subject: "Email Verification - Gyonex",
      html: emailContent,
    });
    res.status(200).json({
      success: true,
      message: "Verification email resent. Please check your inbox.",
    });
  },
);

/* ────────── Verify otp ────────── */
export const verifyOtp: typeHandler = catchAsync(async (req, res, next) => {
  const { otp, email } = req.body;

  if (!otp || !email) {
    return next(new ApiError(400, "OTP and email are required"));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new ApiError(404, "User not found"));
  }

  if (user.verify_code !== otp) {
    return next(new ApiError(400, "Invalid OTP"));
  }

  user.email_verified = true;
  user.verify_code = ""; // Clear the verification code after successful verification
  await user.save();

  res.status(200).json({
    success: true,
    message: "OTP verified successfully",
  });
});

// 🔐 Login user
export const loginUser: typeHandler = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ApiError(400, "Please enter both email and password"));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  /* ────────── Check user email_verified = true/false ────────── */
  if (!user.email_verified) {
    return next(new ApiError(420, "Please verify your email first"));
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    return next(new ApiError(401, "Invalid email or password"));
  }

  sendTokenWithRefresh(user, 200, res);
});

// 🔐 Load user data
export const loadUser: typeHandler = catchAsync(async (req, res, next) => {
  if (!req.user || !req.user._id) {
    return next(new ApiError(401, "User not authenticated"));
  }
  const user = await User.findById(req.user._id as Types.ObjectId);
  if (!user) return next(new ApiError(404, "User not found"));

  const kyc = await Kyc.findOne({ user: user._id });

  res.status(200).json({
    success: true,
    user,
    kyc,
  });
});

/* ── 🔐 Logout user ───────────────────────────────── */
export const logoutUser: typeHandler = catchAsync(async (_req, res) => {
  res.clearCookie("sw99_token");
  res.clearCookie("sw99_refresh_token", { path: "/" });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

export const refreshAccessToken: typeHandler = catchAsync(
  async (req, res, next) => {
    // const refreshToken = req.cookies.refresh_token;
    const refreshToken = req.cookies.sw99_refresh_token;

    if (!refreshToken) {
      return next(
        new ApiError(401, "Refresh token not found. Please login again."),
      );
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET as Secret,
      ) as JwtPayload;
    } catch (err) {
      return next(new ApiError(403, "Invalid or expired refresh token."));
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    const accessToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET as Secret,
      {
        expiresIn: (process.env.JWT_EXPIRE as StringValue) || "7d", // ✅ fixed
      },
    );

    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("sw99_token", accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      expires: new Date(Date.now() + 15 * 60 * 1000),
      path: "/",
    });

    res.status(200).json({
      success: true,
      access_token: accessToken,
    });
  },
);

// get invite data
export const getInviteData: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;

  if (!userId) {
    return next(new ApiError(401, "User not authenticated"));
  }

  //find team summary
  const teamSummary = await UserTeamSummary.findOne({
    userId,
  }).select("totalTeamMember");
  if (!teamSummary) {
    return next(new ApiError(404, "Team summary not found"));
  }

  // find user wallet
  const userWallet = await UserWallet.findOne({
    userId,
  }).select("totalEarning");
  if (!userWallet) {
    return next(new ApiError(404, "User wallet not found"));
  }
  const data = {
    totalEarning: userWallet.totalEarning,
    totalTeamMember: teamSummary.totalTeamMember,
  };

  console.log("Invite Data:", data);

  res.status(200).json({
    success: true,
    inviteData: data,
    message: "Invite data retrieved successfully",
  });
});

// get my team summary
export const getMyTeamSummary: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    // find team summary
    const teamSummary = await UserTeamSummary.findOne({
      userId,
    });
    if (!teamSummary) {
      return next(new ApiError(404, "Team summary not found"));
    }

    res.status(200).json({
      success: true,
      team: teamSummary,
      message: "Team summary retrieved successfully",
    });
  },
);

// get my team summary
export const getMyTeamMembers: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    // ✅ 1. Load team summary
    const teamSummary = await UserTeamSummary.findOne({ userId });
    if (!teamSummary) {
      return next(new ApiError(404, "Team summary not found"));
    }

    // ✅ 2. Get all members up to level 3 with level information
    const levels = ["level_1", "level_2", "level_3"];
    const teamMemberLevelMap = new Map<string, number>();

    const allMemberIds: string[] = [];
    levels.forEach((lvl, index) => {
      const users = teamSummary[lvl]?.users || [];
      users.forEach((id: any) => {
        allMemberIds.push(String(id));
        teamMemberLevelMap.set(String(id), index + 1);
      });
    });

    // ✅ 3. Fetch member details
    const [members, wallets] = await Promise.all([
      User.find({ _id: { $in: allMemberIds } }).select(
        "name email customerId phone createdAt is_active sponsorName",
      ),
      UserWallet.find({ userId: { $in: allMemberIds } }).select(
        "userId totalDeposit totalWithdraw totalCommission",
      ),
    ]);

    // ✅ 4. Map wallets for fast lookup
    const walletMap = new Map<string, any>();
    wallets.forEach((wallet) => {
      walletMap.set(String(wallet.userId), wallet);
    });

    // ✅ 5. Merge and format response
    const formattedMembers = members.map((member) => {
      const id = String(member._id);
      const wallet = walletMap.get(id) || {};
      return {
        id,
        customerId: member.customerId,
        name: member.name,
        email: member.email,
        phone: member.phone,
        level: teamMemberLevelMap.get(id) || 0,
        status: member.is_active ? "active" : "inactive",
        deposit: wallet.totalDeposit || 0,
        withdrawal: wallet.totalWithdraw || 0,
        commission: wallet.totalCommission || 0,
        joinDate: member.createdAt,
        sponsorId: member.sponsorName || "N/A",
      };
    });

    return res.status(200).json({
      success: true,
      members: formattedMembers,
      message: "Team members retrieved successfully",
    });
  },
);

// get my all transactions
export const getMyTransactions: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const transactions = await Transaction.find({ userId }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      tnxData: transactions,
      message: "Transactions retrieved successfully",
    });
  },
);

// get my asset details
export const getMyAssetDetails: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    //get UserTeam by userId
    const userTeam = await UserTeamSummary.findOne({ userId });
    if (!userTeam) {
      throw new ApiError(404, "User team not found");
    }

    // wallet details
    const userWallet = await UserWallet.findOne({ userId });
    if (!userWallet) {
      throw new ApiError(404, "User wallet not found");
    }

    const userRankSummary = await UserRankSummary.findOne({ userId });
    if (!userRankSummary) {
      throw new ApiError(404, "User rank summary not found");
    }

    const userAssetData = {
      todayTeamCommission: userTeam.todayTeamCommission,
      thisMonthCommission: userTeam.thisMonthCommission,
      totalTeamCommission: userTeam.totalTeamCommission,
      totalEarnings: userWallet.totalEarning,
      todyEarnings: userWallet.todayEarning,
      thisMonthEarnings: userWallet.thisMonthEarning,
    };

    res.status(200).json({
      success: true,
      assetData: userAssetData,
      message: "Asset details retrieved successfully",
    });
  },
);

// rest forgot password
export const resetForgotPassword: typeHandler = catchAsync(
  async (req, res, next) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return next(new ApiError(400, "Email and new password are required"));
    }

    const user = await User.findOne({ email });
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    user.password = newPassword;
    user.text_password = newPassword; // Store the plain text password if needed
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  },
);

// change password
export const changePassword2: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    const { oldPassword, newPassword } = req.body;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    if (!oldPassword || !newPassword) {
      return next(new ApiError(400, "Old and new passwords are required"));
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return next(new ApiError(401, "Old password is incorrect"));
    }

    user.password = newPassword;
    user.text_password = newPassword; // Store the plain text password if needed
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  },
);

// claim generation reward
export const claimGenerationReward: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;

    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const { tireName, rewardAmount, level_id } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    // find generation reward config
    let generationRewardConfig = await GenerationRewardConfig.findOne({
      userId,
    });

    // if not found, create a new one
    if (!generationRewardConfig) {
      generationRewardConfig = await GenerationRewardConfig.create({
        userId,
        customerId: user.customerId,
        tierName: "", // Default tier
        lastRewardAmount: 0, // Default reward amount
        totalRewards: 0,
      });
    }

    // Check if the reward is already claimed
    if (generationRewardConfig.lastRewardAmount === rewardAmount) {
      return next(new ApiError(400, "Reward already claimed"));
    }

    // Update the generation reward config
    generationRewardConfig.tierName = tireName;
    generationRewardConfig.lastRewardAmount = rewardAmount;
    generationRewardConfig.totalRewards += rewardAmount;
    generationRewardConfig.isClaimed = true;
    generationRewardConfig.claimedAt = new Date();
    generationRewardConfig.claimedLevels.push(level_id);
    await generationRewardConfig.save();
    // Update user generation reward levels
    if (!user.generationRewardLevels.includes(level_id)) {
      user.generationRewardLevels.push(level_id);
      user.m_balance += rewardAmount; // Add reward amount to user's m_balance
      user.generationRewardTier = tireName;
      await user.save();
    }

    // create transaction for generation reward
    const txManager = new TransactionManager();
    await txManager.createTransaction({
      userId: user._id as string,
      customerId: user.customerId,
      transactionType: "cashIn",
      amount: rewardAmount,
      purpose: "Generation Reward",
      description: `Claimed generation reward of ${tireName}`,
    });

    res.status(200).json({
      success: true,
      message: "Generation reward claimed successfully",
    });
  },
);

/* ────────── Add User Payment Method ────────── */
export const addUserPaymentMethod: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    const { method, accountNumber, name } = req.body;
    if (!method || !accountNumber) {
      return next(new ApiError(400, "All fields are required"));
    }

    const userPaymentMethod = await UserPaymentMethod.create({
      userId,
      customerId: user.customerId,
      name: name,
      method,
      accountNumber,
    });

    user.is_bind_wallet = true;
    await user.save();

    res.status(201).json({
      success: true,
      data: userPaymentMethod,
    });
  },
);

/* ────────── get user payment methods ────────── */
export const getUserPaymentMethods: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const userPaymentMethods = await UserPaymentMethod.find({ userId });
    res.status(200).json({
      success: true,
      userPaymentMethods,
    });
  },
);

/* ────────── get user balance ────────── */
export const getUserBalance: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const user = await User.findById(userId).select("m_balance");
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    res.status(200).json({
      success: true,
      balance: user.m_balance,
    });
  },
);

/* ────────── Get user by customerId ────────── */
export const getUserByCustomerId: typeHandler = catchAsync(
  async (req, res, next) => {
    const { id } = req.params;
    const user = await User.findOne({ customerId: id });
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    };
    res.status(200).json({
      success: true,
      user: userData,
    });
  },
);

/* ────────── Upsert user Security PIN (set or change) ────────── */
export const upsertUserSecurityPin: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) return next(new ApiError(401, "User not authenticated"));

    const { newPin, oldPin } = req.body || {};

    // 6-digit numeric check
    if (!/^\d{6}$/.test(String(newPin || ""))) {
      return next(
        new ApiError(400, "PIN must be exactly 6 digits (numbers only)"),
      );
    }

    const user = await User.findById(userId);
    if (!user) return next(new ApiError(404, "User not found"));

    const hasExistingPin = !!user.securityPin;

    // when changing, oldPin must match
    if (hasExistingPin) {
      if (!/^\d{6}$/.test(String(oldPin || ""))) {
        return next(
          new ApiError(400, "Current PIN is required and must be 6 digits"),
        );
      }
      if (String(user.securityPin) !== String(oldPin)) {
        return next(new ApiError(400, "Current PIN is incorrect"));
      }
    }

    user.securityPin = String(newPin);
    await user.save();

    res.status(200).json({
      success: true,
      message: hasExistingPin
        ? "Security PIN updated successfully"
        : "Security PIN set successfully",
    });
  },
);

/* ────────── PUT /account/email ────────── */
export const changeEmail: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new ApiError(401, "User not authenticated"));

  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return next(new ApiError(400, "Valid email is required"));
  }

  const exists = await User.findOne({ email: String(email).toLowerCase() });
  if (exists && String(exists._id) !== String(userId)) {
    return next(new ApiError(400, "Email already in use"));
  }

  const user = await User.findById(userId);
  if (!user) return next(new ApiError(404, "User not found"));

  user.email = String(email).toLowerCase();
  user.email_verified = false; // optional: force re-verify
  await user.save();

  // TODO: send verification email if needed

  res.status(200).json({ success: true, message: "Email updated" });
});

/* ────────── PUT /account/email ────────── */
export const changePhone: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new ApiError(401, "User not authenticated"));

  const { phone } = req.body || {};
  // allow + and digits, min length 7
  if (!phone || !/^\+?\d{7,}$/.test(String(phone))) {
    return next(new ApiError(400, "Valid phone is required"));
  }

  const user = await User.findById(userId);
  if (!user) return next(new ApiError(404, "User not found"));

  user.phone = String(phone);
  await user.save();

  // TODO: optionally trigger OTP

  res.status(200).json({ success: true, message: "Phone updated" });
});

/* ── change password (validate old) ───────────────────────── */
export const changePassword = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new ApiError(401, "User not authenticated"));

  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return next(new ApiError(400, "Old and new passwords are required"));
  }

  // password policy (same as frontend)
  const ok =
    typeof newPassword === "string" &&
    newPassword.length >= 8 &&
    newPassword.length <= 15 &&
    /[a-z]/.test(newPassword) &&
    /[A-Z]/.test(newPassword) &&
    /\d/.test(newPassword) &&
    /[^A-Za-z0-9]/.test(newPassword);

  if (!ok) {
    return next(
      new ApiError(
        400,
        "Password must be 8–15 chars and include upper, lower, number & special",
      ),
    );
  }

  const user = await User.findById(userId).select("+password");
  if (!user) return next(new ApiError(404, "User not found"));

  const match = await user.comparePassword(oldPassword);
  if (!match) return next(new ApiError(400, "Current password is incorrect"));

  user.password = newPassword;
  await user.save();

  res
    .status(200)
    .json({ success: true, message: "Password changed successfully" });
});

/* ────────── Get logged in use dashboard data ────────── */
export const getDashboardData: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) return next(new ApiError(401, "User not authenticated"));

    /* ────────── Get user wallet────────── */
    const userWallet = await UserWallet.findOne({ userId });
    if (!userWallet) return next(new ApiError(404, "User wallet not found"));

    res.status(200).json({
      success: true,
      walletData: userWallet,
      message: "Dashboard data retrieved successfully",
    });
  },
);

/* ────────── lookupUser with optional via override ────────── */

export const lookupUser: typeHandler = catchAsync(async (req, res, next) => {
  const raw = String(req.body?.query || "").trim();
  console.log(raw);
  const viaIn = req.body?.via as "email" | "customerId" | undefined;

  if (!raw) return next(new ApiError(400, "Query is required"));

  // manual override first; otherwise auto-detect
  const via: "email" | "customerId" =
    viaIn ?? (isEmailLike(raw) ? "email" : "customerId");

  const filter =
    via === "email"
      ? { email: normalizeEmail(raw) }
      : { customerId: normalizeCustomerId(raw) };
  console.log(filter);
  const user = await User.findOne(filter).select({
    _id: 1,
    name: 1,
    email: 1,
    phone: 1,
    customerId: 1,
  });

  if (!user) return next(new ApiError(404, "User not found"));

  res.status(200).json({ success: true, via, user });
});

/* ────────── types (optional) ────────── */
type TeamUserRow = {
  _id: mongoose.Types.ObjectId | string;
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  deposit: number;
  activeDeposit: number;
  status: "active" | "inactive";
  joinedAt?: string;

  /* wallet derived fields */
  totalDeposit: number;
  totalWithdraw: number;
  totalEarning: number;
  totalAiTrade: number;
  totalAiTradeBalance: number;
  totalLiveTradeBalance: number;
};

/* ────────── get users by team level ────────── */

export const getTeamMembersByLevel: typeHandler = catchAsync(
  async (req, res, next) => {
    /* ────────── auth guard ────────── */
    const userId = req.user?._id;
    if (!userId) return next(new ApiError(401, "User not authenticated"));

    /* ────────── user exists ────────── */
    const user = await User.findById(userId);
    if (!user) return next(new ApiError(404, "User not found"));

    /* ────────── level parse/validate ────────── */
    const level = Number(req.params.level);
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      return next(new ApiError(400, "Invalid level. Allowed: 1-10"));
    }

    console.log("👤 User:", user.name, level);

    /* ────────── pagination/sort parse ────────── */
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
    const sortBy = String(req.query.sortBy ?? "createdAt");
    const sortOrder = String(req.query.sortOrder ?? "desc") === "asc" ? 1 : -1;

    /* ────────── fetch team summary ────────── */
    const summary = await UserTeamSummary.findOne({ userId: user._id }).lean();
    if (!summary) return next(new ApiError(404, "User team summary not found"));

    const levelKey = `level_${level}` as
      | "level_1"
      | "level_2"
      | "level_3"
      | "level_4"
      | "level_5"
      | "level_6"
      | "level_7"
      | "level_8"
      | "level_9"
      | "level_10";

    const userIdObjs: mongoose.Types.ObjectId[] =
      (summary as any)?.[levelKey]?.users ?? [];

    if (!Array.isArray(userIdObjs) || userIdObjs.length === 0) {
      return res.status(200).json({ success: true, users: [] });
    }

    /* ────────── projection for User ────────── */
    const projection: ProjectionType<IUser> = {
      _id: 1,
      customerId: 1,
      name: 1,
      email: 1,
      phone: 1,
      deposit: 1,
      activeDeposit: 1,
      createdAt: 1,
      is_active: 1,
    };

    /* ────────── fetch users (batch) ────────── */
    const usersRaw = await User.find({ _id: { $in: userIdObjs } }, projection)
      .sort({ [sortBy]: sortOrder })
      .lean();

    /* ────────── fetch wallets (single batch) ────────── */
    const wallets = await UserWallet.find(
      { userId: { $in: userIdObjs } },
      {
        userId: 1,
        totalDeposit: 1,
        totalWithdraw: 1,
        totalEarning: 1,
        totalAiTradeProfit: 1,
        totalAiTradeBalance: 1,
        totalLiveTradeBalance: 1,
      },
    ).lean();

    /* ────────── index wallets by userId ────────── */
    const walletByUserId = new Map<
      string,
      {
        totalDeposit?: number;
        totalWithdraw?: number;
        totalEarning?: number;
        totalAiTradeProfit?: number;
        totalAiTradeBalance?: number;
        totalLiveTradeBalance?: number;
      }
    >();
    for (const w of wallets) {
      walletByUserId.set(String(w.userId), w);
    }

    /* ────────── shape response rows ────────── */
    const rows: TeamUserRow[] = usersRaw.map((u: any) => {
      const joinedAt = u.createdAt ?? u.joinedAt ?? null;
      /* ────────── derive status strictly from is_active ────────── */
      const derivedStatus: "active" | "inactive" =
        typeof u.is_active === "boolean"
          ? u.is_active
            ? "active"
            : "inactive"
          : "inactive";

      const w = walletByUserId.get(String(u._id)) ?? {};

      return {
        _id: u._id,
        customerId: u.customerId ?? "-",
        name: u.name ?? "-",
        email: u.email ?? undefined,
        phone: u.phone ?? undefined,
        deposit: typeof u.deposit === "number" ? u.deposit : 0,
        activeDeposit:
          typeof u.activeDeposit === "number" ? u.activeDeposit : 0,
        status: derivedStatus,
        joinedAt: joinedAt ? new Date(joinedAt).toISOString() : undefined,

        /* wallet derived fields */
        totalDeposit: typeof w.totalDeposit === "number" ? w.totalDeposit : 0,
        totalWithdraw:
          typeof w.totalWithdraw === "number" ? w.totalWithdraw : 0,
        totalEarning: typeof w.totalEarning === "number" ? w.totalEarning : 0,
        totalAiTrade:
          typeof w.totalAiTradeProfit === "number" ? w.totalAiTradeProfit : 0,
        totalAiTradeBalance:
          typeof w.totalAiTradeBalance === "number" ? w.totalAiTradeBalance : 0,
        totalLiveTradeBalance:
          typeof w.totalLiveTradeBalance === "number"
            ? w.totalLiveTradeBalance
            : 0,
      };
    });

    /* ────────── server-side slice paginate ────────── */
    const start = (page - 1) * limit;
    const end = start + limit;
    const paged = rows.slice(start, end);

    /* ────────── respond ────────── */
    res.status(200).json({
      success: true,
      users: paged,
      pagination: {
        total: rows.length,
        page,
        limit,
        hasMore: end < rows.length,
      },
    });
  },
);

/* ────────── sendPassCode by email ────────── */
export const sendSecurityCodeByEmail: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) {
      return next(new ApiError(401, "User not authenticated"));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    const passCode = String(Math.floor(Math.random() * 1000000)).padStart(
      6,
      "0",
    );
    user.securityPin = passCode;
    await user.save();
    const emailContent = sendSecurityPinTemplate(String(passCode));

    await sendEmail({
      email: user.email,
      subject: "Security PIN - CGFX",
      html: emailContent,
    });

    return res.status(200).json({ success: true });
  },
);
