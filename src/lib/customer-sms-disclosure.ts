import { createHash } from 'crypto';

export const CUSTOMER_SMS_DISCLOSURE_VERSION = '2026-09-01-customer-sms-v1' as const;

export const CUSTOMER_SMS_CONSENT_LABEL =
  "I confirm that I gave permission to receive recurring SMS messages from Let's Get Quoted and its contractors regarding my estimates, appointments, and services.";

export const CUSTOMER_SMS_DISCLOSURE =
  'Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help. Consent is not a condition of purchase.';

export const CUSTOMER_SMS_FULL_DISCLOSURE = "SMS Terms and Privacy Policy.";

export function getCustomerSmsDisclosureHash(text = CUSTOMER_SMS_FULL_DISCLOSURE): string {
  return createHash('sha256').update(text).digest('hex');
}
