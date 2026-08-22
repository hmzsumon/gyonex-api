/* ────────── imports ────────── */
import {
  bulkUpdateUserWithdrawRules,
  getAllUsersAndUpdateAddNewMember,
  getAllUsersPaginated,
  getUserByIdWithWallet,
  getUserTransactionsPaginated,
  updateUserWithdrawRules,
} from "@/controllers/admin.users.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

/* ────────── router ────────── */
const router = Router();

/* ────────── Admin Users listing ────────── */
router.get(
  "/admin/users",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllUsersPaginated,
);

/* ────────── details ────────── */
router.get(
  "/admin/users/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getUserByIdWithWallet,
);

/* ────────── transactions ────────── */
router.get(
  "/admin/users/:id/transactions",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getUserTransactionsPaginated,
);

/* ────────── withdraw rules: bulk ──────────
   ⚠️ :id রুটের আগে রাখতে হবে, না হলে "withdraw-rules" কে id ধরে নেবে
─────────────────────────────────────────────── */
router.patch(
  "/admin/users/withdraw-rules/bulk",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  bulkUpdateUserWithdrawRules,
);

/* ────────── withdraw rules: single user ────────── */
router.patch(
  "/admin/users/:id/withdraw-rules",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  updateUserWithdrawRules,
);

/* ────────── add new member ────────── */
router.put(
  "/admin/users/add-new-member",

  getAllUsersAndUpdateAddNewMember,
);

export default router;
