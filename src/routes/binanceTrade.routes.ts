/* ──────────────────────────────────────────────────────────────────────────
   Binance-style Spot Trade Routes
────────────────────────────────────────────────────────────────────────── */
import {
  getSpotBalances,
  getSpotOrders,
  placeSpotOrder,
} from "@/controllers/binanceTrade.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

router.post("/binance-trade/order", isAuthenticatedUser, placeSpotOrder);

router.get("/binance-trade/balances", isAuthenticatedUser, getSpotBalances);

router.get("/binance-trade/orders", isAuthenticatedUser, getSpotOrders);

export default router;
