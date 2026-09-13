// src/routes/lucky.routes.ts
import {
  adminDeleteCardType,
  adminDeletePackage,
  adminDeletePrizePool,
  adminDeleteTier,
  adminGetPrizePools,
  adminGiftLuckyPackage,
  adminListCardTypes,
  adminListGifts,
  adminLuckyStats,
  adminPreviewPrizePools,
  adminResetLuckyStats,
  adminSaveCardType,
  adminSavePackage,
  adminSavePrizePools,
  adminSaveTier,
  adminSeedPrizePools,
  adminUserLuckyDetail,
  buyLuckyPackage,
  getLuckyShop,
  getMyLuckyCards,
  getMyLuckyPurchases,
  openLuckyCard,
  seedLuckyCards,
  verifyLuckyCard,
} from "@/controllers/lucky.controller";
import { authorizeRoles, isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

/* ────────── public / user ────────── */
router.get("/lucky/shop", getLuckyShop);
router.get("/lucky/verify/:shortCode", verifyLuckyCard);
router.post("/lucky/buy", isAuthenticatedUser, buyLuckyPackage);
router.get("/lucky/cards", isAuthenticatedUser, getMyLuckyCards);
router.get("/lucky/purchases", isAuthenticatedUser, getMyLuckyPurchases);
router.post("/lucky/cards/:id/open", isAuthenticatedUser, openLuckyCard);

/* ────────── admin — card types / tiers / packages ────────── */
router
  .route("/admin/lucky/card-types")
  .get(isAuthenticatedUser, authorizeRoles("admin"), adminListCardTypes)
  .post(isAuthenticatedUser, authorizeRoles("admin"), adminSaveCardType);
router
  .route("/admin/lucky/card-types/:id")
  .delete(isAuthenticatedUser, authorizeRoles("admin"), adminDeleteCardType);

router
  .route("/admin/lucky/prize-tiers")
  .post(isAuthenticatedUser, authorizeRoles("admin"), adminSaveTier);
router
  .route("/admin/lucky/prize-tiers/:id")
  .delete(isAuthenticatedUser, authorizeRoles("admin"), adminDeleteTier);

router
  .route("/admin/lucky/packages")
  .post(isAuthenticatedUser, authorizeRoles("admin"), adminSavePackage);
router
  .route("/admin/lucky/packages/:id")
  .delete(isAuthenticatedUser, authorizeRoles("admin"), adminDeletePackage);

/* ────────── admin — global prize pool ────────── */
router
  .route("/admin/lucky/prize-pools")
  .get(isAuthenticatedUser, authorizeRoles("admin"), adminGetPrizePools)
  .post(isAuthenticatedUser, authorizeRoles("admin"), adminSavePrizePools);
router
  .route("/admin/lucky/prize-pools/preview")
  .post(isAuthenticatedUser, authorizeRoles("admin"), adminPreviewPrizePools);
router
  .route("/admin/lucky/prize-pools/seed")
  .post(isAuthenticatedUser, authorizeRoles("admin"), adminSeedPrizePools);
router
  .route("/admin/lucky/prize-pools/:code")
  .delete(isAuthenticatedUser, authorizeRoles("admin"), adminDeletePrizePool);

/* ────────── admin — stats / user detail / seed ────────── */
router.get(
  "/admin/lucky/stats",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminLuckyStats,
);
router.post(
  "/admin/lucky/card-types/:id/reset-stats",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminResetLuckyStats,
);
router.get(
  "/admin/lucky/user/:userId",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminUserLuckyDetail,
);
router.post(
  "/admin/lucky/seed",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  seedLuckyCards,
);

/* ────────── admin — gift a package to any user ────────── */
router.post(
  "/admin/lucky/gift",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminGiftLuckyPackage,
);
router.get(
  "/admin/lucky/gifts",
  isAuthenticatedUser,
  authorizeRoles("admin"),
  adminListGifts,
);

export default router;
