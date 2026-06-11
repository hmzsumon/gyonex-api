import mongoose, { Document, Schema } from 'mongoose';
import CryptoJS from 'crypto-js';

export type WalletAsset = 'BTC' | 'ETH' | 'USDT' | 'KRW' | 'MAIN';
export type WalletType = 'spot' | 'futures' | 'loan' | 'staking' | 'bonus' | 'referral';

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  asset: WalletAsset;
  walletType: WalletType;
  balance: number;
  lockedBalance: number;
  availableBalance: number;
  address?: string;
  encryptedPrivateKey?: string;
  network?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  lock(amount: number): Promise<void>;
  unlock(amount: number): Promise<void>;
  credit(amount: number): Promise<void>;
  debit(amount: number): Promise<void>;
  getPrivateKey(): string | null;
}

const WalletSchema = new Schema<IWallet>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  asset: {
    type: String,
    enum: ['BTC', 'ETH', 'USDT', 'KRW', 'MAIN'],
    required: true,
  },
  walletType: {
    type: String,
    enum: ['spot', 'futures', 'loan', 'staking', 'bonus', 'referral'],
    default: 'spot',
  },
  balance: { type: Number, default: 0, min: 0 },
  lockedBalance: { type: Number, default: 0, min: 0 },
  address: String,
  encryptedPrivateKey: { type: String, select: false },
  network: String,
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// Virtual: available balance
WalletSchema.virtual('availableBalance').get(function () {
  return Math.max(0, this.balance - this.lockedBalance);
});

// Indexes
WalletSchema.index({ userId: 1, asset: 1, walletType: 1 }, { unique: true });

// Methods
WalletSchema.methods.lock = async function (amount: number): Promise<void> {
  if (this.availableBalance < amount) {
    throw new Error(`Insufficient balance. Available: ${this.availableBalance}, Required: ${amount}`);
  }
  this.lockedBalance += amount;
  await this.save();
};

WalletSchema.methods.unlock = async function (amount: number): Promise<void> {
  this.lockedBalance = Math.max(0, this.lockedBalance - amount);
  await this.save();
};

WalletSchema.methods.credit = async function (amount: number): Promise<void> {
  if (amount <= 0) throw new Error('Credit amount must be positive');
  this.balance += amount;
  await this.save();
};

WalletSchema.methods.debit = async function (amount: number): Promise<void> {
  if (amount <= 0) throw new Error('Debit amount must be positive');
  if (this.availableBalance < amount) {
    throw new Error(`Insufficient available balance`);
  }
  this.balance -= amount;
  await this.save();
};

WalletSchema.methods.getPrivateKey = function (): string | null {
  if (!this.encryptedPrivateKey) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(
      this.encryptedPrivateKey,
      process.env.WALLET_ENCRYPTION_KEY!
    );
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
};

export const Wallet = mongoose.model<IWallet>('Wallet', WalletSchema);
