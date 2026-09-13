// src/controllers/lucky.controller.ts
/* ── Lucky Card controller ──────────────────────────────────────────────
 * লাকি কার্ড = ঘষলেই সরাসরি amount (USDT) — কোনো ম্যাচিং গেম নয়।
 * ফ্লো: ইউজার প্যাকেজ কেনে (m_balance কাটা) -> কার্ড mint হয় -> ইউজার
 * কার্ড খোলে -> সার্ভার provably-fair ভাবে global prize-pool-এ contribution
 * ছড়িয়ে দেয় -> কোনো পুল রেডি হলে পে-আউট -> m_balance-এ যোগ। সব ট্রানজেকশন
 * Transaction কালেকশনে "Buy Lottery" / "Lottery Win" পারপাস দিয়ে।
 * অ্যাডমিন সব card type / prize tier / package / prize pool কন্ট্রোল করে।
 *
 * এছাড়া admin যেকোনো ইউজারকে যেকোনো প্যাকেজ + যেকোনো প্রাইজ amount দিয়ে
 * বিনামূল্যে "গিফট" করতে পারে — গিফট কার্ড গ্লোবাল প্রাইজ পুল স্পর্শ করে না
 * (সম্পূর্ণ ফ্রি, কোনো contribution নেই), preset amount সরাসরি ইউজারকে
 * ক্রেডিট হয় কার্ড খোলার সময়।
 * ──────────────────────────────────────────────────────────────────── */

import { User } from "@/models/user.model";
import LuckyCard from "@/models/LuckyCard.model";
import LuckyCardType from "@/models/LuckyCardType.model";
import LuckyPackage from "@/models/LuckyPackage.model";
import LuckyPoolConfig from "@/models/LuckyPoolConfig.model";
import LuckyPrizePool from "@/models/LuckyPrizePool.model";
import LuckyPrizeTier from "@/models/LuckyPrizeTier.model"; // legacy display
import LuckyPurchase from "@/models/LuckyPurchase.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import {
  createSeedPair,
  defaultClientSeed,
  generateCardCode,
  pickReadyPool,
  poolRound2,
  poolRound4,
  spreadContribution,
  theoreticalRtp,
  validatePoolConfig,
} from "@/utils/luckyEngine";
import TransactionManager from "@/utils/TransactionManager";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";

const transactionManager = new TransactionManager();

/* ── ডিফল্ট গ্লোবাল প্রাইজ পুল (A–I) + কোম্পানি ফান্ড ─────────────────────
 * prize percent যোগফল = 96.001, company fund = 3.999  ->  মোট 100%
 * amount/percent admin panel থেকে পরে যেকোনো সময় পাল্টানো যায়। ──────── */
const DEFAULT_POOLS = [
  { code: "A", label: "Prize A", symbol: "🎈", amount: 50, percent: 25, sortOrder: 0 },
  { code: "B", label: "Prize B", symbol: "🎀", amount: 100, percent: 20, sortOrder: 1 },
  { code: "C", label: "Prize C", symbol: "🎁", amount: 300, percent: 16, sortOrder: 2 },
  { code: "D", label: "Prize D", symbol: "💵", amount: 1000, percent: 12, sortOrder: 3 },
  { code: "E", label: "Prize E", symbol: "💰", amount: 2500, percent: 9, sortOrder: 4 },
  { code: "F", label: "Prize F", symbol: "🏆", amount: 20000, percent: 7, sortOrder: 5 },
  { code: "G", label: "Prize G", symbol: "👑", amount: 50000, percent: 5, sortOrder: 6 },
  { code: "H", label: "Prize H", symbol: "💎", amount: 100000, percent: 2, sortOrder: 7 },
  { code: "I", label: "Prize I", symbol: "🌟", amount: 1000000, percent: 0.001, sortOrder: 8 },
];
const DEFAULT_COMPANY_FUND_PERCENT = 3.999;

// প্রাইজ না পেলে "No win" এর বদলে বন্ধুসুলভ বার্তা (র‍্যান্ডম)
const NO_WIN_MESSAGES = [
  { label: "Good luck! Try again", symbol: "🍀" },
  { label: "Thanks! Maybe next card", symbol: "😊" },
  { label: "Not this time — luck is still with you", symbol: "✨" },
  { label: "Don't give up — try the next card", symbol: "😊" },
  { label: "So close — fortune is knocking", symbol: "🍀" },
];
const pickNoWinMessage = () =>
  NO_WIN_MESSAGES[Math.floor(Math.random() * NO_WIN_MESSAGES.length)];

// গ্লোবাল পুল না থাকলে ডিফল্ট দিয়ে বসিয়ে দেয় (idempotent)
async function ensurePrizePools() {
  const count = await LuckyPrizePool.countDocuments();
  if (count === 0) {
    await LuckyPrizePool.insertMany(DEFAULT_POOLS.map((p) => ({ ...p })));
  }
  return LuckyPoolConfig.getSingleton();
}

const poolPlain = (p: any) => ({
  _id: p._id,
  code: p.code,
  label: p.label,
  symbol: p.symbol,
  amount: Number(p.amount),
  percent: Number(p.percent),
  balance: poolRound2(p.balance),
  fillPercent:
    Number(p.amount) > 0
      ? Math.min(100, poolRound2((Number(p.balance) / Number(p.amount)) * 100))
      : 0,
  timesWon: Number(p.timesWon || 0),
  totalPaid: poolRound2(p.totalPaid || 0),
  totalContributed: poolRound2(p.totalContributed || 0),
  lastWonAt: p.lastWonAt || null,
  isActive: p.isActive !== false,
  sortOrder: Number(p.sortOrder || 0),
});

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const tierPlain = (t: any) => ({
  _id: t._id,
  label: t.label,
  symbol: t.symbol,
  amount: Number(t.amount),
  weight: Number(t.weight),
  stockLimit: t.stockLimit,
  stockUsed: Number(t.stockUsed || 0),
  isJackpot: !!t.isJackpot,
  sortOrder: t.sortOrder,
});

/* ══════════════════════════════════════════════════════════════════════
 * PUBLIC / USER
 * ══════════════════════════════════════════════════════════════════════ */

// ===== শপ ক্যাটালগ ===== GET /api/v1/lucky/shop
export const getLuckyShop = catchAsync(async (_req: Request, res: Response) => {
  await ensurePrizePools();
  const [types, pools] = await Promise.all([
    LuckyCardType.find({ isActive: true }).sort({ sortOrder: 1 }),
    LuckyPrizePool.find({ isActive: true }).sort({ sortOrder: 1 }),
  ]);

  const poolPercentSum = pools.reduce((s, p: any) => s + Number(p.percent || 0), 0);
  const poolTop = pools.reduce((m, p: any) => Math.max(m, Number(p.amount || 0)), 0);

  const shop = [];
  for (const type of types as any[]) {
    const packages = await LuckyPackage.find({
      cardType: type._id,
      isActive: true,
    }).sort({ sortOrder: 1 });

    shop.push({
      _id: type._id,
      key: type.key,
      name: type.name,
      price: Number(type.price),
      accent: type.accent,
      rtp: Math.round(poolPercentSum),
      topPrize:
        Number(type.displayTopPrize) > 0 ? Number(type.displayTopPrize) : poolTop,
      packages: packages.map((p: any) => {
        const totalCards = p.cardCount + p.bonusCards;
        const reg = Number(p.regularPrice || 0);
        const offer = Number(p.price);
        return {
          _id: p._id,
          name: p.name,
          cardCount: p.cardCount,
          bonusCards: p.bonusCards,
          totalCards,
          price: offer,
          regularPrice: reg > offer ? reg : 0,
          perCard: round2(offer / totalCards),
          perCardRegular: reg > offer ? round2(reg / totalCards) : 0,
          discountPercent: reg > offer ? Math.round(((reg - offer) / reg) * 100) : 0,
        };
      }),
    });
  }

  res.status(200).json({ success: true, shop });
});

