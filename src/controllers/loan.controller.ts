import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

import { Loan } from '../models/Loan.model';
import { Wallet } from '../models/Wallet.model';
import { Transaction, Notification, AdminLog } from '../models/index';
import { User } from '../models/User.model.new';
import { getFileUrl } from '../middlewares/upload.middleware';
import { AppError } from '../middlewares/error.middleware';

/* ─────────────────────────────────────────────────────────────────────────
   USER: Loan packages
   GET /loans/packages
───────────────────────────────────────────────────────────────────────── */
export const getLoanPackages = (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      eligibility: {
        tier1: {
          minBalance: 2001,
          maxBalance: 5000,
          supportPct: 50,
          note: 'Balance $2,001–$5,000: 50% loan support',
        },
        tier2: {
          minBalance: 5001,
          maxBalance: null,
          supportPct: 100,
          note: 'Balance $5,001+: 100% loan support',
        },
      },
      types: {
        trading:   { label: 'Trading Loan',  rate: 0.06, defaultDays: 50,  maxDays: 50,  minAmount: 100,  icon: '📈', desc: 'Automated trading capital' },
        business:  { label: 'Business Loan', rate: 0.06, defaultDays: 120, maxDays: 120, minAmount: 500,  icon: '💼', desc: 'Business growth and expansion' },
        house:     { label: 'Home Loan',     rate: 0.06, defaultDays: 90,  maxDays: 90,  minAmount: 1000, icon: '🏠', desc: 'Home purchase or renovation' },
        land:      { label: 'Land Loan',     rate: 0.06, defaultDays: 90,  maxDays: 180, minAmount: 1000, icon: '🌿', desc: 'Land purchase or development' },
        study:     { label: 'Student Loan',  rate: 0.06, defaultDays: 90,  maxDays: 90,  minAmount: 200,  icon: '📚', desc: 'Education and tuition fees' },
        emergency: { label: 'Emergency',     rate: 0.06, defaultDays: 14,  maxDays: 30,  minAmount: 50,   icon: '🚨', desc: 'Urgent financial needs' },
      },
      requirements: [
        'Valid NID card photo',
        'Clear selfie',
        'Minimum balance threshold',
        'KYC approved',
      ],
    },
  });
};

/* ─────────────────────────────────────────────────────────────────────────
   USER: My loans
   GET /loans/my
───────────────────────────────────────────────────────────────────────── */
export const getMyLoans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.authUser!.userId;
    const { status, page = '1', limit = '10' } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = { userId };
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [loans, total] = await Promise.all([
      Loan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Loan.countDocuments(filter),
    ]);

    const all = await Loan.find({ userId });

    const totalBorrowed = all
      .filter(l => l.status !== 'rejected')
      .reduce((s, l) => s + l.requestedAmount, 0);
    const totalRepaid  = all.reduce((s, l) => s + l.totalPaid, 0);
    const activeLoans  = all.filter(l => l.status === 'active').length;
    const pendingLoans = all.filter(l => l.status === 'pending').length;

    res.json({
      success: true,
      data: {
        loans,
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        summary: { totalBorrowed, totalRepaid, activeLoans, pendingLoans },
      },
    });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   USER: Loan countdown
   GET /loans/my/countdown
