import { Router, Request, Response, NextFunction } from 'express';
import { body, param } from 'express-validator';
import { protect, adminOnly } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadRankImage, getFileUrl } from '../middlewares/upload.middleware';
import { UserRank, RankRewardImage, SalaryRecord, RANK_CONFIG } from '../models/Rank.model';
import { User } from '../models/User.model.new';
import { Wallet } from '../models/Wallet.model';
import { Transaction } from '../models/Transaction.model';
import { Notification, AdminLog } from '../models/index';
import { AppError } from '../middlewares/error.middleware';

const router = Router();
router.use(protect);

// ─── GET all rank config (public) ─────────────────────────────────────────────
router.get('/config', (_req: Request, res: Response) => {
  res.json({ success: true, data: RANK_CONFIG });
});

// ─── GET my rank info ──────────────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.authUser!.userId;

    let userRank = await UserRank.findOne({ userId });
    if (!userRank) {
      userRank = await UserRank.create({ userId });
    }

    const [images, salaries] = await Promise.all([
      RankRewardImage.find({ userId }).sort({ createdAt: -1 }),
      SalaryRecord.find({ userId }).sort({ year: -1, month: -1 }).limit(12),
    ]);

    res.json({ success: true, data: { rank: userRank, images, salaries } });
  } catch (e) { next(e); }
});

// ─── GET rank leaderboard ──────────────────────────────────────────────────────
router.get('/leaderboard', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const leaders = await UserRank.find({ currentRank: { $gte: 1 } })
      .sort({ currentRank: -1, teamSize: -1 })
      .limit(50)
      .populate('userId', 'fullName avatar referralCode');
    res.json({ success: true, data: leaders });
  } catch (e) { next(e); }
});

// ─── GET rank showcase (public images) ────────────────────────────────────────
router.get('/showcase', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const images = await RankRewardImage.find({ isPublic: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'fullName avatar')
      .populate('adminId', 'fullName');
    res.json({ success: true, data: images });
  } catch (e) { next(e); }
});

// ─── SUBMIT rank claim ─────────────────────────────────────────────────────────
router.post(
  '/claim',
  body('targetRank').isInt({ min: 2, max: 8 }),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.authUser!.userId;
      const { targetRank } = req.body;

      const userRank = await UserRank.findOne({ userId });
      if (!userRank) return next(new AppError('Rank record not found', 404));

      if (targetRank !== userRank.currentRank + 1) {
        return next(new AppError('You can only claim the next rank in sequence', 400));
      }
      if (userRank.claimStatus === 'image_pending') {
        return next(new AppError('You already have a pending rank claim', 400));
      }

      const rankReq = RANK_CONFIG[targetRank as keyof typeof RANK_CONFIG];
      if (userRank.teamSize < rankReq.requiredTeamSize) {
        return next(new AppError(`Need ${rankReq.requiredTeamSize} team members (have ${userRank.teamSize})`, 400));
      }
      if (userRank.directReferrals < rankReq.requiredReferrals) {
        return next(new AppError(`Need ${rankReq.requiredReferrals} referrals (have ${userRank.directReferrals})`, 400));
      }

      await UserRank.findOneAndUpdate(
        { userId },
        {
          pendingClaimRank:  targetRank,
          claimStatus:       'image_pending',
          claimSubmittedAt:  new Date(),
        },
      );

      const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } }).select('_id');
      await Notification.insertMany(admins.map(a => ({
        userId:  a._id,
        title:   '🏆 Rank Claim — Image Required',
        message: `User submitted rank claim for ${rankReq.name}. Please upload the rank certificate image.`,
        type:    'info',
        link:    `/admin/ranks?userId=${userId}`,
      })));

      res.json({
        success: true,
        message: 'Rank claim submitted. An admin will upload your rank certificate image shortly.',
      });
    } catch (e) { next(e); }
  },
);

