import { Router } from "express";
import { body, query as qv } from "express-validator";

import {
  buyLotteryTickets,
  createLottery,
  drawLotteryWinner,
  getActiveLottery,
  getAllLotteriesForAdmin,
  getLotteryWinners,
  getMyLotteryTickets,
  getSingleLotteryForAdmin,
  updateLottery,
} from "../controllers/lottery.controller";
import { adminOnly, protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { LOTTERY_MAX_QTY } from "../models/Lottery.model";

const router = Router();

/* ─────────────────────────────────────────────────────────────────────────
   USER ROUTES
───────────────────────────────────────────────────────────────────────── */
router.get("/active", protect, getActiveLottery);

router.post(
  "/:id/buy",
  protect,
  [
    body("quantity")
      .isInt({ min: 1, max: LOTTERY_MAX_QTY })
      .withMessage(`Quantity must be between 1 and ${LOTTERY_MAX_QTY}`),
  ],
  validate,
  buyLotteryTickets,
);

router.get("/my-tickets", protect, getMyLotteryTickets);

router.get(
  "/winners",
  protect,
  [
    qv("page").optional().isInt({ min: 1 }).toInt(),
    qv("limit").optional().isInt({ min: 1, max: 50 }).toInt(),
  ],
  validate,
  getLotteryWinners,
);

/* ─────────────────────────────────────────────────────────────────────────
   ADMIN ROUTES
───────────────────────────────────────────────────────────────────────── */
router.post(
  "/admin/create",
  adminOnly,
  [
    body("title").notEmpty().trim(),
    body("prizeAmount").isFloat({ min: 1 }),
    body("drawDate")
      .isISO8601()
      .custom((val: string) => {
        const d = new Date(val).getUTCDate();
        if (d !== 1 && d !== 15) {
          throw new Error(
            "Draw date must fall on the 1st or 15th of the month",
          );
        }
        return true;
      }),
    body("description").optional().trim(),
    body("maxTickets").optional().isInt({ min: 1 }),
  ],
  validate,
  createLottery,
);

router.patch(
  "/admin/:id",
  adminOnly,
  [
    body("title").optional().notEmpty().trim(),
    body("prizeAmount").optional().isFloat({ min: 1 }),
    body("drawDate")
      .optional()
      .isISO8601()
      .custom((val: string) => {
        const d = new Date(val).getUTCDate();
        if (d !== 1 && d !== 15) {
          throw new Error(
            "Draw date must fall on the 1st or 15th of the month",
          );
        }
        return true;
      }),
    body("status").optional().isIn(["upcoming", "open", "cancelled"]),
    body("description").optional().trim(),
    body("maxTickets").optional().isInt({ min: 1 }),
    body("ticketPrice")
      .not()
      .exists()
      .withMessage("Ticket price cannot be changed (fixed at $5)"),
  ],
  validate,
  updateLottery,
);

router.post("/admin/:id/draw", adminOnly, drawLotteryWinner);

router.get(
  "/admin/all",
  adminOnly,
  [
    qv("page").optional().isInt({ min: 1 }).toInt(),
    qv("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
    qv("status").optional().isIn(["upcoming", "open", "drawn", "cancelled"]),
  ],
  validate,
  getAllLotteriesForAdmin,
);

router.get("/admin/:id", adminOnly, getSingleLotteryForAdmin);

export default router;
