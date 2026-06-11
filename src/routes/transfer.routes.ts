/* ───────────────────────────────────────────────────────────
   Transfer routes (internal account↔account)
─────────────────────────────────────────────────────────── */
import {
  createInternalTransfer,
  listMyAccountsLite,
} from "@/controllers/transfer.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.get("/transfer/accounts", isAuthenticatedUser, listMyAccountsLite);

router.post("/transfer", isAuthenticatedUser, createInternalTransfer);

export default router;
