/* ──────────────────────────────────────────────────────────────────────────
    Trade Routes
────────────────────────────────────────────────────────────────────────── */

// routes/trade.routes.ts
import {
  closePosition,
  getClosedPositions,
  getOpenPositionsByAccountId,
  getPositionById,
  getPositions,
  placeMarketOrder,
} from "@/controllers/trade.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.post("/trade/market", isAuthenticatedUser, placeMarketOrder);
router.post("/trade/:id/close", isAuthenticatedUser, closePosition);

/* ────────── Get all Positions by accountId ────────── */

router.get("/positions", isAuthenticatedUser, getPositions);

/* ────────── Get all Closed Positions by accountId ────────── */

router.get("/closed-positions", isAuthenticatedUser, getClosedPositions);

/* ────────── Get Position by id ────────── */
router.get("/positions/:id", isAuthenticatedUser, getPositionById);

/* ────────── Get Open Positions by accountId ────────── */
router.get("/open-positions", isAuthenticatedUser, getOpenPositionsByAccountId);

export default router;
