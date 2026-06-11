/* ── withdrawApprovalTemplate (Upbit Trade • responsive + branding) ─── */

interface WithdrawApprovalParams {
  name: string;
  amount: number | string;
  txId: string;
  walletAddress: string;
}

export const withdrawApprovalTemplate = ({
  name,
  amount,
  txId,
  walletAddress,
}: WithdrawApprovalParams): string => {
  const amt = typeof amount === "number" ? amount.toFixed(2) : String(amount);

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <!-- mobile-first -->
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Withdrawal Approved - Gyonex</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

        /* ── base ── */
        body {
          margin: 0;
          padding: 0;
          background-color: #f8fafc;
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji',
            'Segoe UI Symbol', sans-serif;
          color: #1e293b;
          line-height: 1.6;
          -webkit-text-size-adjust: 100%;
        }

        /* ── shell ── */
        .container {
          max-width: 600px;
          margin: 24px auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
          border: 1px solid #e2e8f0;
        }

        /* ── header (brand gradient) ── */
        .header {
          background: linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%);
          padding: 28px 20px;
          text-align: center;
          color: #ffffff;
          position: relative;
          overflow: hidden;
        }
        .header::before {
          content: '';
          position: absolute;
          top: -50px;
          right: -50px;
          width: 150px;
          height: 150px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 50%;
        }
        .logo {
          font-size: 26px;
          font-weight: 700;
          margin: 0;
          letter-spacing: .2px;
          position: relative;
          z-index: 1;
        }
        .logo span { color: #facc15; } /* accent */

        /* ── content ── */
        .content { padding: 28px 20px; }

        .title {
          font-size: 20px; /* mobile-first */
          font-weight: 600;
          color: #2d3748;
          margin: 0 0 18px 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .title .icon { color: #22c55e; }

        /* ── transaction card ── */
        .transaction-card {
          background: #f8fafc;
          border-radius: 12px;
          padding: 18px;
          margin: 18px 0;
          border-left: 4px solid #0ea5e9;
        }
        .transaction-item {
          margin-bottom: 14px;
          display: flex;
          align-items: flex-start;
        }
        .transaction-item:last-child { margin-bottom: 0; }
        .transaction-icon {
          margin-right: 12px;
          font-size: 18px;
          color: #0ea5e9;
          min-width: 24px;
        }
        .transaction-label {
          font-weight: 600;
          color: #4a5568;
          margin-bottom: 4px;
          font-size: 14px;
        }
        .transaction-value {
          font-weight: 500;
          word-break: break-word;
          color: #111827;
          font-size: 15px;
        }
        .tx-id {
          background: #edf2f7;
          padding: 8px 12px;
          border-radius: 6px;
          font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,"Liberation Mono","Courier New",monospace;
          font-size: 13px;
          margin-top: 5px;
          display: inline-block;
          word-break: break-all;
          color: #1f2937;
        }

        /* ── security note ── */
        .security-note {
          background: #fff7ed;
          border-left: 4px solid #f59e0b;
          padding: 14px;
          border-radius: 10px;
          margin: 18px 0;
          font-size: 14px;
          color: #7c2d12;
        }

        /* ── footer ── */
        .footer {
          background: #f1f5f9;
          text-align: center;
          padding: 16px;
          font-size: 12.5px;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
        }
        .footer a {
          color: #0ea5e9;
          text-decoration: none;
          font-weight: 600;
        }

        /* ── desktop upscale (≥ 600px) ── */
        @media (min-width: 600px) {
          .container { margin: 30px auto; }
          .content { padding: 40px 30px; }
          .logo { font-size: 28px; }
          .title { font-size: 24px; }
        }

        /* ── tiny screens (≤ 360px) ── */
        @media (max-width: 360px) {
          .transaction-label { font-size: 13px; }
          .transaction-value { font-size: 14px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- ── header ── -->
        <div class="header">
          <h1 class="logo">Gyonex</h1>
        </div>

        <!-- ── content ── -->
        <div class="content">
          <h2 class="title"><span class="icon">✓</span> Withdrawal Approved</h2>

          <p>Dear <strong>${name}</strong>,</p>
          <p>Your withdrawal request has been processed successfully and the funds have been sent to your wallet.</p>

          <!-- ── transaction details ── -->
          <div class="transaction-card">
            <div class="transaction-item">
              <div class="transaction-icon">💸</div>
              <div>
                <div class="transaction-label">Amount Withdrawn</div>
                <div class="transaction-value">${amt} USDT</div>
              </div>
            </div>

            <div class="transaction-item">
              <div class="transaction-icon">📍</div>
              <div>
                <div class="transaction-label">Destination Wallet</div>
                <div class="transaction-value">${walletAddress}</div>
              </div>
            </div>

            <div class="transaction-item">
              <div class="transaction-icon">🔗</div>
              <div>
                <div class="transaction-label">Transaction ID</div>
                <div class="transaction-value">
                  <span class="tx-id">${txId}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── security note ── -->
          <div class="security-note">
            <strong>Important:</strong> The transaction may take some time to appear in your wallet depending on network congestion. If you didn't initiate this withdrawal, please secure your account immediately.
          </div>

          <p>Thank you for using Gyonex. We're committed to providing you with secure and efficient digital asset services.</p>
        </div>

        <!-- ── footer ── -->
        <div class="footer">
          &copy; 2025 <a href="https://gyonex.com/">Gyonex</a>. All rights reserved.
        </div>
      </div>
    </body>
  </html>`;
};