// ===== প্যাকেজ কেনা ===== POST /api/v1/lucky/buy  { packageId }
export const buyLuckyPackage = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { packageId } = req.body as { packageId: string };
    if (!mongoose.Types.ObjectId.isValid(packageId || "")) {
      return next(new ApiError(400, "Invalid package"));
    }

    const pkg: any = await LuckyPackage.findById(packageId).populate("cardType");
    if (!pkg || !pkg.isActive) {
      return next(new ApiError(404, "Package not found"));
    }
    if (!pkg.cardType || !pkg.cardType.isActive) {
      return next(new ApiError(400, "This card is currently disabled"));
    }

    const userId = req.user?._id;
    if (!userId) return next(new ApiError(401, "Unauthorized"));
    const user = await User.findById(userId);
    if (!user) return next(new ApiError(404, "User not found"));

    const totalCards = pkg.cardCount + pkg.bonusCards;
    const totalPrice = round2(pkg.price);
    const unitPrice = round2(totalPrice / totalCards);

    if (Number(user.m_balance || 0) < totalPrice) {
      return next(new ApiError(420, "Insufficient balance"));
    }

    // ব্যালেন্স কাটা
    user.m_balance = Math.max(0, Number(user.m_balance) - totalPrice);
    await user.save();

    await transactionManager.createTransaction({
      userId: String(user._id),
      customerId: user.customerId,
      transactionType: "cashOut",
      amount: totalPrice,
      purpose: "Buy Lottery",
      description: `${pkg.cardType.name} — ${pkg.name} (${totalCards} lucky cards)`,
    });

    const purchase = await LuckyPurchase.create({
      user: user._id,
      customerId: user.customerId,
      cardType: pkg.cardType._id,
      cardTypeName: pkg.cardType.name,
      package: pkg._id,
      quantity: totalCards,
      unitPrice,
      totalPrice,
      source: "purchase",
    });

    const clientSeed = defaultClientSeed();
    const cardDocs = [];
    for (let i = 0; i < totalCards; i += 1) {
      const { serverSeed, serverSeedHash } = createSeedPair();
      cardDocs.push({
        shortCode: generateCardCode(),
        user: user._id,
        customerId: user.customerId,
        purchase: purchase._id,
        cardType: pkg.cardType._id,
        cardTypeName: pkg.cardType.name,
        accent: pkg.cardType.accent,
        source: "purchase",
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce: i,
      });
    }
    const cards = await LuckyCard.insertMany(cardDocs);

    res.status(201).json({
      success: true,
      balance: user.m_balance,
      purchase: {
        _id: purchase._id,
        cardType: pkg.cardType.name,
        accent: pkg.cardType.accent,
        quantity: totalCards,
        totalPrice,
      },
      cards: cards.map(publicUnopened),
    });
  },
);

