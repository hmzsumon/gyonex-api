/* ───────────────────────────────────────────────────────────
   Transfer Controller
   - GET  /transfer/accounts    → ইউজারের অ্যাকাউন্ট লিস্ট + ব্যালেন্স
   - POST /transfer             → ইনটার্নাল ট্রান্সফার (ভিতরে-ভিতরে)
─────────────────────────────────────────────────────────── */

import Account from "@/models/Account.model";
import Transfer from "@/models/Transfer.model";
import { User } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import updateTeamLiveTradeInfo from "@/utils/updateTeamLiveTradeInfo";

/* ✅ NEW: transactions + wallet tallies */
import UserWallet from "@/models/UserWallet.model";
import TransactionManager from "@/utils/TransactionManager";

/* ────────── helpers ────────── */
const round2 = (n: number) => +Number(n).toFixed(2);

/* ────────── GET /transfer/accounts ────────── */
export const listMyAccountsLite = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  const rows = await Account.find({ userId }).select(
    "_id title number type currency balance equity marginUsed accountNumber"
  );

  const items = rows.map((a: any) => {
    const equity = Number(a.equity ?? a.balance ?? 0);
    const used = Number(a.marginUsed ?? 0);
    const marginRatio = used > 0 ? (equity / used) * 100 : 9999;
    return {
      id: String(a._id),
      accountNumber: Number(a.accountNumber),
      title: a.title || a.number || a._id,
      type: a.type || "trade",
      currency: a.currency || "USD",
      balance: round2(a.balance ?? 0),
      equity: round2(equity),
      marginRatio: +marginRatio.toFixed(2),
    };
  });

  res.json({ success: true, items });
});

