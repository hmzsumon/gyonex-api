// src/services/email/templates/kycStatusTemplate.ts
export const kycStatusTemplate = ({
  name,
  status,
  reason,
}: {
  name: string;
  status: "approved" | "rejected";
  reason?: string;
}) => {
  const isApproved = status === "approved";

  const title = isApproved
    ? "Your KYC has been approved"
    : "Your KYC has been rejected";

  const message = isApproved
    ? "Your account verification has been approved successfully. You can now access verified account features."
    : "Your KYC request was rejected. Please review the reason below and submit again.";

  const statusLabel = isApproved ? "Approved" : "Rejected";
  const statusBg = isApproved ? "#22c55e" : "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KYC Status - Upbit Trade</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");

      body {
        margin: 0;
        padding: 0;
        background-color: #f8fafc;
        font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, Helvetica, Arial, sans-serif;
        color: #1f2937;
        line-height: 1.6;
        -webkit-text-size-adjust: 100%;
      }

      .container {
        max-width: 600px;
        margin: 24px auto;
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
        border: 1px solid #e5e7eb;
      }

      .header {
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        padding: 28px 20px;
        text-align: center;
        color: #ffffff;
        position: relative;
        overflow: hidden;
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
        font-size: 26px;
        letter-spacing: 0.2px;
        position: relative;
        z-index: 1;
      }

      .logo span {
        color: #facc15;
      }

      .content {
        padding: 28px 20px;
      }

      .title {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 0 0 18px 0;
        color: #111827;
        font-weight: 600;
        font-size: 20px;
        line-height: 1.3;
      }

      .title .icon {
        font-size: 24px;
      }

      .status-card {
        background: #f9fafb;
        border-radius: 12px;
        padding: 16px;
        margin: 18px 0;
        border-left: 4px solid ${isApproved ? "#22c55e" : "#ef4444"};
      }

      .status-row {
        margin-bottom: 12px;
      }

      .status-row:last-child {
        margin-bottom: 0;
      }

      .status-label {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: #4b5563;
        margin-bottom: 4px;
      }

      .status-value {
        font-size: 15px;
        color: #111827;
        font-weight: 500;
        word-break: break-word;
      }

      .badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        color: #ffffff;
        background: ${statusBg};
      }

      .reason-box {
        background: #fff5f5;
        border-left: 4px solid #ef4444;
        padding: 12px;
        border-radius: 10px;
        margin: 18px 0;
        font-size: 14px;
        color: #7f1d1d;
      }

      .success-box {
        background: #f0fdf4;
        border-left: 4px solid #22c55e;
        padding: 12px;
        border-radius: 10px;
        margin: 18px 0;
        font-size: 14px;
        color: #166534;
      }

      .cta-wrap {
        text-align: center;
        margin: 20px 0 10px;
      }

      .cta-button {
        display: inline-block;
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        color: #ffffff !important;
        text-decoration: none;
        padding: 12px 22px;
        border-radius: 10px;
        font-weight: 600;
        box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);
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

        .status-label,
        .status-value {
          font-size: 15px;
        }
      }

      @media (max-width: 360px) {
        .cta-button {
          width: 100%;
          padding: 12px 16px;
        }
      }
    </style>
  </head>

  <body>
    <div class="container">
      <div class="header">
        <h1 class="logo">Gyonex</h1>
      </div>

      <div class="content">
        <h2 class="title">
          <span class="icon">${isApproved ? "✅" : "⚠️"}</span>
          ${title}
        </h2>

        <p style="margin: 0 0 10px 0">Hello <strong>${name || "User"}</strong>,</p>
        <p style="margin: 0 0 12px 0">${message}</p>

        <div class="status-card">
          <div class="status-row">
            <span class="status-label">Verification Status</span>
            <span class="status-value">
              <span class="badge">${statusLabel}</span>
            </span>
          </div>

          <div class="status-row">
            <span class="status-label">Account Name</span>
            <span class="status-value">${name || "User"}</span>
          </div>
        </div>

        ${
          isApproved
            ? `
        <div class="success-box">
          <strong>Success:</strong> Your identity verification is now complete. You can access all verified account features.
        </div>
        `
            : reason
              ? `
        <div class="reason-box">
          <strong>Reject reason:</strong><br />
          ${reason}
        </div>
        `
              : `
        <div class="reason-box">
          <strong>Notice:</strong> Your KYC submission was not approved. Please review your submitted information and try again.
        </div>
        `
        }

        <div class="cta-wrap">
          <a href="https://gyonex.com/dashboard" class="cta-button">
            Go to Dashboard
          </a>
        </div>

        <p class="auto-note">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>

      <div class="footer">
        <div>
          &copy; 2025 <a href="https://gyonex.com/">Gyonex</a>. All rights reserved.
        </div>
        <div style="margin-top: 8px">
          Need help? <a href="mailto:support@gyonex.com">support@gyonex.com</a>
        </div>
      </div>
    </div>
  </body>
</html>`;
};
