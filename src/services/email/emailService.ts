// sendEmail.ts
import { convert } from "html-to-text"; // npm i html-to-text@^9
import nodemailer from "nodemailer";

interface SendEmailOptions {
  email: string;
  subject: string;
  html: string;
}

function need(name: string, val?: string) {
  if (!val) throw new Error(`Missing env ${name}`);
  return val;
}

export const sendEmail = async (options: SendEmailOptions): Promise<void> => {
  const host = process.env.EMAIL_HOST || "mail.privateemail.com";
  const port = Number(process.env.EMAIL_PORT || 587);
  const user = need("EMAIL_USER", process.env.EMAIL_USER);
  const pass = need("EMAIL_PASS", process.env.EMAIL_PASS);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // STARTTLS on 587
    auth: { user, pass },
    tls: { rejectUnauthorized: true },
  });

  const text = convert(options.html, { wordwrap: 120 });

  await transporter.sendMail({
    from: `"Gyonex" <${user}>`,
    to: options.email,
    subject: options.subject,
    html: options.html,
    text, // <- plain text fallback
    replyTo: "support@gyonex.com",
    list: { unsubscribe: "mailto:support@gyonex.com" }, // <- best practice
  });
};