// ===== কার্ড খোলা (স্ক্র্যাচ) ===== POST /api/v1/lucky/cards/:id/open
export const openLuckyCard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const cardId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(cardId || "")) {
      return next(new ApiError(400, "Invalid card"));
    }

    const userId = req.user?._id;
    if (!userId) return next(new ApiError(401, "Unauthorized"));

    const card: any = await LuckyCard.findOne({ _id: cardId, user: userId });
    if (!card) return next(new ApiError(404, "Card not found"));

    // ইতিমধ্যে খোলা — আগের ফলাফল
    if (card.status === "opened") {
      const bal = await User.findById(userId).select("m_balance");
      return res.status(200).json({
        success: true,
        balance: bal ? bal.m_balance : undefined,
        card: revealPayload(card, false),
      });
    }

    // ===== ১. কার্ডটা exclusively "opened" মার্ক করি (idempotent গার্ড) =====
    const opened: any = await LuckyCard.findOneAndUpdate(
      { _id: cardId, user: userId, status: "unopened" },
      { $set: { status: "opened", openedAt: new Date() } },
      { new: true },
    );
    if (!opened) {
      const fresh = await LuckyCard.findById(cardId);
      const bal = await User.findById(userId).select("m_balance");
      return res.status(200).json({
        success: true,
        balance: bal ? bal.m_balance : undefined,
        card: revealPayload(fresh, false),
      });
    }

    /* ══ গিফট কার্ড — গ্লোবাল পুল স্পর্শ করে না, preset amount সরাসরি ══ */
    if (opened.source === "gift") {
      const noWin = pickNoWinMessage();
      const presetAmount = Number(opened.presetPrizeAmount || 0);
      const win = presetAmount > 0;

      const finalCard = await LuckyCard.findByIdAndUpdate(
        opened._id,
        {
          $set: {
            prizePoolCode: "",
            prizeAmount: win ? presetAmount : 0,
            prizeLabel: win ? "Admin Gift" : noWin.label,
            revealSymbol: win ? "🎁" : noWin.symbol,
            contribution: 0,
            poolSnapshot: [],
          },
        },
        { new: true },
      );

      let newBalance;
      if (win) {
        const winUser: any = await User.findById(userId);
        winUser.m_balance = Number(winUser.m_balance || 0) + presetAmount;
        await winUser.save();
        newBalance = winUser.m_balance;
        await transactionManager.createTransaction({
          userId: String(winUser._id),
          customerId: winUser.customerId,
          transactionType: "cashIn",
          amount: presetAmount,
          purpose: "Lottery Gift",
          description: `${finalCard!.cardTypeName} — Admin gift prize`,
        });
      } else {
        const bal = await User.findById(userId).select("m_balance");
        newBalance = bal ? bal.m_balance : undefined;
      }

      return res.status(200).json({
        success: true,
        balance: newBalance,
        card: revealPayload(finalCard, true),
      });
    }

    // ===== ২. এই কার্ডের অবদান (unit offer price) =====
    await ensurePrizePools();
    let contribution = 0;
    if (opened.purchase) {
      const purchase: any = await LuckyPurchase.findById(opened.purchase).select(
        "unitPrice totalPrice quantity",
      );
      if (purchase) contribution = Number(purchase.unitPrice) || 0;
    }
    if (!contribution) {
      const ct: any = await LuckyCardType.findById(opened.cardType).select("price");
      contribution = ct ? Number(ct.price) || 0 : 0;
    }

    const cfg = await LuckyPoolConfig.getSingleton();
    const poolDocs = await LuckyPrizePool.find({ isActive: true }).sort({
      sortOrder: 1,
    });

    // ===== ৩. পুল + কোম্পানি ফান্ডে বিতরণ (atomic $inc) =====
    const { poolAdds, companyAdd } = spreadContribution(
      contribution,
      poolDocs,
      Number(cfg.companyFundPercent || 0),
    );

    const bulk = poolDocs
      .filter((p: any) => (poolAdds[p.code] || 0) > 0)
      .map((p: any) => ({
        updateOne: {
          filter: { _id: p._id },
          update: {
            $inc: {
              balance: poolAdds[p.code],
              totalContributed: poolAdds[p.code],
            },
          },
        },
      }));
    if (bulk.length) await LuckyPrizePool.bulkWrite(bulk as any);
    await LuckyPoolConfig.updateOne(
      { key: "global" },
      { $inc: { companyFundCollected: companyAdd, totalContributed: contribution } },
    );

    // ===== ৪. রেডি পুল বাছাই (post-increment) + atomic claim =====
    const freshPools = await LuckyPrizePool.find({ isActive: true }).sort({
      sortOrder: 1,
    });
    const target: any = pickReadyPool(freshPools.map((p: any) => p.toObject()));

    const noWin = pickNoWinMessage();
    let prizeAmount = 0;
    let prizeCode = "";
    let prizeLabel = noWin.label;
    let revealSymbol = noWin.symbol;

    if (target) {
      const claimed = await LuckyPrizePool.findOneAndUpdate(
        { _id: target._id, balance: { $gte: target.amount } },
        {
          $inc: {
            balance: -target.amount,
            totalPaid: target.amount,
            timesWon: 1,
          },
          $set: { lastWonAt: new Date() },
        },
        { new: true },
      );
      if (claimed) {
        prizeAmount = Number(target.amount);
        prizeCode = target.code;
        prizeLabel = target.label;
        revealSymbol = target.symbol || "🎁";
        await LuckyPoolConfig.updateOne(
          { key: "global" },
          { $inc: { totalPaidOut: prizeAmount } },
        );
      }
    }

    // ===== ৫. কার্ডে ফলাফল + পুল স্ন্যাপশট বসাই =====
    const snapPools = await LuckyPrizePool.find().sort({ sortOrder: 1 });
    const poolSnapshot = snapPools.map((p: any) => ({
      code: p.code,
      balance: poolRound2(p.balance),
      amount: Number(p.amount),
    }));

    const finalCard = await LuckyCard.findByIdAndUpdate(
      opened._id,
      {
        $set: {
          prizePoolCode: prizeCode,
          prizeAmount,
          prizeLabel,
          revealSymbol,
          contribution: poolRound2(contribution),
          poolSnapshot,
        },
      },
      { new: true },
    );

    // ===== ৬. জিতলে ব্যালেন্সে যোগ + ট্রানজেকশন =====
    let newBalance;
    if (prizeAmount > 0) {
      const winUser: any = await User.findById(userId);
      winUser.m_balance = Number(winUser.m_balance || 0) + prizeAmount;
      await winUser.save();
      newBalance = winUser.m_balance;
      await transactionManager.createTransaction({
        userId: String(winUser._id),
        customerId: winUser.customerId,
        transactionType: "cashIn",
        amount: prizeAmount,
        purpose: "Lottery Win",
        description: `${finalCard!.cardTypeName} — ${prizeLabel} (${prizeCode})`,
      });
    } else {
      const bal = await User.findById(userId).select("m_balance");
      newBalance = bal ? bal.m_balance : undefined;
    }

    res.status(200).json({
      success: true,
      balance: newBalance,
      card: revealPayload(finalCard, true),
    });
  },
);

// ===== আমার কার্ড ===== GET /api/v1/lucky/cards?status=unopened|opened
export const getMyLuckyCards = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const filter: any = { user: userId };
  if (req.query.status === "unopened" || req.query.status === "opened") {
    filter.status = req.query.status;
  }
  const cards = await LuckyCard.find(filter)
    .sort({ status: 1, createdAt: -1 })
    .limit(300);

  res.status(200).json({
    success: true,
    cards: cards.map((c: any) =>
      c.status === "opened" ? revealPayload(c, false) : publicUnopened(c),
    ),
  });
});

// ===== আমার কেনাকাটা ===== GET /api/v1/lucky/purchases
export const getMyLuckyPurchases = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  const rows = await LuckyPurchase.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(100);
  res.status(200).json({
    success: true,
    purchases: rows.map((p: any) => ({
      _id: p._id,
      cardType: p.cardTypeName,
      quantity: p.quantity,
      totalPrice: Number(p.totalPrice),
      source: p.source,
      createdAt: p.createdAt,
    })),
  });
});

// ===== verifier (পাবলিক) ===== GET /api/v1/lucky/verify/:shortCode
export const verifyLuckyCard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const card: any = await LuckyCard.findOne({ shortCode: req.params.shortCode });
    if (!card) return next(new ApiError(404, "Card not found"));

    if (card.status !== "opened") {
      return res.status(200).json({
        success: true,
        data: { status: "unopened", shortCode: card.shortCode },
      });
    }

    if (card.source === "gift") {
      return res.status(200).json({
        success: true,
        data: {
          status: "opened",
          model: "admin-gift",
          shortCode: card.shortCode,
          cardType: card.cardTypeName,
          prizeLabel: card.prizeLabel,
          prizeAmount: Number(card.prizeAmount),
          openedAt: card.openedAt,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        status: "opened",
        model: "global-prize-pool",
        shortCode: card.shortCode,
        cardType: card.cardTypeName,
        prizeCode: card.prizePoolCode || "",
        prizeLabel: card.prizeLabel,
        prizeAmount: Number(card.prizeAmount),
        contribution: Number(card.contribution || 0),
        openedAt: card.openedAt,
        poolSnapshot: (card.poolSnapshot || []).map((p: any) => ({
          code: p.code,
          balance: Number(p.balance),
          amount: Number(p.amount),
          fillPercent:
            Number(p.amount) > 0
              ? Math.min(100, poolRound2((Number(p.balance) / Number(p.amount)) * 100))
              : 0,
        })),
      },
    });
  },
);

/* ══════════════════════════════════════════════════════════════════════
 * ADMIN
 * ══════════════════════════════════════════════════════════════════════ */

