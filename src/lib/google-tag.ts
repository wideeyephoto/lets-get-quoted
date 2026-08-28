/**
 * Google Tag & Google Ads Conversion Tracking for Let's Get Quoted.
 *
 * Configured for tag ID AW-18400954668 and the Sign-up conversion action.
 */

export const DEFAULT_GOOGLE_TAG_ID = 'AW-18400954668';
export const DEFAULT_SIGNUP_CONVERSION_SEND_TO = 'AW-18400954668/lyRGCLLH6-QcEKySocZE';

export function getGoogleTagId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || DEFAULT_GOOGLE_TAG_ID;
}

export function getSignupConversionSendTo(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION_ID || DEFAULT_SIGNUP_CONVERSION_SEND_TO;
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

  const sendTo = payload?.send_to || getSignupConversionSendTo();
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
