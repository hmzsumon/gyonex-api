import mongoose, { Schema, Document } from 'mongoose';

/* ─────────────────────────────────────────────────────────────────────────
   Lottery Constants
───────────────────────────────────────────────────────────────────────── */
export const LOTTERY_TICKET_PRICE = 5;
export const LOTTERY_MAX_QTY = 100;

/* ─────────────────────────────────────────────────────────────────────────
   Lottery Types
───────────────────────────────────────────────────────────────────────── */
export interface ILotteryTicket {
  userId:      mongoose.Types.ObjectId;
  quantity:    number;
  purchasedAt: Date;
}

export interface ILotteryWinner {
  userId:      mongoose.Types.ObjectId;
  ticketIndex: number;
  drawnAt:     Date;
}

export interface ILotteryWinnerInfo {
  name:       string;
  country:    string;
  maskedName: string;
}

export interface ILottery extends Document {
  title:       string;
  description: string;
  prizeAmount: number;
  prizeAsset:  string;
  ticketPrice: number;
  maxTickets:  number;
  drawDate:    Date;
  status:      'upcoming' | 'open' | 'drawn' | 'cancelled';
  tickets:     ILotteryTicket[];
  winner?:     ILotteryWinner;
  winnerInfo?: ILotteryWinnerInfo;
  createdBy:   mongoose.Types.ObjectId;
  createdAt:   Date;
  updatedAt:   Date;
}

/* ─────────────────────────────────────────────────────────────────────────
   Lottery Schema
───────────────────────────────────────────────────────────────────────── */
const LotterySchema = new Schema<ILottery>(
  {
    title:       { type: String, required: true },
    description: { type: String, default: '' },
    prizeAmount: { type: Number, required: true, min: 1 },
    prizeAsset:  { type: String, default: 'USDT' },
    ticketPrice: { type: Number, required: true, default: LOTTERY_TICKET_PRICE, min: 1 },
    maxTickets:  { type: Number, default: 10_000 },
    drawDate:    { type: Date, required: true },
    status: {
      type:    String,
      enum:    ['upcoming', 'open', 'drawn', 'cancelled'],
      default: 'open',
    },
    tickets: [
      {
        userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
        quantity:    { type: Number, default: 1 },
        purchasedAt: { type: Date, default: Date.now },
      },
    ],
    winner: {
      userId:      { type: Schema.Types.ObjectId, ref: 'User' },
      ticketIndex: Number,
      drawnAt:     Date,
    },
    winnerInfo: {
      name:       String,
      country:    String,
      maskedName: String,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

/* ─────────────────────────────────────────────────────────────────────────
   Indexes
───────────────────────────────────────────────────────────────────────── */
LotterySchema.index({ status: 1 });
LotterySchema.index({ 'tickets.userId': 1 });
LotterySchema.index({ 'winner.drawnAt': -1 });

/* ─────────────────────────────────────────────────────────────────────────
   Export Model
───────────────────────────────────────────────────────────────────────── */
export const Lottery =
  (mongoose.models.Lottery as mongoose.Model<ILottery>) ||
  mongoose.model<ILottery>('Lottery', LotterySchema);