// ===== সব card type + tier + package + লাইভ RTP ===== GET /admin/lucky/card-types
export const adminListCardTypes = catchAsync(async (_req: Request, res: Response) => {
  const types = await LuckyCardType.find().sort({ sortOrder: 1 });

  const out = [];
  for (const type of types as any[]) {
    const [tiers, packages, issued] = await Promise.all([
      LuckyPrizeTier.find({ cardType: type._id }).sort({ sortOrder: 1 }),
      LuckyPackage.find({ cardType: type._id }).sort({ sortOrder: 1 }),
      LuckyCard.countDocuments({ cardType: type._id }),
    ]);
    const tp = tiers.map(tierPlain);
    out.push({
      _id: type._id,
      key: type.key,
      name: type.name,
      price: Number(type.price),
      accent: type.accent,
      targetRtp: Number(type.targetRtp),
      displayTopPrize: Number(type.displayTopPrize || 0),
      realTopPrize: tp.reduce((m, t) => Math.max(m, t.amount), 0),
      theoreticalRtp: Math.round(theoreticalRtp(tp, Number(type.price)) * 10000) / 100,
      isActive: type.isActive,
      sortOrder: type.sortOrder,
      cardsIssued: issued,
      prizeTiers: tp,
      packages: (packages as any[]).map((p) => ({
        _id: p._id,
        name: p.name,
        cardCount: p.cardCount,
        bonusCards: p.bonusCards,
        regularPrice: Number(p.regularPrice || 0),
        price: Number(p.price),
        isActive: p.isActive,
        sortOrder: p.sortOrder,
      })),
    });
  }

  res.status(200).json({ success: true, cardTypes: out });
});

// ===== card type create / update ===== POST /admin/lucky/card-types
export const adminSaveCardType = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      _id,
      key,
      name,
      price,
      accent,
      targetRtp,
      displayTopPrize,
      sortOrder,
      isActive,
    } = req.body;

    if (_id) {
      const t: any = await LuckyCardType.findById(_id);
      if (!t) return next(new ApiError(404, "Card type not found"));
      if (name != null) t.name = String(name).trim();
      if (price != null) t.price = Number(price);
      if (accent != null) t.accent = String(accent);
      if (targetRtp != null) t.targetRtp = Number(targetRtp);
      if (displayTopPrize != null)
        t.displayTopPrize = Math.max(0, Number(displayTopPrize) || 0);
      if (sortOrder != null) t.sortOrder = Number(sortOrder);
      if (typeof isActive === "boolean") t.isActive = isActive;
      await t.save();
      return res.status(200).json({ success: true, cardType: t });
    }

    if (!key || !name || price == null) {
      return next(new ApiError(400, "key, name, price are required"));
    }
    const dupe = await LuckyCardType.findOne({ key: String(key).trim() });
    if (dupe) return next(new ApiError(409, "This key already exists"));

    const created = await LuckyCardType.create({
      key: String(key).trim(),
      name: String(name).trim(),
      price: Number(price),
      accent: accent || "#7C5CFC",
      targetRtp: targetRtp != null ? Number(targetRtp) : 80,
      displayTopPrize:
        displayTopPrize != null ? Math.max(0, Number(displayTopPrize) || 0) : 0,
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    });
    res.status(201).json({ success: true, cardType: created });
  },
);

// ===== card type delete ===== DELETE /admin/lucky/card-types/:id
export const adminDeleteCardType = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const issued = await LuckyCard.countDocuments({ cardType: id });
  if (issued > 0) {
    await LuckyCardType.findByIdAndUpdate(id, { isActive: false });
    return res
      .status(200)
      .json({ success: true, message: "Card already issued — set inactive" });
  }
  await LuckyPrizeTier.deleteMany({ cardType: id });
  await LuckyPackage.deleteMany({ cardType: id });
  await LuckyCardType.findByIdAndDelete(id);
  res.status(200).json({ success: true, message: "Deleted" });
});

// ===== prize tier create / update ===== POST /admin/lucky/prize-tiers
export const adminSaveTier = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      _id,
      cardType,
      label,
      symbol,
      amount,
      weight,
      stockLimit,
      isJackpot,
      sortOrder,
    } = req.body;

    if (_id) {
      const t: any = await LuckyPrizeTier.findById(_id);
      if (!t) return next(new ApiError(404, "Tier not found"));
      if (label != null) t.label = String(label);
      if (symbol != null) t.symbol = String(symbol);
      if (amount != null) t.amount = Math.max(0, Number(amount));
      if (weight != null) t.weight = Math.max(0, Number(weight));
      if (stockLimit !== undefined)
        t.stockLimit = stockLimit === null || stockLimit === "" ? null : Number(stockLimit);
      if (typeof isJackpot === "boolean") t.isJackpot = isJackpot;
      if (sortOrder != null) t.sortOrder = Number(sortOrder);
      await t.save();
      return res.status(200).json({ success: true, tier: t });
    }

    if (!cardType || !label || amount == null || weight == null) {
      return next(new ApiError(400, "cardType, label, amount, weight are required"));
    }
    const created = await LuckyPrizeTier.create({
      cardType,
      label: String(label),
      symbol: symbol || "💰",
      amount: Math.max(0, Number(amount)),
      weight: Math.max(0, Number(weight)),
      stockLimit:
        stockLimit === null || stockLimit === "" || stockLimit === undefined
          ? null
          : Number(stockLimit),
      isJackpot: !!isJackpot,
      sortOrder: sortOrder != null ? Number(sortOrder) : 0,
    });
    res.status(201).json({ success: true, tier: created });
  },
);

// ===== prize tier delete ===== DELETE /admin/lucky/prize-tiers/:id
export const adminDeleteTier = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const used = await LuckyCard.countDocuments({ prizeTier: id });
  if (used > 0) {
    await LuckyPrizeTier.findByIdAndUpdate(id, { weight: 0 });
    return res
      .status(200)
      .json({ success: true, message: "Tier already used — weight set to 0" });
  }
  await LuckyPrizeTier.findByIdAndDelete(id);
  res.status(200).json({ success: true, message: "Deleted" });
});

// ===== package create / update ===== POST /admin/lucky/packages
export const adminSavePackage = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { _id, cardType, name, cardCount, bonusCards, regularPrice, price, isActive } =
      req.body;

    if (_id) {
      const p: any = await LuckyPackage.findById(_id);
      if (!p) return next(new ApiError(404, "Package not found"));
      if (name != null) p.name = String(name);
      if (cardCount != null) p.cardCount = Number(cardCount);
      if (bonusCards != null) p.bonusCards = Number(bonusCards);
      if (regularPrice != null) p.regularPrice = Math.max(0, Number(regularPrice) || 0);
      if (price != null) p.price = Number(price);
      if (typeof isActive === "boolean") p.isActive = isActive;
      await p.save();
      return res.status(200).json({ success: true, package: p });
    }

    if (!cardType || !name || cardCount == null || price == null) {
      return next(new ApiError(400, "cardType, name, cardCount, price are required"));
    }
    const created = await LuckyPackage.create({
      cardType,
      name: String(name),
      cardCount: Number(cardCount),
      bonusCards: bonusCards != null ? Number(bonusCards) : 0,
      regularPrice: regularPrice != null ? Math.max(0, Number(regularPrice) || 0) : 0,
      price: Number(price),
      sortOrder: req.body.sortOrder != null ? Number(req.body.sortOrder) : 0,
    });
    res.status(201).json({ success: true, package: created });
  },
);

// ===== package delete ===== DELETE /admin/lucky/packages/:id
export const adminDeletePackage = catchAsync(async (req: Request, res: Response) => {
  const id = req.params.id;
  const used = await LuckyPurchase.countDocuments({ package: id });
  if (used > 0) {
    await LuckyPackage.findByIdAndUpdate(id, { isActive: false });
    return res
      .status(200)
      .json({ success: true, message: "Package used — set inactive" });
  }
  await LuckyPackage.findByIdAndDelete(id);
  res.status(200).json({ success: true, message: "Deleted" });
});

