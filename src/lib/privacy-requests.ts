import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminAction, type AuditActor } from '@/lib/admin';

// Data-consent / privacy-request history. Same shape as support_cases minus
// SLA/priority — staff log an access/deletion/correction request against an
// account and mark it resolved once handled.

export type PrivacyRequestKind = 'access' | 'deletion' | 'correction' | 'other';
export type PrivacyRequestStatus = 'open' | 'resolved';

const KINDS: PrivacyRequestKind[] = ['access', 'deletion', 'correction', 'other'];

export function isPrivacyRequestKind(value: string | undefined | null): value is PrivacyRequestKind {
  return !!value && (KINDS as string[]).includes(value);
}

export type PrivacyRequest = {
  id: string;
  account_id: string;
  kind: PrivacyRequestKind;
  status: PrivacyRequestStatus;
  details: string | null;
  created_by: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
};

const COLUMNS = 'id, account_id, kind, status, details, created_by, resolved_at, resolved_by, created_at';

export async function listPrivacyRequests(admin: SupabaseClient, accountId: string): Promise<PrivacyRequest[]> {
  const { data, error } = await admin
    .from('privacy_requests')
    .select(COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('listPrivacyRequests failed:', error);
    return [];
  }
  return (data ?? []) as PrivacyRequest[];
}

export async function logPrivacyRequest(
  admin: SupabaseClient,
  actor: AuditActor,
  accountId: string,
  kind: PrivacyRequestKind,
  details?: string | null,
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from('privacy_requests')
    .insert({ account_id: accountId, kind, details: details ?? null, created_by: actor.adminEmail })
    .select('id')
    .single();
  if (error || !data) {
    console.error('logPrivacyRequest failed:', error);
    throw new Error(error?.message || 'Failed to log privacy request');
  }
  await logAdminAction(admin, actor, {
    action: 'privacy_request_log',
    accountId,
    targetType: 'privacy_request',
    targetId: data.id,
    meta: { kind },
  });
  return { id: data.id };
}

export async function resolvePrivacyRequest(admin: SupabaseClient, actor: AuditActor, requestId: string): Promise<void> {
  const { data, error } = await admin
    .from('privacy_requests')
    .update({ resolved_at: new Date().toISOString(), resolved_by: actor.adminEmail, status: 'resolved' })
    .eq('id', requestId)
    .select('id')
    .single();
  if (error || !data) {
    console.error('resolvePrivacyRequest failed:', error);
    throw new Error(error?.message || 'Privacy request not found or resolution failed');
  }
  await logAdminAction(admin, actor, { action: 'privacy_request_resolve', targetType: 'privacy_request', targetId: requestId });
}
