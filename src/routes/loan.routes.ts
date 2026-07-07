import {
  applyForLoan,
  approveLoan,
  getAllLoansForAdmin,
  getLoanPackages,
  getMyLoanCountdown,
  getMyLoans,
  rejectLoan,
  repayLoan,
  runLoanDefaults,
} from "@/controllers/loan.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

/* ─────────────────────────────────────────────────────────────────────────
   USER ROUTES
   এখানে সব user loan related route রাখা হয়েছে।
───────────────────────────────────────────────────────────────────────── */

/* ────────── get loan packages ────────── */
router.get("/packages", isAuthenticatedUser, getLoanPackages);

/* ────────── get my loan countdown ──────────
   NOTE: এই route টা /:loanId route এর আগে থাকবে।
   না হলে countdown কে loanId ধরে ফেলতে পারে।
───────────────────────────────────────────────────────────────────────── */
router.get("/my/countdown", isAuthenticatedUser, getMyLoanCountdown);

/* ────────── get my loans ────────── */
router.get("/my", isAuthenticatedUser, getMyLoans);

/* ────────── apply for loan ──────────
   KYC verified user শুধু amount + period দিয়ে apply করবে।
───────────────────────────────────────────────────────────────────────── */
router.post("/apply", isAuthenticatedUser, applyForLoan);

/* ────────── repay loan ────────── */
router.post("/:loanId/repay", isAuthenticatedUser, repayLoan);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN ROUTES
   এখানে admin loan manage করবে।
───────────────────────────────────────────────────────────────────────── */

/* ────────── get all loans for admin ────────── */
router.get(
  "/admin/all",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllLoansForAdmin,
);

/* ────────── approve loan ────────── */
router.patch(
  "/admin/:loanId/approve",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  approveLoan,
);

/* ────────── reject loan ────────── */
router.patch(
  "/admin/:loanId/reject",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  rejectLoan,
);

/* ────────── run daily loan defaults ────────── */
router.post(
  "/admin/run-defaults",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  runLoanDefaults,
);

export default router;
