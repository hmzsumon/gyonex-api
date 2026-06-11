import {
  adminCreateManualDeposit,
  adminPreviewManualDeposit,
  createDepositWithBlockBee,
  getAllDeposits,
  getAllDepositsForAdmin,
  getDepositByIdForAdmin,
  getMyDeposits,
  getSingleDeposit,
  handleBlockBeeCallback,
  testSocketConnection,
} from "@/controllers/deposit.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

// create deposit with BlockBee
router.post(
  "/create-new-deposit",
  isAuthenticatedUser,
  createDepositWithBlockBee
);

// BlockBee callback route
router.get("/callback/:id", handleBlockBeeCallback);

// get my deposits
router.get("/my-deposits", isAuthenticatedUser, getMyDeposits);

// test socket connection
router.get(
  "/test-socket-connection",
  isAuthenticatedUser,
  testSocketConnection
);

// get all deposits for admin
router.get(
  "/admin/all-deposits",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllDepositsForAdmin
);

// get deposit by id for admin
router.get(
  "/admin/deposit/:depositId",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getDepositByIdForAdmin
);

router.get(
  "/deposits",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllDeposits
);
router.get(
  "/deposits/:id",
  isAuthenticatedUser,
  authorizeRoles("admin", "agent"),
  getSingleDeposit
);

/* ────────── preview before confirm (GET) ────────── */
router.get(
  "/admin/deposits/preview",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminPreviewManualDeposit
);

/* ────────── confirm + create deposit (POST) ────────── */
router.post(
  "/admin/deposits/manual",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminCreateManualDeposit
);

export default router;
