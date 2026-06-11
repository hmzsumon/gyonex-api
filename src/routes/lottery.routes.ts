import { Router, Request, Response, NextFunction } from 'express';
import { body, query as qv } from 'express-validator';
import mongoose, { Schema, Document } from 'mongoose';
import { protect, adminOnly, AuthRequest } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { Wallet } from '../models/Wallet.model';
import { Transaction, Notification, AdminLog } from '../models/index';
import { AppError } from '../middlewares/error.middleware';

const router = Router();

/* ─────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────── */
const TICKET_PRICE = 5;
const MAX_QTY      = 100;

/* ─────────────────────────────────────────────────────────────────────────
   Lottery Model
───────────────────────────────────────────────────────────────────────── */
interface ILotteryTicket {
  userId:      mongoose.Types.ObjectId;
  quantity:    number;
  purchasedAt: Date;
}

interface ILotteryWinner {
  userId:      mongoose.Types.ObjectId;
  ticketIndex: number;
  drawnAt:     Date;
}

interface ILotteryWinnerInfo {
  name:       string;
  country:    string;
  maskedName: string;
}

interface ILottery extends Document {
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

const LotterySchema = new Schema<ILottery>(
  {
    title:       { type: String, required: true },
    description: { type: String, default: '' },
    prizeAmount: { type: Number, required: true, min: 1 },
    prizeAsset:  { type: String, default: 'USDT' },
    ticketPrice: { type: Number, required: true, default: TICKET_PRICE, min: 1 },
    maxTickets:  { type: Number, default: 10_000 },
    drawDate:    { type: Date, required: true },
    status: {
      type:    String,
      enum:    ['upcoming', 'open', 'drawn', 'cancelled'],
      default: 'open',
    },
    tickets: [{
      userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
      quantity:    { type: Number, default: 1 },
      purchasedAt: { type: Date, default: Date.now },
    }],
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

LotterySchema.index({ status: 1 });
LotterySchema.index({ 'tickets.userId': 1 });
LotterySchema.index({ 'winner.drawnAt': -1 });

const Lottery =
  (mongoose.models.Lottery as mongoose.Model<ILottery>) ||
  mongoose.model<ILottery>('Lottery', LotterySchema);

/* ─────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────── */
function maskName(fullName: string): string {
  return fullName
    .split(' ')
    .map(part =>
      part.length > 2
        ? part[0] + '***' + part[part.length - 1]
        : part[0] + '***',
    )
    .join(' ');
}

function sumTickets(tickets: ILotteryTicket[]): number {
  return tickets.reduce((s, t) => s + t.quantity, 0);
}

/* ─────────────────────────────────────────────────────────────────────────
   USER: Get active lottery
   GET /lottery/active
───────────────────────────────────────────────────────────────────────── */
router.get(
  '/active',
  protect,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const lottery = await Lottery.findOne({ status: 'open' })
        .populate('tickets.userId', 'fullName country')
        .sort({ createdAt: -1 });

      const totalTickets = lottery ? sumTickets(lottery.tickets) : 0;

      const myTickets = lottery
        ? lottery.tickets
            .filter(t => {
              const id = (t.userId as unknown as { _id?: mongoose.Types.ObjectId })?._id;
              return id?.toString() === req.authUser!.userId;
            })
            .reduce((s, t) => s + t.quantity, 0)
        : 0;

      res.json({ success: true, data: { lottery, totalTickets, myTickets } });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   USER: Buy tickets
   POST /lottery/:id/buy
───────────────────────────────────────────────────────────────────────── */
router.post(
  '/:id/buy',
  protect,
  [
    body('quantity')
      .isInt({ min: 1, max: MAX_QTY })
      .withMessage(`Quantity must be between 1 and ${MAX_QTY}`),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const lottery = await Lottery.findById(req.params.id);

      if (!lottery || lottery.status !== 'open')
        return next(new AppError('Lottery is not open for ticket purchase', 400));

      if (new Date(lottery.drawDate) < new Date())
        return next(new AppError('Lottery draw date has already passed', 400));

      const quantity: number  = req.body.quantity;
      const totalCost: number = TICKET_PRICE * quantity;

      if (lottery.maxTickets) {
        const sold = sumTickets(lottery.tickets);
        if (sold + quantity > lottery.maxTickets)
          return next(
            new AppError(
              `Only ${lottery.maxTickets - sold} tickets remain in this lottery`,
              400,
            ),
          );
      }

      const wallet = await Wallet.findOne({ userId: req.authUser!.userId, asset: 'USDT' });
      if (!wallet || wallet.availableBalance < totalCost)
        return next(
          new AppError(`Insufficient balance. You need $${totalCost} USDT`, 400),
        );

      await wallet.debit(totalCost);

      await Transaction.create({
        userId:      req.authUser!.userId,
        walletId:    wallet._id,
        type:        'fee',
        asset:       'USDT',
        amount:      totalCost,
        fee:         0,
        netAmount:   totalCost,
        status:      'completed',
        completedAt: new Date(),
        metadata:    { lotteryId: lottery._id, quantity },
      });

      lottery.tickets.push({
        userId:      new mongoose.Types.ObjectId(req.authUser!.userId),
        quantity,
        purchasedAt: new Date(),
      });
      await lottery.save();

      await Notification.create({
        userId:  req.authUser!.userId,
        title:   '🎟️ Lottery Tickets Purchased!',
        message: `You bought ${quantity} ticket${quantity > 1 ? 's' : ''} for "${lottery.title}". Good luck!`,
        type:    'success',
        link:    '/lottery',
      });

      res.json({
        success: true,
        message: `${quantity} ticket${quantity > 1 ? 's' : ''} purchased!`,
        data:    { totalCost, myTickets: quantity },
      });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   USER: My ticket history
   GET /lottery/my-tickets
───────────────────────────────────────────────────────────────────────── */
router.get(
  '/my-tickets',
  protect,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const uid = new mongoose.Types.ObjectId(req.authUser!.userId);

      const lotteries = await Lottery.find({ 'tickets.userId': uid }).sort({ createdAt: -1 });

      const result = lotteries.map(l => ({
        _id:         l._id,
        title:       l.title,
        prizeAmount: l.prizeAmount,
        prizeAsset:  l.prizeAsset,
        ticketPrice: TICKET_PRICE,
        drawDate:    l.drawDate,
        status:      l.status,
        myTickets:   l.tickets
          .filter(t => t.userId.toString() === req.authUser!.userId)
          .reduce((s, t) => s + t.quantity, 0),
        isWinner: l.winner?.userId?.toString() === req.authUser!.userId,
        winner:   l.winnerInfo
          ? { maskedName: l.winnerInfo.maskedName, country: l.winnerInfo.country }
          : null,
      }));

      res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   USER: Paginated winners list
   GET /lottery/winners?page=1&limit=10
───────────────────────────────────────────────────────────────────────── */
router.get(
  '/winners',
  protect,
  [
    qv('page').optional().isInt({ min: 1 }).toInt(),
    qv('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page  = (req.query.page  as unknown as number) || 1;
      const limit = (req.query.limit as unknown as number) || 10;
      const skip  = (page - 1) * limit;

      const [drawn, total] = await Promise.all([
        Lottery.find({ status: 'drawn' })
          .sort({ 'winner.drawnAt': -1 })
          .skip(skip)
          .limit(limit),
        Lottery.countDocuments({ status: 'drawn' }),
      ]);

      const winners = drawn.map(l => ({
        _id:           l._id,
        title:         l.title,
        prizeAmount:   l.prizeAmount,
        prizeAsset:    l.prizeAsset,
        drawDate:      l.winner?.drawnAt ?? l.drawDate,
        winnerName:    l.winnerInfo?.maskedName ?? 'U***r',
        winnerCountry: l.winnerInfo?.country    ?? '🌍',
        totalTickets:  sumTickets(l.tickets),
      }));

      res.json({
        success: true,
        data: { winners, total, page, pages: Math.ceil(total / limit) },
      });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Create lottery
   POST /lottery/admin/create
───────────────────────────────────────────────────────────────────────── */
router.post(
  '/admin/create',
  adminOnly,
  [
    body('title').notEmpty().trim(),
    body('prizeAmount').isFloat({ min: 1 }),
    body('drawDate')
      .isISO8601()
      .custom((val: string) => {
        const d = new Date(val).getUTCDate();
        if (d !== 1 && d !== 15)
          throw new Error('Draw date must fall on the 1st or 15th of the month');
        return true;
      }),
    body('description').optional().trim(),
    body('maxTickets').optional().isInt({ min: 1 }),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const existing = await Lottery.findOne({ status: 'open' });
      if (existing)
        return next(
          new AppError('A lottery is already open. Close or cancel it before creating a new one.', 400),
        );

      const lottery = await Lottery.create({
        title:       req.body.title,
        description: req.body.description ?? '',
        prizeAmount: req.body.prizeAmount,
        prizeAsset:  req.body.prizeAsset ?? 'USDT',
        ticketPrice: TICKET_PRICE,
        maxTickets:  req.body.maxTickets ?? 10_000,
        drawDate:    req.body.drawDate,
        status:      'open',
        createdBy:   req.authUser!.userId,
      });

      await AdminLog.create({
        adminId:    req.authUser!.userId,
        action:     'lottery_created',
        targetId:   lottery._id,
        targetType: 'Lottery',
        details:    { title: lottery.title, prizeAmount: lottery.prizeAmount, drawDate: lottery.drawDate },
      });

      res.status(201).json({ success: true, data: lottery });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Update lottery
   PATCH /lottery/admin/:id
───────────────────────────────────────────────────────────────────────── */
router.patch(
  '/admin/:id',
  adminOnly,
  [
    body('title').optional().notEmpty().trim(),
    body('prizeAmount').optional().isFloat({ min: 1 }),
    body('drawDate')
      .optional()
      .isISO8601()
      .custom((val: string) => {
        const d = new Date(val).getUTCDate();
        if (d !== 1 && d !== 15)
          throw new Error('Draw date must fall on the 1st or 15th of the month');
        return true;
      }),
    body('status').optional().isIn(['upcoming', 'open', 'cancelled']),
    body('description').optional().trim(),
    body('maxTickets').optional().isInt({ min: 1 }),
    body('ticketPrice').not().exists().withMessage('Ticket price cannot be changed (fixed at $5)'),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const lottery = await Lottery.findByIdAndUpdate(
        req.params.id,
        { ...req.body, ticketPrice: TICKET_PRICE },
        { new: true, runValidators: true },
      );
      if (!lottery) return next(new AppError('Lottery not found', 404));

      await AdminLog.create({
        adminId:    req.authUser!.userId,
        action:     'lottery_updated',
        targetId:   lottery._id,
        targetType: 'Lottery',
        details:    req.body,
      });

      res.json({ success: true, data: lottery });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Draw winner
   POST /lottery/admin/:id/draw
───────────────────────────────────────────────────────────────────────── */
router.post(
  '/admin/:id/draw',
  adminOnly,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const lottery = await Lottery.findById(req.params.id).populate(
        'tickets.userId',
        'fullName country',
      );

      if (!lottery || lottery.status !== 'open')
        return next(new AppError('Lottery is not open', 400));

      const pool: { userId: mongoose.Types.ObjectId; name: string; country: string }[] = [];

      for (const t of lottery.tickets) {
        const u = t.userId as unknown as {
          _id:      mongoose.Types.ObjectId;
          fullName: string;
          country:  string;
        };
        for (let i = 0; i < t.quantity; i++) {
          pool.push({
            userId:  u._id,
            name:    u.fullName || 'User',
            country: u.country  || '🌍',
          });
        }
      }

      if (pool.length === 0)
        return next(new AppError('No tickets sold — cannot draw a winner', 400));

      const winnerIdx = Math.floor(Math.random() * pool.length);
      const winner    = pool[winnerIdx];
      const masked    = maskName(winner.name);

      lottery.status     = 'drawn';
      lottery.winner     = { userId: winner.userId, ticketIndex: winnerIdx, drawnAt: new Date() };
      lottery.winnerInfo = { name: winner.name, country: winner.country, maskedName: masked };
      await lottery.save();

      const wallet = await Wallet.findOne({ userId: winner.userId, asset: 'USDT' });
      if (wallet) {
        await wallet.credit(lottery.prizeAmount);
        await Transaction.create({
          userId:      winner.userId,
          walletId:    wallet._id,
          type:        'commission',
          asset:       'USDT',
          amount:      lottery.prizeAmount,
          fee:         0,
          netAmount:   lottery.prizeAmount,
          status:      'completed',
          completedAt: new Date(),
          metadata:    { lotteryId: lottery._id },
        });
      }

      await Notification.create({
        userId:  winner.userId,
        title:   '🎉 You Won the Lottery!',
        message: `Congratulations! You won $${lottery.prizeAmount} ${lottery.prizeAsset} in "${lottery.title}"! The prize has been credited to your USDT wallet.`,
        type:    'success',
        link:    '/lottery',
      });

      await AdminLog.create({
        adminId:    req.authUser!.userId,
        action:     'lottery_drawn',
        targetId:   lottery._id,
        targetType: 'Lottery',
        details: {
          winner:    winner.name,
          masked,
          prize:     lottery.prizeAmount,
          totalPool: pool.length,
        },
      });

      res.json({
        success: true,
        message: `Winner drawn: ${masked}`,
        data: {
          winner:      masked,
          prizeAmount: lottery.prizeAmount,
          totalPool:   pool.length,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: List all lotteries + stats
   GET /lottery/admin/all
───────────────────────────────────────────────────────────────────────── */
router.get(
  '/admin/all',
  adminOnly,
  [
    qv('page').optional().isInt({ min: 1 }).toInt(),
    qv('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    qv('status').optional().isIn(['upcoming', 'open', 'drawn', 'cancelled']),
  ],
  validate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page   = (req.query.page  as unknown as number) || 1;
      const limit  = (req.query.limit as unknown as number) || 20;
      const skip   = (page - 1) * limit;
      const filter = req.query.status ? { status: req.query.status as string } : {};

      const [lotteries, total] = await Promise.all([
        Lottery.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('createdBy', 'fullName'),
        Lottery.countDocuments(filter),
      ]);

      const [statsRaw] = await Lottery.aggregate([
        {
          $group: {
            _id:         null,
            allTotal:    { $sum: 1 },
            openCount:   { $sum: { $cond: [{ $eq: ['$status', 'open'] },      1, 0] } },
            drawnCount:  { $sum: { $cond: [{ $eq: ['$status', 'drawn'] },     1, 0] } },
            cancelCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          },
        },
      ]);

      const [ticketTotalRaw] = await Lottery.aggregate([
        { $unwind: '$tickets' },
        { $group: { _id: null, total: { $sum: '$tickets.quantity' } } },
      ]);

      const stats = {
        total:            statsRaw?.allTotal    ?? 0,
        open:             statsRaw?.openCount   ?? 0,
        drawn:            statsRaw?.drawnCount  ?? 0,
        cancelled:        statsRaw?.cancelCount ?? 0,
        totalTicketsSold: ticketTotalRaw?.total ?? 0,
        totalRevenue:    (ticketTotalRaw?.total ?? 0) * TICKET_PRICE,
      };

      res.json({
        success: true,
        data: {
          lotteries,
          stats,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Single lottery detail
   GET /lottery/admin/:id
───────────────────────────────────────────────────────────────────────── */
router.get(
  '/admin/:id',
  adminOnly,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const lottery = await Lottery.findById(req.params.id)
        .populate('tickets.userId', 'fullName email country')
        .populate('createdBy', 'fullName email');

      if (!lottery) return next(new AppError('Lottery not found', 404));

      const totalTickets = sumTickets(lottery.tickets);

      res.json({
        success: true,
        data: {
          lottery,
          totalTickets,
          revenue:            totalTickets * TICKET_PRICE,
          uniqueParticipants: new Set(lottery.tickets.map(t => t.userId.toString())).size,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);

export default router;