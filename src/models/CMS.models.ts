import mongoose, { Document, Schema } from 'mongoose';

export type NetworkType = 'BEP20' | 'TRC20' | 'ERC20' | 'BTC' | 'SOL';

export interface IDepositWallet extends Document {
  coin: string;            // e.g. USDT, BTC, ETH
  network: NetworkType;
  walletAddress: string;
  label?: string;
  memo?: string;
  tag?: string;
  qrCodeUrl?: string;      // uploaded QR image URL
  qrCodeGenerated?: string;// auto-generated QR data URL
  explorerLink?: string;
  minDeposit: number;
  confirmationsRequired: number;
  isActive: boolean;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;
  depositInstructions?: string;
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  changeLog: Array<{
    field: string;
    oldValue: string;
    newValue: string;
    changedBy: mongoose.Types.ObjectId;
    changedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const DepositWalletSchema = new Schema<IDepositWallet>({
  coin: { type: String, required: true, uppercase: true, trim: true },
  network: { type: String, enum: ['BEP20','TRC20','ERC20','BTC','SOL'], required: true },
  walletAddress: { type: String, required: true, trim: true },
  label: { type: String, trim: true },
  memo: String,
  tag: String,
  qrCodeUrl: String,
  qrCodeGenerated: String,
  explorerLink: String,
  minDeposit: { type: Number, default: 10 },
  confirmationsRequired: { type: Number, default: 3 },
  isActive: { type: Boolean, default: true, index: true },
  isMaintenanceMode: { type: Boolean, default: false },
  maintenanceMessage: String,
  depositInstructions: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  changeLog: [{
    field: String,
    oldValue: String,
    newValue: String,
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

DepositWalletSchema.index({ coin: 1, network: 1 }, { unique: true });

export const DepositWallet = mongoose.model<IDepositWallet>('DepositWallet', DepositWalletSchema);

// ─── CMS Banner/Media models ───────────────────────────────────────────────────
export interface ICMSBanner extends Document {
  title: string;
  section: string;
  imageUrl: string;
  linkUrl?: string;
  altText?: string;
  order: number;
  isActive: boolean;
  startDate?: Date;
  endDate?: Date;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const CMSBannerSchema = new Schema<ICMSBanner>({
  title: { type: String, required: true },
  section: { type: String, required: true, index: true },
  imageUrl: { type: String, required: true },
  linkUrl: String,
  altText: String,
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  startDate: Date,
  endDate: Date,
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const CMSBanner = mongoose.model<ICMSBanner>('CMSBanner', CMSBannerSchema);

// ─── Blog Post ─────────────────────────────────────────────────────────────────
export interface IBlogPost extends Document {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featuredImage?: string;
  category: string;
  tags: string[];
  author: mongoose.Types.ObjectId;
  status: 'draft' | 'published' | 'scheduled';
  publishedAt?: Date;
  scheduledAt?: Date;
  seoTitle?: string;
  seoDescription?: string;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

const BlogPostSchema = new Schema<IBlogPost>({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  content: { type: String, required: true },
  excerpt: String,
  featuredImage: String,
  category: { type: String, required: true },
  tags: [String],
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['draft','published','scheduled'], default: 'draft' },
  publishedAt: Date,
  scheduledAt: Date,
  seoTitle: String,
  seoDescription: String,
  views: { type: Number, default: 0 },
}, { timestamps: true });

BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ slug: 1 });

export const BlogPost = mongoose.model<IBlogPost>('BlogPost', BlogPostSchema);

// ─── Media Library ─────────────────────────────────────────────────────────────
export interface IMediaFile extends Document {
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  folder: string;
  uploadedBy: mongoose.Types.ObjectId;
  tags: string[];
  createdAt: Date;
}

const MediaFileSchema = new Schema<IMediaFile>({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  url: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  folder: { type: String, default: 'general', index: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tags: [String],
}, { timestamps: true });

export const MediaFile = mongoose.model<IMediaFile>('MediaFile', MediaFileSchema);

// ─── Manual Balance Adjustment ─────────────────────────────────────────────────
export interface IBalanceAdjustment extends Document {
  userId: mongoose.Types.ObjectId;
  walletId: mongoose.Types.ObjectId;
  adminId: mongoose.Types.ObjectId;
  type: 'credit' | 'debit' | 'freeze' | 'unfreeze' | 'reset';
  asset: string;
  amount: number;
  reason: string;
  note?: string;
  previousBalance: number;
  newBalance: number;
  ip?: string;
  createdAt: Date;
}

const BalanceAdjustmentSchema = new Schema<IBalanceAdjustment>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
  adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['credit','debit','freeze','unfreeze','reset'], required: true },
  asset: { type: String, required: true, uppercase: true },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  note: String,
  previousBalance: { type: Number, required: true },
  newBalance: { type: Number, required: true },
  ip: String,
}, { timestamps: true });

export const BalanceAdjustment = mongoose.model<IBalanceAdjustment>('BalanceAdjustment', BalanceAdjustmentSchema);

// ─── Lottery Winner ────────────────────────────────────────────────────────────
export interface ILotteryDraw extends Document {
  drawId: string;
  title: string;
  ticketPrice: number;
  prize: number;
  prizeAsset: string;
  status: 'open' | 'drawing' | 'completed';
  type: 'daily' | 'weekly' | 'monthly' | 'special';
  winnerId?: mongoose.Types.ObjectId;
  winnerTicket?: string;
  isManualWinner: boolean;
  isFakeWinner: boolean;
  winnerCountry?: string;
  drawDate: Date;
  totalTickets: number;
  totalRevenue: number;
  publishedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const LotteryDrawSchema = new Schema<ILotteryDraw>({
  drawId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  ticketPrice: { type: Number, default: 5 },
  prize: { type: Number, required: true },
  prizeAsset: { type: String, default: 'USDT' },
  status: { type: String, enum: ['open','drawing','completed'], default: 'open' },
  type: { type: String, enum: ['daily','weekly','monthly','special'], default: 'daily' },
  winnerId: { type: Schema.Types.ObjectId, ref: 'User' },
  winnerTicket: String,
  isManualWinner: { type: Boolean, default: false },
  isFakeWinner: { type: Boolean, default: false },
  winnerCountry: String,
  drawDate: { type: Date, required: true },
  totalTickets: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  publishedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const LotteryDraw = mongoose.model<ILotteryDraw>('LotteryDraw', LotteryDrawSchema);