───────────────────────────────────────────────────────────────────────── */
export const getMyLoanCountdown = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.authUser!.userId;
    const activeLoans = await Loan.find({ userId, status: 'active' });

    const data = activeLoans.map(loan => {
      const now       = Date.now();
      const due       = loan.dueDate ? new Date(loan.dueDate).getTime() : 0;
      const msLeft    = Math.max(0, due - now);
      const daysLeft  = Math.floor(msLeft / 86400000);
      const hoursLeft = Math.floor((msLeft % 86400000) / 3600000);
      const minsLeft  = Math.floor((msLeft % 3600000) / 60000);
      const secsLeft  = Math.floor((msLeft % 60000) / 1000);
      const totalDays = loan.repaymentPeriodDays;
      const elapsed   = totalDays - daysLeft;
      const progress  = Math.min(100, (elapsed / totalDays) * 100);
      const repayPct  = loan.totalRepayable ? (loan.totalPaid / loan.totalRepayable) * 100 : 0;
      const isOverdue = due > 0 && due < now;

      return {
        loanId:              loan._id,
        loanType:            loan.loanType,
        status:              loan.status,
        requestedAmount:     loan.requestedAmount,
        approvedAmount:      loan.approvedAmount,
        totalRepayable:      loan.totalRepayable,
        totalPaid:           loan.totalPaid,
        remainingAmount:     Math.max(0, (loan.totalRepayable || 0) - loan.totalPaid),
        disbursedAt:         loan.disbursedAt,
        dueDate:             loan.dueDate,
        repaymentPeriodDays: loan.repaymentPeriodDays,
        daysLeft,
        hoursLeft,
        minsLeft,
        secsLeft,
        timeLeft:      `${daysLeft}d ${hoursLeft}h ${minsLeft}m`,
        totalDays,
        elapsedDays:   elapsed,
        timeProgress:  progress,
        repayProgress: repayPct,
        isOverdue,
        urgency: isOverdue
          ? 'overdue'
          : daysLeft <= 3
            ? 'critical'
            : daysLeft <= 7
              ? 'warning'
              : 'normal',
      };
    });

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   USER: Apply for loan
   POST /loans/apply
───────────────────────────────────────────────────────────────────────── */
export const applyForLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.authUser!.userId;
    const files = req.files as unknown as { [fieldname: string]: Express.Multer.File[] };

    const {
      loanType,
      requestedAmount,
      purpose,
      repaymentPeriodDays,
      applicantName,
      applicantEmail,
      nidNumber,
    } = req.body;

    /* ── Duplicate active/pending loan block ── */
    const existingLoan = await Loan.findOne({
      userId,
      status: { $in: ['pending', 'active'] },
    });

    if (existingLoan) {
      return next(
        new AppError(
          'You already have a pending or active loan. Please repay it first.',
          400,
        ),
      );
    }

    /* ── Balance eligibility check ── */
    const usdtWallet  = await Wallet.findOne({ userId, asset: 'USDT' });
    const usdtBalance = usdtWallet?.balance || 0;

    if (usdtBalance < 2001) {
      return next(
        new AppError(
          `Minimum USDT balance of $2,001 required. Your balance: $${usdtBalance.toFixed(2)}`,
          400,
        ),
      );
    }

    const maxLoan = usdtBalance >= 5001 ? usdtBalance : usdtBalance * 0.5;

    if (parseFloat(requestedAmount) > maxLoan) {
      return next(
        new AppError(
          `Max loan is $${maxLoan.toFixed(2)} (${usdtBalance >= 5001 ? '100%' : '50%'} of your $${usdtBalance.toFixed(2)} balance)`,
          400,
        ),
      );
    }

    const nidPhotoUrl = files.nidPhoto?.[0]
      ? getFileUrl('loans', files.nidPhoto[0].filename)
      : undefined;
    const selfieUrl = files.selfie?.[0]
      ? getFileUrl('loans', files.selfie[0].filename)
      : undefined;

    const interestRate   = 0.06;
    const days           = parseInt(repaymentPeriodDays);
    const totalInterest  = parseFloat(requestedAmount) * interestRate * (days / 30);
    const totalRepayable = parseFloat(requestedAmount) + totalInterest;

    const loan = await Loan.create({
      userId,
      loanType,
      requestedAmount:     parseFloat(requestedAmount),
      purpose,
      repaymentPeriodDays: days,
      interestRate,
      totalRepayable,
      monthlyInstallment:  totalRepayable / (days / 30),
      applicantName,
      applicantEmail,
      nidNumber,
      nidPhotoUrl,
      selfieUrl,
      status: 'pending',
    });

    await Notification.create({
      userId,
      title:   '📋 Loan Application Received',
      message: `Your ${loanType} loan application of $${requestedAmount} has been submitted. We'll review within 24 hours.`,
      type:    'info',
      link:    '/loans',
    });

    const admins = await User.find({
      role: { $in: ['admin', 'super_admin', 'finance_admin'] },
    }).select('_id');

    await Notification.insertMany(
      admins.map(a => ({
        userId:  a._id,
        title:   `💰 New Loan Application — $${requestedAmount}`,
        message: `${applicantName} applied for a ${loanType} loan. Review required.`,
        type:    'info',
        link:    '/admin/loans',
      })),
    );

    await AdminLog.create({
      adminId:     userId,
      action:      'loan_application',
      target:      loan._id,
      targetModel: 'Loan',
      details:     { amount: requestedAmount, type: loanType },
    });

    res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully! Review takes up to 24 hours.',
      data: loan,
    });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   USER: Repay loan
   POST /loans/:loanId/repay
