import { Notification } from "@/models/Notification.model";
import SystemStats from "@/models/SystemStats.model";
import { User } from "@/models/user.model";
import Wallet from "@/models/UserWallet.model";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import TransactionManager from "@/utils/TransactionManager";
import { num } from "../utils/money";

/* ────────── Send Money (no session; atomic debit; no double credit) ────────── */
export const sendMoney: typeHandler = catchAsync(async (req, res, next) => {
  /* ────────── auth ────────── */
  const sender = req.user;
  if (!sender || !sender._id) {
    return next(new ApiError(401, "User not authenticated"));
  }

  /* ────────── input ────────── */
  const { amount, recipient_id } = req.body;
  if (!amount || amount <= 0 || !recipient_id) {
    return next(new ApiError(400, "Amount and recipient are required"));
  }

  const numAmount = num(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    return next(new ApiError(400, "Invalid amount"));
  }

  // self-transfer block
  if (String(recipient_id) === String(sender.customerId)) {
    return next(new ApiError(400, "You cannot send to yourself"));
  }

  /* ────────── constants ────────── */
  const fee = num(numAmount * 0.02);
  const grossAmount = num(numAmount + fee);

  /* ────────── fetch refs (no session) ────────── */
  const [company, recipient, senderWallet, recipientWallet] = await Promise.all(
    [
      SystemStats.findOne(),
      User.findOne({ customerId: recipient_id }),
      Wallet.findOne({ userId: sender._id }),
      User.findOne({ customerId: recipient_id }).then((u) =>
        u ? Wallet.findOne({ userId: u._id }) : null
      ),
    ]
  );

  if (!company) return next(new ApiError(404, "Company stats not found"));
  if (!recipient) return next(new ApiError(404, "Recipient not found"));
  if (!senderWallet) return next(new ApiError(404, "Sender wallet not found"));
  if (!recipientWallet)
    return next(new ApiError(404, "Recipient wallet not found"));

  /* ────────── atomic conditional DEBIT (prevents negative) ──────────
     - only debits if sender.m_balance >= grossAmount
     - returns the updated sender row if success; null if insufficient
  */
  const debited = await User.findOneAndUpdate(
    { _id: sender._id, m_balance: { $gte: grossAmount } },
    { $inc: { m_balance: -grossAmount } },
    { new: true }
  );

  if (!debited) {
    return next(new ApiError(400, "Insufficient balance"));
  }

  /* ────────── after-debit updates (no session) ──────────
     - if any step throws, we best-effort rollback sender debit
  */
  const txManager = new TransactionManager();

  let senderWalletDone = false;
  let recipientCredited = false;
  let recipientWalletDone = false;
  let companyDone = false;
  let cashOutTxDone = false;
  let cashInTxDone = false;
  let notifyCreated: any = null;

  try {
    /* ────────── sender wallet stats ────────── */
    await Wallet.updateOne(
      { _id: senderWallet._id },
      { $inc: { totalSend: numAmount } }
    );
    senderWalletDone = true;

    /* ────────── recipient CREDIT (single time) ────────── */
    await User.updateOne(
      { _id: recipient._id },
      { $inc: { m_balance: numAmount } }
    );
    recipientCredited = true;

    /* ────────── recipient wallet stats ────────── */
    await Wallet.updateOne(
      { _id: recipientWallet._id },
      { $inc: { totalReceive: numAmount } }
    );
    recipientWalletDone = true;

    /* ────────── cash out transactions ────────── */
    await txManager.createTransaction({
      userId: String(sender._id),
      customerId: sender.customerId,
      transactionType: "cashOut",
      amount: grossAmount,
      purpose: "Send Money",
      description: `Sent ${numAmount} USDT to ${recipient.customerId} (fee ${fee} USDT)`,
    });
    cashOutTxDone = true;
    /* ────────── cash in transactions ────────── */
    await txManager.createTransaction({
      userId: String(recipient._id),
      customerId: recipient.customerId,
      transactionType: "cashIn",
      amount: numAmount,
      purpose: "Receive Money",
      description: `Received ${numAmount} USDT from ${sender.customerId}`,
    });
    cashInTxDone = true;

    /* ────────── company stats ────────── */
    await SystemStats.updateOne(
      { _id: company._id },
      {
        $inc: {
          totalUserToUserTransfer: numAmount,
          todayUserToUserTransfer: numAmount,
          "income.sendCharge": fee,
        },
      }
    );
    companyDone = true;

    /* ────────── notify recipient ────────── */
    notifyCreated = await Notification.create({
      user_id: recipient._id,
      role: recipient.role,
      title: "USDT Deposit Successful",
      category: "deposit",
      message: `You have successfully received ${numAmount} USDT from ${sender.customerId}.`,
      url: `/transactions`,
    });

    if (global?.io?.to) {
      global.io.to(String(recipient._id)).emit("user-notification", {
        success: true,
        message: "Deposit confirmed ✅",
        notification: notifyCreated,
      });
    }
  } catch (err) {
    // ────────── BEST-EFFORT ROLLBACK (since no session) ──────────
    // Always return sender debit first.
    await User.updateOne(
      { _id: sender._id },
      { $inc: { m_balance: +grossAmount } }
    );

    // If recipient was credited, reverse it.
    if (recipientCredited) {
      await User.updateOne(
        { _id: recipient._id },
        { $inc: { m_balance: -numAmount } }
      );
    }

    // If wallet and stats were inc'ed, best-effort revert.
    if (senderWalletDone) {
      await Wallet.updateOne(
        { _id: senderWallet._id },
        { $inc: { totalSend: -numAmount } }
      );
    }
    if (recipientWalletDone) {
      await Wallet.updateOne(
        { _id: recipientWallet._id },
        { $inc: { totalReceive: -numAmount } }
      );
    }
    if (companyDone) {
      await SystemStats.updateOne(
        { _id: company._id },
        {
          $inc: {
            totalUserToUserTransfer: -numAmount,
            todayUserToUserTransfer: -numAmount,
            "income.sendCharge": -fee,
          },
        }
      );
    }

    // Transactions/notification best-effort: you may keep as-is or add delete logic on your models if needed.

    return next(new ApiError(500, "Transfer failed, rolled back"));
  }

  /* ────────── success ────────── */
  res.status(200).json({
    success: true,
    message: "Money sent successfully",
  });
});
