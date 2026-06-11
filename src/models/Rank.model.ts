import mongoose, { Document, Schema } from 'mongoose';

export type RankLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// ─── Incentive-based ranks (one-time reward) ──────────────────────────────────
export const INCENTIVE_RANKS = {
  bronze:      { name: 'Bronze',      badge: '🥉', minRefs: 10, minInvestment: 1000,  reward: 50,   color: '#CD7C2F' },
  silver:      { name: 'Silver',      badge: '🥈', minRefs: 20, minInvestment: 3000,  reward: 100,  color: '#94A3B8' },
  gold:        { name: 'Gold',        badge: '🥇', minRefs: 30, minInvestment: 6000,  reward: 300,  color: '#F5B731' },
  platinum:    { name: 'Platinum',    badge: '💎', minRefs: 35, minInvestment: 11000, reward: 500,  color: '#E2E8F0' },
  emerald:     { name: 'Emerald',     badge: '💚', minRefs: 50, minInvestment: 21000, reward: 1000, color: '#10B981' },
  diamond:     { name: 'Diamond',     badge: '💠', minRefs: 55, minInvestment: 35000, reward: 2000, color: '#3B82F6' },
  grandmaster: { name: 'Grandmaster', badge: '👑', minRefs: 60, minInvestment: 55000, reward: 5000, color: '#F97316' },
};

// ─── Salary-based ranks (monthly recurring) ───────────────────────────────────
export const SALARY_RANKS = {
  1: { name: 'Ambassador',           badge: '🌐', minRefs: 10, teamTarget: 50,   monthlySalary: 100,  color: '#94A3B8' },
  2: { name: 'Regional Director',    badge: '🏅', minRefs: 10, teamTarget: 200,  monthlySalary: 300,  color: '#22C55E' },
  3: { name: 'National Director',    badge: '🎖️', minRefs: 10, teamTarget: 400,  monthlySalary: 700,  color: '#8B5CF6' },
  4: { name: 'Continental Director', badge: '⭐', minRefs: 10, teamTarget: 900,  monthlySalary: 1000, color: '#F59E0B' },
  5: { name: 'Global Director',      badge: '🌟', minRefs: 10, teamTarget: 1500, monthlySalary: 2000, color: '#F97316' },
};

// ─── Legacy RANK_CONFIG (backward compat) ─────────────────────────────────────
export const RANK_CONFIG = {
  1: { name: 'Ambassador',           level: 1, requiredTeamSize: 50,   requiredReferrals: 10, monthlyRewardUSD: 100,  color: '#94A3B8', badge: '🌐' },
  2: { name: 'Regional Director',    level: 2, requiredTeamSize: 200,  requiredReferrals: 10, monthlyRewardUSD: 300,  color: '#22C55E', badge: '🏅' },
  3: { name: 'National Director',    level: 3, requiredTeamSize: 400,  requiredReferrals: 10, monthlyRewardUSD: 700,  color: '#8B5CF6', badge: '🎖️' },
  4: { name: 'Continental Director', level: 4, requiredTeamSize: 900,  requiredReferrals: 10, monthlyRewardUSD: 1000, color: '#F59E0B', badge: '⭐' },
  5: { name: 'Global Director',      level: 5, requiredTeamSize: 1500, requiredReferrals: 10, monthlyRewardUSD: 2000, color: '#F97316', badge: '🌟' },
};

// ─── Smart Trade Profit Sharing ───────────────────────────────────────────────
export const SMART_TRADE_SHARING = {
  user:             0.60,
  company:          0.15,
  upline:           0.25,
  lossCompensation: 0.50,
  uplineDistribution: { L1: 0.30, L2: 0.25, L3: 0.20, L4: 0.15, L5: 0.10 },
};

// ─── Staking Upline Sharing ───────────────────────────────────────────────────
export const STAKING_UPLINE_SHARING = {
  L1: 0.15, L2: 0.12, L3: 0.10, L4: 0.05, L5: 0.03,
};

// ─── Smart Trade Packages ─────────────────────────────────────────────────────
export const SMART_TRADE_PACKAGES = {
  classic:      { name: 'Classic Trade', minDeposit: 30,    dailyMin: 0.002, dailyMax: 0.12 },
  standard:     { name: 'Standard',      minDeposit: 50,    dailyMin: 0.002, dailyMax: 0.12 },
  advance:      { name: 'Advance',       minDeposit: 100,   dailyMin: 0.002, dailyMax: 0.12 },
  professional: { name: 'Professional',  minDeposit: 300,   dailyMin: 0.002, dailyMax: 0.12 },
  premium:      { name: 'Premium',       minDeposit: 500,   dailyMin: 0.002, dailyMax: 0.12 },
  elite:        { name: 'Elite',         minDeposit: 1000,  dailyMin: 0.002, dailyMax: 0.12 },
  royal:        { name: 'Royal',         minDeposit: 2000,  dailyMin: 0.002, dailyMax: 0.12 },
  platinum:     { name: 'Platinum',      minDeposit: 5000,  dailyMin: 0.002, dailyMax: 0.12 },
  diamond:      { name: 'Diamond',       minDeposit: 10000, dailyMin: 0.002, dailyMax: 0.12 },
  supreme:      { name: 'Supreme',       minDeposit: 50000, dailyMin: 0.002, dailyMax: 0.12 },
};

