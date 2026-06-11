// src/routes/kyc.routes.ts
import {
  approveKycRequest,
  getAdminKycRequestById,
  getAdminKycRequests,
  getMyKyc,
  rejectKycRequest,
  saveKycProfile,
  submitKycDocuments,
} from "@/controllers/kyc.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

/* ────────── user routes ────────── */
router.get("/kyc/me", isAuthenticatedUser, getMyKyc);
router.put("/kyc/profile", isAuthenticatedUser, saveKycProfile);
router.post("/kyc/documents", isAuthenticatedUser, submitKycDocuments);

/* ────────── admin routes ────────── */
router.get(
  "/admin/kyc",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAdminKycRequests,
);

router.get(
  "/admin/kyc/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAdminKycRequestById,
);

router.put(
  "/admin/kyc/:id/approve",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  approveKycRequest,
);

router.put(
  "/admin/kyc/:id/reject",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  rejectKycRequest,
);

export default router;
