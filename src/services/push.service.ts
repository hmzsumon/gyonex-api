// src/services/push.service.ts
import { webpush } from "@/config/webpush";
import { UserPush } from "@/models/UserPush.model";

/* ────────── send web push to all endpoints of a user ────────── */
export async function sendPushToUser(
  userId: string,
  payload: Record<string, any>
) {
  const subs = await UserPush.find({ userId });
  if (!subs.length) return;

  console.log("sendPushToUser", userId, subs.length);

  const body = JSON.stringify(payload);

  for (const s of subs) {
    try {
      await webpush.sendNotification(s.subscription as any, body, { TTL: 300 });
      await UserPush.updateOne(
        { _id: s._id },
        { $set: { lastSuccessAt: new Date() } }
      );
    } catch (e: any) {
      if (e?.statusCode === 410 || e?.statusCode === 404) {
        await UserPush.deleteOne({ _id: s._id }); // cleanup stale endpoint
      } else {
        await UserPush.updateOne(
          { _id: s._id },
          { $set: { lastFailureAt: new Date() } }
        );
      }
    }
  }
}

/* ────────── broadcast web push to all admins (optional) ────────── */
export async function sendPushToAdmins(
  adminIds: string[],
  payload: Record<string, any>
) {
  for (const adminId of adminIds) {
    await sendPushToUser(String(adminId), payload);
  }
}
