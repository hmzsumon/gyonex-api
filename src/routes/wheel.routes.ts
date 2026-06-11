// src/routes/wheel.routes.ts
import {
  getConfig,
  myRounds,
  placeBet,
  settleRound,
} from "@/controllers/wheel.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

// Public config (or protect if you want)
router.get("/games/:gameKey/wheel/config", getConfig);

// Protected gameplay routes
router.post("/games/wheel/place-bet", isAuthenticatedUser, placeBet);
router.post("/games/wheel/settle", isAuthenticatedUser, settleRound);
router.get("/games/:gameKey/wheel/history", isAuthenticatedUser, myRounds);

export default router;
