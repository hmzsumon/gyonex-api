import mongoose from "mongoose";
import AiAccount from "@/models/AiAccount.model";
import { User } from "@/models/user.model";
import Transaction from "@/models/Transaction.model";
import SystemStats from "@/models/SystemStats.model";
import { SmartTradeSetting, getSmartTradeSettings } from "@/models/SmartTradeSetting.model";
import { syncSmartAccount, smartAccountView, refreshSmartEligibility } from "@/services/smartTradeLifecycle.service";
import { money } from "@/utils/smartTradePolicy";
import { catchAsync } from "@/utils/catchAsync";
import { ApiError } from "@/utils/ApiError";

export const getSmartSettings = catchAsync(async (_req, res) => {
  const settings = await getSmartTradeSettings();
  res.json({ success: true, settings: { cancellationFeePercent: settings.cancellationFeePercent } });
});

export const updateSmartSettings = catchAsync(async (req, res) => {
  const fee = req.body.cancellationFeePercent;
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0 || fee > 100)
    throw new ApiError(400, "Cancellation fee must be a number between 0 and 100");
  const settings = await SmartTradeSetting.findOneAndUpdate({ key: "global" }, {
    $set: { cancellationFeePercent: fee, updatedBy: req.user!._id },
  }, { upsert: true, new: true, runValidators: true });
  res.json({ success: true, settings: { cancellationFeePercent: settings.cancellationFeePercent } });
});

export const cancelSmartAccount = catchAsync(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid account ID");
  const userId = req.user!._id;
  const settings = await getSmartTradeSettings();
  const session = await mongoose.startSession();
  let result: any;
  try {
    await session.withTransaction(async () => {
      const account = await AiAccount.findOne({ _id: req.params.id, userId, role: "user" }).session(session).lean();
      if (!account) throw new ApiError(404, "Smart Trade account not found");
      await syncSmartAccount(account, session);
      const view = smartAccountView(account, settings.cancellationFeePercent);
      if (!view.canCancel) throw new ApiError(400, "Only active accounts within their first calendar month can be cancelled");
      const fee = money(Number(account.planPrice) * settings.cancellationFeePercent / 100);
      const refund = money(Number(account.planPrice) - fee);
      const updated = await AiAccount.updateOne({ _id: account._id, status: "active", is_active: { $ne: false } }, {
        $set: { status: "inactive", is_active: false, balance: 0, equity: 0, cancelledAt: new Date(),
          cancellationFeePercent: settings.cancellationFeePercent, cancellationFee: fee, cancellationRefund: refund },
      }, { session });
      if (!updated.modifiedCount) throw new ApiError(409, "Account has already changed; refresh and try again");
      const user = await User.findByIdAndUpdate(userId, { $inc: { m_balance: refund } }, { new: true, session });
      if (!user) throw new ApiError(404, "User not found");
      await Transaction.create([{
        userId, customerId: user.customerId, unique_id: String(Math.floor(1e9 + Math.random() * 9e9)),
        amount: refund, transactionType: "cashIn", purpose: "Refund", isCashIn: true, isCashOut: false,
        previous_m_balance: money(Number(user.m_balance) - refund), current_m_balance: user.m_balance,
        description: `Smart Trade ${account.accountNumber} cancellation: ${settings.cancellationFeePercent}% fee (${fee} USDT), ${refund} USDT refunded`,
      }], { session });
      await SystemStats.updateOne({}, { $inc: { "income.aiTradeCharge": fee } }, { session, upsert: true });
      await refreshSmartEligibility(userId, session);
      result = { fee, refund, feePercent: settings.cancellationFeePercent };
    });
  } finally { await session.endSession(); }
  res.json({ success: true, message: `Account cancelled. ${result.refund.toFixed(2)} USDT refunded to main balance.`, ...result });
});
