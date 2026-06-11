import SpotWallet from "@/models/SpotWallet.model";
import StakingBonusLog from "@/models/StakingBonusLog.model";
import SystemStats from "@/models/SystemStats.model";
import TradingPair from "@/models/TradingPair.model"; // ✅ NEW
import Transaction, {
  TransactionPurpose,
  TransactionType,
} from "@/models/Transaction.model";
import { User } from "@/models/user.model";
import { ClientSession, Types } from "mongoose";

const round8 = (v: number) => +Number(v).toFixed(8);

const genUniqueId10 = () =>
  (Math.floor(Math.random() * 9000000000) + 1000000000).toString();

async function createMainBalanceTransaction(opts: {
  userId: Types.ObjectId;
  customerId?: string;
  transactionType: TransactionType;
  amount: number;
  purpose: TransactionPurpose;
  description: string;
  session?: ClientSession;
}) {
  const q = User.findById(opts.userId).select("m_balance");
  if (opts.session) q.session(opts.session);
  const u = await q;
  if (!u) return;

  const current = round8(Number((u as any).m_balance ?? 0));
  const amount = round8(Number(opts.amount));
  const previous =
    opts.transactionType === "cashIn"
      ? round8(current - amount)
      : round8(current + amount);

  const doc = {
    userId: opts.userId,
    customerId: opts.customerId,
    unique_id: genUniqueId10(),
    amount,
    transactionType: opts.transactionType,
    purpose: opts.purpose,
    description: opts.description,
    isCashIn: opts.transactionType === "cashIn",
    isCashOut: opts.transactionType === "cashOut",
    previous_m_balance: previous,
    current_m_balance: current,
  };

  if (opts.session) {
    await Transaction.create([doc as any], { session: opts.session });
  } else {
    await Transaction.create(doc as any);
  }
}

const LEVEL_RATES = [0.18, 0.15, 0.12, 0.09, 0.06]; // sum=0.60

type DistributeInput = {
  subscriptionId: Types.ObjectId;
  fromUserId: Types.ObjectId;
  symbol: string;
  asset: string;
  dayKey: string;
  remainderQty: number; // gross remainder (after user share)
  session?: ClientSession;
};

export async function distributeStakingBonusAndSystemCut(
  input: DistributeInput
) {
  const {
    subscriptionId,
    fromUserId,
    symbol,
    asset,
    dayKey,
    remainderQty,
    session,
  } = input;

  let systemQty = round8(remainderQty * 0.4);
  let parentsPaidTotal = 0;
  const touchedParents: string[] = [];

  if (remainderQty <= 0) {
    return { systemQty: 0, parentsPaidTotal: 0, touchedParents };
  }

  const user = await User.findById(fromUserId).select("_id parents");
  if (!user) {
    // no user => all to system
    await SystemStats.updateOne(
      {},
      {
        $inc: {
          stakingSystemCutTotal: +remainderQty,
          [`stakingSystemCutBySymbol.${symbol}`]: +remainderQty,
        },
      },
      { upsert: true, session }
    );
    return { systemQty: remainderQty, parentsPaidTotal: 0, touchedParents };
  }

  const parents = await User.find({ _id: { $in: user.parents } }).select(
    "_id customerId is_active name"
  );

  // ordering আপনার মতো চাইলে reverse রাখতে পারেন
  parents.reverse();

  // ✅ normalize symbol once
  const symbolKey = String(symbol || "").toUpperCase();
  const isUSDT = symbolKey === "USDT";

  // ✅ fetch TradingPair icon once (only for SpotWallet path)
  let pairIconUrl: string | undefined;
  if (!isUSDT) {
    const pair = await TradingPair.findOne({ symbol: symbolKey })
      .select("iconUrl")
      .lean();
    pairIconUrl = pair?.iconUrl || undefined;
  }

  // distribute per level
  for (let i = 0; i < 5; i++) {
    const rate = LEVEL_RATES[i];
    const bonusQty = round8(remainderQty * rate);
    if (bonusQty <= 0) continue;

    const parent = parents[i];
    console.log("🎁", i + 1, "Bonus:", bonusQty, "to", parent?.name);

    // parent missing or inactive => goes to system
    if (!parent || !(parent as any).is_active) {
      systemQty = round8(systemQty + bonusQty);
      continue;
    }

    // ✅ log first (idempotency)
    try {
      await StakingBonusLog.create(
        [
          {
            userId: parent._id,
            customerId: (parent as any).customerId,
            subscriptionId,
            fromUserId,
            toUserId: parent._id,
            symbol: symbolKey,
            dayKey,
            level: i + 1,
            bonusQty,
          },
        ],
        { session }
      );
    } catch (e: any) {
      if (String(e?.code) === "11000") {
        // already distributed this level for this day
        continue;
      }
      throw e;
    }

    // ✅ credit parent (USDT => main balance, others => SpotWallet)
    if (isUSDT) {
      await User.updateOne(
        { _id: parent._id },
        { $inc: { m_balance: +bonusQty } },
        session ? { session } : undefined
      );

      await createMainBalanceTransaction({
        userId: parent._id as Types.ObjectId,
        customerId: (parent as any).customerId,
        transactionType: "cashIn",
        amount: bonusQty,
        purpose: "Staking Bonus",
        description: `Staking level bonus (L${i + 1}): ${bonusQty} USDT`,
        session,
      }).catch((e) => {
        console.error(
          "❌ distributeStakingBonus txn failed:",
          (e as any)?.message || e
        );
      });
    } else {
      // ✅ SpotWallet create/update with icon from TradingPair
      const updateDoc: any = {
        $setOnInsert: {
          userId: parent._id,
          customerId: (parent as any).customerId,
          asset,
          symbol: symbolKey,
          avgPrice: 0,
        },
        $inc: { qty: +bonusQty },
      };

      // ✅ ensure iconUrl is present even on existing wallet
      if (pairIconUrl) {
        updateDoc.$set = { iconUrl: pairIconUrl };
      }

      await SpotWallet.findOneAndUpdate(
        { userId: parent._id, symbol: symbolKey },
        updateDoc,
        { upsert: true, session }
      );
    }

    parentsPaidTotal = round8(parentsPaidTotal + bonusQty);
    touchedParents.push(`${String(parent._id)}:${symbolKey}`);
  }

  // ✅ system cut update (Map)
  if (systemQty > 0) {
    await SystemStats.updateOne(
      {},
      {
        $inc: {
          stakingSystemCutTotal: +systemQty,
          [`stakingSystemCutBySymbol.${symbolKey}`]: +systemQty,
        },
      },
      { upsert: true, session }
    );
  }

  return { systemQty, parentsPaidTotal, touchedParents };
}