/* ══════════════════════ GLOBAL PRIZE POOL (admin) ══════════════════════ */

// ===== পুল + কনফিগ + লাইভ অবস্থা ===== GET /admin/lucky/prize-pools
export const adminGetPrizePools = catchAsync(async (_req: Request, res: Response) => {
  const cfg = await ensurePrizePools();
  const pools = await LuckyPrizePool.find().sort({ sortOrder: 1 });
  const rows = pools.map(poolPlain);
  const prizeSum = rows.reduce((s, r) => s + r.percent, 0);
  const v = validatePoolConfig(
    rows.map((r) => ({ percent: r.percent })),
    Number(cfg.companyFundPercent || 0),
  );

  res.status(200).json({
    success: true,
    pools: rows,
    config: {
      companyFundPercent: Number(cfg.companyFundPercent || 0),
      companyFundCollected: poolRound2(cfg.companyFundCollected || 0),
      totalContributed: poolRound2(cfg.totalContributed || 0),
      totalPaidOut: poolRound2(cfg.totalPaidOut || 0),
      lastConfirmedAt: cfg.lastConfirmedAt || null,
    },
    totals: {
      prizePercentSum: poolRound4(prizeSum),
      grandTotalPercent: v.grandTotalPercent,
      over100: v.over100,
      exactly100: v.exactly100,
      under100: v.under100,
      valid: !v.over100,
      configuredPayoutPercent: poolRound4(prizeSum),
      actualRtp:
        Number(cfg.totalContributed) > 0
          ? poolRound2((Number(cfg.totalPaidOut) / Number(cfg.totalContributed)) * 100)
          : 0,
    },
  });
});

// ===== প্রিভিউ (সেভ করে না) ===== POST /admin/lucky/prize-pools/preview
export const adminPreviewPrizePools = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const incoming = Array.isArray(req.body.pools) ? req.body.pools : [];
    const companyPercent = Number(req.body.companyFundPercent || 0);
    const samplePrice =
      Number(req.body.samplePrice) > 0 ? Number(req.body.samplePrice) : 100;

    if (incoming.length === 0) {
      return next(new ApiError(400, "Please provide at least one prize pool"));
    }

    const codes = new Set<string>();
    const cleanRows = [];
    for (const r of incoming) {
      const code = String(r.code || "").trim().toUpperCase();
      if (!code) return next(new ApiError(400, "Every pool needs a code"));
      if (codes.has(code)) return next(new ApiError(400, `Duplicate code: ${code}`));
      codes.add(code);
      const amount = Math.max(0, Number(r.amount) || 0);
      const percent = Math.max(0, Number(r.percent) || 0);
      cleanRows.push({
        code,
        label: String(r.label || `Prize ${code}`).trim(),
        symbol: String(r.symbol || "🎁"),
        amount,
        percent,
        sortOrder: Number(r.sortOrder) || 0,
        isActive: r.isActive !== false,
      });
    }

    const v = validatePoolConfig(cleanRows, companyPercent);

    const table = cleanRows.map((r) => {
      const perScratch = poolRound4((samplePrice * r.percent) / 100);
      return {
        code: r.code,
        label: r.label,
        symbol: r.symbol,
        amount: r.amount,
        percent: r.percent,
        isActive: r.isActive,
        depositPerSale: perScratch,
        scratchesPerWin: perScratch > 0 ? Math.round(r.amount / perScratch) : null,
      };
    });
    table.push({
      code: "COMPANY",
      label: "Company Fund",
      symbol: "🏦",
      amount: null as any,
      percent: v.companyFundPercent,
      isActive: true,
      depositPerSale: poolRound4((samplePrice * companyPercent) / 100),
      scratchesPerWin: null,
    });

    res.status(200).json({
      success: true,
      preview: {
        samplePrice,
        rows: table,
        prizePercentSum: v.prizePercentSum,
        companyFundPercent: v.companyFundPercent,
        grandTotalPercent: v.grandTotalPercent,
        over100: v.over100,
        exactly100: v.exactly100,
        under100: v.under100,
        valid: !v.over100,
        warning: v.over100
          ? "This setup isn't valid — all percentages add up to more than 100%. Fix it and preview again."
          : v.under100
            ? `Total ${v.grandTotalPercent}% — under 100%. The remaining ${poolRound4(100 - v.grandTotalPercent)}% will sit as extra house margin. Set company fund to ${v.suggestedCompanyFundPercent}% if you want exactly 100%.`
            : null,
        suggestedCompanyFundPercent: v.suggestedCompanyFundPercent,
      },
    });
  },
);

// ===== কনফার্ম করে সেভ ===== POST /admin/lucky/prize-pools
export const adminSavePrizePools = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const incoming = Array.isArray(req.body.pools) ? req.body.pools : [];
    const companyPercent = Math.max(0, Number(req.body.companyFundPercent || 0));
    if (incoming.length === 0) {
      return next(new ApiError(400, "Please provide at least one prize pool"));
    }
    if (req.body.confirm !== true) {
      return next(new ApiError(400, "Review the preview and confirm (confirm: true required)"));
    }

    const codes = new Set<string>();
    const cleanRows = [];
    for (const r of incoming) {
      const code = String(r.code || "").trim().toUpperCase();
      if (!code) return next(new ApiError(400, "Every pool needs a code"));
      if (codes.has(code)) return next(new ApiError(400, `Duplicate code: ${code}`));
      codes.add(code);
      cleanRows.push({
        code,
        label: String(r.label || `Prize ${code}`).trim(),
        symbol: String(r.symbol || "🎁"),
        amount: Math.max(0, Number(r.amount) || 0),
        percent: Math.max(0, Number(r.percent) || 0),
        sortOrder: Number(r.sortOrder) || 0,
        isActive: r.isActive !== false,
      });
    }

    const v = validatePoolConfig(cleanRows, companyPercent);
    if (v.over100) {
      return next(
        new ApiError(
          400,
          `This setup isn't valid — total is ${v.grandTotalPercent}%, which is over 100%. Prizes + company fund can be at most 100%.`,
        ),
      );
    }

    const existing = await LuckyPrizePool.find();
    const existingByCode = new Map(existing.map((p: any) => [p.code, p]));

    for (const r of cleanRows) {
      const cur: any = existingByCode.get(r.code);
      if (cur) {
        cur.label = r.label;
        cur.symbol = r.symbol;
        cur.amount = r.amount;
        cur.percent = r.percent;
        cur.sortOrder = r.sortOrder;
        cur.isActive = r.isActive;
        await cur.save();
      } else {
        await LuckyPrizePool.create({ ...r, balance: 0 });
      }
    }

    for (const p of existing as any[]) {
      if (!codes.has(p.code)) {
        if (Number(p.balance) > 0 || Number(p.timesWon) > 0) {
          p.isActive = false;
          await p.save();
        } else {
          await LuckyPrizePool.findByIdAndDelete(p._id);
        }
      }
    }

    await LuckyPoolConfig.updateOne(
      { key: "global" },
      {
        $set: {
          companyFundPercent: companyPercent,
          lastConfirmedAt: new Date(),
          updatedBy: req.user?._id,
        },
      },
      { upsert: true },
    );

    const pools = await LuckyPrizePool.find().sort({ sortOrder: 1 });
    res.status(200).json({
      success: true,
      message: `Saved — total ${v.grandTotalPercent}%${v.exactly100 ? " (exactly 100%)" : ""}`,
      pools: pools.map(poolPlain),
      totals: {
        grandTotalPercent: v.grandTotalPercent,
        prizePercentSum: v.prizePercentSum,
        companyFundPercent: companyPercent,
      },
    });
  },
);

