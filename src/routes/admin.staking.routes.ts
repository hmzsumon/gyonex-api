import {
  adminGetStakingSettings,
  adminUpdateStakingSettings,
  adminBulkUpsertStakingPlans,
  adminGetAllStakingPlans,
  adminRunStakingProfit,
  adminUpsertStakingPlan,
} from "@/controllers/admin.staking.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.get("/admin/staking/settings", isAuthenticatedUser, authorizeRoles("admin"), adminGetStakingSettings);
router.put("/admin/staking/settings", isAuthenticatedUser, authorizeRoles("admin"), adminUpdateStakingSettings);

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
  isAuthenticatedUser, authorizeRoles("admin"),
  adminBulkUpsertStakingPlans
);

// ✅ POST /admin/staking/run-profit
router.post("/staking/run-profit", isAuthenticatedUser, authorizeRoles("admin"), adminRunStakingProfit);

export default router;
