import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { protect } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { Wallet } from '../models/Wallet.model';
import { Transaction } from '../models/Transaction.model.new';
import { AppError } from '../middlewares/error.middleware';

const router = Router();
router.use(protect);

// GET /api/v1/wallets
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallets = await Wallet.find({ userId: req.authUser!.userId });
    res.json({ success: true, data: wallets });
  } catch (e) { next(e); }
});

// GET /api/v1/wallets/transactions
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const { type, asset } = req.query;

    const filter: Record<string, unknown> = { userId: req.authUser!.userId };
    if (type)  filter.type  = type;
    if (asset) filter.asset = (asset as string).toUpperCase();

    const [transactions, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Transaction.countDocuments(filter),
    ]);

    res.json({ success: true, data: { transactions, pagination: { page, limit, total } } });
  } catch (e) { next(e); }
});

// POST /api/v1/wallets/withdraw
router.post(
  '/withdraw',
  [
    body('asset').notEmpty().toUpperCase(),
    body('amount').isFloat({ min: 50 }).withMessage('Minimum withdrawal is $50'),
    body('toAddress').notEmpty(),
    body('network').notEmpty(),
    body('withdrawPin').isLength({ min: 4, max: 6 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId               = req.authUser!.userId;
      const { asset, amount, toAddress, network } = req.body;
      const fee       = amount * 0.08;
      const netAmount = amount - fee;

      const wallet = await Wallet.findOne({ userId, asset });
      if (!wallet) return next(new AppError('Wallet not found', 404));
      if (wallet.availableBalance < amount) return next(new AppError('Insufficient balance', 400));

      await wallet.lock(amount);

      const tx = await Transaction.create({
        userId,
        walletId: wallet._id,
        type:     'withdrawal',
        asset,
        amount,
        fee,
        netAmount,
        status:    'pending',
        toAddress,
        network,
      });

      res.status(201).json({ success: true, message: 'Withdrawal request submitted for approval', data: tx });
    } catch (e) { next(e); }
  },
);

// POST /api/v1/wallets/deposit/confirm
router.post('/deposit/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.authUser!.userId;
    const { txHash, asset, amount, network } = req.body;

    const wallet = await Wallet.findOne({ userId, asset });
    if (!wallet) return next(new AppError('Wallet not found', 404));

    const tx = await Transaction.create({
      userId,
      walletId: wallet._id,
      type:     'deposit',
      asset,
      amount,
      fee:      0,
      netAmount: amount,
      status:   'pending',
      txHash,
      network,
    });

    res.status(201).json({ success: true, message: 'Deposit submitted for admin review', data: tx });
  } catch (e) { next(e); }
});

// POST /api/v1/wallets/transfer
router.post(
  '/transfer',
  [
    body('fromAsset').notEmpty().toUpperCase(),
    body('toAsset').notEmpty().toUpperCase(),
    body('amount').isFloat({ min: 10 }).withMessage('Minimum transfer is $10'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.authUser!.userId;
      const { fromAsset, toAsset, amount } = req.body;

      if (fromAsset === toAsset) return next(new AppError('Cannot transfer to same wallet', 400));

      const [fromWallet, toWallet] = await Promise.all([
        Wallet.findOne({ userId, asset: fromAsset }),
        Wallet.findOne({ userId, asset: toAsset }),
      ]);

      if (!fromWallet) return next(new AppError('Source wallet not found', 404));
      if (!toWallet)   return next(new AppError('Destination wallet not found', 404));

      const fee       = amount * 0.05;
      const netAmount = amount - fee;

      if (fromWallet.availableBalance < amount) return next(new AppError('Insufficient balance', 400));

      await fromWallet.debit(amount);
      await toWallet.credit(netAmount);

      await Promise.all([
        Transaction.create({
          userId, walletId: fromWallet._id,
          type: 'transfer_out', asset: fromAsset,
          amount: -amount, fee, netAmount: -amount,
          status: 'completed', completedAt: new Date(),
          metadata: { toAsset, toWalletId: toWallet._id, fee },
        }),
        Transaction.create({
          userId, walletId: toWallet._id,
          type: 'transfer_in', asset: toAsset,
          amount: netAmount, fee: 0, netAmount,
          status: 'completed', completedAt: new Date(),
          metadata: { fromAsset, fromWalletId: fromWallet._id },
        }),
      ]);

      res.json({
        success: true,
        message: 'Transfer completed',
        data: {
          fromAsset, toAsset,
          sent:     amount,
          fee:      fee.toFixed(4),
          received: netAmount.toFixed(4),
        },
      });
    } catch (e) { next(e); }
  },
);

export default router;