import { createAdminClient } from '@/lib/auth';
import { needsOwnerSmsConsent } from '@/lib/owner-sms-disclosure';
import { normalizeUsPhone } from '@/lib/phone';

/**
 * Two different texting questions that kept being answered as one.
 *
 *   1. Does LGQ have permission to text the OWNER about their own account —
 *      a high-value lead landing, a homeowner accepting an estimate. One
 *      person, their own number, their own consent.
 *
 *   2. Can this contractor text THEIR CUSTOMERS from a number of their own —
 *      which is a carrier registration, not a setting, and which nobody can
 *      start yet because the provider has not confirmed the process.
 *
 * They are separate all the way down and this module keeps them separate:
 * separate storage (sms_consent vs messaging_registrations), separate status,
 * separate section in the dialog. Collapsing them is how a page ends up telling
 * a contractor they are "set up for texting" because they typed their own
 * mobile into a box.
 *
 * THE RULE ABOUT NOT KNOWING. Every loader below can fail to read, and a read
 * failure is not a state — `not_started` and "we could not check" look identical
 * on a screen and mean opposite things. So both return a discriminated union
 * with an `unavailable` arm, and the strip renders that as its own status. The
 * alternative is the failure mode this whole file is written against: a query
 * errors, the code falls back to a sensible-looking default, and somebody is
 * told their setup is fine.
 */

/* -------------------------------------------------------------------------
   Customer texting — the registration
   ---------------------------------------------------------------------- */

/**
 * Every state a registration can be in. Mirrors the check constraint on
 * messaging_registrations.status, and deliberately has no member for "could not
 * read" — see the note at the top.
 */
