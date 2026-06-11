// backend/routes/notification.route.ts
import {
  getAdminNotifications,
  getMyUnreadNotifications,
  getMyUnreadNotificationsCount,
  updateAdminNotificationIsRead,
  updateNotificationIsRead,
} from "@/controllers/notification.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

/* ──────────  router init  ────────── */
const router = Router();

/* ──────────  GET: my unread count  ────────── */
router.get(
  "/my-unread-notifications-count",
  isAuthenticatedUser,
  getMyUnreadNotificationsCount
);

/* ──────────  GET: my unread list  ────────── */
router.get(
  "/my-unread-notifications",
  isAuthenticatedUser,
  getMyUnreadNotifications
);

/* ──────────  PUT: mark a notification read  ────────── */
router.put(
  "/update-notification/:id",
  isAuthenticatedUser,
  updateNotificationIsRead
);

/* ──────────  GET: admin unread list  ────────── */
router.get(
  "/admin-notifications",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAdminNotifications
);

/* ──────────  PUT: mark admin notifications read  ────────── */
router.put(
  "/update-admin-notification",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  updateAdminNotificationIsRead
);

export default router;
