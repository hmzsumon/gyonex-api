import {
  getTradingPairs,
  syncTradingPairIcons,
} from "@/controllers/tradingPair.controller";
import { Router } from "express";

const router = Router();

/* ────────── GET /trading-pairs  ──────────
   Public রাখলে auth লাগবে না
   Query: page, limit, search, enabled, popular, mostPopular, bestSeller, trending, newListing, featured, pinned, sort, order
*/
router.get("/trading-pairs", getTradingPairs);

// 🔒 ideally admin-only রাখো (তুমি চাইলে admin middleware add করো)
router.post("/trading-pairs/sync-icons", syncTradingPairIcons);

export default router;
