import {
  approveWithdrawRequest,
  geMyWithdraws,
  getAdminWithdrawSettings,
  getAllPendingWithdrawsForAdmin,
  getAllWithdrawsForAdmin,
  getWithdrawById,
  getWithdrawSettings,
  newWithdrawRequest,
  rejectWithdrawRequest,
  updateAdminWithdrawSettings,
} from "@/controllers/withdraw.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { requireKycVerified } from "@/middlewares/kyc.middleware";
import { requireTeamActivation } from "@/middlewares/teamActivation.middleware";
import { Router } from "express";
const router = Router();

// create new withdraw request
router.post(
  "/new-withdraw-request",
  isAuthenticatedUser,
  requireKycVerified, // 🔒 KYC approved না হলে এখানেই আটকে যাবে
  requireTeamActivation, // 🔒 শুধু admin-selected ইউজারদের জন্য
  newWithdrawRequest,
);

// get all withdraws for admin
router.get(
  "/get-all-withdraws-for-admin",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllWithdrawsForAdmin,
);

// get withdraw by id
router.get("/get-withdraw-by-id/:id", isAuthenticatedUser, getWithdrawById);

// get all pending withdraws for admin
router.get(
  "/admin/pending-withdraws",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllPendingWithdrawsForAdmin,
);

// approve withdraw request
router.put(
  "/admin/withdraw/approve",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  approveWithdrawRequest,
);

// reject withdraw request
router.put(
  "/admin/withdraw/reject",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  rejectWithdrawRequest,
);

/* ────────── get my withdraws ────────── */
router.get("/my-withdraws", isAuthenticatedUser, geMyWithdraws);

/* ────────── withdraw settings (fee / min / max / quick amounts / limit) ────────── */
// client-facing (read-only)
router.get("/withdraw/settings", isAuthenticatedUser, getWithdrawSettings);

// admin management
router.get(
  "/admin/withdraw/settings",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAdminWithdrawSettings,
);
router.put(
  "/admin/withdraw/settings",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  updateAdminWithdrawSettings,
);

export default router;