// ===== ডিফল্ট A–I পুল সিড ===== POST /admin/lucky/prize-pools/seed
export const adminSeedPrizePools = catchAsync(async (_req: Request, res: Response) => {
  const existing = await LuckyPrizePool.countDocuments();
  if (existing > 0) {
    await ensurePrizePools();
    return res
      .status(200)
      .json({ success: true, message: "Prize pools already exist — nothing changed" });
  }
  await LuckyPrizePool.insertMany(DEFAULT_POOLS.map((p) => ({ ...p })));
  await LuckyPoolConfig.updateOne(
    { key: "global" },
    { $set: { companyFundPercent: DEFAULT_COMPANY_FUND_PERCENT } },
    { upsert: true },
  );
  res.status(200).json({ success: true, message: "Default 9 prize pools (A–I) seeded" });
});

// ===== একটা পুল ডিলিট ===== DELETE /admin/lucky/prize-pools/:code
export const adminDeletePrizePool = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    const pool: any = await LuckyPrizePool.findOne({ code });
    if (!pool) return next(new ApiError(404, "Pool not found"));
    if (Number(pool.balance) > 0 || Number(pool.timesWon) > 0) {
      pool.isActive = false;
      await pool.save();
      return res
        .status(200)
        .json({ success: true, message: "This pool has history — only deactivated" });
    }
    await LuckyPrizePool.findByIdAndDelete(pool._id);
    res.status(200).json({ success: true, message: "Pool deleted" });
  },
);

// ===== লাইভ RTP রিপোর্ট + সাম্প্রতিক কার্ড ===== GET /admin/lucky/stats
export const adminLuckyStats = catchAsync(async (_req: Request, res: Response) => {
  const types = await LuckyCardType.find().sort({ sortOrder: 1 });

  const rtp = [];
  for (const type of types as any[]) {
    const openedMatch: any = { cardType: type._id, status: "opened" };
    if (type.statsSince) openedMatch.openedAt = { $gte: type.statsSince };

    const [agg, tierRows] = await Promise.all([
      LuckyCard.aggregate([
        { $match: openedMatch },
        { $group: { _id: null, count: { $sum: 1 }, paid: { $sum: "$prizeAmount" } } },
      ]),
      LuckyPrizeTier.find({ cardType: type._id }),
    ]);

    const opened = agg[0] ? agg[0].count : 0;
    const paid = agg[0] ? agg[0].paid : 0;
    const staked = opened * Number(type.price);
    const tp = tierRows.map(tierPlain);

    rtp.push({
      _id: type._id,
      name: type.name,
      price: Number(type.price),
      targetRtp: Number(type.targetRtp),
      theoreticalRtp: Math.round(theoreticalRtp(tp, Number(type.price)) * 10000) / 100,
      cardsOpened: opened,
      staked,
      paidOut: paid,
      actualRtp: staked > 0 ? Math.round((paid / staked) * 10000) / 100 : 0,
      houseProfit: staked - paid,
      statsSince: type.statsSince || null,
    });
  }

  const [totalPurchase, totalPrize, recentCards, recentPurchases] = await Promise.all([
    LuckyPurchase.aggregate([{ $group: { _id: null, sum: { $sum: "$totalPrice" } } }]),
    LuckyCard.aggregate([
      { $match: { status: "opened" } },
      { $group: { _id: null, sum: { $sum: "$prizeAmount" } } },
    ]),
    LuckyCard.find({ status: "opened", prizeAmount: { $gt: 0 } })
      .sort({ openedAt: -1 })
      .limit(20)
      .populate("user", "name customerId"),
    LuckyPurchase.find().sort({ createdAt: -1 }).limit(30).populate("user", "name customerId"),
  ]);

  const staked = totalPurchase[0] ? totalPurchase[0].sum : 0;
  const paid = totalPrize[0] ? totalPrize[0].sum : 0;

  const cfg = await ensurePrizePools();
  const poolDocs = await LuckyPrizePool.find().sort({ sortOrder: 1 });
  const poolRows = poolDocs.map(poolPlain);
  const prizePercentSum = poolRows.reduce((s, r) => s + r.percent, 0);
  const poolBalanceTotal = poolRows.reduce((s, r) => s + r.balance, 0);

  res.status(200).json({
    success: true,
    summary: {
      totalStaked: staked,
      totalPaidOut: paid,
      grossRevenue: staked - paid,
      liveRtp: staked > 0 ? Math.round((paid / staked) * 10000) / 100 : 0,
    },
    prizePool: {
      pools: poolRows,
      companyFundPercent: Number(cfg.companyFundPercent || 0),
      companyFundCollected: poolRound2(cfg.companyFundCollected || 0),
      totalContributed: poolRound2(cfg.totalContributed || 0),
      totalPaidOut: poolRound2(cfg.totalPaidOut || 0),
      poolBalanceTotal: poolRound2(poolBalanceTotal),
      configuredPayoutPercent: poolRound4(prizePercentSum),
      grandTotalPercent: poolRound4(prizePercentSum + Number(cfg.companyFundPercent || 0)),
      actualRtp:
        Number(cfg.totalContributed) > 0
          ? poolRound2((Number(cfg.totalPaidOut) / Number(cfg.totalContributed)) * 100)
          : 0,
      lastConfirmedAt: cfg.lastConfirmedAt || null,
    },
    rtp,
    recentWins: (recentCards as any[]).map((c) => ({
      _id: c._id,
      shortCode: c.shortCode,
      user: c.user ? c.user.name : "",
      customerId: c.user ? c.user.customerId : "",
      cardType: c.cardTypeName,
      prizeCode: c.prizePoolCode || "",
      prizeLabel: c.prizeLabel || "",
      prizeAmount: Number(c.prizeAmount),
      source: c.source,
      openedAt: c.openedAt,
    })),
    recentPurchases: (recentPurchases as any[]).map((p) => ({
      _id: p._id,
      user: p.user ? p.user.name : "",
      customerId: p.user ? p.user.customerId : "",
      cardType: p.cardTypeName,
      quantity: p.quantity,
      totalPrice: Number(p.totalPrice),
      source: p.source,
      createdAt: p.createdAt,
    })),
  });
});

