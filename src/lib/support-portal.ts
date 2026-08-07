import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseStatus, SupportCase, SupportCaseNote } from '@/lib/support-cases';

/**
 * The contractor's side of the support case system.
 *
 * /admin owns @/lib/support-cases: staff see every case, every note, every
 * assignment. This module is the other half — what an account holder may read
 * and write about their OWN cases — and it is deliberately a separate file
 * because the two have opposite defaults. Over there, show everything. Here,
 * show nothing that was not addressed to them.
 *
 * TWO RULES, and everything in here exists to hold them:
 *
 *   1. ACCOUNT SCOPE. support_cases and support_case_notes have RLS enabled
 *      with no policy — the /admin table pattern — so the database will not
 *      catch a missing filter the way it does on leads or jobs. These functions
 *      run on the service-role client, which means the `account_id` filter IS
 *      the boundary. Every function therefore takes accountId as a required
 *      argument rather than reading it from somewhere, and there is no exported
 *      function that touches a case without one.
 *
 *   2. NOTE VISIBILITY. The thread is shared with staff, so it contains their
 *      working notes. Only visibility='customer' is ever returned from here.
 *
 * Notes are keyed by case, not by account, so a note read cannot filter on
 * account_id directly. Rather than a join that has to be got right every time,
 * ownership is proved FIRST — getAccountCase returns null for a case belonging
 * to anybody else — and the thread is only fetched for a case that came back.
 * loadAccountCaseThread is the only supported way to do it.
 */

/**
 * The words the contractor sees. Deliberately not the raw status.
 *
 * 'open' and 'pending' are a queue's vocabulary and they say nothing about who
 * is holding the ball — which is the single thing somebody checking on their
 * own request wants to know.
 */
export const CUSTOMER_STATUS_LABEL: Record<CaseStatus, string> = {
  open: 'With support',
  pending: 'Waiting on you',
  resolved: 'Resolved',
  closed: 'Closed',
};

/** A one-line explanation under the badge, for the same reason. */
export const CUSTOMER_STATUS_NOTE: Record<CaseStatus, string> = {
  open: 'We have this and will come back to you.',
  pending: 'We need something from you before we can go on.',
  resolved: 'We think this is sorted. Reply if it is not.',
  closed: 'This one is finished. Start a new request if you need us again.',
};

/**
 * Whether the contractor can still reply on this case.
 *
 * Resolved is not final — "that didn't fix it" has to have somewhere to go, and
 * a reply reopens it (see nextStatusAfterCustomerReply). Closed is final, and
 * the page offers a new request instead of a dead textarea.
 */
export function canCustomerReply(status: CaseStatus): boolean {
  return status !== 'closed';
}

/**
 * Where a case lands once the contractor replies.
 *
 * A reply always puts the ball back with support. Leaving a case 'pending'
 * after the customer has answered the question is how a queue quietly loses
 * somebody: staff filter for what they are waiting on, and the reply is sitting
 * in a case that still claims to be waiting on them.
 */
export function nextStatusAfterCustomerReply(status: CaseStatus): CaseStatus | null {
  return status === 'open' ? null : 'open';
}

export const SUBJECT_MAX = 160;
export const BODY_MAX = 5000;

export type SupportFormError = 'subject' | 'body' | 'too_long' | 'rate' | 'closed' | 'not_found' | 'failed';

/** Validate what the contractor typed. Returns null when it is fine. */
export function validateSupportInput(input: { subject?: string; body: string }): SupportFormError | null {
  if (input.subject !== undefined && !input.subject.trim()) return 'subject';
  if (!input.body.trim()) return 'body';
  if ((input.subject ?? '').length > SUBJECT_MAX) return 'too_long';
  if (input.body.length > BODY_MAX) return 'too_long';
  return null;
}

export const SUPPORT_ERROR_MESSAGE: Record<SupportFormError, string> = {
  subject: 'Give it a short title so we know what it is about.',
  body: 'Tell us what is going on before sending.',
  too_long: 'That is longer than we can take — please trim it a little.',
  rate: 'You have sent us a few already. We will work through those first.',
  closed: 'That request is closed. Start a new one and we will pick it up.',
  not_found: 'We could not find that request.',
  failed: 'Something went wrong sending that. Please try again in a moment.',
};

const CASE_COLUMNS =
  'id, account_id, subject, status, priority, assigned_to, sla_due_at, source, requester_email, created_by, created_at';
const NOTE_COLUMNS = 'id, case_id, kind, visibility, body, created_by, created_at';

/** Every case belonging to this account, newest first. */
export async function listAccountCases(admin: SupabaseClient, accountId: string): Promise<SupportCase[]> {
  const { data, error } = await admin
    .from('support_cases')
    .select(CASE_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('listAccountCases failed:', error);
    return [];
  }
  return (data ?? []) as SupportCase[];
}

