import { generateQrSvg } from './equipment-qr';

export type ReviewFlyerInput = {
  businessName: string;
  phone?: string | null;
  googleReviewUrl: string;
  tagline?: string | null;
  ownerName?: string | null;
};

/**
 * Generates a clean, print-ready HTML page for a physical "Thank You" leave-behind flyer
 * with a high-resolution Google Review QR code.
 */
export function buildReviewFlyerHtml(input: ReviewFlyerInput): string {
  const qrSvg = generateQrSvg(input.googleReviewUrl, 200);

  const businessName = escapeHtml(input.businessName || "Let's Get Quoted");
  const phone = input.phone ? escapeHtml(input.phone) : null;
  const tagline = input.tagline
    ? escapeHtml(input.tagline)
    : 'Your feedback means the world to our local family business!';
  const signoff = input.ownerName ? `— ${escapeHtml(input.ownerName)} &amp; the Crew` : '— The Entire Team';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Thank You for Choosing ${businessName}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 95vh;
      box-sizing: border-box;
    }
    .flyer-card {
      max-width: 580px;
      width: 100%;
      border: 3px solid #0f172a;
      border-radius: 16px;
      padding: 36px 32px;
      text-align: center;
      box-sizing: border-box;
    }
    .business-title {
      font-size: 28px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 6px;
    }
    .tagline {
      font-size: 15px;
      color: #475569;
      margin: 0 0 20px;
    }
    .stars {
      color: #eab308;
      font-size: 28px;
      letter-spacing: 4px;
      margin-bottom: 20px;
    }
    .qr-container {
      display: inline-block;
      padding: 14px;
      background: #f8fafc;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      margin: 10px 0 20px;
    }
    .instruction-head {
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 6px;
    }
    .instruction-step {
      font-size: 14px;
      color: #334155;
      margin: 0 0 16px;
      line-height: 1.4;
    }
    .signoff {
      font-size: 14px;
      font-weight: 600;
      color: #0f172a;
      margin-top: 16px;
    }
    .phone-contact {
      margin-top: 12px;
      font-size: 13px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="flyer-card">
    <h1 class="business-title">${businessName}</h1>
    <p class="tagline">${tagline}</p>
    <div class="stars">★★★★★</div>

    <h2 class="instruction-head">How was your service today?</h2>
    <p class="instruction-step">
      As a local business, honest Google reviews help our community find dependable craftsmanship.
    </p>

    <div class="qr-container">
      ${qrSvg}
      <p style="margin: 8px 0 0; font-size: 11px; font-weight: 700; color: #0f172a; letter-spacing: 0.05em;">
        SCAN WITH PHONE CAMERA TO REVIEW
      </p>
    </div>

    <p class="signoff">Thank you for trusting us with your home! ${signoff}</p>
    ${phone ? `<p class="phone-contact">Questions or future projects? Call us anytime: <strong>${phone}</strong></p>` : ''}
  </div>
</body>
</html>
`.trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
