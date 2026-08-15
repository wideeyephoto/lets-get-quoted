import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Best-effort queries still need an honest UI state.  Callers that render a
 * collection can pass one collector through all of the independent fetchers;
 * a failed query then remains isolated without being mistaken for a verified
 * empty result.
 */
export type AdminSignalKey =
  | 'cronTrouble'
  | 'disputes'
  | 'pausedPayouts'
  | 'suspendedAccounts'
  | 'notOnboarded'
  | 'dunning'
  | 'overdueQuickStops'
  | 'failedSms'
  | 'failedEmails'
  | 'webhookFailures'
  | 'incidents'
  | 'casesNearSla'
  | 'myCases';

export type AdminSignalDiagnostics = { failed: AdminSignalKey[] };

export function createAdminSignalDiagnostics(): AdminSignalDiagnostics {
  return { failed: [] };
}

function signalFailed(
  diagnostics: AdminSignalDiagnostics | undefined,
  key: AdminSignalKey,
  context: string,
  error: unknown,
) {
  console.error(`${context} failed:`, error);
  if (diagnostics && !diagnostics.failed.includes(key)) diagnostics.failed.push(key);
}

type SignalOptions = { diagnostics?: AdminSignalDiagnostics };

// One fetcher per Command Center / Money-page signal. Every fetcher returns
// the raw row shape its callers already render — this is a data layer, not a
// presentation layer, so src/app/admin/money/page.tsx and
// src/lib/admin-command-center.ts both build on the same source of truth
// instead of drifting apart. Each fetcher is independently safe to await in a
// Promise.all: a Postgres error surfaces as an empty array/zero rather than
// throwing, so one broken signal never blanks a page that shows several.

export type DisputeRow = {
  id: string;
  account_id: string;
  amount: number | null;
  label: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  stripe_dispute_id: string | null;
  dispute_due_by: string | null;
};