// ===== "প্রকৃত RTP" গণনার উইন্ডো রিসেট ===== POST /admin/lucky/card-types/:id/reset-stats
export const adminResetLuckyStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params.id;
    const now = new Date();

    if (id === "all") {
      const r = await LuckyCardType.updateMany({}, { $set: { statsSince: now } });
      return res.status(200).json({
        success: true,
        message: `Actual-RTP stats reset for ${(r as any).modifiedCount ?? 0} card type(s)`,
        statsSince: now,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ApiError(400, "Invalid card type"));
    }
    const type = await LuckyCardType.findByIdAndUpdate(
      id,
      { $set: { statsSince: now } },
      { new: true },
    );
    if (!type) return next(new ApiError(404, "Card type not found"));

    res.status(200).json({
      success: true,
      message: `Actual-RTP stats reset for ${type.name}`,
      statsSince: now,
    });
  },
);

// ===== একটা ইউজারের লাকি কার্ড ডিটেলস (অ্যাডমিন) ===== GET /admin/lucky/user/:userId
export const adminUserLuckyDetail = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId;
    const user = await User.findById(userId).select("name customerId phone m_balance");
    if (!user) return next(new ApiError(404, "User not found"));

    const [purchases, cards, agg] = await Promise.all([
      LuckyPurchase.find({ user: userId }).sort({ createdAt: -1 }).limit(50),
      LuckyCard.find({ user: userId }).sort({ createdAt: -1 }).limit(100),
      LuckyCard.aggregate([
        {
          $match: {
            user: new mongoose.Types.ObjectId(userId),
            status: "opened",
          },
        },
        { $group: { _id: null, opened: { $sum: 1 }, won: { $sum: "$prizeAmount" } } },
      ]),
    ]);

    const spent = purchases.reduce((s, p: any) => s + Number(p.totalPrice), 0);

    res.status(200).json({
      success: true,
      user,
      stats: {
        totalSpent: spent,
        cardsBought: cards.length,
        cardsOpened: agg[0] ? agg[0].opened : 0,
        totalWon: agg[0] ? agg[0].won : 0,
      },
      purchases: purchases.map((p: any) => ({
        _id: p._id,
        cardType: p.cardTypeName,
        quantity: p.quantity,
        totalPrice: Number(p.totalPrice),
        source: p.source,
        createdAt: p.createdAt,
      })),
      cards: cards.map((c: any) => ({
        _id: c._id,
        shortCode: c.shortCode,
        cardType: c.cardTypeName,
        status: c.status,
        source: c.source,
        prizeAmount: Number(c.prizeAmount),
        openedAt: c.openedAt,
        createdAt: c.createdAt,
      })),
    });
  },
);

/* ══════════════════════ ADMIN — GIFT LUCKY PACKAGE ══════════════════════
 * অ্যাডমিন যেকোনো ইউজারকে যেকোনো (বিদ্যমান) লাকি প্যাকেজ বিনামূল্যে গিফট
 * করতে পারবে + সেই গিফটের জন্য একটা প্রাইজ amount (USDT) বসিয়ে দিতে
 * পারবে। ইউজারের balance থেকে কিছু কাটা হয় না, গ্লোবাল প্রাইজ পুলেও কোনো
 * contribution যায় না — সম্পূর্ণ ফ্রি। ইউজার প্যাকেজের কার্ডগুলো নিজের
 * "My Cards" থেকে স্বাভাবিক নিয়মেই স্ক্র্যাচ করবে; ব্যাচের একটা কার্ডে
 * (র‍্যান্ডম) admin-এর বসানো prizeAmount preset থাকে, বাকিগুলো "no win"।
 * ══════════════════════════════════════════════════════════════════════ */

// ===== POST /admin/lucky/gift  { userId, packageId, prizeAmount, note } =====
export const adminGiftLuckyPackage = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { userId, packageId, prizeAmount, note } = req.body as {
      userId: string;
      packageId: string;
      prizeAmount?: number;
      note?: string;
    };

    if (!mongoose.Types.ObjectId.isValid(userId || "")) {
      return next(new ApiError(400, "Invalid user"));
    }
    if (!mongoose.Types.ObjectId.isValid(packageId || "")) {
      return next(new ApiError(400, "Invalid package"));
    }

    const targetUser = await User.findById(userId).select("name customerId m_balance");
    if (!targetUser) return next(new ApiError(404, "User not found"));

    const pkg: any = await LuckyPackage.findById(packageId).populate("cardType");
    if (!pkg) return next(new ApiError(404, "Package not found"));
    if (!pkg.cardType) return next(new ApiError(400, "This package has no card type"));

    const giftAmount = Math.max(0, Number(prizeAmount) || 0);
    const totalCards = pkg.cardCount + pkg.bonusCards;

    const purchase = await LuckyPurchase.create({
      user: targetUser._id,
      customerId: targetUser.customerId,
      cardType: pkg.cardType._id,
      cardTypeName: pkg.cardType.name,
      package: pkg._id,
      quantity: totalCards,
      unitPrice: 0,
      totalPrice: 0,
      source: "gift",
      giftedBy: req.user?._id,
      giftNote: note ? String(note).trim() : "",
      giftPrizeAmount: giftAmount,
    });

    // ব্যাচের যেকোনো একটা কার্ডে পুরো prize amount বসে (র‍্যান্ডম index)
    const winningIndex =
      giftAmount > 0 ? Math.floor(Math.random() * totalCards) : -1;

    const clientSeed = defaultClientSeed();
    const cardDocs = [];
    for (let i = 0; i < totalCards; i += 1) {
      const { serverSeed, serverSeedHash } = createSeedPair();
      cardDocs.push({
        shortCode: generateCardCode(),
        user: targetUser._id,
        customerId: targetUser.customerId,
        purchase: purchase._id,
        cardType: pkg.cardType._id,
        cardTypeName: pkg.cardType.name,
        accent: pkg.cardType.accent,
        source: "gift",
        presetPrizeAmount: i === winningIndex ? giftAmount : 0,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce: i,
      });
    }
    const cards = await LuckyCard.insertMany(cardDocs);

    res.status(201).json({
      success: true,
      message: `Gifted "${pkg.name}" (${totalCards} cards) to ${targetUser.name}`,
      purchase: {
        _id: purchase._id,
        user: targetUser.name,
        customerId: targetUser.customerId,
        cardType: pkg.cardType.name,
        quantity: totalCards,
        prizeAmount: giftAmount,
      },
      cards: cards.map(publicUnopened),
    });
  },
);

