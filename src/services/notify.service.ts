// src/services/notify.service.ts
/* ──────────────────────────────────────────────────────────────
 * কেন্দ্রীয় নোটিফিকেশন সার্ভিস।
 *
 * নিয়ম:
 *   ইউজার/এডমিন অনলাইনে থাকলে  → socket দিয়ে রিয়েল-টাইম "normal notification"
 *                                  (ফ্রন্টএন্ডে সাউন্ড + লিস্ট আপডেট হয়)
 *   অফলাইনে থাকলে              → web push notification (ব্রাউজার/মোবাইলে)
 *
 * DB-তে দুই ক্ষেত্রেই notification সেভ হয় (drawer-এ পরে দেখা যাবে),
 * শুধু push পাঠানো হয় কন্ডিশনালি — যাতে অনলাইনে থাকা অবস্থায় ডাবল
 * (সাউন্ড + push) না হয়।
 * ────────────────────────────────────────────────────────────── */
import { AdminNotification } from "@/models/AdminNotification.model";
import {
  Notification,
  NotificationCategory,
} from "@/models/Notification.model";
import { User } from "@/models/user.model";
import { io, isUserOnline } from "@/socket";
import { sendPushToAdmins, sendPushToUser } from "@/services/push.service";

export type NotifyInput = {
  title: string;
  message?: string;
  category?: NotificationCategory;
  url?: string;
};

/* ────────── এক ইউজারকে নোটিফাই করা ────────── */
export async function notifyUser(
  userId: string,
  role: string | undefined,
  input: NotifyInput,
) {
  const notification = await Notification.create({
    user_id: userId,
    role,
    ...input,
  });

  const uid = String(userId);

  if (io) {
    // (পুরনো + নতুন — যেসব ইভেন্ট ফ্রন্টএন্ড শোনে সবগুলোই পাঠানো হচ্ছে)
    io.to(`u:${uid}`).emit("notifications:new", notification);
    io.to(`u:${uid}`).emit("user-notification", {
      success: true,
      notification,
    });

    const unreadCount = await Notification.countDocuments({
      user_id: uid,
      is_read: false,
    });
    io.to(`u:${uid}`).emit("notifications:count", { count: unreadCount });
  }

  // ────────── অনলাইনে থাকলে push দরকার নেই, সকেটেই কাজ হয়ে গেছে ──────────
  if (!isUserOnline(uid)) {
    try {
      await sendPushToUser(uid, {
        title: input.title,
        body: input.message,
        url: input.url,
        tag: input.category || "notification",
      });
    } catch {
      /* push ব্যর্থ হলেও notification সেভ থেকে যায়, drawer-এ দেখা যাবে */
    }
  }

  return notification;
}

/* ────────── সব এডমিনকে নোটিফাই করা ────────── */
export async function notifyAdmins(input: NotifyInput) {
  const notification = await AdminNotification.create(input);

  if (io) {
    io.emit("admin-notification", { success: true, notification });
  }

  try {
    const admins = await User.find({ role: "admin" }, "_id").lean();
    const offlineAdminIds = admins
      .map((a) => String(a._id))
      .filter((id) => !isUserOnline(id));

    if (offlineAdminIds.length) {
      await sendPushToAdmins(offlineAdminIds, {
        title: input.title,
        body: input.message,
        url: input.url,
        tag: input.category || "admin-notification",
        renotify: true,
      });
    }
  } catch {
    /* push ব্যর্থ হলেও notification সেভ থেকে যায় */
  }

  return notification;
}