/**
 * When each case last had something said on it, customer-visible only.
 *
 * Deliberately just a timestamp. Telling the contractor WHO spoke last would
 * mean deciding whether a created_by is one of their people or one of ours, and
 * on a case where a second user replied that guess is wrong — while the status
 * badge above it already answers the question ("With support" / "Waiting on
 * you") from a field that cannot be misread.
 */
export async function lastActivityByCase(
  admin: SupabaseClient,
  caseIds: string[],
): Promise<Map<string, string>> {
  const latest = new Map<string, string>();
  if (caseIds.length === 0) return latest;

  const { data, error } = await admin
    .from('support_case_notes')
    .select('case_id, created_at')
    .in('case_id', caseIds)
    .eq('visibility', 'customer')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('lastActivityByCase failed:', error);
    return latest;
  }
  // Newest first, so the first row seen for a case is its latest.
  for (const row of (data ?? []) as { case_id: string; created_at: string }[]) {
    if (!latest.has(row.case_id)) latest.set(row.case_id, row.created_at);
  }
  return latest;
}

/**
 * One case, only if this account owns it.
 *
 * Null covers both "no such case" and "somebody else's case" on purpose — the
 * caller renders notFound() either way, so a probe cannot tell a real case id
 * from a made-up one.
 */
export async function getAccountCase(
  admin: SupabaseClient,
  accountId: string,
  caseId: string,
): Promise<SupportCase | null> {
  const { data, error } = await admin
    .from('support_cases')
    .select(CASE_COLUMNS)
    .eq('id', caseId)
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !data) return null;
  return data as SupportCase;
}

/**
 * The case and the half of its thread the contractor may read.
 *
 * One function rather than two so the ownership check cannot be skipped: there
 * is no exported way to fetch notes for a case id you have not proved you own.
 */
export async function loadAccountCaseThread(
  admin: SupabaseClient,
  accountId: string,
  caseId: string,
): Promise<{ supportCase: SupportCase; thread: SupportCaseNote[] } | null> {
  const supportCase = await getAccountCase(admin, accountId, caseId);
  if (!supportCase) return null;

  const { data, error } = await admin
    .from('support_case_notes')
    .select(NOTE_COLUMNS)
    .eq('case_id', supportCase.id)
    .eq('visibility', 'customer')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('loadAccountCaseThread notes failed:', error);
    return { supportCase, thread: [] };
  }
  return { supportCase, thread: (data ?? []) as SupportCaseNote[] };
}

/**
 * Open a case on the contractor's behalf.
 *
 * The message they typed becomes note #1 rather than a column on the case, so
 * the opening request and every reply after it are the same kind of thing in
 * the same thread — there is no "original message" that renders differently
 * from the rest of the conversation and has to be special-cased forever.
 */
export async function openCustomerCase(
  admin: SupabaseClient,
  input: { accountId: string; requesterEmail: string; subject: string; body: string },
): Promise<SupportCase | null> {
  const { data, error } = await admin
    .from('support_cases')
    .insert({
      account_id: input.accountId,
      subject: input.subject,
      status: 'open',
      priority: 'normal',
      source: 'customer',
      requester_email: input.requesterEmail,
      created_by: input.requesterEmail,
    })
    .select(CASE_COLUMNS)
    .single();
  if (error || !data) {
    console.error('openCustomerCase failed:', error);
    return null;
  }

  const opened = data as SupportCase;
  const { error: noteError } = await admin.from('support_case_notes').insert({
    case_id: opened.id,
    kind: 'note',
    visibility: 'customer',
    body: input.body,
    created_by: input.requesterEmail,
  });
  if (noteError) {
    // The case exists but says nothing. Better a subject line in the queue than
    // a silent success, so staff still see somebody is waiting.
    console.error('openCustomerCase opening note failed:', noteError);
  }
  return opened;
}

/**
 * A reply from the contractor, and the status move that goes with it.
 *
 * Returns false when the case is not theirs, or is closed. Both are checked
 * here rather than trusted from the page, because a server action is a public
 * endpoint — the page having hidden the textarea proves nothing.
 */
export async function addCustomerReply(
  admin: SupabaseClient,
  input: { accountId: string; caseId: string; requesterEmail: string; body: string },
): Promise<SupportCase | null> {
  const supportCase = await getAccountCase(admin, input.accountId, input.caseId);
  if (!supportCase) return null;
  if (!canCustomerReply(supportCase.status)) return null;

  const { error } = await admin.from('support_case_notes').insert({
    case_id: supportCase.id,
    kind: 'note',
    visibility: 'customer',
    body: input.body,
    created_by: input.requesterEmail,
  });
  if (error) {
    console.error('addCustomerReply failed:', error);
    return null;
  }

  const next = nextStatusAfterCustomerReply(supportCase.status);
  if (next) {
    const { error: statusError } = await admin
      .from('support_cases')
      .update({ status: next })
      .eq('id', supportCase.id)
      .eq('account_id', input.accountId);
    if (statusError) console.error('addCustomerReply status move failed:', statusError);
    else supportCase.status = next;
  }
  return supportCase;
}
