import React from 'react';
import { cspNonce } from '@/lib/csp-nonce';
import { getSignupConversionSendTo } from '@/lib/google-tag';

/**
 * Google Ads Event Snippet for Sign-up Conversion.
 *
 * Placed on conversion landing pages (e.g. /welcome) to measure sign-up goals.
 * Uses the request's CSP nonce to ensure seamless execution.
 */
export default async function GoogleTagConversion({
  sendTo,
  value = 1.0,
  currency = 'USD',
  transactionId,
}: {
  sendTo?: string;
  value?: number;
  currency?: string;
  transactionId?: string;
}) {
  const targetSendTo = sendTo || getSignupConversionSendTo();
  const nonce = await cspNonce();

  if (!targetSendTo) return null;

  const eventPayload: Record<string, unknown> = {
    send_to: targetSendTo,
    value,
    currency,
  };
  if (transactionId) {
    eventPayload.transaction_id = transactionId;
  }

  const conversionScript = `if (typeof gtag === 'function') {
  gtag('event', 'conversion', ${JSON.stringify(eventPayload)});
} else {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(['event', 'conversion', ${JSON.stringify(eventPayload)}]);
}`;

  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: conversionScript }}
    />
  );
}
