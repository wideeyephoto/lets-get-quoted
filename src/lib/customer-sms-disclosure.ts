/**
 * Canonical Customer & Marketing SMS Disclosure & Consent Constants.
 *
 * Keeping this copy centralized lets the database record which exact version
 * was accepted, matching 10DLC / carrier compliance records and TCPA evidence.
 */

export const CUSTOMER_SMS_DISCLOSURE_VERSION = '2026-09-01-customer-sms-v1' as const;

export const CUSTOMER_SMS_CONSENT_LABEL =
  "I confirm that I gave permission to receive recurring SMS messages from Let's Get Quoted and its contractors regarding my estimates, appointments, and services.";

export const CUSTOMER_SMS_DISCLOSURE =
  'Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help. Consent is not a condition of purchase.';

export const CUSTOMER_SMS_FULL_DISCLOSURE = `${CUSTOMER_SMS_CONSENT_LABEL} ${CUSTOMER_SMS_DISCLOSURE} SMS Terms and Privacy Policy.`;

export function getCustomerSmsDisclosureHash(text = CUSTOMER_SMS_FULL_DISCLOSURE): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = typeof window === 'undefined' ? require('crypto') : null;
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }
  return '';
}

// ----------------------------------------------------------------------------
// Marketing Consent Constants (TCPA express written consent standard)
// ----------------------------------------------------------------------------

export const MARKETING_SMS_DISCLOSURE_VERSION = '2026-09-15-marketing-sms-v1' as const;

export const MARKETING_SMS_CONSENT_LABEL =
  "I agree to receive recurring promotional and marketing SMS text messages, special seasonal offers, and service announcements from Let's Get Quoted and its contractors.";

export const MARKETING_SMS_DISCLOSURE =
  'Consent is not a condition of purchase. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.';

export const MARKETING_SMS_FULL_DISCLOSURE = `${MARKETING_SMS_CONSENT_LABEL} ${MARKETING_SMS_DISCLOSURE} SMS Terms and Privacy Policy.`;

export function getMarketingSmsDisclosureHash(text = MARKETING_SMS_FULL_DISCLOSURE): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = typeof window === 'undefined' ? require('crypto') : null;
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }
  return '';
}
