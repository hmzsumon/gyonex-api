/* ──────────────────────────────────────────────────────────────────────────
   Account Routes
────────────────────────────────────────────────────────────────────────── */
import {
  closeAccount,
  createAccount,
  myAccounts,
  setDefault,
  transferInternal,
  updateAccount,
} from "@/controllers/account.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.post("/accounts", isAuthenticatedUser, createAccount);
router.get("/accounts/mine", isAuthenticatedUser, myAccounts);
router.patch("/accounts/:id", isAuthenticatedUser, updateAccount);
router.patch("/accounts/:id/default", isAuthenticatedUser, setDefault);
router.post("/accounts/:id/transfer", isAuthenticatedUser, transferInternal);
router.delete("/accounts/:id", isAuthenticatedUser, closeAccount);

export default router;
