/* ── registrationSuccessTemplate (Upbit Trade • mobile-friendly) ─────── */
export interface RegistrationData {
  name: string;
  email: string;
  password: string;
}
const registrationSuccessTemplate = ({
  name,
  email,
  password,
}: RegistrationData): string => {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- critical for mobile -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to Gyonex</title>
    <style>
      /* Webfont (optional) — many clients will fall back to system fonts */
      @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");

      /* ── Base ───────────────────────────────────────────── */
      body {
        margin: 0;
        padding: 0;
        background-color: #f8fafc;
        font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji",
          "Segoe UI Symbol", sans-serif;
        color: #1f2937; /* slate-800 */
        line-height: 1.6;
        -webkit-text-size-adjust: 100%;
      }

      /* Limit line-length for readability on desktop, adapt on mobile */
      .container {
        max-width: 600px;
        margin: 24px auto;
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        border: 1px solid #e5e7eb; /* neutral-200 */
      }

      .header {
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        padding: 28px 20px;
        text-align: center;
        color: #ffffff;
        position: relative;
      }
      .header::before {
        content: "";
        position: absolute;
        top: -50px;
        right: -50px;
        width: 150px;
        height: 150px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 50%;
      }

      .logo {
        margin: 0;
        font-weight: 700;
        font-size: 26px; /* will increase on desktop via media query */
        letter-spacing: 0.2px;
        position: relative;
        z-index: 1;
      }
      .logo span {
        color: #facc15;
      } /* amber-400 */

      .content {
        padding: 28px 20px;
      }

      .title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 18px 0;
        color: #111827; /* gray-900 */
        font-weight: 600;
        font-size: 20px; /* mobile-first */
        line-height: 1.3;
      }
      .title .icon {
        font-size: 24px;
      }

      /* Card holding credentials */
      .credentials-card {
        background: #f9fafb;
        border-radius: 12px;
        padding: 14px;
        margin: 18px 0;
        border-left: 4px solid #0ea5e9;
      }
      .credential-item {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
      }
      .credential-item:last-child {
        margin-bottom: 0;
      }
      .credential-label {
        min-width: 74px;
        font-weight: 600;
        color: #374151;
        font-size: 14px;
      }
      .credential-value {
        flex: 1;
        font-size: 14px;
        color: #111827;
        word-break: break-word; /* prevent overflow on mobile */
      }

      .security-alert {
        background: #fff5f5;
        border-left: 4px solid #ef4444;
        padding: 12px;
        border-radius: 10px;
        margin: 18px 0;
        font-size: 14px;
        color: #7f1d1d;
      }

      .cta-button {
        display: inline-block;
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        color: #ffffff !important;
        text-decoration: none;
        padding: 12px 22px;
        border-radius: 10px;
        font-weight: 600;
        margin: 16px 0;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);
      }
      .cta-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 14px rgba(2, 132, 199, 0.35);
      }

      ul {
        margin: 8px 0 0 0;
        padding-left: 18px; /* tighter on mobile */
      }
      li {
        margin: 6px 0;
        font-size: 14px;
      }

      .auto-note {
        margin-top: 18px;
        font-size: 12.5px;
        color: #6b7280;
        text-align: center;
      }

      .footer {
        background: #f3f4f6;
        text-align: center;
        padding: 16px;
        font-size: 12.5px;
        color: #6b7280;
        border-top: 1px solid #e5e7eb;
      }
      .footer a {
        color: #0ea5e9;
        text-decoration: none;
        font-weight: 600;
      }

      /* ── Desktop Upscale (≥ 600px) ───────────────────────── */
      @media (min-width: 600px) {
        .container {
          margin: 40px auto;
        }
        .content {
          padding: 40px 30px;
        }
        .logo {
          font-size: 28px;
        }
        .title {
          font-size: 24px;
        }
        .title .icon {
          font-size: 28px;
        }
        .credential-label,
        .credential-value,
        li {
          font-size: 15px;
        }
      }

      /* ── Ultra Small (≤ 360px) — extra safety ────────────── */
      @media (max-width: 360px) {
        .credential-label {
          min-width: 66px;
        }
        .cta-button {
          width: 100%;
          padding: 12px 16px;
        }
      }

      /* ── Gmail iOS right-side spacing fix ─────────────────── */
      u + .body .content {
        padding-left: 18px !important;
        padding-right: 18px !important;
      }
    </style>
  </head>

  <body class="body">
    <div class="container">
      <!-- ── Header / Branding ── -->
      <div class="header">
        <h1 class="logo">Gyonex</h1>
      </div>

      <!-- ── Content ── -->
      <div class="content">
        <h2 class="title">
          <span class="icon">🎉</span> Welcome to Gyonex!
        </h2>

        <p style="margin: 0 0 10px 0">Dear <strong>${name}</strong>,</p>
        <p style="margin: 0 0 12px 0">
          Welcome to <strong>Gyonex</strong> — your gateway to secure
          and efficient digital asset management.
        </p>

        <!-- ── Credentials ── -->
        <div class="credentials-card">
          <div class="credential-item">
            <div class="credential-label">Email:</div>
            <div class="credential-value">${email}</div>
          </div>
          <div class="credential-item">
            <div class="credential-label">Password:</div>
            <div class="credential-value">${password}</div>
          </div>
        </div>

        <!-- ── Security ── -->
        <div class="security-alert">
          <strong>Security Tip:</strong> Change your password after first login
          and enable two-factor authentication (2FA) in your account settings.
        </div>

        <!-- ── CTA ── -->
        <center style="margin: 12px 0 6px">
          <a
            href="https://gyonex.com/register-login?tab=signin"
            class="cta-button"
          >
            Login to Your Account
          </a>
        </center>

        <p style="margin: 14px 0 8px 0">
          With your gyonex account, you can now:
        </p>
        <ul>
          <li>Trade digital assets with our advanced platform</li>
          <li>Access real-time market data and analytics</li>
          <li>Enjoy secure wallet services</li>
          <li>Benefit from our 24/7 customer support</li>
        </ul>

        <p class="auto-note">
          This is an automated message. Please do not reply directly to this
          email.
        </p>
      </div>

      <!-- ── Footer ── -->
      <div class="footer">
        <div>
          &copy; 2025
          <a href="https://gyonex.com/">Gyonex</a>. All
          rights reserved.
        </div>
        <div style="margin-top: 8px">
          Stay safe and never share your login credentials with anyone.
        </div>
      </div>
    </div>
  </body>
</html>
`;
};
export default registrationSuccessTemplate;
