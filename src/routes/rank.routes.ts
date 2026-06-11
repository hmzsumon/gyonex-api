/* ────────── comments ────────── */
/* Routes mounted under your API prefix, using your auth middleware. */
/* ────────── comments ────────── */
import { claimRank, getMyRankSummary } from "@/controllers/rank.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.get("/my-rank-summary", isAuthenticatedUser, getMyRankSummary);
router.post("/claim", isAuthenticatedUser, claimRank);

export default router;
