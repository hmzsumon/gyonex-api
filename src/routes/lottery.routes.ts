/* ────────── lottery route imports ────────── */
import {
  buyLotteryTickets,
  createLottery,
  drawLotteryWinner,
  getActiveLottery,
  getAllLotteriesForAdmin,
  getLotteryEvents,
  getLotteryWinners,
  getMyLotteryTickets,
  getSingleLotteryForAdmin,
  updateLottery,
} from "@/controllers/lottery.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

/* ────────── lottery router instance ────────── */
const router = Router();

/* ────────── user lottery routes ────────── */
router.get("/events", isAuthenticatedUser, getLotteryEvents);
router.get("/active", isAuthenticatedUser, getActiveLottery);

router.post("/events/:id/buy", isAuthenticatedUser, buyLotteryTickets);

/* ────────── old user buy route support ────────── */
router.post("/:id/buy", isAuthenticatedUser, buyLotteryTickets);

router.get("/my-tickets", isAuthenticatedUser, getMyLotteryTickets);
router.get("/winners", isAuthenticatedUser, getLotteryWinners);

/* ────────── admin lottery management routes ────────── */
router.post(
  "/admin/events",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  createLottery,
);

router.patch(
  "/admin/events/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  updateLottery,
);

router.post(
  "/admin/events/:id/draw",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  drawLotteryWinner,
);

router.get(
  "/admin/events",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllLotteriesForAdmin,
);

router.get(
  "/admin/events/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getSingleLotteryForAdmin,
);

/* ────────── old admin route support ────────── */
router.post(
  "/admin/create",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  createLottery,
);

router.patch(
  "/admin/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  updateLottery,
);

router.post(
  "/admin/:id/draw",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  drawLotteryWinner,
);

router.get(
  "/admin/all",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getAllLotteriesForAdmin,
);

router.get(
  "/admin/:id",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  getSingleLotteryForAdmin,
);

/* ────────── lottery route export ────────── */
export default router;
