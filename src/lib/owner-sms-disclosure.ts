/**
 * The exact words an owner agrees to, and the identifier recorded when they do.
 *
 * WHY THIS IS A MODULE AND NOT JUST JSX.
 *
 * These sentences are evidence. They go into a carrier 10DLC campaign
 * submission as a screenshot, and the consent ledger has to be able to say that
 * a given owner accepted THIS wording rather than whatever the checkbox said
 * six months ago. That only works if one string is simultaneously the thing
 * rendered, the thing tested, and the thing the version identifies. Retyping
 * the sentence into a test is how the test starts passing against a copy while
 * the screen shows something else.
 *
 * Import-free on purpose so a server action, a client component and a test can
 * all read it without dragging a Supabase client into a browser bundle.
 *
 * IF YOU EDIT ANY STRING BELOW, BUMP THE VERSION. The version is not decoration
 * — it is the only thing that distinguishes "consented" from "consented to what
 * we are showing regulators today", and a silent wording change makes every
 * historical row a claim nobody can substantiate.
 */

/**
 * Bumped when the wording changes. Sortable-date prefix so the ledger reads
 * chronologically.
 *
 * v2 because v1 was never recorded: the previous wording shipped before the
 * ledger had a disclosure_version column at all. Rows from that era carry null,
 * and they are NOT retro-stamped — see the migration note. Null means "agreed
 * to something we can no longer name", which is treated as stale.
 */
export const OWNER_SMS_DISCLOSURE_VERSION = '2026-08-21-owner-alerts-v2';

/**
 * The checkbox label, verbatim.
 *
 * "recurring" and the four named traffic types are load-bearing: they have to
 * match the campaign use-case and sample messages filed with the carriers. A
 * checkbox promising less than the campaign registers for is a mismatch a
 * reviewer will find; one promising more is a consent nobody gave.
 */
export const OWNER_SMS_CONSENT_LABEL =
  'I agree to receive recurring transactional account, billing, support, and quote-request alert texts from Let’s Get Quoted at the mobile number above.';

// The disclosure, in the pieces the rendered version needs — two of them are
// link text. Split rather than duplicated so the sentence on screen and the
// sentence below are provably the same characters; the test asserts the join.
export const OWNER_SMS_DISCLOSURE_LEAD =
  'Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our ';
export const OWNER_SMS_TERMS_LABEL = 'SMS Terms';
export const OWNER_SMS_DISCLOSURE_JOIN = ' and ';
export const OWNER_SMS_PRIVACY_LABEL = 'Privacy Policy';
export const OWNER_SMS_DISCLOSURE_TAIL = '.';

/** The whole disclosure as one string — what the version identifies. */
export const OWNER_SMS_DISCLOSURE =
  OWNER_SMS_DISCLOSURE_LEAD +
  OWNER_SMS_TERMS_LABEL +
  OWNER_SMS_DISCLOSURE_JOIN +
  OWNER_SMS_PRIVACY_LABEL +
  OWNER_SMS_DISCLOSURE_TAIL;

export const OWNER_SMS_TERMS_HREF = '/sms-terms';
export const OWNER_SMS_PRIVACY_HREF = '/privacy';

/**
 * Does this owner still need to agree?
 *
 * True for somebody who has never consented, AND for somebody whose recorded
 * consent predates the current wording. The second case is the one that matters
 * here: they agreed to a different sentence, so the box starts empty and the
 * ledger does not get to claim they accepted this one.
 *
 * Opted-out is deliberately NOT this function's business. A STOP is not a
 * stale consent to refresh — nothing in this dialog can undo it.
 */
export function needsOwnerSmsConsent(recordedVersion: string | null | undefined): boolean {
  return recordedVersion !== OWNER_SMS_DISCLOSURE_VERSION;
}
