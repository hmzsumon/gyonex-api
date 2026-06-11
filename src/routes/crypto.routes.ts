// routes/crypto.routes.ts
import {
  getKlines,
  getMostCrypto,
  getUsdts,
} from "@/controllers/crypto.controller";
import { Router } from "express";

const router = Router();

/** @route GET /crypto/most */
router.get("/crypto/most", getMostCrypto);

/** @route GET /crypto/symbols */
router.get("/crypto/symbols", getUsdts);

/** ✅ @route GET /crypto/klines */
router.get("/crypto/klines", getKlines);

export default router;
