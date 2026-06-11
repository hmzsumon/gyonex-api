import mongoose, { Document, Schema } from 'mongoose';

// ============ KYC MODEL ============
export interface IKYC extends Document {
  userId: mongoose.Types.ObjectId;
  documentType: 'nid' | 'passport' | 'drivers_license';
  frontImage: string;
  backImage?: string;
  selfieImage: string;
  documentNumber?: string;
  fullName?: string;
  dateOfBirth?: Date;
  country?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewNote?: string;
  reviewedAt?: Date;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const KYCSchema = new Schema<IKYC>({
  userId:         { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentType:   { type: String, enum: ['nid', 'passport', 'drivers_license'], required: true },
  frontImage:     { type: String, required: true },
  backImage:      String,
  selfieImage:    { type: String, required: true },
  documentNumber: String,
  fullName:       String,
  dateOfBirth:    Date,
  country:        String,
  status:         { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy:     { type: Schema.Types.ObjectId, ref: 'User' },
  reviewNote:     String,
  reviewedAt:     Date,
  submittedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

export const KYC =
  mongoose.models.KYC ?? mongoose.model<IKYC>('KYC', KYCSchema);


// ============ NOTIFICATION MODEL ============
export interface INotification extends Document {
  userId:    mongoose.Types.ObjectId;
  title:     string;
  message:   string;
  type:      'info' | 'success' | 'warning' | 'error' | 'trade' | 'wallet' | 'kyc' | 'system';
  isRead:    boolean;
  link?:     string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>({
  userId:   { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:    { type: String, required: true },
  message:  { type: String, required: true },
  type:     { type: String, enum: ['info', 'success', 'warning', 'error', 'trade', 'wallet', 'kyc', 'system'], default: 'info' },
  isRead:   { type: Boolean, default: false }, // removed inline index — covered by compound below
  link:     String,
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification =
  mongoose.models.Notification ?? mongoose.model<INotification>('Notification', NotificationSchema);


// ============ TRANSACTION MODEL ============
export interface ITransaction extends Document {
  userId:      mongoose.Types.ObjectId;
  walletId:    mongoose.Types.ObjectId;
  type:        'deposit' | 'withdrawal' | 'transfer' | 'loan_disbursement' | 'loan_repayment' | 'commission' | 'trade' | 'fee';
  asset:       string;
  amount:      number;
  fee:         number;
  netAmount:   number;
  status:      'pending' | 'completed' | 'failed' | 'cancelled';
  completedAt?: Date;
  metadata?:   Record<string, unknown>;
  createdAt:   Date;
  updatedAt:   Date;
}

const TransactionSchema = new Schema<ITransaction>({
  userId:   { type: Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
  type:     {
    type: String,
    enum: ['deposit', 'withdrawal', 'transfer', 'loan_disbursement', 'loan_repayment', 'commission', 'trade', 'fee'],
    required: true,
  },
  asset:       { type: String, required: true },
  amount:      { type: Number, required: true },
  fee:         { type: Number, default: 0 },
  netAmount:   { type: Number, required: true },
  status:      { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending', index: true },
  completedAt: Date,
  metadata:    { type: Schema.Types.Mixed },
}, { timestamps: true });

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ walletId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1, createdAt: -1 });

export const Transaction =
  mongoose.models.Transaction ?? mongoose.model<ITransaction>('Transaction', TransactionSchema);


// ============ REFERRAL MODEL ============
export interface IReferral extends Document {
  referrerId:     mongoose.Types.ObjectId;
  referredId:     mongoose.Types.ObjectId;
  level:          1 | 2 | 3;
  commissionRate: number;
  totalEarned:    number;
  isActive:       boolean;
  createdAt:      Date;
}

const ReferralSchema = new Schema<IReferral>({
  referrerId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  referredId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  level:          { type: Number, enum: [1, 2, 3], required: true },
  commissionRate: { type: Number, required: true },
  totalEarned:    { type: Number, default: 0 },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

ReferralSchema.index({ referrerId: 1, level: 1 });

export const Referral =
  mongoose.models.Referral ?? mongoose.model<IReferral>('Referral', ReferralSchema);


// ============ ADMIN LOG MODEL ============
export interface IAdminLog extends Document {
  adminId:     mongoose.Types.ObjectId;
  action:      string;
  targetType?: string;
  targetId?:   mongoose.Types.ObjectId;
  details?:    Record<string, unknown>;
  ip?:         string;
  userAgent?:  string;
  createdAt:   Date;
}

const AdminLogSchema = new Schema<IAdminLog>({
  adminId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action:     { type: String, required: true },
  targetType: String,
  targetId:   { type: Schema.Types.ObjectId },
  details:    { type: Schema.Types.Mixed },
  ip:         String,
  userAgent:  String,
}, { timestamps: true });

AdminLogSchema.index({ adminId: 1, createdAt: -1 });
AdminLogSchema.index({ action: 1, createdAt: -1 });

export const AdminLog =
  mongoose.models.AdminLog ?? mongoose.model<IAdminLog>('AdminLog', AdminLogSchema);


// ============ SETTINGS MODEL ============
export interface ISettings extends Document {
  key:          string;
  value:        unknown;
  type:         'string' | 'number' | 'boolean' | 'json';
  description?: string;
  isPublic:     boolean;
  updatedBy?:   mongoose.Types.ObjectId;
  updatedAt:    Date;
}

const SettingsSchema = new Schema<ISettings>({
  key:         { type: String, required: true, unique: true },
  value:       { type: Schema.Types.Mixed, required: true },
  type:        { type: String, enum: ['string', 'number', 'boolean', 'json'], default: 'string' },
  description: String,
  isPublic:    { type: Boolean, default: false },
  updatedBy:   { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const Settings =
  mongoose.models.Settings ?? mongoose.model<ISettings>('Settings', SettingsSchema);


// ============ TRADE MODEL ============
export interface ITrade extends Document {
  buyOrderId:    mongoose.Types.ObjectId;
  sellOrderId:   mongoose.Types.ObjectId;
  buyerId:       mongoose.Types.ObjectId;
  sellerId:      mongoose.Types.ObjectId;
  symbol:        string;
  quantity:      number;
  price:         number;
  totalValue:    number;
  buyFee:        number;
  sellFee:       number;
  upbitTradeId?: string;
  executedAt:    Date;
  createdAt:     Date;
}

const TradeSchema = new Schema<ITrade>({
  buyOrderId:   { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  sellOrderId:  { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  buyerId:      { type: Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
  sellerId:     { type: Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
  symbol:       { type: String, required: true, index: true },
  quantity:     { type: Number, required: true },
  price:        { type: Number, required: true },
  totalValue:   { type: Number, required: true },
  buyFee:       { type: Number, default: 0 },
  sellFee:      { type: Number, default: 0 },
  upbitTradeId: String,
  executedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

TradeSchema.index({ symbol: 1, executedAt: -1 });
TradeSchema.index({ buyerId: 1, executedAt: -1 });
TradeSchema.index({ sellerId: 1, executedAt: -1 });

export const Trade =
  mongoose.models.Trade ?? mongoose.model<ITrade>('Trade', TradeSchema);