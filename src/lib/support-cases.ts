import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminAction } from '@/lib/admin';

// Lightweight internal case log (Phase 3) — no external help-desk system
// exists in this codebase. Staff open a case, thread notes on it, and change
// its status directly from /admin; status changes append to the same notes
// thread (kind='status_change') so it alone is a complete history.

export type CaseStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type CasePriority = 'low' | 'normal' | 'high' | 'urgent';

const CASE_STATUSES: CaseStatus[] = ['open', 'pending', 'resolved', 'closed'];
const CASE_PRIORITIES: CasePriority[] = ['low', 'normal', 'high', 'urgent'];

export function isCaseStatus(value: string | undefined | null): value is CaseStatus {
  return !!value && (CASE_STATUSES as string[]).includes(value);
}
export function isCasePriority(value: string | undefined | null): value is CasePriority {
  return !!value && (CASE_PRIORITIES as string[]).includes(value);
}

export type SupportCase = {
  id: string;
  account_id: string | null;
  subject: string;
  status: CaseStatus;
  priority: CasePriority;
  assigned_to: string | null;
  sla_due_at: string | null;
  created_by: string;
  created_at: string;
};

export type SupportCaseNote = {
  id: string;
  case_id: string;
  kind: 'note' | 'status_change';
  body: string;
  created_by: string;
  created_at: string;
};

const CASE_COLUMNS = 'id, account_id, subject, status, priority, assigned_to, sla_due_at, created_by, created_at';
const NOTE_COLUMNS = 'id, case_id, kind, body, created_by, created_at';

export async function listSupportCases(
  admin: SupabaseClient,
  opts: { statuses?: CaseStatus[]; assignedTo?: string; accountId?: string; limit?: number } = {}
): Promise<SupportCase[]> {
  let query = admin
    .from('support_cases')
    .select(CASE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.statuses?.length) query = query.in('status', opts.statuses);
  if (opts.assignedTo) query = query.eq('assigned_to', opts.assignedTo);
  if (opts.accountId) query = query.eq('account_id', opts.accountId);
  const { data, error } = await query;
  if (error) {
    console.error('listSupportCases failed:', error);
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
  adminEmail: string,
  input: { accountId?: string | null; subject: string; priority?: CasePriority; assignedTo?: string | null; slaDueAt?: string | null }
): Promise<SupportCase> {
  const { data, error } = await admin
    .from('support_cases')
    .insert({
      account_id: input.accountId ?? null,
      subject: input.subject,
      priority: input.priority ?? 'normal',
      assigned_to: input.assignedTo ?? null,
      sla_due_at: input.slaDueAt ?? null,
      created_by: adminEmail,
    })
    .select(CASE_COLUMNS)
    .single();
  if (error || !data) throw new Error(`createSupportCase failed: ${error?.message ?? 'no row returned'}`);
  await logAdminAction(admin, adminEmail, {
    action: 'support_case_create',
    accountId: input.accountId ?? null,
    targetType: 'support_case',
    targetId: data.id,
    meta: { subject: input.subject },
  });
  return data as SupportCase;
}

export async function addSupportCaseNote(admin: SupabaseClient, adminEmail: string, caseId: string, body: string): Promise<void> {
  const { error } = await admin.from('support_case_notes').insert({ case_id: caseId, kind: 'note', body, created_by: adminEmail });
  if (error) {
    console.error('addSupportCaseNote failed:', error);
    return;
  }
  await logAdminAction(admin, adminEmail, { action: 'support_case_note', targetType: 'support_case', targetId: caseId });
}

export async function updateSupportCaseStatus(admin: SupabaseClient, adminEmail: string, caseId: string, status: CaseStatus): Promise<void> {
  const { error } = await admin.from('support_cases').update({ status }).eq('id', caseId);
  if (error) {
    console.error('updateSupportCaseStatus failed:', error);
    return;
  }
  await admin.from('support_case_notes').insert({ case_id: caseId, kind: 'status_change', body: `Status changed to ${status}`, created_by: adminEmail });
  await logAdminAction(admin, adminEmail, { action: 'support_case_status_change', targetType: 'support_case', targetId: caseId, meta: { status } });
}

export async function assignSupportCase(admin: SupabaseClient, adminEmail: string, caseId: string, assignedTo: string | null): Promise<void> {
  const { error } = await admin.from('support_cases').update({ assigned_to: assignedTo }).eq('id', caseId);
  if (error) {
    console.error('assignSupportCase failed:', error);
    return;
  }
  await admin.from('support_case_notes').insert({
    case_id: caseId,
    kind: 'status_change',
    body: assignedTo ? `Assigned to ${assignedTo}` : 'Unassigned',
    created_by: adminEmail,
  });
  await logAdminAction(admin, adminEmail, { action: 'support_case_assign', targetType: 'support_case', targetId: caseId, meta: { assignedTo } });
}
