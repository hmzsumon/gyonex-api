// src/controllers/push.controller.ts
import { webpush } from "@/config/webpush";
import { User } from "@/models/user.model";
import { UserPush } from "@/models/UserPush.model";
import { typeHandler } from "@/types/express";
import { ApiError } from "@/utils/ApiError";
import { catchAsync } from "@/utils/catchAsync";

/* ────────── constants ────────── */
const MAX_DEVICES_PER_USER = 10;

/* ────────── POST /api/push/save-subscription ────────── */
export const saveSubscription: typeHandler = catchAsync(
  async (req, res, next) => {
    const userId = req.user?._id;
    const { subscription, userAgent, deviceName } = req.body;

    if (!userId) return next(new ApiError(401, "Unauthenticated"));
    if (!subscription) return next(new ApiError(400, "Missing subscription"));

    const endpoint = subscription?.endpoint;
    if (!endpoint)
      return next(new ApiError(400, "Invalid subscription (no endpoint)"));

    const user = await User.findById(userId);
    if (!user) return next(new ApiError(404, "User not found"));

    /* ── enforce max devices per user (evict oldest) ── */
    const count = await UserPush.countDocuments({ userId });
    if (count >= MAX_DEVICES_PER_USER) {
      const evict = await UserPush.find({ userId })
        .sort({ createdAt: 1 })
        .limit(count - MAX_DEVICES_PER_USER + 1);
      if (evict.length) {
        await UserPush.deleteMany({ _id: { $in: evict.map((d) => d._id) } });
      }
    }

    /* ────────── upsert: one document per endpoint ────────── */
    await UserPush.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId,
          customerId: user.customerId,
          subscription,
          userAgent: userAgent ?? req.get("user-agent"),
          deviceName: deviceName ?? undefined,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: "Subscription saved." });
  }
);

/* ────────── POST /api/push/unsubscribe ────────── */
export const unsubscribe: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  const { endpoint } = req.body;

  if (!userId) return next(new ApiError(401, "Unauthenticated"));
  if (!endpoint) return next(new ApiError(400, "Missing endpoint"));

  await UserPush.deleteOne({ endpoint, userId });
  res.json({ success: true, message: "Unsubscribed." });
});

/* ────────── POST /api/push/send-test ────────── */
export const sendTestPush: typeHandler = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  if (!userId) return next(new ApiError(401, "Unauthenticated"));

  const subs = await UserPush.find({ userId });
  if (!subs.length) return next(new ApiError(404, "No subscription found"));

  const payload = JSON.stringify({
    title: "Hello from Web Push",
    body: "Your push is working ✅",
    url: "/notifications",
    tag: "test",
  });

  /* ────────── fan out to all endpoints ────────── */
  for (const s of subs) {
    try {
      await webpush.sendNotification(s.subscription as any, payload, {
        TTL: 120,
      });
      await UserPush.updateOne(
        { _id: s._id },
        { $set: { lastSuccessAt: new Date() } }
      );
    } catch (e: any) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        await UserPush.deleteOne({ _id: s._id });
      } else {
        await UserPush.updateOne(
          { _id: s._id },
          { $set: { lastFailureAt: new Date() } }
        );
      }
    }
  }

  res.json({ success: true, message: "Test push sent." });
});
