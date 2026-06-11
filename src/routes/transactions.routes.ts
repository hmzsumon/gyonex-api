import { getMyTransactions } from "@/controllers/transactions.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();
/* ────────── get my transactions ────────── */
router.get("/my-transactions", isAuthenticatedUser, getMyTransactions);

export default router;
