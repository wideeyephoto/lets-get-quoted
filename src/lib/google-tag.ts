export function getGoogleTagId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_TAG_ID?.trim() || '';
}

export function getSignupConversionSendTo(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID?.trim() || '';
}

export type GoogleAdsSignupTrackingConfig = {
  tagId: string;
  sendTo: string;
};

/**
 * The base Google tag and sign-up conversion target are one configuration.
 * Refuse partial or cross-account values so acquisition tracking cannot look
 * enabled while silently dropping or misrouting conversions.
 */
export function getGoogleAdsSignupTrackingConfig(): GoogleAdsSignupTrackingConfig | null {
  const tagId = getGoogleTagId();
  const sendTo = getSignupConversionSendTo();
  const sendToMatch = /^(AW-\d+)\/[^/\s]+$/.exec(sendTo);

  if (!/^AW-\d+$/.test(tagId) || !sendToMatch || sendToMatch[1] !== tagId) {
    return null;
  }

  return { tagId, sendTo };
}

export type GoogleAdsConversionPayload = {
  send_to?: string;
  value?: number;
  currency?: string;
  transaction_id?: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __lgq_signup_converted?: boolean;
  }
}

/**
 * Sends a Google Ads conversion event via gtag.js.
 * Safe to call from client components.
 */
export function trackGoogleAdsConversion(payload?: Partial<GoogleAdsConversionPayload>): boolean {
  if (typeof window === 'undefined') return false;

  const sendTo = payload?.send_to || getGoogleAdsSignupTrackingConfig()?.sendTo;
  if (!sendTo) return false;

  const value = payload?.value ?? 1.0;
  const currency = payload?.currency || 'USD';

  if (typeof window.gtag === 'function') {
    try {
      window.gtag('event', 'conversion', {
        send_to: sendTo,
        value,
        currency,
        ...(payload?.transaction_id ? { transaction_id: payload.transaction_id } : {}),
      });
      return true;
    } catch (err) {
      console.warn('Google Ads conversion event failed:', err);
      return false;
    }
  }

  // If gtag is not ready yet, push directly to dataLayer
  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push([
      'event',
      'conversion',
      {
        send_to: sendTo,
        value,
        currency,
        ...(payload?.transaction_id ? { transaction_id: payload.transaction_id } : {}),
      },
    ]);
    return true;
  }

  return false;
}

/**
 * Fires the sign-up conversion event once per session / activation.
 */
export function trackSignupConversion(transactionId?: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__lgq_signup_converted) return false;

  const tracked = trackGoogleAdsConversion(transactionId ? { transaction_id: transactionId } : undefined);
  if (tracked) {
    window.__lgq_signup_converted = true;
  }
  return tracked;
}
