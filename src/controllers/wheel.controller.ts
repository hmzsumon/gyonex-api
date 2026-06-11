/* ── Wheel Controller (Multi-Game) ─────────────────────────────────────────────────────── */

/* ── Imports ─────────────────────────────────────────────────────────────────────────────── */
import {
  allowedSegmentIds,
  getGameConfig,
  segmentMap,
} from "@/constants/wheel.config";
import { User } from "@/models/user.model";
import WheelRound from "@/models/WheelRound.model";
import { typeHandler } from "@/types/express";
import type { BetInput } from "@/types/wheel";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import TransactionManager from "@/utils/TransactionManager";
import { Request, Response } from "express";
import { startSession, Types } from "mongoose";

/* ── Helpers ─────────────────────────────────────────────────────────────────────────────── */
// sum numbers safely
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

/* ── Handler: GET /games/:gameKey/wheel/config ───────────────────────────────────────────── */
export const getConfig = catchAsync(async (req: Request, res: Response) => {
  const { gameKey } = req.body as { gameKey: string };
  const cfg = getGameConfig(gameKey);
  if (!cfg) throw new ApiError(404, "Game config not found");
  return res.json({
    success: true,
    game: { key: cfg.key, name: cfg.name, segments: cfg.segments },
  });
});

/* ── Handler: POST /games/:gameKey/wheel/place-bet ───────────────────────────────────────── */
/* ── Body: { bets: BetInput[] } ──────────────────────────────────────────────────────────── */
export const placeBet: typeHandler = catchAsync(async (req, res, next) => {
  const { gameKey } = req.body as { gameKey: string };

  /* ── Auth ───────────────────────────────────────────────────────────── */
  const userId = req.user?._id;
  if (!userId) return next(new ApiError(401, "Unauthorized"));

  const user = await User.findById(userId);
  if (!user) return next(new ApiError(401, "User not found"));

  /* ── Game Config ────────────────────────────────────────────────────── */
  const cfg = getGameConfig(gameKey);
  if (!cfg) return next(new ApiError(404, "Game not found"));

  /* ── Validate Input ─────────────────────────────────────────────────── */
  const { bets } = req.body as { bets: BetInput[] };
  if (!Array.isArray(bets) || bets.length === 0) {
    return next(new ApiError(400, "No bets provided"));
  }

  // console.log("Received bets:", bets);

  const allowedIds = allowedSegmentIds(gameKey);

  // sanitize: coerce to integers, filter invalid rows
  const cleanBets = bets
    .map((b) => ({
      segmentId: Number(b.segmentId),
      amount: Math.floor(Number(b.amount) || 0),
    }))
    .filter((b) => b.segmentId && b.amount > 0);

  if (!cleanBets.length) {
    return next(new ApiError(400, "Invalid bets payload"));
  }

  for (const b of cleanBets) {
    if (!allowedIds.has(b.segmentId)) {
      return next(new ApiError(400, `Invalid segmentId: ${b.segmentId}`));
    }
    if (cfg.minBet && b.amount < cfg.minBet) {
      return next(
        new ApiError(
          400,
          `Bet too small (min ${cfg.minBet}) on segment ${b.segmentId}`
        )
      );
    }
    if (cfg.maxBet && b.amount > cfg.maxBet) {
      return next(
        new ApiError(
          400,
          `Bet too large (max ${cfg.maxBet}) on segment ${b.segmentId}`
        )
      );
    }
  }

  const totalStake = sum(cleanBets.map((b) => b.amount));
  if (!totalStake || totalStake <= 0) {
    return next(new ApiError(400, "Total stake must be positive"));
  }
  if (cfg.maxTotalStake && totalStake > cfg.maxTotalStake) {
    return next(
      new ApiError(
        400,
        `Total stake exceeds max allowed (${cfg.maxTotalStake})`
      )
    );
  }

  if (user.m_balance < totalStake) {
    return next(new ApiError(400, "Insufficient balance"));
  }

  /* ── Transaction: Stake & Create Round ───────────────────────────────── */
  const session = await startSession();
  try {
    // You can use session.startTransaction() if other writes need atomicity across collections
    // await session.startTransaction();

    if (user.m_balance < totalStake) {
      return next(new ApiError(400, "Insufficient balance"));
    }

    // 1) debit balance
    user.m_balance = Math.max(0, user.m_balance - totalStake);
    user.bet_volume = Math.max(0, user.bet_volume - totalStake);
    if (user.bet_volume === 0) {
      user.is_complete_bet_volume = true;
    }
    await user.save({ session });

    // 2) write transaction (cashOut) — keep as-is if TransactionManager doesn't accept session
    const txm = new TransactionManager();
    await txm.createTransaction({
      userId: String(userId),
      transactionType: "cashOut",
      amount: totalStake,
      purpose: "game:bet",
      description: `Wheel bet ${totalStake}`,
    });

    // 3) open round
    //    IMPORTANT: generate a fresh _id, and set the same value in roundId (string)
    //    so unique index on roundId never clashes with null/undefined duplicates.
    const newId = new Types.ObjectId();
    const round = await WheelRound.create(
      [
        {
          _id: newId, // explicit _id (ObjectId)
          roundId: String(newId), // mirror as string for unique 'roundId'
          userId,
          gameKey,
          bets: cleanBets,
          totalStake,
          status: "open",
          txIds: [],
        },
      ],
      { session }
    );

    // If you started a transaction earlier:
    // await session.commitTransaction();

    res.status(201).json({ success: true, roundId: String(newId), totalStake });
  } catch (err) {
    // If you started a transaction earlier:
    // await session.abortTransaction();
    return next(err);
  } finally {
    session.endSession();
  }
});

