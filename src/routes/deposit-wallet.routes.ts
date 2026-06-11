import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import QRCode from 'qrcode';
import { protect, adminOnly } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadRankImage, getFileUrl } from '../middlewares/upload.middleware';
import { DepositWallet } from '../models/CMS.models';
import { AdminLog } from '../models/index';
import { AppError } from '../middlewares/error.middleware';

const router = Router();

// ─── PUBLIC: Get all active deposit networks ──────────────────────────────────
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const wallets = await DepositWallet.find({ isActive: true })
      .select('-changeLog -createdBy -updatedBy');
    res.json({ success: true, data: wallets });
  } catch (e) { next(e); }
});

// ─── PUBLIC: Get active deposit wallets for a coin ────────────────────────────
// NOTE: must be defined AFTER /admin/all to avoid "all" being treated as a coin
router.get('/:coin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wallets = await DepositWallet.find({
      coin:     req.params.coin.toUpperCase(),
      isActive: true,
    }).select('-changeLog -createdBy');
    res.json({ success: true, data: wallets });
  } catch (e) { next(e); }
});

// ─── ADMIN: Get all wallets (including inactive) ──────────────────────────────
router.get('/admin/all',
  protect, adminOnly,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const wallets = await DepositWallet.find()
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 });
      res.json({ success: true, data: wallets });
    } catch (e) { next(e); }
  },
);

// ─── ADMIN: Add new deposit wallet address ────────────────────────────────────
router.post(
  '/admin',
  protect, adminOnly,
  uploadRankImage.single('qrImage'),
  [
    body('coin').notEmpty().toUpperCase(),
    body('network').isIn(['BEP20', 'TRC20', 'ERC20', 'BTC', 'SOL']),
    body('walletAddress').notEmpty().isLength({ min: 10, max: 100 }),
    body('label').optional().isString(),
    body('memo').optional().isString(),
    body('minDeposit').optional().isFloat({ min: 0 }),
    body('confirmationsRequired').optional().isInt({ min: 1, max: 100 }),
    body('explorerLink').optional().isURL(),
    body('depositInstructions').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.authUser!.userId;
      const {
        coin, network, walletAddress, label, memo,
        minDeposit, confirmationsRequired, explorerLink, depositInstructions,
      } = req.body;

      const qrDataUrl = await QRCode.toDataURL(walletAddress, {
        width:  300,
        margin: 2,
        color:  { dark: '#000000', light: '#ffffff' },
      });

      const depositWallet = await DepositWallet.create({
        coin,
        network,
        walletAddress,
        label:                 label || `${coin} ${network}`,
        memo,
        minDeposit:            minDeposit || 10,
        confirmationsRequired: confirmationsRequired || 3,
        explorerLink,
        depositInstructions,
        qrCodeGenerated:       qrDataUrl,
        qrCodeUrl:             req.file ? getFileUrl('ranks', req.file.filename) : undefined,
        isActive:              true,
        createdBy:             adminId,
      });

      await AdminLog.create({
        adminId,
        action:  'deposit_wallet_added',
        details: { coin, network, walletAddress: walletAddress.substring(0, 10) + '...' },
        ip:      req.ip,
      });

      res.status(201).json({ success: true, message: 'Deposit wallet added', data: depositWallet });
    } catch (e) { next(e); }
  },
);

// ─── ADMIN: Update deposit wallet ─────────────────────────────────────────────
router.patch(
  '/admin/:walletId',
  protect, adminOnly,
  uploadRankImage.single('qrImage'),
  param('walletId').isMongoId(),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId  = req.authUser!.userId;
      const existing = await DepositWallet.findById(req.params.walletId);
      if (!existing) return next(new AppError('Deposit wallet not found', 404));

      const allowed = [
        'walletAddress', 'label', 'memo', 'minDeposit', 'confirmationsRequired',
        'explorerLink', 'depositInstructions', 'isActive', 'isMaintenanceMode', 'maintenanceMessage',
      ];

      const updates: Record<string, unknown> = {};
      const changelog: Array<{
        field:     string;
        oldValue:  string;
        newValue:  string;
        changedBy: string;
        changedAt: Date;
      }> = [];

      for (const field of allowed) {
        const incoming = req.body[field];
       const current = (existing as unknown as Record<string, unknown>)[field];
        if (incoming !== undefined && incoming !== current) {
          changelog.push({ field, oldValue: String(current), newValue: String(incoming), changedBy: adminId, changedAt: new Date() });
          updates[field] = incoming;
        }
      }

      if (req.file) {
        updates.qrCodeUrl = getFileUrl('ranks', req.file.filename);
      }

      if (updates.walletAddress) {
        updates.qrCodeGenerated = await QRCode.toDataURL(updates.walletAddress as string, { width: 300, margin: 2 });
      }

      updates.updatedBy = adminId;

      const wallet = await DepositWallet.findByIdAndUpdate(
        req.params.walletId,
        { ...updates, $push: { changeLog: { $each: changelog } } },
        { new: true },
      );

      await AdminLog.create({
        adminId,
        action:   'deposit_wallet_updated',
        targetId: req.params.walletId,
        details:  { changes: changelog.length },
        ip:       req.ip,
      });

      res.json({ success: true, message: 'Deposit wallet updated', data: wallet });
    } catch (e) { next(e); }
  },
);

// ─── ADMIN: Toggle wallet active/maintenance ──────────────────────────────────
router.patch(
  '/admin/:walletId/toggle',
  protect, adminOnly,
  param('walletId').isMongoId(),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallet = await DepositWallet.findById(req.params.walletId);
      if (!wallet) return next(new AppError('Not found', 404));

      wallet.isActive = !wallet.isActive;
      await wallet.save();

      res.json({
        success: true,
        message: `Deposit wallet ${wallet.isActive ? 'enabled' : 'disabled'}`,
        data:    wallet,
      });
    } catch (e) { next(e); }
  },
);

// ─── ADMIN: Delete wallet ─────────────────────────────────────────────────────
router.delete(
  '/admin/:walletId',
  protect, adminOnly,
  param('walletId').isMongoId(),
  validate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await DepositWallet.findByIdAndDelete(_req.params.walletId);
      res.json({ success: true, message: 'Deposit wallet deleted' });
    } catch (e) { next(e); }
  },
);

export default router;