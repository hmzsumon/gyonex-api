import {
  adminBulkUpsertStakingPlans,
  adminGetAllStakingPlans,
  adminRunStakingProfit,
  adminUpsertStakingPlan,
} from "@/controllers/admin.staking.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.get(
  "/admin/staking/plans",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminGetAllStakingPlans
);

router.post(
  "/admin/staking/plan",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminUpsertStakingPlan
);

// ✅ bulk endpoint
router.post(
  "/admin/staking/plans/bulk",

  adminBulkUpsertStakingPlans
);

// ✅ POST /admin/staking/run-profit
router.post("/staking/run-profit", adminRunStakingProfit);

export default router;
