// mail/templates/emailVerificationTemplate.ts
export function emailVerificationTemplate(code: string) {
  // ইনবক্স প্রিভিউর জন্য ছোট preheader টেক্সট
  const preheader =
    "Your Gyonex verification code. This code expires in 30 minutes.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Email Verification - Gyonex</title>
  <style>
    /* সিস্টেম ফন্ট, কোনও @import নয় */
    body{margin:0;padding:0;background:#f8fafc;color:#111827;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6}
    .preheader{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}
    .wrap{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}
    .head{background:linear-gradient(135deg,#0ea5e9 0%,#22c55e 100%);color:#fff;text-align:center;padding:22px}
    .brand{margin:0;font-size:22px;font-weight:700}
    .brand b{color:#facc15}
    .content{padding:24px 18px}
    .title{margin:0 0 12px;font-size:20px;font-weight:700}
    .code{background:#ecfeff;border:1px dashed #a7f3d0;color:#0ea5e9;text-align:center;padding:18px;font-size:34px;font-weight:800;border-radius:10px;margin:18px 0;letter-spacing:6px;font-family:Consolas,"Courier New",monospace}
    .cta{text-align:center;margin:12px 0 6px}
    .btn{display:inline-block;background:linear-gradient(135deg,#0ea5e9 0%,#22c55e 100%);color:#fff!important;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700}
    .note{background:#fff7ed;border-left:4px solid #f59e0b;padding:12px;border-radius:10px;margin:16px 0;font-size:14px;color:#7c2d12}
    .foot{background:#f1f5f9;text-align:center;padding:14px;font-size:12.5px;color:#64748b;border-top:1px solid #e2e8f0}
    .foot a{color:#0ea5e9;text-decoration:none;font-weight:600}
    @media (min-width:600px){.brand{font-size:24px}.title{font-size:22px}.code{font-size:40px}}
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="wrap">
    <div class="head">
      <h1 class="brand">Gyonex</h1>
    </div>
    <div class="content">
      <h2 class="title">Verify your email address</h2>
      <p style="margin:0 0 10px">Hello,</p>
      <p style="margin:0 0 10px">Use the verification code below to finish setting up your Gyonex account:</p>
      <div class="code">${code}</div>
  
      <div class="note"><strong>Security:</strong> This code will expire in <strong>30 minutes</strong>. If you didn’t request this, you can safely ignore this email.</div>
      <p style="margin:0">Thanks for choosing Gyonex.</p>
    </div>
    <div class="foot">
      © 2025 <a href="https://gyonex.com/">Gyonex </a> • Need help? <a href="mailto:support@gyonex.com">support@gyonex.com</a>
    </div>
  </div>
</body>
</html>`;
}
