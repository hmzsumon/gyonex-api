import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import mongoose, { Document, Schema } from "mongoose";
import validator from "validator";

// Enum definitions
export enum UserRole {
  User = "user",
  Admin = "admin",
  Owner = "owner",
  Manager = "manager",
  Employee = "employee",
  SuperAdmin = "super_admin",
  Agent = "agent",
}

export enum UserRank {
  User = "User",
  Bronze = "bronze",
  Silver = "silver",
  Gold = "gold",
  Platinum = "platinum",
  Diamond = "diamond",
  Emerald = "emerald",
  Grandmaster = "grandmaster",
}

export enum UserVipTier {
  VIP0 = "VIP0",
  VIP1 = "VIP1",
  VIP2 = "VIP2",
  VIP3 = "VIP3",
  VIP4 = "VIP4",
  VIP5 = "VIP5",
  VIP6 = "VIP6",
}

// User interface
export interface IUser extends Document {
  name: string;
  email: string;
  oldEmail: string;
  phone: string;
  password: string;
  securityPin: string;
  text_password: string;
  tnx_password: string;
  customerId: string;
  country: string;
  role: UserRole;
  generationRewardTier?: string;
  rank: UserRank;
  vipTier: UserVipTier;
  m_balance: number;
  demo_balance: number; // Optional field for demo balance
  bet_volume: number; // Optional field for betting amount
  w_balance: number; // Wallet balance
  d_balance: number; // Optional field for daily balance
  last_m_balance: number;
  t_balance: number;
  a_balance: number;
  e_balance: number;
  s_bonus: number;

  addNewMember: number;
  betting_volume: number;
  current_investment: number;
  email_verified: boolean;
  verify_code: string;
  kyc_verified: boolean;
  kyc_request: boolean;
  kyc_step: number;
  is_active: boolean;
  activeAt: Date | null;
  is_new: boolean;
  is_winner: boolean;
  is_task_completed: boolean; // Optional field for task completion status
  is_package_active: boolean;
  two_factor_enabled: boolean;
  is_block: boolean;
  is_possible_withdraw: boolean;
  is_withdraw_block: boolean;
  is_due: boolean;
  is_complete_bet_volume: boolean; // Optional field for bet volume completion status
  is_bind_wallet: boolean;
  due_amount: number;
  is_payment_method_added: boolean;

  is_active_aiTrade: boolean;

  fcm_tokens: string[];
  sponsorId?: mongoose.Types.ObjectId | null;
  sponsorName?: string;
  agentId?: mongoose.Types.ObjectId | null;
  agentName?: string;
  kyc_id?: mongoose.Types.ObjectId | null;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  parents: mongoose.Types.ObjectId[];
  generationRewardLevels: number[];
  createdAt?: Date;
  updatedAt?: Date;

  getJWTToken(): string;
  comparePassword(password: string): Promise<boolean>;
  getResetPasswordToken(): string;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      required: [true, "Please Enter Your Email"],
      validate: [validator.isEmail, "Please Enter a valid Email"],
    },

    oldEmail: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      validate: [validator.isMobilePhone, "Please Enter a valid Phone Number"],
    },
    customerId: {
      type: String,
      unique: true,
      required: [true, "Please Enter Your Customer ID"],
    },
    password: {
      type: String,
      minlength: 6,
      select: false,
    },
    text_password: {
      type: String,
      minlength: 6,
      required: [true, "Please Enter Your Password"],
    },
    securityPin: {
      type: String,
      minlength: 6,
    },
    country: { type: String },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.User,
    },
    rank: {
      type: String,
      enum: Object.values(UserRank),
      default: UserRank.User,
    },

    generationRewardTier: {
      type: String,
      default: "",
    },

    vipTier: {
      type: String,
      enum: Object.values(UserVipTier),
      default: UserVipTier.VIP0,
    },
    m_balance: { type: Number, min: 0, default: 0 },
    demo_balance: { type: Number, default: 0 }, // Optional field for demo balance
    bet_volume: { type: Number, min: 0, default: 0 }, // Optional field for betting amount
    w_balance: { type: Number, default: 0 }, // Wallet balance
    d_balance: { type: Number, default: 0 }, // Deposit balance
    last_m_balance: { type: Number, default: 0 },
    s_bonus: { type: Number, default: 0 },

    addNewMember: { type: Number, default: 0 },

    email_verified: { type: Boolean, default: false },
    verify_code: { type: String, default: "" },
    kyc_verified: { type: Boolean, default: false },
    kyc_request: { type: Boolean, default: false },
    kyc_step: { type: Number, default: 1 },

    kyc_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Kyc",
      default: null,
    },
    is_active: { type: Boolean, default: false },
    activeAt: { type: Date, default: null },
    is_new: { type: Boolean, default: true },
    is_winner: { type: Boolean, default: false },
    two_factor_enabled: { type: Boolean, default: false },
    is_block: { type: Boolean, default: false },
    is_withdraw_block: { type: Boolean, default: false },
    is_complete_bet_volume: { type: Boolean, default: false }, // Optional field for bet volume completion status
    is_bind_wallet: { type: Boolean, default: false },

    is_active_aiTrade: { type: Boolean, default: false },

    fcm_tokens: [],
    sponsorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sponsorName: {
      type: String,
      default: "",
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    agentName: {
      type: String,
      default: "",
    },
    parents: [],
    generationRewardLevels: [], // Array to store generation reward levels
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true },
);

// 🔐 Pre-save hook for hashing password
userSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// 🔐 Create JWT Token
userSchema.methods.getJWTToken = function (): string {
  const payload = { id: this._id };

  const secret: Secret = process.env.JWT_SECRET!;
  const options: SignOptions = {
    expiresIn: process.env.JWT_EXPIRE as jwt.SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secret, options);
};

// 🔐 Compare Password
userSchema.methods.comparePassword = async function (
  password: string,
): Promise<boolean> {
  return bcrypt.compare(password, this.password);
};

// 🔐 Generate Reset Password Token
userSchema.methods.getResetPasswordToken = function (): string {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  return resetToken;
};

export const User = mongoose.model<IUser>("User", userSchema);