/* ────────── POST /transfer (internal) ──────────
 * body: { fromId: string|'main', toId: string|'main', amount: number }
 * Rules:
 *  - fromId !== toId
 *  - if transferring OUT of an account → margin ratio >= 150%
 *  - currency must match (simple)
 *  - supports Main balance (user.m_balance) on either side without DB session/txn
 *  - ONLY call updateTeamLiveTradeInfo when main is involved
 *    - fromId === 'main' → +amount
 *    - toId   === 'main' → -amount
 *  - When main is involved, create transactions + wallet tallies
──────────────────────────────────────────────────────────── */
export const createInternalTransfer = catchAsync(async (req, res) => {
  /* ────────── auth & input ────────── */
  const userId = req.user?._id;
  if (!userId) throw new ApiError(401, "Unauthenticated");

  const { fromId, toId, amount } = (req.body || {}) as {
    fromId: string;
    toId: string;
    amount: number;
  };

  if (!fromId || !toId) throw new ApiError(400, "Missing fields");
  if (fromId === toId) throw new ApiError(400, "Accounts must differ");

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new ApiError(400, "Invalid amount");
  }

  /* ────────── load user & accounts ────────── */
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const fromAcc =
    fromId !== "main" ? await Account.findOne({ _id: fromId, userId }) : null;
  const toAcc =
    toId !== "main" ? await Account.findOne({ _id: toId, userId }) : null;

  if (fromId !== "main" && !fromAcc)
    throw new ApiError(404, "From account not found");
  if (toId !== "main" && !toAcc)
    throw new ApiError(404, "To account not found");

  /* ────────── currency check ────────── */
  const fromCurrency = fromAcc?.currency || "USD";
  const toCurrency = toAcc?.currency || "USD";
  if (fromCurrency !== toCurrency) throw new ApiError(400, "Currency mismatch");

  /* ────────── source balance check ────────── */
  const fromBalance =
    fromId === "main"
      ? Number(user.m_balance || 0)
      : Number(fromAcc?.balance || 0);
  if (fromBalance < amt) throw new ApiError(400, "Insufficient funds");

  /* ────────── margin ratio rule (OUT of an account) ────────── */
  if (fromAcc) {
    const equity = Number(fromAcc.equity ?? fromAcc.balance ?? 0);
    const used = Number(fromAcc.marginUsed ?? 0);
    const ratio = used > 0 ? (equity / used) * 100 : 9999;
    if (ratio < 150) throw new ApiError(400, "Margin ratio < 150%");
  }

  /* ────────── apply debits/credits (no session; demo-safe) ────────── */
  if (fromId === "main") {
    user.m_balance = round2((user.m_balance || 0) - amt);
  } else if (fromAcc) {
    fromAcc.balance = round2((fromAcc.balance || 0) - amt);
    fromAcc.equity = fromAcc.balance; // demo: equity mirrors balance
  }

  if (toId === "main") {
    user.m_balance = round2((user.m_balance || 0) + amt);
  } else if (toAcc) {
    toAcc.balance = round2((toAcc.balance || 0) + amt);
    toAcc.equity = toAcc.balance; // demo: equity mirrors balance
  }

  /* ────────── persist account/user state ────────── */
  const saves: Promise<any>[] = [];
  if (fromAcc) saves.push(fromAcc.save());
  if (toAcc) saves.push(toAcc.save());
  if (fromId === "main" || toId === "main") saves.push(user.save());
  await Promise.all(saves);

  /* ────────── team live-trade metrics (main only) ──────────
   * - fromId === "main" → +amount
   * - toId   === "main" → -amount
   * - account ↔ account → no-op
   * - clamped to non-negative inside the util
  ─────────────────────────────────────────────────────────── */
  try {
    if (fromId === "main" || toId === "main") {
      await updateTeamLiveTradeInfo(String(userId), round2(amt), fromId);
      // non-blocking
      // void updateTeamLiveTradeInfo(String(userId), round2(amt), fromId);
    }
  } catch (e) {
    console.error(
      "❌ Team live trade update failed:",
      (e as any)?.message || e
    );
  }

  /* ────────── transactions + wallet tallies (main only) ────────── */
  try {
    const txManager = new TransactionManager();

    // main → account : cashOut + wallet.totalTransferToTrade++
    if (fromId === "main" && toId !== "main") {
      const desc =
        toAcc?.accountNumber != null
          ? `Transfer to Trade #${toAcc.accountNumber}`
          : `Transfer to Trade (Account ${String(toId)})`;

      await txManager.createTransaction({
        userId: String(user._id),
        customerId: user.customerId,
        transactionType: "cashOut",
        amount: round2(amt),
        purpose: "Transfer to Trade",
        description: desc,
      });

      await UserWallet.updateOne(
        { userId: user._id },
        { $inc: { totalTransferToTrade: round2(amt) } },
        { upsert: true }
      ).exec();
    }

    // account → main : cashIn + wallet.totalTransferToWallet++
    if (fromId !== "main" && toId === "main") {
      const desc =
        fromAcc?.accountNumber != null
          ? `Transfer to Wallet from #${fromAcc.accountNumber}`
          : `Transfer to Wallet (From Account ${String(fromId)})`;

      await txManager.createTransaction({
        userId: String(user._id),
        customerId: user.customerId,
        transactionType: "cashIn",
        amount: round2(amt),
        purpose: "Transfer to Wallet",
        description: desc,
      });

      await UserWallet.updateOne(
        { userId: user._id },
        { $inc: { totalTransferToWallet: round2(amt) } },
        { upsert: true }
      ).exec();
    }

    // account ↔ account : no transactions / wallet tallies
  } catch (e) {
    // Not fatal for the transfer itself; log for ops
    console.error("❌ Transfer side-effects failed:", (e as any)?.message || e);
  }

  /* ────────── create transfer record ────────── */
  const doc: any = {
    userId,
    amount: round2(amt),
    currency: fromCurrency,
    status: "done",
    createdAt: new Date(),
    fromKind: fromAcc ? "account" : "main",
    toKind: toAcc ? "account" : "main",
  };
  if (fromAcc) doc.fromId = fromAcc._id; // only ObjectId when account
  if (toAcc) doc.toId = toAcc._id;

  const tr = await Transfer.create(doc);

  /* ────────── response ────────── */
  res.status(201).json({
    success: true,
    transfer: {
      id: String(tr._id),
      amount: tr.amount,
      currency: tr.currency,
      status: tr.status,
    },
    accounts: {
      from: fromAcc
        ? { id: String(fromAcc._id), balance: round2(fromAcc.balance) }
        : { id: "main", balance: round2(user.m_balance) },
      to: toAcc
        ? { id: String(toAcc._id), balance: round2(toAcc.balance) }
        : { id: "main", balance: round2(user.m_balance) },
    },
  });
});
