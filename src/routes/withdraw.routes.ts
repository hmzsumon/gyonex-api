import {
  approveWithdrawRequest,
  geMyWithdraws,
  getAllPendingWithdrawsForAdmin,
  getAllWithdrawsForAdmin,
  getWithdrawById,
  newWithdrawRequest,
  rejectWithdrawRequest,
} from "@/controllers/withdraw.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";
const router = Router();

// create new withdraw request
router.post("/new-withdraw-request", isAuthenticatedUser, newWithdrawRequest);

// get all withdraws for admin
router.get(
  "/get-all-withdraws-for-admin",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllWithdrawsForAdmin
);

// get withdraw by id
router.get("/get-withdraw-by-id/:id", isAuthenticatedUser, getWithdrawById);

// get all pending withdraws for admin
router.get(
  "/admin/pending-withdraws",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllPendingWithdrawsForAdmin
);

// approve withdraw request
router.put(
  "/admin/withdraw/approve",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  approveWithdrawRequest
);

// reject withdraw request
router.put(
  "/admin/withdraw/reject",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  rejectWithdrawRequest
);

/* ────────── get my withdraws ────────── */
router.get("/my-withdraws", isAuthenticatedUser, geMyWithdraws);

export default router;
