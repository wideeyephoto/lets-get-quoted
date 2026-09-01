export interface QuickStopPaymentRequest {
  accountId: string;
  contractorName: string;
  homeownerName?: string;
  homeownerPhone?: string;
  serviceDescription: string;
  amountDollars: number;
  tipAllowed?: boolean;
}

export interface QuickStopPaymentSession {
  sessionId: string;
  checkoutUrl: string;
  amountCents: number;
  serviceDescription: string;
  qrCodeSvgDataUri: string;
  smsPromptText: string;
}

/**
 * Creates a mobile 1-tap quick pay checkout session for field workers on site
 */
export function createMobileQuickPaySession(req: QuickStopPaymentRequest): QuickStopPaymentSession {
  const sessionId = `qpay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const amountCents = Math.round(req.amountDollars * 100);
  const checkoutUrl = `https://app.letsgetquoted.com/pay/quick/${sessionId}?acc=${encodeURIComponent(req.accountId)}&amt=${req.amountDollars}`;

  const smsPromptText = `Hi ${req.homeownerName || 'there'}, here is your 1-tap receipt and payment link for today's ${req.serviceDescription} ($${req.amountDollars}): ${checkoutUrl} (Apple Pay, Google Pay, & Cards accepted)`;

  // Lightweight SVG QR code data URI placeholder for instant on-screen scanning
  const qrCodeSvgDataUri = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23ffffff"/><text x="100" y="100" font-family="sans-serif" font-size="14" text-anchor="middle" fill="%230f172a">Scan to Pay $${req.amountDollars}</text></svg>`;

  return {
    sessionId,
    checkoutUrl,
    amountCents,
    serviceDescription: req.serviceDescription,
    qrCodeSvgDataUri,
    smsPromptText,
  };
}
