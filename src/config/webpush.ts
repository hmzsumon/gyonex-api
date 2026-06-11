// src/config/webpush.ts
import webpush from "web-push";

/* ────────── envs ────────── */
const subject = process.env.VAPID_SUBJECT!;
const publicKey = process.env.VAPID_PUBLIC_KEY!;
const privateKey = process.env.VAPID_PRIVATE_KEY!;

if (!subject || !publicKey || !privateKey) {
  // eslint-disable-next-line no-console
  console.error("❌ Missing VAPID envs");
}

/* ────────── init web-push ────────── */
webpush.setVapidDetails(subject, publicKey, privateKey);

/* ────────── export singleton ────────── */
export { webpush };
