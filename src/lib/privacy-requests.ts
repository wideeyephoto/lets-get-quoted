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

/**
 * Statutory deadline for GDPR Article 12(3) / CCPA / state privacy laws.
 * Baseline response time is 30 calendar days from receipt.
 */
export const STATUTORY_PRIVACY_DEADLINE_DAYS = 30;

export function privacyRequestDeadline(createdAt: string): string {
  const date = new Date(createdAt);
  const time = date.getTime();
  if (isNaN(time)) return createdAt;
  return new Date(time + STATUTORY_PRIVACY_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export type PlatformPrivacyRequestRow = PrivacyRequest & {
  deadline_at: string;
  account_business_name?: string | null;
  account_number?: number | null;
};

export type ListPlatformPrivacyRequestsOpts = {
  status?: PrivacyRequestStatus | 'all';
  kind?: PrivacyRequestKind | 'all';
  page?: number;
  pageSize?: number;
  onError?: (error: unknown) => void;
};

export type ListPlatformPrivacyRequestsResult = {
  rows: PlatformPrivacyRequestRow[];
  total: number;
  openCount: number;
  overdueCount: number;
};

export async function listPlatformPrivacyRequestsPaged(
  admin: SupabaseClient,
  opts: ListPlatformPrivacyRequestsOpts = {},
): Promise<ListPlatformPrivacyRequestsResult> {
  const pageSize = opts.pageSize ?? 50;
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('privacy_requests')
    .select(COLUMNS, { count: 'exact' });

  const status = opts.status ?? 'open';
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (opts.kind && opts.kind !== 'all') {
    query = query.eq('kind', opts.kind);
  }

  // Open requests order by created_at asc (oldest first = closest to statutory deadline)
  // Resolved requests order by created_at desc
  if (status === 'open') {
    query = query.order('created_at', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  query = query.range(from, to);

  const thirtyDaysAgo = new Date(Date.now() - STATUTORY_PRIVACY_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [res, openRes, overdueRes] = await Promise.all([
    query,
    admin.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    admin.from('privacy_requests').select('id', { count: 'exact', head: true }).eq('status', 'open').lt('created_at', thirtyDaysAgo),
  ]);

  if (res.error) {
    console.error('listPlatformPrivacyRequestsPaged failed:', res.error);
    opts.onError?.(res.error);
    return { rows: [], total: 0, openCount: 0, overdueCount: 0 };
  }

  const rawRows = (res.data ?? []) as PrivacyRequest[];
  const accountIds = [...new Set(rawRows.map((r) => r.account_id).filter(Boolean))];

  const acctMap = new Map<string, { business_name: string | null; account_number: number | null }>();
  if (accountIds.length > 0) {
    const { data: accts, error: acctErr } = await admin
      .from('accounts')
      .select('id, business_name, account_number')
      .in('id', accountIds);
    if (!acctErr && accts) {
      for (const a of accts) {
        acctMap.set(a.id, a);
      }
    }
  }

  const rows: PlatformPrivacyRequestRow[] = rawRows.map((r) => {
    const acct = acctMap.get(r.account_id);
    return {
      ...r,
      deadline_at: privacyRequestDeadline(r.created_at),
      account_business_name: acct?.business_name ?? null,
      account_number: acct?.account_number ?? null,
    };
  });

  return {
    rows,
    total: res.count ?? rows.length,
    openCount: openRes.count ?? 0,
    overdueCount: overdueRes.count ?? 0,
  };
}

