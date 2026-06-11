import {
  addUserPaymentMethod,
  changeEmail,
  changePassword,
  changePhone,
  checkEmailExist,
  claimGenerationReward,
  getDashboardData,
  getInviteData,
  getMyAssetDetails,
  getMyTeamMembers,
  getMyTeamSummary,
  getMyTransactions,
  getTeamMembersByLevel,
  getUserBalance,
  getUserByCustomerId,
  getUserPaymentMethods,
  loadUser,
  loginUser,
  logoutUser,
  lookupUser,
  refreshAccessToken,
  registerUser,
  resendVerificationEmail,
  resetForgotPassword,
  sendOtpToEmail,
  sendSecurityCodeByEmail,
  upsertUserSecurityPin,
  verifyEmail,
  verifyOtp,
  verifyOtpForPassword,
} from "@/controllers/user.controller";
import { sendMoney } from "@/controllers/wallet.controller";
import { isAuthenticatedUser } from "@/middlewares/auth";
import { Router } from "express";

const router = Router();

// register user
router.post("/register", registerUser);
// verify email
router.post("/verify-email", verifyEmail);

/* ────────── resend verification email ────────── */
router.post("/resend-verification-email", resendVerificationEmail);
// load user
router.get("/load-user", isAuthenticatedUser, loadUser);
// log in user
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/refresh-token", refreshAccessToken);

/* ────────── Send USDT ────────── */
router.post("/send-usdt", isAuthenticatedUser, sendMoney);

// check isEmail exists or not
router.get("/check-email-exist", checkEmailExist);

// get invite data
router.get("/get-invite-data", isAuthenticatedUser, getInviteData);

// get my team summary
router.get("/get-my-team-summary", isAuthenticatedUser, getMyTeamSummary);

// get my team members
router.get("/get-my-team-members", isAuthenticatedUser, getMyTeamMembers);

// get my transactions
router.get("/get-my-transactions", isAuthenticatedUser, getMyTransactions);
// get my asset details
router.get("/get-my-asset-details", isAuthenticatedUser, getMyAssetDetails);

// verify OTP
router.post("/verify-otp-for-password", verifyOtpForPassword);

// reset forgot password
router.post("/reset-forgot-password", resetForgotPassword);

/* ────────── change password ────────── */
router.put("/change-password", isAuthenticatedUser, changePassword);

// claim generation reward
router.post(
  "/claim-generation-reward",
  isAuthenticatedUser,
  claimGenerationReward
);

/* ────────── Add user Payment Method ────────── */

router.post(
  "/add-user-payment-method",
  isAuthenticatedUser,
  addUserPaymentMethod
);

router.get(
  "/get-user-payment-methods",
  isAuthenticatedUser,
  getUserPaymentMethods
);

router.get("/wallet/me", isAuthenticatedUser, getUserBalance);

router.put(
  "/get-user-by-customer-id/:id",
  isAuthenticatedUser,
  getUserByCustomerId
);

/* ────────── Security PIN route ────────── */
router.put("/security-pin", isAuthenticatedUser, upsertUserSecurityPin);

/* ──────────secured endpoints  ────────── */
router.put("/account/email", isAuthenticatedUser, changeEmail);
router.put("/account/phone", isAuthenticatedUser, changePhone);

router.get("/dashboard-data", isAuthenticatedUser, getDashboardData);

/* ────────── User lookup ────────── */
router.post("/user-lookup", isAuthenticatedUser, lookupUser);

/* ────────── Send OTP ────────── */
router.post("/send-otp-to-email", isAuthenticatedUser, sendOtpToEmail);

/* ────────── Verify OTP ────────── */
router.post("/verify-otp", isAuthenticatedUser, verifyOtp);

router.get(
  "/team/levels/:level/users",
  isAuthenticatedUser,
  getTeamMembersByLevel
);

/* ────────── send security code by email ────────── */
router
  .route("/send-pass-code")
  .post(isAuthenticatedUser, sendSecurityCodeByEmail);

export default router;
