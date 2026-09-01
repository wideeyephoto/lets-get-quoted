import { createHash } from 'node:crypto';

/**
 * Canonical Crew SMS Disclosure & Consent Constants.
 *
 * Keeping this copy centralized lets the database record which exact version
 * was accepted, matching 10DLC / carrier compliance records.
 */

export const CREW_SMS_DISCLOSURE_VERSION = '2026-09-01-crew-sms-v1';

export const CREW_SMS_CONSENT_LABEL =
  'I confirm that this crew member gave permission to enter their mobile number and receive recurring SMS messages from Let’s Get Quoted about crew assignments, job opportunities, and schedule updates.';

export const CREW_SMS_DISCLOSURE =
  'Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help. Consent is not a condition of purchase.';

export const CREW_SMS_WELCOME_MESSAGE =
  'Let’s Get Quoted: Welcome! You’re subscribed to recurring crew assignment, job opportunity, and schedule update texts for businesses using Let’s Get Quoted. Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe or HELP for help.';

/**
 * Full disclosure text as shown to the user / contractor.
 */
export const CREW_SMS_FULL_DISCLOSURE = `${CREW_SMS_CONSENT_LABEL} ${CREW_SMS_DISCLOSURE} SMS Terms and Privacy Policy.`;

/**
 * Computes deterministic SHA-256 hash of the disclosure text for audited evidence recording.
 */
export function getCrewSmsDisclosureHash(text = CREW_SMS_FULL_DISCLOSURE): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
