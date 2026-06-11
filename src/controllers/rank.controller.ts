/* ────────── comments ────────── */
/* Rank controller using your utilities. */
/* ────────── comments ────────── */
import { User } from "@/models/user.model";
import { claimRankBonus, getRankSummary } from "@/services/rank.service";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";
import { z } from "zod";

/* ────────── get my rank summary ────────── */
export const getMyRankSummary = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(400, "User ID is required");

  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found");

  const data = await getRankSummary(String(userId));
  res.status(200).json({ status: "success", data });
});

/* ────────── claim rank bonus ────────── */
const claimBody = z.object({
  key: z.enum([
    "bronze",
    "silver",
    "gold",
    "platinum",
    "diamond",
    "emerald",
    "grandmaster",
  ]),
});

export const claimRank = catchAsync(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) throw new ApiError(400, "User ID is required");

  const parsed = claimBody.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "Invalid payload");

  const result = await claimRankBonus(String(userId), parsed.data.key);
  if (!result.ok && result.message === "Not qualified") {
    throw new ApiError(400, "Not qualified");
  }

  res.status(200).json({
    status: "success",
    message: result.message ?? "Claimed",
    rewardUsd: result.rewardUsd,
  });
});
