import {
  adminLogin,
  checkUtilityFunction,
  createPaymentMethod,
  getAdminDashboardSummary,
  getAllUsers,
  getAllUsersByAgentIdAndChangeEmail,
  getUserById,
  initialSetup,
  resetDailyTasks,
  updateAllUsersTaskReport,
} from "@/controllers/admin.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

// initialize setup
router.post("/initial-setup", initialSetup);

// admin login
router.post("/admin/login", adminLogin);

// check utility function
router.post("/check-utility-function", checkUtilityFunction);

// update all users task report
router.put("/update-all-users-task-report", updateAllUsersTaskReport);

// get admin dashboard summary
router.get(
  "/admin/dashboard-summary",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAdminDashboardSummary
);

// get all users
router.get(
  "/admin/users",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllUsers
);

// get user by ID
router.get(
  "/admin/user/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getUserById
);

// reset daily tasks
router.put(
  "/admin/reset-daily-tasks",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  resetDailyTasks
);

/* ────────── Payment Methods ────────── */
router.post("/admin/payment-methods", createPaymentMethod);

// get all users by agent id and change email
router.get(
  "/admin/users-by-agent-id-and-change-email",

  getAllUsersByAgentIdAndChangeEmail
);

export default router;