// ─── ACK rank reward image ─────────────────────────────────────────────────────
router.post(
  '/images/:imageId/acknowledge',
  param('imageId').isMongoId(),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const image = await RankRewardImage.findOneAndUpdate(
        { _id: req.params.imageId, userId: req.authUser!.userId },
        { userAcknowledged: true, acknowledgedAt: new Date() },
        { new: true },
      );
      if (!image) return next(new AppError('Image not found', 404));
      res.json({ success: true, message: 'Rank image acknowledged', data: image });
    } catch (e) { next(e); }
  },
);

// ─── SHARE rank image to feed ──────────────────────────────────────────────────
router.post(
  '/images/:imageId/share',
  param('imageId').isMongoId(),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const image = await RankRewardImage.findOneAndUpdate(
        { _id: req.params.imageId, userId: req.authUser!.userId },
        { sharedToFeed: true },
        { new: true },
      );
      if (!image) return next(new AppError('Image not found', 404));
      res.json({ success: true, message: 'Rank achievement shared to showcase', data: image });
    } catch (e) { next(e); }
  },
);

// ─── CLAIM monthly salary reward ──────────────────────────────────────────────
router.post('/salary/claim', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId  = req.authUser!.userId;
    const userRank = await UserRank.findOne({ userId });

    if (!userRank || userRank.currentRank < 1) {
      return next(new AppError('No active rank found', 400));
    }

    const rankCfg = RANK_CONFIG[userRank.currentRank as keyof typeof RANK_CONFIG];
    if (!rankCfg) return next(new AppError('Invalid rank', 400));

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const existingClaim = await SalaryRecord.findOne({ userId, year, month });
    if (existingClaim) {
      return next(new AppError('Monthly salary already claimed for this month', 400));
    }

    const salaryAmount = rankCfg.monthlyRewardUSD;

    let salaryWallet = await Wallet.findOne({ userId, asset: 'SALARY' });
    if (!salaryWallet) {
      salaryWallet = await Wallet.create({ userId, asset: 'SALARY', walletType: 'salary' });
    }
    await salaryWallet.credit(salaryAmount);

    await Promise.all([
      SalaryRecord.create({ userId, rankLevel: userRank.currentRank, amount: salaryAmount, year, month, paidAt: now }),
      Transaction.create({
        userId,
        walletId:    salaryWallet._id,
        type:        'salary_reward',
        asset:       'SALARY',
        amount:      salaryAmount,
        fee:         0,
        netAmount:   salaryAmount,
        status:      'completed',
        completedAt: now,
      }),
      Notification.create({
        userId,
        title:   `💰 Monthly Salary Credited — $${salaryAmount}`,
        message: `Your ${rankCfg.name} monthly salary of $${salaryAmount} has been credited to your Salary wallet.`,
        type:    'success',
        link:    '/wallet',
      }),
    ]);

    res.json({
      success: true,
      message: `Monthly salary of $${salaryAmount} credited!`,
      data:    { amount: salaryAmount, monthKey: `${year}-${month}` },
    });
  } catch (e) { next(e); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════════
router.use(adminOnly);

// ─── GET all pending rank claims ───────────────────────────────────────────────
router.get('/admin/pending-claims', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pending = await UserRank.find({ claimStatus: 'image_pending' })
      .populate('userId', 'fullName email avatar referralCode')
      .sort({ claimSubmittedAt: 1 });
    res.json({ success: true, data: pending });
  } catch (e) { next(e); }
});

// ─── GET user rank details ─────────────────────────────────────────────────────
router.get('/admin/user/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [userRank, images, salaries] = await Promise.all([
      UserRank.findOne({ userId: req.params.userId }).populate('userId', 'fullName email avatar'),
      RankRewardImage.find({ userId: req.params.userId }).populate('adminId', 'fullName'),
      SalaryRecord.find({ userId: req.params.userId }).sort({ year: -1, month: -1 }),
    ]);
    res.json({ success: true, data: { rank: userRank, images, salaries } });
  } catch (e) { next(e); }
});