// ===== GET /admin/lucky/gifts — গিফটের হিস্টরি =====
export const adminListGifts = catchAsync(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));

  const filter = { source: "gift" };
  const [total, rows] = await Promise.all([
    LuckyPurchase.countDocuments(filter),
    LuckyPurchase.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "name customerId")
      .populate("giftedBy", "name customerId"),
  ]);

  res.status(200).json({
    success: true,
    gifts: (rows as any[]).map((p) => ({
      _id: p._id,
      user: p.user ? { _id: p.user._id, name: p.user.name, customerId: p.user.customerId } : null,
      giftedBy: p.giftedBy
        ? { _id: p.giftedBy._id, name: p.giftedBy.name, customerId: p.giftedBy.customerId }
        : null,
      cardType: p.cardTypeName,
      quantity: p.quantity,
      prizeAmount: Number(p.giftPrizeAmount || 0),
      note: p.giftNote || "",
      createdAt: p.createdAt,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ===== ডিফল্ট ক্যাটালগ সিড ===== POST /admin/lucky/seed
export const seedLuckyCards = catchAsync(async (_req: Request, res: Response) => {
  await ensurePrizePools();

  const catalog = [
    {
      key: "lucky-mini",
      name: "Lucky Mini",
      price: 20,
      accent: "#22C55E",
      targetRtp: 80,
      displayTopPrize: 500000,
      sortOrder: 0,
      tiers: [
        { label: "No win", symbol: "🪙", amount: 0, weight: 5600 },
        { label: "10 USDT", symbol: "🪙", amount: 10, weight: 3000 },
        { label: "25 USDT", symbol: "💵", amount: 25, weight: 900 },
        { label: "60 USDT", symbol: "💸", amount: 60, weight: 350 },
        { label: "200 USDT", symbol: "💰", amount: 200, weight: 110 },
        { label: "1000 USDT", symbol: "👑", amount: 1000, weight: 34 },
        {
          label: "5000 USDT Jackpot",
          symbol: "💎",
          amount: 5000,
          weight: 6,
          stockLimit: 12,
          isJackpot: true,
        },
      ],
      packages: [
        { name: "3 Cards", cardCount: 3, bonusCards: 0, regularPrice: 75, price: 60, sortOrder: 0 },
        { name: "5 Cards", cardCount: 5, bonusCards: 0, regularPrice: 125, price: 95, sortOrder: 1 },
        {
          name: "10 + 1 Cards",
          cardCount: 10,
          bonusCards: 1,
          regularPrice: 240,
          price: 180,
          sortOrder: 2,
        },
      ],
    },
    {
      key: "lucky-star",
      name: "Lucky Star",
      price: 50,
      accent: "#7C5CFC",
      targetRtp: 82,
      displayTopPrize: 1500000,
      sortOrder: 1,
      tiers: [
        { label: "No win", symbol: "🪙", amount: 0, weight: 6000 },
        { label: "25 USDT", symbol: "🪙", amount: 25, weight: 2600 },
        { label: "60 USDT", symbol: "💵", amount: 60, weight: 900 },
        { label: "150 USDT", symbol: "💸", amount: 150, weight: 350 },
        { label: "600 USDT", symbol: "💰", amount: 600, weight: 110 },
        { label: "2500 USDT", symbol: "👑", amount: 2500, weight: 34 },
        {
          label: "15000 USDT Jackpot",
          symbol: "💎",
          amount: 15000,
          weight: 6,
          stockLimit: 8,
          isJackpot: true,
        },
      ],
      packages: [
        { name: "3 Cards", cardCount: 3, bonusCards: 0, regularPrice: 190, price: 150, sortOrder: 0 },
        { name: "5 Cards", cardCount: 5, bonusCards: 0, regularPrice: 300, price: 240, sortOrder: 1 },
        {
          name: "10 + 1 Cards",
          cardCount: 10,
          bonusCards: 1,
          regularPrice: 600,
          price: 460,
          sortOrder: 2,
        },
      ],
    },
    {
      key: "lucky-gold",
      name: "Lucky Gold",
      price: 100,
      accent: "#F5B93B",
      targetRtp: 80,
      displayTopPrize: 2500000,
      sortOrder: 2,
      tiers: [
        { label: "No win", symbol: "🪙", amount: 0, weight: 5700 },
        { label: "50 USDT", symbol: "🪙", amount: 50, weight: 2800 },
        { label: "120 USDT", symbol: "💵", amount: 120, weight: 900 },
        { label: "300 USDT", symbol: "💸", amount: 300, weight: 400 },
        { label: "1000 USDT", symbol: "💰", amount: 1000, weight: 150 },
        { label: "3500 USDT", symbol: "👑", amount: 3500, weight: 45 },
        {
          label: "25000 USDT Jackpot",
          symbol: "💎",
          amount: 25000,
          weight: 5,
          stockLimit: 4,
          isJackpot: true,
        },
      ],
      packages: [
        { name: "3 Cards", cardCount: 3, bonusCards: 0, regularPrice: 380, price: 300, sortOrder: 0 },
        { name: "5 Cards", cardCount: 5, bonusCards: 0, regularPrice: 600, price: 480, sortOrder: 1 },
        {
          name: "10 + 1 Cards",
          cardCount: 10,
          bonusCards: 1,
          regularPrice: 1200,
          price: 920,
          sortOrder: 2,
        },
      ],
    },
  ];

  const results = [];
  for (const c of catalog) {
    let type: any = await LuckyCardType.findOne({ key: c.key });
    if (!type) {
      type = await LuckyCardType.create({
        key: c.key,
        name: c.name,
        price: c.price,
        accent: c.accent,
        targetRtp: c.targetRtp,
        displayTopPrize: c.displayTopPrize || 0,
        sortOrder: c.sortOrder,
      });
    } else if (c.displayTopPrize && !type.displayTopPrize) {
      type.displayTopPrize = c.displayTopPrize;
      await type.save();
    }
    const tierCount = await LuckyPrizeTier.countDocuments({ cardType: type._id });
    if (tierCount === 0) {
      await LuckyPrizeTier.insertMany(
        c.tiers.map((t: any, i) => ({
          cardType: type._id,
          label: t.label,
          symbol: t.symbol,
          amount: t.amount,
          weight: t.weight,
          stockLimit: t.stockLimit != null ? t.stockLimit : null,
          isJackpot: !!t.isJackpot,
          sortOrder: i,
        })),
      );
    }
    const pkgCount = await LuckyPackage.countDocuments({ cardType: type._id });
    if (pkgCount === 0) {
      await LuckyPackage.insertMany(c.packages.map((p) => ({ cardType: type._id, ...p })));
    }
    results.push(type.name);
  }

  res.status(200).json({ success: true, message: `Seeded: ${results.join(", ")}` });
});

/* ══════════════════════════════ helpers ═══════════════════════════════ */
function publicUnopened(c: any) {
  return {
    _id: c._id,
    shortCode: c.shortCode,
    status: "unopened",
    cardType: c.cardTypeName,
    accent: c.accent,
    source: c.source,
    serverSeedHash: c.serverSeedHash,
    createdAt: c.createdAt,
  };
}

function revealPayload(c: any, justOpened: boolean) {
  return {
    _id: c._id,
    shortCode: c.shortCode,
    status: "opened",
    justOpened: !!justOpened,
    cardType: c.cardTypeName,
    accent: c.accent,
    source: c.source,
    prizeAmount: Number(c.prizeAmount),
    prizeLabel: c.prizeLabel,
    prizeCode: c.prizePoolCode || "",
    revealSymbol: c.revealSymbol,
    win: Number(c.prizeAmount) > 0,
    contribution: Number(c.contribution || 0),
    poolSnapshot: (c.poolSnapshot || []).map((p: any) => ({
      code: p.code,
      balance: Number(p.balance),
      amount: Number(p.amount),
    })),
    openedAt: c.openedAt,
    createdAt: c.createdAt,
  };
}