export async function getOpenDisputes(
  admin: SupabaseClient,
  opts?: SignalOptions & { limit?: number; accountId?: string },
): Promise<DisputeRow[]> {
  let q = admin
    .from('payments')
    .select('id, account_id, amount, label, disputed_at, dispute_reason, dispute_status, stripe_dispute_id, dispute_due_by')
    .is('test_marker', null)
    .eq('status', 'disputed')
    .order('disputed_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  // So the per-account dispute count can open its own rows. Everything a staff
  // member needs to respond is in this shape already; it just had no way to be
  // asked for one account.
  if (opts?.accountId) q = q.eq('account_id', opts.accountId);
  const { data, error } = await q;
  if (error) {
    signalFailed(opts?.diagnostics, 'disputes', 'getOpenDisputes', error);
    return [];
  }
  return (data ?? []) as DisputeRow[];
}

export type PausedPayoutRow = {
  id: string;
  business_name: string | null;
  account_number: number | null;
  connect_disabled_at: string | null;
};

export async function getPausedPayouts(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<PausedPayoutRow[]> {
  const { data, error } = await admin
    .from('accounts')
    .select('id, business_name, account_number, connect_disabled_at')
    .is('test_marker', null)
    .not('connect_disabled_at', 'is', null)
    .order('connect_disabled_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    signalFailed(opts?.diagnostics, 'pausedPayouts', 'getPausedPayouts', error);
    return [];
  }
  return (data ?? []) as PausedPayoutRow[];
}

export async function getNotOnboardedCount(admin: SupabaseClient, opts?: SignalOptions): Promise<number> {
  const { count, error } = await admin.from('accounts').select('id', { count: 'exact', head: true }).is('test_marker', null).eq('connect_onboarded', false);
  if (error) {
    signalFailed(opts?.diagnostics, 'notOnboarded', 'getNotOnboardedCount', error);
    return 0;
  }
  return count ?? 0;
}

export type NotOnboardedAccountRow = {
  id: string;
  business_name: string | null;
  account_number: number | null;
  created_at: string;
};

export async function getNotOnboardedAccounts(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<NotOnboardedAccountRow[]> {
  const { data, error } = await admin
    .from('accounts')
    .select('id, business_name, account_number, created_at')
    .is('test_marker', null)
    .eq('connect_onboarded', false)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    signalFailed(opts?.diagnostics, 'notOnboarded', 'getNotOnboardedAccounts', error);
    return [];
  }
  return (data ?? []) as NotOnboardedAccountRow[];
}

export type SuspendedAccountRow = {
  id: string;
  business_name: string | null;
  account_number: number | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
};

export async function getSuspendedAccounts(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<SuspendedAccountRow[]> {
  const { data, error } = await admin
    .from('accounts')
    .select('id, business_name, account_number, suspended_at, suspended_reason, suspended_by')
    .is('test_marker', null)
    .not('suspended_at', 'is', null)
    .order('suspended_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    signalFailed(opts?.diagnostics, 'suspendedAccounts', 'getSuspendedAccounts', error);
    return [];
  }
  return (data ?? []) as SuspendedAccountRow[];
}

// Recurring-charge dunning: a saved card that needs the client's attention
// (expired/needs auth) or has exhausted its retries — see src/lib/dunning.ts
// for the state machine that produces these two terminal-ish states.
export type DunningPaymentRow = {
  id: string;
  account_id: string;
  amount: number | null;
  label: string | null;
  dunning_state: string | null;
  failure_message: string | null;
  next_retry_at: string | null;
  failed_at: string | null;
};

export async function getPaymentsNeedingAttention(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<DunningPaymentRow[]> {
  const { data, error } = await admin
    .from('payments')
    .select('id, account_id, amount, label, dunning_state, failure_message, next_retry_at, failed_at')
    .is('test_marker', null)
    .in('dunning_state', ['needs_card', 'exhausted'])
    .order('failed_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    signalFailed(opts?.diagnostics, 'dunning', 'getPaymentsNeedingAttention', error);
    return [];
  }
  return (data ?? []) as DunningPaymentRow[];
}

// Quick Stops stuck past their own deadline — the exact two overdue shapes
// src/lib/quick-stop-sweep.ts already sweeps for expiry, reused here
// read-only (no mutation) purely to surface them to staff.
export type OverdueQuickStopRow = {
  id: string;
  account_id: string;
  client_name: string;
  status: string;
  response_deadline_at: string | null;
  payment_deadline_at: string | null;
  /** When the sweep closed it out — the only timestamp an expired row has. */
  updated_at: string | null;
};

/** How far back an already-expired request still counts as news. */
const EXPIRED_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/**
 * Quick Stops nobody answered.
 *
 * This used to look ONLY for requests sitting past their deadline in
 * awaiting_contractor / more_information_requested / awaiting_customer_payment
 * — which is exactly, precisely the set sweepQuickStopOffers expires. The sweep
 * runs every fifteen minutes on a cron AND lazily on every owner dashboard
 * load, so the card was a detector racing its own janitor: in steady state it
 * could only ever be empty, for at most a fifteen-minute window between a
 * deadline lapsing and the sweep tidying it away.
 *
 * An empty card does not read as "this cannot show you anything". It reads as
 * good news, and staff learn to trust it.
 *
 * So it now also returns what the sweep LEFT BEHIND: requests it closed out as
 * offer_expired in the last two days. That is the same event from the only
 * point of view that matters — somebody asked for a visit and got nothing —
 * and unlike the live states it survives long enough to be read.
 *
 * The pre-sweep states are still included. They are real while they last, and
 * dropping them would lose the one case the sweep has not reached yet.
 */
export async function getOverdueQuickStops(admin: SupabaseClient, opts?: SignalOptions & { limit?: number; now?: Date }): Promise<OverdueQuickStopRow[]> {
  const limit = opts?.limit ?? 50;
  const now = opts?.now ?? new Date();
  const nowIso = now.toISOString();
  const sinceIso = new Date(now.getTime() - EXPIRED_LOOKBACK_MS).toISOString();
  const columns = 'id, account_id, client_name, status, response_deadline_at, payment_deadline_at, updated_at';
  const [awaitingPayment, awaitingResponse, expired] = await Promise.all([
    admin
      .from('extra_stop_requests')
      .select(columns)
      .is('test_marker', null)
      .eq('status', 'awaiting_customer_payment')
      .lt('payment_deadline_at', nowIso)
      .order('payment_deadline_at', { ascending: true })
      .limit(limit),
    admin
      .from('extra_stop_requests')
      .select(columns)
      .is('test_marker', null)
      .in('status', ['awaiting_contractor', 'more_information_requested'])
      .lt('response_deadline_at', nowIso)
      .order('response_deadline_at', { ascending: true })
      .limit(limit),
    admin
      .from('extra_stop_requests')
      .select(columns)
      .is('test_marker', null)
      .eq('status', 'offer_expired')
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: false })
      .limit(limit),
  ]);
  if (awaitingPayment.error) signalFailed(opts?.diagnostics, 'overdueQuickStops', 'getOverdueQuickStops (payment)', awaitingPayment.error);
  if (awaitingResponse.error) signalFailed(opts?.diagnostics, 'overdueQuickStops', 'getOverdueQuickStops (response)', awaitingResponse.error);
  if (expired.error) signalFailed(opts?.diagnostics, 'overdueQuickStops', 'getOverdueQuickStops (expired)', expired.error);
  // Live ones first — they can still be saved. The expired are a record.
  const rows = [
    ...(awaitingPayment.data ?? []),
    ...(awaitingResponse.data ?? []),
    ...(expired.data ?? []),
  ] as OverdueQuickStopRow[];
  return rows.slice(0, limit);
}

export type FailedSmsEventRow = {
  id: string;
  account_id: string;
  payment_id: string | null;
  event_type: string;
  phone_number: string;
  error_reason: string | null;
  created_at: string;
};

export async function getFailedSmsEvents(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<FailedSmsEventRow[]> {
  const { data, error } = await admin
    .from('sms_events')
    .select('id, account_id, payment_id, event_type, phone_number, error_reason, created_at')
    .is('test_marker', null)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    signalFailed(opts?.diagnostics, 'failedSms', 'getFailedSmsEvents', error);
    return [];
  }
  return (data ?? []) as FailedSmsEventRow[];
}

export type FailedEmailEventRow = {
  id: string;
  account_id: string | null;
  kind: string;
  recipient: string;
  status: string;
  error_reason: string | null;
  occurred_at: string;
};

// Fed by the Resend delivery webhook (src/app/api/resend/webhook/route.ts).
// A complaint is treated the same as a bounce here — both mean the send did
// not land as a good transactional message, and either can indicate a client
// contact detail gone bad.
export async function getFailedEmailEvents(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<FailedEmailEventRow[]> {
  const { data, error } = await admin
    .from('email_events')
    .select('id, account_id, kind, recipient, status, error_reason, occurred_at')
    .is('test_marker', null)
    .in('status', ['bounced', 'complained'])
    .order('occurred_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    // Missing table (migration not yet applied) degrades to empty, same as
    // every other best-effort signal here.
    signalFailed(opts?.diagnostics, 'failedEmails', 'getFailedEmailEvents', error);
    return [];
  }
  return (data ?? []) as FailedEmailEventRow[];
}

export type WebhookFailureRow = {
  id: string;
  source: string;
  event_type: string | null;
  reference_id: string | null;
  error_message: string;
  created_at: string;
};

export async function getUnresolvedWebhookFailures(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<WebhookFailureRow[]> {
  const { data, error } = await admin
    .from('webhook_failures')
    .select('id, source, event_type, reference_id, error_message, created_at')
    .is('test_marker', null)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (error) {
    signalFailed(opts?.diagnostics, 'webhookFailures', 'getUnresolvedWebhookFailures', error);
    return [];
  }
  return (data ?? []) as WebhookFailureRow[];
}

export type PlatformIncidentRow = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  severity: string;
  started_at: string;
  resolved_at: string | null;
  /** Who wrote it down. These rows are hand-authored, so it always matters. */
  created_by: string | null;
  owner: string | null;
  affected_services: string[];
  impact_summary: string | null;
  root_cause: string | null;
  resolution_summary: string | null;
  external_url: string | null;
};

export async function getRecentIncidents(admin: SupabaseClient, opts?: SignalOptions & { limit?: number }): Promise<PlatformIncidentRow[]> {
  const { data, error } = await admin
    .from('platform_incidents')
    .select('id, kind, title, description, severity, started_at, resolved_at, created_by, owner, affected_services, impact_summary, root_cause, resolution_summary, external_url')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 8);
  if (error) {
    signalFailed(opts?.diagnostics, 'incidents', 'getRecentIncidents', error);
    return [];
  }
  return (data ?? []) as PlatformIncidentRow[];
}

// Full case CRUD lives in src/lib/support-cases.ts — these two are
// Command-Center-shaped read signals only, so they query support_cases
// directly rather than round-tripping through that module.
export type SupportCaseRow = {
  id: string;
  account_id: string | null;
  subject: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  sla_due_at: string | null;
  created_at: string;
};

const SUPPORT_CASE_ROW_COLUMNS = 'id, account_id, subject, status, priority, assigned_to, sla_due_at, created_at';
const OPEN_CASE_STATUSES = '(resolved,closed)';

/**
 * Open cases whose SLA is close.
 *
 * "Close" used to mean nothing at all: the query bounded null-ness and
 * open-ness and nothing else, and severityForDeadline paints every unpassed
 * deadline 'warn', so a case due in six months looked exactly as urgent as one
 * due this afternoon. `withinMs` is the missing bound — the card is titled
 * "nearing SLA" and now means it.
 */
export async function getCasesNearSla(
  admin: SupabaseClient,
  opts?: SignalOptions & { limit?: number; withinMs?: number; now?: Date },
): Promise<SupportCaseRow[]> {
  const now = opts?.now ?? new Date();
  const horizon = new Date(now.getTime() + (opts?.withinMs ?? 48 * 60 * 60 * 1000)).toISOString();
  const { data, error } = await admin
    .from('support_cases')
    .select(SUPPORT_CASE_ROW_COLUMNS)
    .is('test_marker', null)
    .not('sla_due_at', 'is', null)
    .lt('sla_due_at', horizon)
    .not('status', 'in', OPEN_CASE_STATUSES)
    .order('sla_due_at', { ascending: true })
    .limit(opts?.limit ?? 20);
  if (error) {
    signalFailed(opts?.diagnostics, 'casesNearSla', 'getCasesNearSla', error);
    return [];
  }
  return (data ?? []) as SupportCaseRow[];
}

/**
 * How many open cases have no SLA at all.
 *
 * The card above cannot see them by construction, and they are not a rare edge:
 * sla_due_at is nullable with no default, blank on the staff form, unsettable
 * after creation, and every case from the public contact form is created
 * without one. So the class of case with a real person waiting was invisible on
 * a card that then reported "No cases approaching their SLA" — a coverage
 * overstatement rather than good news. Surfacing the number does not fix the
 * scheduling gap, but it stops the silence from reading as an all-clear.
 */
export async function getCasesWithoutSlaCount(admin: SupabaseClient, opts?: SignalOptions): Promise<number> {
  const { count, error } = await admin
    .from('support_cases')
    .select('id', { count: 'exact', head: true })
    .is('test_marker', null)
    .is('sla_due_at', null)
    .not('status', 'in', OPEN_CASE_STATUSES);
  if (error) {
    signalFailed(opts?.diagnostics, 'casesNearSla', 'getCasesWithoutSlaCount', error);
    return 0;
  }
  return count ?? 0;
}

export async function getMyAssignedCases(admin: SupabaseClient, staffEmail: string, opts?: SignalOptions & { limit?: number }): Promise<SupportCaseRow[]> {
  const { data, error } = await admin
    .from('support_cases')
    .select(SUPPORT_CASE_ROW_COLUMNS)
    .is('test_marker', null)
    .eq('assigned_to', staffEmail)
    .not('status', 'in', OPEN_CASE_STATUSES)
    .order('sla_due_at', { ascending: true, nullsFirst: false })
    .limit(opts?.limit ?? 20);
  if (error) {
    signalFailed(opts?.diagnostics, 'myCases', 'getMyAssignedCases', error);
    return [];
  }
  return (data ?? []) as SupportCaseRow[];
}