// ─── UPLOAD rank image + approve claim ────────────────────────────────────────
router.post(
  '/admin/upload-image',
  uploadRankImage.single('rankImage'),
  [
    body('userId').isMongoId().withMessage('Valid userId required'),
    body('rankLevel').isInt({ min: 1, max: 8 }).withMessage('Valid rank level required'),
    body('message').optional().isString().isLength({ max: 500 }),
    body('isPublic').optional().isBoolean(),
    body('approveClaim').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = req.authUser!.userId;

      if (!req.file) {
        return next(new AppError('Rank certificate image is required. Please upload an image file.', 400));
      }

      const { userId, rankLevel, message, isPublic = true, approveClaim = true } = req.body;
      const level  = parseInt(rankLevel) as keyof typeof RANK_CONFIG;
      const config = RANK_CONFIG[level];
      if (!config) return next(new AppError('Invalid rank level', 400));

      const user = await User.findById(userId);
      if (!user) return next(new AppError('User not found', 404));

      const imageUrl  = getFileUrl('ranks', req.file.filename);
      const imagePath = req.file.path;

      const rankImage = await RankRewardImage.create({
        userId,
        adminId,
        rankLevel:  level,
        rankName:   config.name,
        imagePath,
        imageUrl,
        isPublic:   Boolean(isPublic),
        message:    message || `Congratulations! You have achieved ${config.name} rank! ${config.badge}`,
        sharedToFeed: false,
      });

      if (approveClaim) {
        const userRank = await UserRank.findOne({ userId });
        if (userRank && userRank.claimStatus === 'image_pending' && userRank.pendingClaimRank === level) {
          await Promise.all([
            UserRank.findOneAndUpdate(
              { userId },
              {
                currentRank:          level,
                highestRankAchieved:  Math.max(level, userRank.highestRankAchieved),
                $addToSet:            { completedRankLevels: level },
                claimStatus:          'approved',
                claimApprovedAt:      new Date(),
                reviewedBy:           adminId,
                pendingClaimRank:     undefined,
              },
            ),
            User.findByIdAndUpdate(userId, { rank: config.name }),
          ]);
        }
      }

      await Promise.all([
        Notification.create({
          userId,
          title:   `${config.badge} Rank Achieved: ${config.name}!`,
          message: message || `Congratulations! Your rank certificate has been issued. You are now a ${config.name}!`,
          type:    'success',
          link:    '/ranks',
          metadata: { rankLevel: level, rankName: config.name, imageId: rankImage._id },
        }),
        AdminLog.create({
          adminId,
          action:     'rank_image_uploaded',
          targetType: 'User',
          targetId:   userId,
          details:    { rankLevel: level, rankName: config.name, imageId: rankImage._id, approveClaim },
          ip:         req.ip,
        }),
      ]);

      const io = req.app.get('io');
      io?.to(`user:${userId}`).emit('rank:image_received', {
        rankLevel: level,
        rankName:  config.name,
        imageUrl,
        message:   rankImage.message,
      });

      res.status(201).json({
        success: true,
        message: `Rank image uploaded and sent to ${user.fullName}`,
        data:    rankImage,
      });
    } catch (e) { next(e); }
  },
);

// ─── REJECT rank claim ─────────────────────────────────────────────────────────
router.post(
  '/admin/reject-claim',
  [
    body('userId').isMongoId(),
    body('reason').notEmpty().isLength({ max: 300 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, reason } = req.body;

      const userRank = await UserRank.findOneAndUpdate(
        { userId, claimStatus: 'image_pending' },
        {
          claimStatus:      'rejected',
          claimRejectedAt:  new Date(),
          claimNote:        reason,
          reviewedBy:       req.authUser!.userId,
          pendingClaimRank: undefined,
        },
        { new: true },
      );
      if (!userRank) return next(new AppError('No pending claim found for this user', 404));

      await Notification.create({
        userId,
        title:   'Rank Claim Rejected',
        message: `Your rank claim was rejected. Reason: ${reason}`,
        type:    'warning',
        link:    '/ranks',
      });

      res.json({ success: true, message: 'Rank claim rejected' });
    } catch (e) { next(e); }
  },
);