───────────────────────────────────────────────────────────────────────── */
export const repayLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.authUser!.userId;
    const loan = await Loan.findOne({
      _id: req.params.loanId,
      userId,
      status: 'active',
    });

    if (!loan) return next(new AppError('Active loan not found', 404));

    const payAmount = parseFloat(req.body.amount);
    const remaining = (loan.totalRepayable || 0) - loan.totalPaid;

    if (payAmount > remaining) {
      return next(new AppError(`Maximum repayment is $${remaining.toFixed(2)}`, 400));
    }

    const wallet = await Wallet.findOne({ userId, asset: 'USDT' });

    if (!wallet || wallet.availableBalance < payAmount) {
      return next(new AppError('Insufficient USDT balance', 400));
    }

    await wallet.debit(payAmount);

    const tx = await Transaction.create({
      userId,
      walletId:    wallet._id,
      type:        'loan_repayment',
      asset:       'USDT',
      amount:      -payAmount,
      fee:         0,
      netAmount:   -payAmount,
      status:      'completed',
      completedAt: new Date(),
      metadata:    { loanId: loan._id },
    });

    loan.totalPaid += payAmount;
    loan.repaymentHistory.push({
      amount:        payAmount,
      paidAt:        new Date(),
      transactionId: tx._id as mongoose.Types.ObjectId,
    });

    if (loan.totalPaid >= (loan.totalRepayable || 0)) {
      loan.status = 'completed';

      await Notification.create({
        userId,
        title:   '🎉 Loan Fully Repaid!',
        message: `Congratulations! Your ${loan.loanType} loan has been fully repaid.`,
        type:    'success',
        link:    '/loans',
      });
    }

    await loan.save();

    res.json({
      success: true,
      message: `$${payAmount} repayment successful`,
      data: loan,
    });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: All loans
   GET /loans/admin/all
───────────────────────────────────────────────────────────────────────── */
export const getAllLoansForAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [loans, total] = await Promise.all([
      Loan.find(filter)
        .populate('userId', 'fullName email phone kycStatus')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Loan.countDocuments(filter),
    ]);

    const [pending, active, totalCount, pendingLoans] = await Promise.all([
      Loan.countDocuments({ status: 'pending' }),
      Loan.countDocuments({ status: 'active' }),
      Loan.countDocuments(),
      Loan.find({ status: 'pending' }),
    ]);

    const stats = {
      pending,
      active,
      total: totalCount,
      totalAmountPending: pendingLoans.reduce((s, l) => s + l.requestedAmount, 0),
    };

    res.json({
      success: true,
      data: { loans, total, page: parseInt(page), stats },
    });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Approve loan
   PATCH /loans/admin/:loanId/approve
