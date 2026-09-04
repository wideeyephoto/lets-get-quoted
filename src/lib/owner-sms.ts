import { createAdminClient } from '@/lib/auth';
import { normalizeUsPhone } from '@/lib/phone';
import {
  type OwnerAlerts,
  type Registration,
  REGISTRATION_STATUSES,
  type RegistrationStatus,
  type MessagingSetup,
} from '@/lib/owner-sms-presentation';

export * from '@/lib/owner-sms-presentation';

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

export async function loadMessagingSetup(accountId: string): Promise<MessagingSetup> {
  const [alerts, registration] = await Promise.all([loadOwnerAlerts(accountId), loadRegistration(accountId)]);
  return { alerts, registration };
}
