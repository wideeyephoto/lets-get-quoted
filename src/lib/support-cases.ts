import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminAction, type AuditActor } from '@/lib/admin';

// Lightweight internal case log (Phase 3) — no external help-desk system
// exists in this codebase. Staff open a case, thread notes on it, and change
// its status directly from /admin; status changes append to the same notes
// thread (kind='status_change') so it alone is a complete history.

export type CaseStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';
export type CaseSource = 'staff' | 'customer';

/**
 * Who a note is for.
 *
 * 'internal' never leaves /admin. 'customer' is published to the contractor at
 * /dashboard/help. There is no third value and no "probably fine" — the person
 * who would read a mislabelled internal note is the subject of it.
 */
export type NoteVisibility = 'internal' | 'customer';

const CASE_STATUSES: CaseStatus[] = ['open', 'pending', 'resolved', 'closed'];
const CASE_PRIORITIES: CasePriority[] = ['low', 'normal', 'high', 'urgent'];
const NOTE_VISIBILITIES: NoteVisibility[] = ['internal', 'customer'];

export function isCaseStatus(value: string | undefined | null): value is CaseStatus {
  return !!value && (CASE_STATUSES as string[]).includes(value);
}
export function isCasePriority(value: string | undefined | null): value is CasePriority {
  return !!value && (CASE_PRIORITIES as string[]).includes(value);
}
export function isNoteVisibility(value: string | undefined | null): value is NoteVisibility {
  return !!value && (NOTE_VISIBILITIES as string[]).includes(value);
}

/**
 * Read a visibility off a form, falling back to 'internal'.
 *
 * Never to 'customer'. A malformed or missing field is a bug, and the harmless
 * outcome of a bug here is a note staff can still see; the harmful one is a
 * private note landing in the contractor's thread.
 */
export function visibilityFromForm(value: string | undefined | null): NoteVisibility {
  return isNoteVisibility(value) ? value : 'internal';
}

const SLA_MS: Record<CasePriority, number> = {
  low: 5 * 24 * 60 * 60 * 1000,
  normal: 3 * 24 * 60 * 60 * 1000,
  high: 24 * 60 * 60 * 1000,
  urgent: 4 * 60 * 60 * 1000,
};

export function defaultCaseSla(priority: CasePriority, now = new Date()): string {
  return new Date(now.getTime() + SLA_MS[priority]).toISOString();
}

export type SupportCase = {
  id: string;
  account_id: string | null;
  subject: string;
  status: CaseStatus;
  priority: CasePriority;
  assigned_to: string | null;
  sla_due_at: string | null;
  source: CaseSource;
  requester_email: string | null;
  created_by: string;
  created_at: string;
};

export type SupportCaseNote = {
  id: string;
  case_id: string;
  kind: 'note' | 'status_change';
  visibility: NoteVisibility;
  body: string;
  created_by: string;
  created_at: string;
};

const CASE_COLUMNS =
  'id, account_id, subject, status, priority, assigned_to, sla_due_at, source, requester_email, created_by, created_at';
const NOTE_COLUMNS = 'id, case_id, kind, visibility, body, created_by, created_at';

export async function listSupportCases(
  admin: SupabaseClient,
  opts: { statuses?: CaseStatus[]; assignedTo?: string; accountId?: string; limit?: number; onError?: (error: unknown) => void } = {}
): Promise<SupportCase[]> {
  let query = admin
    .from('support_cases')
    .select(CASE_COLUMNS)
    .is('test_marker', null)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.statuses?.length) query = query.in('status', opts.statuses);
  if (opts.assignedTo) query = query.eq('assigned_to', opts.assignedTo);
  if (opts.accountId) query = query.eq('account_id', opts.accountId);
  const { data, error } = await query;
  if (error) {
    console.error('listSupportCases failed:', error);
    opts.onError?.(error);
    return [];
  }
  return (data ?? []) as SupportCase[];
}

export async function getSupportCase(admin: SupabaseClient, id: string): Promise<SupportCase | null> {
  const { data, error } = await admin.from('support_cases').select(CASE_COLUMNS).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data as SupportCase;
}

