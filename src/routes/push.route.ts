import { saveSubscription, sendTestPush } from "@/controllers/push.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

/* save/replace current user's push subscription */
router.post("/save-subscription", isAuthenticatedUser, saveSubscription);

/* fire a test push to current user */
router.post("/send-test", isAuthenticatedUser, sendTestPush);

export default router;
