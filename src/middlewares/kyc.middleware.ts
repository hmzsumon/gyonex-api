// src/middlewares/kyc.middleware.ts
import Kyc from "@/models/kyc.model";
import { User, UserRole } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { NextFunction, Request, Response } from "express";

/* ────────── যেসব role KYC গেট থেকে ছাড় পাবে ────────── */
const EXEMPT_ROLES: string[] = [
  UserRole.Admin,
  UserRole.SuperAdmin,
  UserRole.Owner,
  UserRole.Manager,
  UserRole.Agent,
];

/* ────────── kyc status অনুযায়ী ইউজার-ফেসিং মেসেজ ────────── */
const KYC_MESSAGES: Record<string, string> = {
  not_started:
    "Please complete your KYC verification before requesting a withdrawal.",
  draft:
    "Your KYC is incomplete. Please finish and submit it to enable withdrawals.",
  pending:
    "Your KYC is under review. Withdrawals will be enabled once it is approved.",
  rejected:
    "Your KYC was rejected. Please re-submit your documents to enable withdrawals.",
};

/**
 * KYC approved না হলে রিকোয়েস্ট আটকে দেয়।
 *
 * - user.kyc_verified এবং Kyc কালেকশন — দুইটাই দেখে, যাতে কোনো একটা
 *   save ফেল করে থাকলেও approved ইউজার আটকে না যায় (self-heal)।
 * - process.env.KYC_WITHDRAW_GATE === "on" না হলে গেট নিষ্ক্রিয় থাকে,
 *   ফলে কোড ডিপ্লয় আর এনফোর্সমেন্ট আলাদা করা যায়।
 *
 * isAuthenticatedUser এর পরে ব্যবহার করতে হবে।
 */
export const requireKycVerified = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    /* ────────── kill switch ────────── */
    if (process.env.KYC_WITHDRAW_GATE !== "on") return next();

    const user = req.user;
    if (!user) {
      return next(new ApiError(401, "User not authenticated"));
    }

    /* ────────── role exemption ────────── */
    if (EXEMPT_ROLES.includes(user.role)) return next();

    /* ────────── fast path ────────── */
    if (user.kyc_verified === true) return next();

    /* ────────── fallback: Kyc কালেকশন দেখি ────────── */
    const kyc = await Kyc.findOne({ user: user._id }).select("status").lean();

    if (kyc?.status === "approved") {
      // ফ্ল্যাগ পিছিয়ে ছিল — ঠিক করে দিয়ে যেতে দিই
      await User.updateOne(
        { _id: user._id },
        { $set: { kyc_verified: true, kyc_request: false, kyc_step: 3 } },
      );
      // user === req.user (একই রেফারেন্স), তাই এখানেই সেট করলেই যথেষ্ট
      user.kyc_verified = true;
      return next();
    }

    const kycStatus = kyc?.status ?? "not_started";

    return next(
      new ApiError(403, KYC_MESSAGES[kycStatus] ?? KYC_MESSAGES.not_started, {
        code: "KYC_REQUIRED",
        kycStatus,
      }),
    );
  },
);
