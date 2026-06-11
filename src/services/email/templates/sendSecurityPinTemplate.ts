// email-templates.ts
export function sendSecurityPinTemplate(code: string): string {
  // Escape in case someone passes non-numeric code (safety)
  const escapeHtml = (s: string) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
    );

  const safeCode = escapeHtml(code);

  const preheader =
    "Your new Security PIN is ready. Use it permanently, or use it as your old PIN to set a new one.";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Your New Security PIN - Gyonex</title>
    <style>
      /* System fonts only, no @import */
      body {
        margin: 0;
        padding: 0;
        background: #f8fafc;
        color: #111827;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
        line-height: 1.6;
      }
      .preheader {
        display: none !important;
        visibility: hidden;
        opacity: 0;
        color: transparent;
        height: 0;
        width: 0;
        overflow: hidden;
        mso-hide: all;
      }
      .wrap {
        max-width: 600px;
        margin: 24px auto;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        overflow: hidden;
      }
      .head {
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        color: #fff;
        text-align: center;
        padding: 22px;
      }
      .brand {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
      }
      .brand b { color: #facc15; }
      .content { padding: 24px 18px; }
      .title {
        margin: 0 0 12px;
        font-size: 20px;
        font-weight: 700;
      }
      .code {
        background: #ecfeff;
        border: 1px dashed #a7f3d0;
        color: #0ea5e9;
        text-align: center;
        padding: 18px;
        font-size: 34px;
        font-weight: 800;
        border-radius: 10px;
        margin: 18px 0;
        letter-spacing: 6px;
        font-family: Consolas, "Courier New", monospace;
      }
      .note {
        background: #eef2ff;
        border-left: 4px solid #6366f1;
        padding: 12px;
        border-radius: 10px;
        margin: 16px 0;
        font-size: 14px;
        color: #1e293b;
      }
      .foot {
        background: #f1f5f9;
        text-align: center;
        padding: 14px;
        font-size: 12.5px;
        color: #64748b;
        border-top: 1px solid #e2e8f0;
      }
      .foot a { color: #0ea5e9; text-decoration: none; font-weight: 600; }
      @media (min-width: 600px) {
        .brand { font-size: 24px; }
        .title { font-size: 22px; }
        .code { font-size: 40px; }
      }
    </style>
  </head>
  <body>
    <div class="preheader">${preheader}</div>
    <div class="wrap">
      <div class="head">
        <h1 class="brand">Gyonex</h1>
      </div>
      <div class="content">
        <h2 class="title">Your New Security PIN</h2>
        <p style="margin: 0 0 10px">Hello,</p>
        <p style="margin: 0 0 10px">
          We've generated a new Security PIN for your account. You can use this PIN
          permanently, or use it as your <strong>old PIN</strong> to set a new one of your choice.
        </p>

        <div class="code">${safeCode}</div>

        <div class="note">
          Keep this PIN confidential and do not share it with anyone. If you did not request this PIN,
          please secure your account immediately by changing your password and contacting support.
        </div>

        <p style="margin: 0">Thanks for choosing Gyonex.</p>
      </div>
      <div class="foot">
        © 2025 <a href="https://gyonex.com/">Gyonex</a> • Need help?
        <a href="mailto:support@gyonex.com">support@gyonex.com</a>
      </div>
    </div>
  </body>
</html>`;
}