export async function listSupportCaseNotes(admin: SupabaseClient, caseId: string): Promise<SupportCaseNote[]> {
  const { data, error } = await admin
    .from('support_case_notes')
    .select(NOTE_COLUMNS)
    .eq('case_id', caseId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('listSupportCaseNotes failed:', error);
    return [];
  }
  return (data ?? []) as SupportCaseNote[];
}

export async function createSupportCase(
  admin: SupabaseClient,
  actor: AuditActor,
  input: {
    accountId?: string | null;
    subject: string;
    priority?: CasePriority;
    assignedTo?: string | null;
    slaDueAt?: string | null;
    source?: CaseSource;
    requesterEmail?: string | null;
  }
): Promise<SupportCase> {
  const { data, error } = await admin
    .from('support_cases')
    .insert({
      account_id: input.accountId ?? null,
      subject: input.subject,
      priority: input.priority ?? 'normal',
      assigned_to: input.assignedTo ?? null,
      sla_due_at: input.slaDueAt ?? null,
      source: input.source ?? 'staff',
      requester_email: input.requesterEmail ?? null,
      created_by: actor.adminEmail,
    })
    .select(CASE_COLUMNS)
    .single();
  if (error || !data) throw new Error(`createSupportCase failed: ${error?.message ?? 'no row returned'}`);
  await logAdminAction(admin, actor, {
    action: 'support_case_create',
    accountId: input.accountId ?? null,
    targetType: 'support_case',
    targetId: data.id,
    meta: { subject: input.subject },
  });
  return data as SupportCase;
}

/**
 * `visibility` is required, with no default.
 *
 * A default would be one forgotten argument away from either publishing a staff
 * note to the contractor or silently swallowing a reply they are waiting for.
 * Making it explicit costs one word at each call site and makes the compiler
 * find every one of them.
 */
export async function addSupportCaseNote(
  admin: SupabaseClient,
  actor: AuditActor,
  caseId: string,
  body: string,
  visibility: NoteVisibility,
): Promise<boolean> {
  const { error } = await admin
    .from('support_case_notes')
    .insert({ case_id: caseId, kind: 'note', visibility, body, created_by: actor.adminEmail });
  if (error) {
    console.error('addSupportCaseNote failed:', error);
    return false;
  }
  await logAdminAction(admin, actor, {
    action: 'support_case_note',
    targetType: 'support_case',
    targetId: caseId,
    meta: { visibility },
  });
  return true;
}

export async function updateSupportCaseStatus(admin: SupabaseClient, actor: AuditActor, caseId: string, status: CaseStatus): Promise<boolean> {
  const { error } = await admin.from('support_cases').update({ status }).eq('id', caseId);
  if (error) {
    console.error('updateSupportCaseStatus failed:', error);
    return false;
  }
  // Internal. The contractor already sees the live status as a badge on their
  // own page, in their own words — 'pending' means "we are waiting on you",
  // which is not what the raw word says.
  await admin.from('support_case_notes').insert({
    case_id: caseId,
    kind: 'status_change',
    visibility: 'internal',
    body: `Status changed to ${status}`,
    created_by: actor.adminEmail,
  });
  await logAdminAction(admin, actor, { action: 'support_case_status_change', targetType: 'support_case', targetId: caseId, meta: { status } });
  return true;
}

export async function assignSupportCase(admin: SupabaseClient, actor: AuditActor, caseId: string, assignedTo: string | null): Promise<boolean> {
  const { error } = await admin.from('support_cases').update({ assigned_to: assignedTo }).eq('id', caseId);
  if (error) {
    console.error('assignSupportCase failed:', error);
    return false;
  }
  // Always internal — it names a staff email, and who is handling a case is
  // not the contractor's business.
  await admin.from('support_case_notes').insert({
    case_id: caseId,
    kind: 'status_change',
    visibility: 'internal',
    body: assignedTo ? `Assigned to ${assignedTo}` : 'Unassigned',
    created_by: actor.adminEmail,
  });
  await logAdminAction(admin, actor, { action: 'support_case_assign', targetType: 'support_case', targetId: caseId, meta: { assignedTo } });
  return true;
}
