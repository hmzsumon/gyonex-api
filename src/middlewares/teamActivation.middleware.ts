// src/middlewares/teamActivation.middleware.ts
import { UserRole } from "@/models/user.model";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { NextFunction, Request, Response } from "express";

/* ────────── যেসব role এই গেট থেকে ছাড় পাবে ────────── */
const EXEMPT_ROLES: string[] = [
  UserRole.Admin,
  UserRole.SuperAdmin,
  UserRole.Owner,
  UserRole.Manager,
  UserRole.Agent,
];

/**
 * Team activation gate.
 *
 * ⚠️ এই শর্ত ডিফল্টভাবে কারো ওপর প্রযোজ্য নয়।
 * শুধুমাত্র যেসব ইউজারের `require_team_activation === true`
 * (অ্যাডমিন প্যানেল থেকে সেট করা হয়), তাদের ক্ষেত্রেই প্রযোজ্য।
 *
 * প্রতি ইউজারের জন্য কতজন লাগবে সেটাও আলাদা করে সেট করা যায়
 * (`required_team_members`, ডিফল্ট 3)।
 *
 * isAuthenticatedUser এর পরে ব্যবহার করতে হবে।
 */
export const requireTeamActivation = catchAsync(
  async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return next(new ApiError(401, "User not authenticated"));
    }

    if (EXEMPT_ROLES.includes(user.role)) return next();

    /* ────────── অ্যাডমিন এই ইউজারকে শর্তে না রাখলে কিছুই করার নেই ────────── */
    if (user.require_team_activation !== true) return next();

    const required = Math.max(0, Number(user.required_team_members ?? 3));
    const activated = Math.max(0, Number(user.addNewMember ?? 0));

    if (activated >= required) return next();

    const remaining = required - activated;

    return next(
      new ApiError(
        403,
        `Activate ${remaining} more member(s) to unlock withdrawals. (${activated}/${required} completed)`,
        {
          code: "TEAM_ACTIVATION_REQUIRED",
          activatedMembers: activated,
          requiredMembers: required,
          remainingMembers: remaining,
        },
      ),
    );
  },
);
