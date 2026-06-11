// src/routes/staking.routes.ts
import {
  cancelMySubscription,
  getMyStakingSummary,
  getMySubscriptionById,
  getMySubscriptionLogs,
  getMySubscriptions,
  getStakingPlans,
  subscribeStaking,
} from "@/controllers/staking.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.get("/staking/plans", isAuthenticatedUser, getStakingPlans);
router.post("/staking/subscribe", isAuthenticatedUser, subscribeStaking);

router.get("/staking/me", isAuthenticatedUser, getMySubscriptions);
router.get("/staking/summary", isAuthenticatedUser, getMyStakingSummary);

// ✅ details + logs + cancel
router.get(
  "/staking/subscriptions/:id",
  isAuthenticatedUser,
  getMySubscriptionById
);
router.get(
  "/staking/subscriptions/:id/logs",
  isAuthenticatedUser,
  getMySubscriptionLogs
);
router.post(
  "/staking/subscriptions/:id/cancel",
  isAuthenticatedUser,
  cancelMySubscription
);

export default router;