// ─── MANUALLY update user rank ─────────────────────────────────────────────────
router.patch(
  '/admin/user/:userId/rank',
  [
    param('userId').isMongoId(),
    body('rankLevel').isInt({ min: 1, max: 8 }),
    body('teamSize').optional().isInt({ min: 0 }),
    body('directReferrals').optional().isInt({ min: 0 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rankLevel, teamSize, directReferrals } = req.body;
      const level  = parseInt(rankLevel) as keyof typeof RANK_CONFIG;
      const config = RANK_CONFIG[level];

      const updates: Record<string, unknown> = {
        currentRank:         level,
        highestRankAchieved: level,
        $addToSet:           { completedRankLevels: level },
      };
      if (teamSize         !== undefined) updates.teamSize         = teamSize;
      if (directReferrals  !== undefined) updates.directReferrals  = directReferrals;

      await Promise.all([
        UserRank.findOneAndUpdate({ userId: req.params.userId }, updates, { upsert: true }),
        User.findByIdAndUpdate(req.params.userId, { rank: config.name }),
        AdminLog.create({
          adminId:    req.authUser!.userId,
          action:     'rank_manually_updated',
          targetType: 'User',
          targetId:   req.params.userId,
          details:    { rankLevel, rankName: config.name },
        }),
      ]);

      res.json({ success: true, message: `User rank updated to ${config.name}` });
    } catch (e) { next(e); }
  },
);

// ─── DISBURSE monthly salary ───────────────────────────────────────────────────
router.post(
  '/admin/disburse-salary',
  [
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2024 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { month, year } = req.body;

      const userRanks = await UserRank.find({ currentRank: { $gte: 1 } }).populate('userId', '_id');

      let disbursed = 0;
      const errors: string[] = [];

      for (const ur of userRanks) {
        try {
          const existing = await SalaryRecord.findOne({ userId: ur.userId, month, year });
          if (existing) continue;

          const config = RANK_CONFIG[ur.currentRank as keyof typeof RANK_CONFIG];
          const amount = config.monthlyRewardUSD;

          const wallet = await Wallet.findOne({ userId: ur.userId, asset: 'MAIN' });
          if (!wallet) continue;

          await wallet.credit(amount);

          const tx = await Transaction.create({
            userId:      ur.userId,
            walletId:    wallet._id,
            type:        'registration_bonus',
            asset:       'MAIN',
            amount,
            fee:         0,
            netAmount:   amount,
            status:      'completed',
            completedAt: new Date(),
            metadata:    { type: 'rank_salary', rankLevel: ur.currentRank, month, year },
          });

          await Promise.all([
            SalaryRecord.create({
              userId:        ur.userId,
              rankLevel:     ur.currentRank,
              rankName:      config.name,
              amount,
              month,
              year,
              status:        'paid',
              paidAt:        new Date(),
              walletId:      wallet._id,
              transactionId: tx._id,
            }),
            Notification.create({
              userId:  ur.userId,
              title:   `💰 Monthly Salary: $${amount}`,
              message: `Your ${config.name} rank salary of $${amount} for ${month}/${year} has been credited.`,
              type:    'success',
              link:    '/wallet',
            }),
          ]);

          disbursed++;
        } catch (err) {
          errors.push(`Failed for user ${ur.userId}: ${(err as Error).message}`);
        }
      }

      await AdminLog.create({
        adminId: req.authUser!.userId,
        action:  'salary_disbursed',
        details: { month, year, disbursed, errors: errors.length },
      });

      res.json({
        success: true,
        message: `Salary disbursed to ${disbursed} users`,
        data:    { disbursed, errors },
      });
    } catch (e) { next(e); }
  },
);

export default router;