// ─── IUserRank ────────────────────────────────────────────────────────────────
export interface IUserRank extends Document {
  userId:                mongoose.Types.ObjectId;

  // Rank progression
  currentRank:           number;
  highestRankAchieved:   number;
  completedRankLevels:   number[];
  incentiveRank:         string;

  // Team stats
  directReferrals:       number;
  teamSize:              number;
  totalInvestment:       number;

  // Claim workflow
  claimStatus:           'none' | 'image_pending' | 'approved' | 'rejected';
  pendingClaimRank?:     number;
  claimSubmittedAt?:     Date;
  claimApprovedAt?:      Date;
  claimRejectedAt?:      Date;
  claimNote?:            string;
  reviewedBy?:           mongoose.Types.ObjectId;

  // Eligibility
  isEligibleForNextRank: boolean;

  // Smart trade
  smartTradeActive:      boolean;
  smartTradePackage?:    string;
  smartTradeAmount?:     number;
  smartTradeStartDate?:  Date;

  createdAt: Date;
  updatedAt: Date;
}

const UserRankSchema = new Schema<IUserRank>({
  userId:               { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  currentRank:          { type: Number, default: 0, min: 0, max: 5 },
  highestRankAchieved:  { type: Number, default: 0, min: 0, max: 5 },
  completedRankLevels:  { type: [Number], default: [] },
  incentiveRank:        { type: String, default: 'none' },

  directReferrals:      { type: Number, default: 0 },
  teamSize:             { type: Number, default: 0 },
  totalInvestment:      { type: Number, default: 0 },

  claimStatus:          { type: String, enum: ['none', 'image_pending', 'approved', 'rejected'], default: 'none' },
  pendingClaimRank:     { type: Number },
  claimSubmittedAt:     { type: Date },
  claimApprovedAt:      { type: Date },
  claimRejectedAt:      { type: Date },
  claimNote:            { type: String },
  reviewedBy:           { type: Schema.Types.ObjectId, ref: 'User' },

  isEligibleForNextRank: { type: Boolean, default: false },

  smartTradeActive:     { type: Boolean, default: false },
  smartTradePackage:    { type: String },
  smartTradeAmount:     { type: Number },
  smartTradeStartDate:  { type: Date },
}, { timestamps: true });

// ─── IRankRewardImage ─────────────────────────────────────────────────────────
export interface IRankRewardImage extends Document {
  userId:           mongoose.Types.ObjectId;
  adminId:          mongoose.Types.ObjectId;
  rankLevel:        number;
  rankName:         string;
  imagePath:        string;
  imageUrl:         string;
  isPublic:         boolean;
  message?:         string;
  userAcknowledged: boolean;
  sharedToFeed:     boolean;
  acknowledgedAt?:  Date;
  createdAt:        Date;
}

const RankRewardImageSchema = new Schema<IRankRewardImage>({
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
  adminId:          { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rankLevel:        { type: Number, required: true },
  rankName:         { type: String, required: true },
  imagePath:        { type: String, required: true },
  imageUrl:         { type: String, required: true },
  isPublic:         { type: Boolean, default: true },
  message:          { type: String },
  userAcknowledged: { type: Boolean, default: false },
  sharedToFeed:     { type: Boolean, default: false },
  acknowledgedAt:   { type: Date },
}, { timestamps: true });

// ─── ISalaryRecord ────────────────────────────────────────────────────────────
export interface ISalaryRecord extends Document {
  userId:        mongoose.Types.ObjectId;
  rankLevel:     number;
  rankName?:     string;
  amount:        number;
  year:          number;
  month:         number;
  status?:       'paid' | 'pending';
  paidAt:        Date;
  walletId?:     mongoose.Types.ObjectId;
  transactionId?: mongoose.Types.ObjectId;
}

const SalaryRecordSchema = new Schema<ISalaryRecord>({
  userId:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
  rankLevel:     { type: Number, required: true },
  rankName:      { type: String },
  amount:        { type: Number, required: true },
  year:          { type: Number, required: true },
  month:         { type: Number, required: true },
  status:        { type: String, enum: ['paid', 'pending'], default: 'paid' },
  paidAt:        { type: Date, default: Date.now },
  walletId:      { type: Schema.Types.ObjectId, ref: 'Wallet' },
  transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction' },
}, { timestamps: false });

SalaryRecordSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

// ─── Exports ──────────────────────────────────────────────────────────────────
export const UserRank        = mongoose.model<IUserRank>('UserRank', UserRankSchema);
export const RankRewardImage = mongoose.model<IRankRewardImage>('RankRewardImage', RankRewardImageSchema);
export const SalaryRecord    = mongoose.model<ISalaryRecord>('SalaryRecord', SalaryRecordSchema);