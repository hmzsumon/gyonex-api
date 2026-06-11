import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export type UserRole   = 'super_admin' | 'admin' | 'moderator' | 'user';
export type UserStatus = 'active' | 'suspended' | 'banned' | 'pending_verification';
export type KYCStatus  = 'not_submitted' | 'pending' | 'approved' | 'rejected';

export interface IDevice {
  deviceId:   string;
  deviceName: string;
  browser:    string;
  os:         string;
  ip:         string;
  country:    string;
  city:       string;
  isVPN:      boolean;
  lastSeen:   Date;
  isTrusted:  boolean;
}

export interface ILoginHistory {
  ip:         string;
  country:    string;
  city:       string;
  browser:    string;
  os:         string;
  deviceType: string;
  isVPN:      boolean;
  status:     'success' | 'failed' | '2fa_required';
  timestamp:  Date;
}

export interface IUser extends Document {
  _id:                        mongoose.Types.ObjectId;
  userId:                     mongoose.Types.ObjectId; // ← virtual alias for _id
  fullName:                   string;
  email:                      string;
  phone?:                     string;
  password:                   string;
  avatar?:                    string;
  role:                       UserRole;
  status:                     UserStatus;
  kycStatus:                  KYCStatus;
  kycDocument?:               mongoose.Types.ObjectId;
  referralCode:               string;
  referredBy?:                mongoose.Types.ObjectId;
  twoFactorSecret?:           string;
  twoFactorEnabled:           boolean;
  withdrawPin?:               string;
  emailVerified:              boolean;
  emailVerificationToken?:    string;
  emailVerificationExpires?:  Date;
  passwordResetToken?:        string;
  passwordResetExpires?:      Date;
  refreshTokens:              string[];
  devices:                    IDevice[];
  loginHistory:               ILoginHistory[];
  lastLogin?:                 Date;
  registrationBonus:          number;
  vipLevel:                   number;
  tradingEnabled:             boolean;
  withdrawalEnabled:          boolean;
  depositEnabled:             boolean;
  notes?:                     string;
  createdAt:                  Date;
  updatedAt:                  Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  compareWithdrawPin(candidatePin: string): Promise<boolean>;
  generateEmailVerificationToken(): string;
  generatePasswordResetToken(): string;
  toSafeObject(): Partial<IUser>;
}

const DeviceSchema = new Schema<IDevice>({
  deviceId:   { type: String, required: true },
  deviceName: { type: String, default: 'Unknown Device' },
  browser:    { type: String, default: 'Unknown' },
  os:         { type: String, default: 'Unknown' },
  ip:         { type: String, required: true },
  country:    { type: String, default: 'Unknown' },
  city:       { type: String, default: 'Unknown' },
  isVPN:      { type: Boolean, default: false },
  lastSeen:   { type: Date, default: Date.now },
  isTrusted:  { type: Boolean, default: false },
}, { _id: false });

const LoginHistorySchema = new Schema<ILoginHistory>({
  ip:         String,
  country:    String,
  city:       String,
  browser:    String,
  os:         String,
  deviceType: String,
  isVPN:      Boolean,
  status:     { type: String, enum: ['success', 'failed', '2fa_required'] },
  timestamp:  { type: Date, default: Date.now },
}, { _id: false });

const UserSchema = new Schema<IUser>({
  fullName: {
    type:      String,
    required:  [true, 'Full name is required'],
    trim:      true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  email: {
    type:      String,
    required:  [true, 'Email is required'],
    unique:    true,
    lowercase: true,
    trim:      true,
    match:     [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  phone: {
    type:   String,
    sparse: true,
  },
  password: {
    type:      String,
    required:  [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select:    false,
  },
  avatar: String,
  role: {
    type:    String,
    enum:    ['super_admin', 'admin', 'moderator', 'user'],
    default: 'user',
  },
  status: {
    type:    String,
    enum:    ['active', 'suspended', 'banned', 'pending_verification'],
    default: 'pending_verification',
  },
  kycStatus: {
    type:    String,
    enum:    ['not_submitted', 'pending', 'approved', 'rejected'],
    default: 'not_submitted',
  },
  kycDocument:              { type: Schema.Types.ObjectId, ref: 'KYC' },
  referralCode: {
    type:      String,
    unique:    true,
    uppercase: true,
  },
  referredBy:               { type: Schema.Types.ObjectId, ref: 'User' },
  twoFactorSecret:          { type: String, select: false },
  twoFactorEnabled:         { type: Boolean, default: false },
  withdrawPin:              { type: String, select: false },
  emailVerified:            { type: Boolean, default: false },
  emailVerificationToken:   { type: String, select: false },
  emailVerificationExpires: { type: Date,   select: false },
  passwordResetToken:       { type: String, select: false },
  passwordResetExpires:     { type: Date,   select: false },
  refreshTokens:            { type: [String], select: false, default: [] },
  devices:                  { type: [DeviceSchema], default: [] },
  loginHistory:             { type: [LoginHistorySchema], default: [] },
  lastLogin:                Date,
  registrationBonus:        { type: Number, default: 4 },
  vipLevel:                 { type: Number, default: 0, min: 0, max: 4 },
  tradingEnabled:           { type: Boolean, default: true },
  withdrawalEnabled:        { type: Boolean, default: true },
  depositEnabled:           { type: Boolean, default: true },
  notes:                    String,
}, {
  timestamps: true,
  toJSON:   { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Virtual: userId → _id ────────────────────────────────────────────────────
UserSchema.virtual('userId').get(function (this: IUser) {
  return this._id;
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
UserSchema.index({ referredBy: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ createdAt: -1 });

// ─── Pre-save: hash password ──────────────────────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Pre-save: hash withdraw PIN ──────────────────────────────────────────────
UserSchema.pre('save', async function (next) {
  if (!this.isModified('withdrawPin') || !this.withdrawPin) return next();
  const salt       = await bcrypt.genSalt(10);
  this.withdrawPin = await bcrypt.hash(this.withdrawPin, salt);
  next();
});

// ─── Pre-save: generate referral code ────────────────────────────────────────
UserSchema.pre('save', function (next) {
  if (!this.referralCode) {
    this.referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

// ─── Methods ──────────────────────────────────────────────────────────────────
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.compareWithdrawPin = async function (candidatePin: string): Promise<boolean> {
  return bcrypt.compare(candidatePin, this.withdrawPin);
};

UserSchema.methods.generateEmailVerificationToken = function (): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken   = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return token;
};

UserSchema.methods.generatePasswordResetToken = function (): string {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken   = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  return token;
};

UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.twoFactorSecret;
  delete obj.withdrawPin;
  delete obj.refreshTokens;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  return obj;
};

export const User =
  mongoose.models.User ?? mongoose.model<IUser>('User', UserSchema);