export const REGISTRATION_STATUSES = [
  'not_started',
  'submitted',
  'in_review',
  'approved',
  'action_required',
  'rejected',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type Registration =
  | {
      readonly kind: 'ok';
      readonly status: RegistrationStatus;
      /** Only ever set once a number has actually been assigned. */
      readonly assignedNumber: string | null;
      /** Why it needs attention, when it does. */
      readonly detail: string | null;
    }
  | { readonly kind: 'unavailable' };

/* -------------------------------------------------------------------------
   LGQ notifications — the owner's own number
   ---------------------------------------------------------------------- */

export type OwnerAlerts =
  | {
      readonly kind: 'ok';
      /** E.164, or null if they have never given one. */
      readonly phone: string | null;
      /** Whether they asked for the high-value lead text at all. */
      readonly enabled: boolean;
      /**
       * What the consent ledger says about that number, for THIS account.
       * `none` means there is no row — which is what every account looked like
       * before this shipped, and is why a STOP from an owner did nothing.
       */
      readonly consent: 'opted_in' | 'opted_out' | 'none';
      readonly consentedAt: string | null;
      /**
       * WHICH wording they agreed to. Null for a consent recorded before the
       * disclosure was versioned — which is not the same as no consent, and is
       * also not good enough to put in front of a carrier. See
       * lib/owner-sms-disclosure.
       */
      readonly consentVersion: string | null;
    }
  | { readonly kind: 'unavailable' };

/* -------------------------------------------------------------------------
   What the strip says
   ---------------------------------------------------------------------- */

export type StatusTone = 'ready' | 'pending' | 'attention' | 'unknown';

export type StatusChip = {
  readonly label: string;
  readonly tone: StatusTone;
  /** The sentence under the label, where there is room for one. */
  readonly detail: string | null;
};

/**
 * The owner-alert chip.
 *
 * "Ready" is the narrow claim it looks like: a number is on file AND the
 * consent ledger has not been flipped by a STOP. Enabled-with-no-number is
 * Setup needed rather than Ready, and so is opted-out — somebody who replied
 * STOP is not going to get their lead alerts, and a page that says Ready is
 * lying to them about why their phone is quiet.
 */
export function ownerAlertChip(alerts: OwnerAlerts): StatusChip {
  if (alerts.kind === 'unavailable') {
    return { label: 'Unavailable', tone: 'unknown', detail: 'We could not read your notification settings just now.' };
  }
  if (alerts.consent === 'opted_out') {
    return {
      label: 'Stopped',
      tone: 'attention',
      detail: 'You replied STOP to a text from us. Reply START from that phone to turn alerts back on.',
    };
  }
  if (!alerts.phone) {
    return { label: 'Setup needed', tone: 'attention', detail: 'No mobile number on file, so nothing can be texted to you.' };
  }
  /**
   * A NUMBER WITHOUT CONSENT IS NOT READY, and this used to say it was.
   *
   * Two ways to land here. A legacy account whose number was typed into the old
   * settings page, which never asked for consent at all — so there is no ledger
   * row and `consent` is 'none'. Or somebody who agreed to wording we have since
   * replaced, which is a row with a stale version.
   *
   * Both were reported as Ready, because the check was only ever "is there a
   * number". For the one thing this chip is read for — can we defend texting
   * this person — that is the wrong answer twice over. It is checked BEFORE the
   * enabled switch below, since consent is about whether we may text at all,
   * not about whether they currently want a particular alert.
   */
  if (alerts.consent === 'none') {
    return {
      label: 'Consent needed',
      tone: 'attention',
      detail: 'We have your number but no record of you agreeing to be texted on it.',
    };
  }
  if (needsOwnerSmsConsent(alerts.consentVersion)) {
    return {
      label: 'Consent needed',
      tone: 'attention',
      detail: 'Our texting disclosure changed. Open setup and agree to the current wording.',
    };
  }
  if (!alerts.enabled) {
    return { label: 'Off', tone: 'pending', detail: 'Your number is on file and lead alerts are switched off.' };
  }
  return { label: 'Ready', tone: 'ready', detail: null };
}

/**
 * The customer-texting chip.
 *
 * `not_started` reads "Coming soon" and not "Not started", because "Not
 * started" is an accusation — it says the contractor has something to do. They
 * do not. Nobody can begin until the provider confirms the downstream-business
 * registration process, and saying so is the honest version.
 */
export function registrationChip(registration: Registration): StatusChip {
  if (registration.kind === 'unavailable') {
    return { label: 'Unavailable', tone: 'unknown', detail: 'We could not read your registration status just now.' };
  }
  switch (registration.status) {
    case 'approved':
      return { label: 'Approved', tone: 'ready', detail: null };
    case 'submitted':
    case 'in_review':
      return { label: 'Under review', tone: 'pending', detail: 'Sent to the carriers. This normally takes a few business days.' };
    case 'action_required':
      return { label: 'Action required', tone: 'attention', detail: registration.detail };
    case 'rejected':
      return { label: 'Action required', tone: 'attention', detail: registration.detail };
    case 'not_started':
    default:
      return {
        label: 'Coming soon',
        tone: 'pending',
        detail: 'Registration opens once our provider confirms the process for managed accounts.',
      };
  }
}

/**
 * ONE CHIP FOR A PHONE, and it has to be the worst of the two.
 *
 * The strip shows both statuses side by side on a desktop and has room for
 * exactly one on a phone. Which one has to be the one that would make somebody
 * open the dialog — so it is the most severe, not the first. An aggregate that
 * reported "Ready" while the other half said "Action required" would be a
 * summary that hides the only thing it exists to surface.
 */
const TONE_ORDER: Record<StatusTone, number> = { unknown: 3, attention: 2, pending: 1, ready: 0 };

export function aggregateChip(alerts: OwnerAlerts, registration: Registration): StatusChip {
  const chips = [ownerAlertChip(alerts), registrationChip(registration)];
  const worst = chips.reduce((carry, chip) => (TONE_ORDER[chip.tone] > TONE_ORDER[carry.tone] ? chip : carry));
  // The aggregate keeps the severity but not the wording: "Stopped" on its own,
  // with no room to say what stopped, is a word nobody can act on.
  if (worst.tone === 'ready') return { label: 'Ready', tone: 'ready', detail: null };
  if (worst.tone === 'unknown') return { label: 'Unavailable', tone: 'unknown', detail: worst.detail };
  if (worst.tone === 'attention') return { label: 'Needs attention', tone: 'attention', detail: worst.detail };
  return { label: 'In progress', tone: 'pending', detail: worst.detail };
}

/**
 * Whether the owner-notification form can be saved at all.
 *
 * A form that accepts a submission it cannot store is worse than a disabled
 * one: the owner types their number, presses save, sees nothing break, and
 * believes they are set up. If the read failed the write is going to fail too.
 */
export function canSaveOwnerAlerts(alerts: OwnerAlerts): boolean {
  return alerts.kind === 'ok';
}

/* -------------------------------------------------------------------------
   Validation
   ---------------------------------------------------------------------- */

export type OwnerAlertsInput = { phone: string; enabled: boolean; consented: boolean };

export type OwnerAlertsError = { readonly field: 'phone' | 'consent' | 'form'; readonly message: string };

/**
 * What the dialog will not accept, and why each one is a refusal rather than a
 * silent correction.
 *
 * Consent is checked BEFORE the number is even looked at when alerts are being
 * switched on, because the consent tick is the thing that makes the number
 * legal to hold for this purpose. Storing the number and then complaining would
 * mean having kept it without permission for as long as the error was on
 * screen.
 */
export function validateOwnerAlerts(input: OwnerAlertsInput): OwnerAlertsError[] {
  const errors: OwnerAlertsError[] = [];
  const typed = input.phone.trim();

  if (input.enabled) {
    if (!input.consented) {
      errors.push({ field: 'consent', message: 'Tick the box to agree to receive these texts.' });
    }
    if (!typed) {
      errors.push({ field: 'phone', message: 'Add the mobile number you want these texts on.' });
    } else if (!normalizeUsPhone(typed)) {
      errors.push({ field: 'phone', message: 'That does not look like a US mobile number. Try (248) 555-0100.' });
    }
  } else if (typed && !normalizeUsPhone(typed)) {
    // Alerts off, but they left something unparseable in the box. Saving it
    // would store a number nothing can ever text.
    errors.push({ field: 'phone', message: 'That does not look like a US mobile number. Clear it or fix it.' });
  }

  return errors;
}

/* -------------------------------------------------------------------------
   Reads
   ---------------------------------------------------------------------- */

/**
 * The owner's number, their switch, and what the consent ledger says.
 *
 * Two reads, and either one failing makes the whole thing unavailable —
 * reporting a number with an unknown consent state is exactly the half-answer
 * this module refuses to give.
 */
export async function loadOwnerAlerts(accountId: string): Promise<OwnerAlerts> {
  const admin = createAdminClient();

  const { data: account, error } = await admin
    .from('accounts')
    .select('alert_phone, high_value_sms_enabled')
    .eq('id', accountId)
    .maybeSingle();
  if (error) {
    console.error('Owner alert settings unreadable:', error.message);
    return { kind: 'unavailable' };
  }

  const phone = normalizeUsPhone(String(account?.alert_phone ?? '')) ?? null;
  const enabled = Boolean(account?.high_value_sms_enabled);
  if (!phone) return { kind: 'ok', phone: null, enabled, consent: 'none', consentedAt: null, consentVersion: null };

  /**
   * Keyed on the NUMBER, which is what makes changing it re-ask for consent.
   *
   * Consent rows are (account_id, phone_number), so typing a different mobile
   * finds no row and reads as 'none' — there is no such thing as consent that
   * follows somebody to a new handset. The form then requires the box before it
   * will enable anything for the new number.
   */
  const { data: consent, error: consentError } = await admin
    .from('sms_consent')
    .select('status, consented_at, disclosure_version')
    .eq('account_id', accountId)
    .eq('phone_number', phone)
    .maybeSingle();
  if (consentError) {
    console.error('Owner consent unreadable:', consentError.message);
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ok',
    phone,
    enabled,
    consent: consent?.status === 'opted_out' ? 'opted_out' : consent ? 'opted_in' : 'none',
    consentedAt: consent?.consented_at ?? null,
    consentVersion: consent?.disclosure_version ?? null,
  };
}

/**
 * Registration status, read explicitly.
 *
 * NO ROW IS NOT AN ERROR. Rows are created when a registration begins, and none
 * have begun, so every account today has no row and that means `not_started` —
 * a real state with a real answer. A read that ERRORS is the different thing,
 * and it is the one that returns unavailable.
 *
 * That distinction is also what makes this survive the migration not having
 * been applied yet: a missing table errors, so the strip says it cannot tell
 * rather than announcing that nobody has registered.
 */
export async function loadRegistration(accountId: string): Promise<Registration> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('messaging_registrations')
    .select('status, assigned_number, status_detail')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('Messaging registration unreadable:', error.message);
    return { kind: 'unavailable' };
  }

  const stored = String(data?.status ?? 'not_started');
  const status = (REGISTRATION_STATUSES as readonly string[]).includes(stored)
    ? (stored as RegistrationStatus)
    // A status the app does not know about is not a status the app can explain.
    : null;
  if (!status) {
    console.error(`Messaging registration has an unrecognized status: ${stored}`);
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ok',
    status,
    // Only ever reported alongside an approval. A number sitting on a row that
    // is still in review is provisioning noise, not something to show anybody.
    assignedNumber: status === 'approved' ? (data?.assigned_number ?? null) : null,
    detail: data?.status_detail ?? null,
  };
}

export type MessagingSetup = { readonly alerts: OwnerAlerts; readonly registration: Registration };

export async function loadMessagingSetup(accountId: string): Promise<MessagingSetup> {
  const [alerts, registration] = await Promise.all([loadOwnerAlerts(accountId), loadRegistration(accountId)]);
  return { alerts, registration };
}