───────────────────────────────────────────────────────────────────────── */
export const approveLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.authUser!.userId;
    const loan = await Loan.findOne({
      _id: req.params.loanId,
      status: 'pending',
    });

    if (!loan) return next(new AppError('Pending loan not found', 404));

    const approvedAmount = req.body.approvedAmount
      ? parseFloat(req.body.approvedAmount)
      : loan.requestedAmount;

    const rate = 0.06;
    const totalRepayable = approvedAmount * (1 + rate * (loan.repaymentPeriodDays / 30));

    let wallet = await Wallet.findOne({ userId: loan.userId, asset: 'MAIN' });
    if (!wallet) wallet = await Wallet.findOne({ userId: loan.userId, asset: 'USDT' });
    if (!wallet) return next(new AppError('User wallet not found', 404));

    await wallet.credit(approvedAmount);

    await Transaction.create({
      userId:      loan.userId,
      walletId:    wallet._id,
      type:        'loan_disbursement',
      asset:       wallet.asset,
      amount:      approvedAmount,
      fee:         0,
      netAmount:   approvedAmount,
      status:      'completed',
      completedAt: new Date(),
      metadata:    { loanId: loan._id },
    });

    await Loan.findByIdAndUpdate(loan._id, {
      status:             'active',
      approvedAmount,
      disbursedAmount:    approvedAmount,
      totalRepayable,
      monthlyInstallment: totalRepayable / (loan.repaymentPeriodDays / 30),
      approvedBy:         adminId,
      approvedAt:         new Date(),
      disbursedAt:        new Date(),
      dueDate:            new Date(Date.now() + loan.repaymentPeriodDays * 86400000),
      walletId:           wallet._id,
      adminNote:          req.body.adminNote,
    });

    await Notification.create({
      userId:  loan.userId,
      title:   '✅ Loan Approved & Disbursed!',
      message: `Your ${loan.loanType} loan of $${approvedAmount} has been approved and credited to your wallet.`,
      type:    'success',
      link:    '/loans',
    });

    await AdminLog.create({
      adminId,
      action:      'loan_approved',
      target:      loan._id,
      targetModel: 'Loan',
      details:     { approvedAmount, adminNote: req.body.adminNote },
    });

    res.json({
      success: true,
      message: `Loan approved and $${approvedAmount} disbursed`,
      data: { approvedAmount },
    });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Reject loan
   PATCH /loans/admin/:loanId/reject
───────────────────────────────────────────────────────────────────────── */
export const rejectLoan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loan = await Loan.findOneAndUpdate(
      { _id: req.params.loanId, status: 'pending' },
      {
        status:    'rejected',
        adminNote: req.body.reason,
        rejectedAt:new Date(),
      },
      { new: true },
    );

    if (!loan) return next(new AppError('Pending loan not found', 404));

    await Notification.create({
      userId:  loan.userId,
      title:   '❌ Loan Application Rejected',
      message: `Your ${loan.loanType} loan application was rejected. Reason: ${req.body.reason}`,
      type:    'error',
      link:    '/loans',
    });

    res.json({ success: true, message: 'Loan rejected', data: loan });
  } catch (e) {
    next(e);
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN: Run daily defaults
   POST /loans/admin/run-defaults
───────────────────────────────────────────────────────────────────────── */
export const runLoanDefaults = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const now = new Date();
    const overdue = await Loan.find({ status: 'active', dueDate: { $lt: now } });
    let defaulted = 0;

    for (const loan of overdue) {
      await Loan.findByIdAndUpdate(loan._id, { status: 'defaulted' });

      await Notification.create({
        userId:  loan.userId,
        title:   '⚠️ Loan Defaulted',
        message: `Your ${loan.loanType} loan of $${loan.requestedAmount} has been marked as defaulted due to missed repayment deadline.`,
        type:    'error',
        link:    '/loans',
      });

      defaulted++;
    }

    res.json({ success: true, data: { checked: overdue.length, defaulted } });
  } catch (e) {
    next(e);
  }
};
