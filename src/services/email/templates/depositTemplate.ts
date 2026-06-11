/* ── depositTemplate (Upbit Trade • responsive + branding updates) ───── */

export const depositTemplate = (
  name: string,
  amount: number | string,
  txId: string,
): string => {
  // normalize amount to string (no locale to keep email consistent)
  const amt = typeof amount === "number" ? amount.toFixed(2) : String(amount);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!-- mobile-first layout -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Deposit Confirmed - Gyonex</title>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap");

      /* ── Base ───────────────────────────────────────────── */
      body {
        margin: 0;
        padding: 0;
        background-color: #f5f7fa;
        font-family: "Poppins", -apple-system, BlinkMacSystemFont, "Segoe UI",
          Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji",
          "Segoe UI Symbol", sans-serif;
        color: #1a202c;
        line-height: 1.55;
        -webkit-text-size-adjust: 100%;
      }

      .container {
        max-width: 600px;
        margin: 20px auto;
        background: #ffffff;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
        border: 1px solid #e5e7eb;
      }

      /* ── Header (brand gradient) ─────────────────────────── */
      .header {
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        padding: 32px 22px;
        text-align: center;
        color: #ffffff;
        position: relative;
        overflow: hidden;
      }
      .header::before {
        content: "";
        position: absolute;
        top: -50px;
        right: -30px;
        width: 150px;
        height: 150px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 50%;
      }
      .header::after {
        content: "";
        position: absolute;
        bottom: -80px;
        left: -30px;
        width: 180px;
        height: 180px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 50%;
      }

      .logo {
        font-size: 28px;
        font-weight: 700;
        margin: 0;
        letter-spacing: .3px;
        position: relative;
        z-index: 2;
      }
      .logo span { color: #facc15; } /* accent */

      /* ── Content ─────────────────────────────────────────── */
      .content { padding: 28px 22px; }

      .title {
        font-size: 20px; /* mobile-first */
        font-weight: 600;
        color: #2d3748;
        margin: 0 0 16px 0;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .card {
        background: #f8fafc;
        border-radius: 10px;
        padding: 18px;
        margin: 18px 0;
        border-left: 3px solid #0ea5e9; /* brand blue */
      }

      .detail-row { margin-bottom: 12px; }
      .detail-row:last-child { margin-bottom: 0; }

      .detail-label {
        font-weight: 600;
        color: #4a5568;
        display: block;
        margin-bottom: 4px;
        font-size: 14px;
      }

      .detail-value {
        font-weight: 500;
        color: #111827;
        font-size: 15px;
        word-break: break-word; /* safe on mobile */
      }

      .tx-id {
        background: #edf2f7;
        padding: 6px 10px;
        border-radius: 6px;
        font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,"Liberation Mono","Courier New",monospace;
        word-break: break-word;
        font-size: 13px;
        display: inline-block;
        margin-top: 5px;
        color: #1f2937;
      }

      .status {
        display: inline-block;
        padding: 3px 8px;
        background: #22c55e; /* brand green */
        color: white;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }

      .cta-container { text-align: center; margin: 22px 0; }

      .cta-button {
        display: inline-block;
        background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
        color: #ffffff !important;
        text-decoration: none;
        padding: 11px 24px;
        border-radius: 10px;
        font-weight: 700;
        transition: transform .2s ease, box-shadow .2s ease;
        box-shadow: 0 4px 10px rgba(2, 132, 199, .25);
      }
      .cta-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 14px rgba(2, 132, 199, .35);
      }

      .auto-note {
        font-size: 12.5px;
        color: #6b7280;
        text-align: center;
        margin-top: 18px;
      }

      .footer {
        background: #f8fafc;
        padding: 15px;
        text-align: center;
        font-size: 12.5px;
        color: #6b7280;
        border-top: 1px solid #e5e7eb;
      }
      .footer a {
        color: #0ea5e9;
        text-decoration: none;
        font-weight: 600;
      }

      /* ── Desktop upscale (≥ 600px) ───────────────────────── */
      @media (min-width: 600px) {
        .header { padding: 40px 25px; }
        .logo { font-size: 32px; }
        .content { padding: 35px 30px; }
        .title { font-size: 22px; }
      }

      /* ── Very small screens (≤ 360px) ─────────────────────── */
      @media (max-width: 360px) {
        .cta-button { width: 100%; }
      }
    </style>
  </head>

  <body>
    <div class="container">
      <!-- ── Brand ── -->
      <div class="header">
        <h1 class="logo">Gyonex</h1>
      </div>

      <!-- ── Content ── -->
      <div class="content">
        <h2 class="title">
          <!-- simple check icon -->
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
               xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21
                     C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3
                     C16.9706 3 21 7.02944 21 12Z"
                  stroke="#22c55e" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Deposit Successful
        </h2>

        <p>Hello <strong>${name}</strong>,</p>
        <p>Your deposit has been processed successfully and is now available in your account.</p>

        <!-- ── Details ── -->
        <div class="card">
          <div class="detail-row">
            <span class="detail-label">Amount</span>
            <span class="detail-value">${amt} USDT</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Network</span>
            <span class="detail-value">TRC20</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value"><span class="status">Completed</span></span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Transaction ID</span>
            <div><span class="tx-id">${txId}</span></div>
          </div>
        </div>

        <!-- ── CTA ── -->
        <div class="cta-container">
          <a href="https://gyonex.com/dashboard" class="cta-button">
            View Balance
          </a>
        </div>

        <p class="auto-note">
          This is an automated notification. Please do not reply.
        </p>
      </div>

      <!-- ── Footer ── -->
      <div class="footer">
        &copy; 2025 <a href="https://gyonex.com/">Gyonex</a>. All rights reserved.
      </div>
    </div>
  </body>
</html>
`;
};
