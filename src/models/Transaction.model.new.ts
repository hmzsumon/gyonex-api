import mongoose, { Document, Schema } from 'mongoose';

export type TransactionType = 'deposit' | 'withdrawal' | 'trade_buy' | 'trade_sell' | 'fee' | 'referral_reward' | 'registration_bonus' | 'transfer_in' | 'transfer_out' | 'staking_reward' | 'loan_disbursement' | 'loan_repayment';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'rejected';

export interface ITransaction extends Document {
  userId: mongoose.Types.ObjectId;
  walletId: mongoose.Types.ObjectId;
  type: TransactionType;
  asset: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: TransactionStatus;
  txHash?: string;             
  fromAddress?: string;
  toAddress?: string;
  network?: string;
  orderId?: mongoose.Types.ObjectId;
  referenceId?: string;
  adminNote?: string;
  userNote?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'trade_buy', 'trade_sell', 'fee', 'referral_reward',
      'registration_bonus', 'transfer_in', 'transfer_out', 'staking_reward',
      'loan_disbursement', 'loan_repayment'],
    required: true,
    index: true,
  },
  asset: { type: String, required: true, uppercase: true },
  amount: { type: Number, required: true },
  fee: { type: Number, default: 0 },
  netAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'rejected'],
    default: 'pending',
    index: true,
  },
  txHash: { type: String, sparse: true },
  fromAddress: String,
  toAddress: String,
  network: String,
  orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  referenceId: String,
  adminNote: String,
  userNote: String,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedAt: Date,
  completedAt: Date,
  metadata: { type: Schema.Types.Mixed },
}, {
  timestamps: true,
});

TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ userId: 1, type: 1, status: 1 });
TransactionSchema.index({ status: 1, type: 1, createdAt: -1 });

export const Transaction =
  (mongoose.models.Transaction as mongoose.Model<ITransaction>) ??
  mongoose.model<ITransaction>('Transaction', TransactionSchema);