/* ── Handler: POST /games/:gameKey/wheel/settle ──────────────────────────────────────────── */
export const settleRound: typeHandler = catchAsync(async (req, res, next) => {
  const { gameKey } = req.body as { gameKey: string };

  /* ── Auth ───────────────────────────────────────────────────────────── */
  const userId = req.user?._id;
  if (!userId) return next(new ApiError(401, "Unauthorized"));

  const user = await User.findById(userId);
  if (!user) return next(new ApiError(401, "User not found"));

  /* ── Game Config ────────────────────────────────────────────────────── */
  const cfg = getGameConfig(gameKey);
  if (!cfg) return next(new ApiError(404, "Game not found"));

  /* ── Validate Input ─────────────────────────────────────────────────── */
  const { roundId, winningSegmentId, finalMulti } = req.body as {
    roundId: string;
    winningSegmentId: number;
    finalMulti?: number;
  };
  if (!roundId || (!winningSegmentId && winningSegmentId !== 0)) {
    return next(new ApiError(400, "roundId & winningSegmentId required"));
  }

  const map = segmentMap(gameKey);
  const seg = map.get(Number(winningSegmentId));
  if (!seg) return next(new ApiError(400, "Invalid winningSegmentId"));

  /* ── Transaction: Settle & Payout ───────────────────────────────────── */
  const session = await startSession();
  try {
    // 1) Load round by _id (we returned this as roundId to the client)
    const round = await WheelRound.findOne({
      _id: roundId,
      userId,
      gameKey,
    }).session(session);
    if (!round) throw new ApiError(404, "Round not found");
    if (round.status !== "open") {
      throw new ApiError(400, "Round already settled");
    }

    // 2) Compute payout
    const winBet = round.bets.find((b: any) => b.segmentId === seg.id);
    const appliedMulti = finalMulti ?? seg.multi;
    const payout = winBet ? Math.floor(winBet.amount * appliedMulti) : 0;
    const net = payout - round.totalStake;

    // 3) Persist outcome
    round.outcome = {
      segmentId: seg.id,
      baseMulti: seg.multi,
      finalMulti: appliedMulti,
      angle: seg.angle,
    } as any;
    round.payout = payout;
    round.net = net;
    round.status = "settled";
    round.settledAt = new Date();

    // 4) Credit if win
    if (payout > 0) {
      user.m_balance += payout;
      await user.save({ session });

      const txm = new TransactionManager();
      await txm.createTransaction({
        userId: String(userId),
        transactionType: "cashIn",
        amount: Number(payout),
        purpose: "game:payout",
        description: `Wheel payout ${payout} (round ${roundId})`,
      });
    }

    await round.save({ session });

    res.json({
      success: true,
      roundId: round._id,
      outcome: round.outcome,
      payout: round.payout,
      net: round.net,
      status: round.status,
    });
  } catch (err) {
    return next(err);
  } finally {
    session.endSession();
  }
});

/* ── Handler: GET /games/:gameKey/wheel/history ─────────────────────────────────────────── */
/* ── Query: ?limit=50 ───────────────────────────────────────────────────────────────────── */
export const myRounds = catchAsync(async (req: Request, res: Response) => {
  const { gameKey } = req.params as { gameKey: string };

  /* ── Auth ──────────────────────────────────────────────────────────────────────────────── */
  const userId = new Types.ObjectId(
    (req as any).user?._id || (req as any).user?.id
  );
  if (!userId) throw new ApiError(401, "Unauthorized");

  /* ── Query & Respond ───────────────────────────────────────────────────────────────────── */
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
  const rounds = await WheelRound.find({ userId, gameKey })
    .sort({ createdAt: -1 })
    .limit(limit);

  res.json({ success: true, rounds });
});

/* ── End ─────────────────────────────────────────────────────────────────────────────────── */
