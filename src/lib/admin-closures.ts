import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminAccountClosureJob = Readonly<{
  id: string;
  closureSubjectId: string;
  accountId: string | null;
  businessName: string | null;
  accountNumber: string | null;
  requestedByUserId: string | null;
  requestedByRole: string;
  accessRevokedAt: string;
  localDisposalState: string;
  stripeState: string;
  quickbooksState: string;
  storageState: string;
  authCleanupState: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type AdminRecoverableDeletion = Readonly<{
  id: string;
  accountId: string;
  businessName: string | null;
  accountNumber: string | null;
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  status: string;
  deletedAt: string;
  purgeEligibleAt: string;
  deletedByUserId: string | null;
  deletionReason: string | null;
  daysRemaining: number;
  hoursRemaining: number;
  isExpired: boolean;
}>;

export type AdminPendingIrreversibleWork = Readonly<{
  activeClosures: readonly AdminAccountClosureJob[];
  completedClosures: readonly AdminAccountClosureJob[];
  recoverableDeletions: readonly AdminRecoverableDeletion[];
  metrics: {
    pendingClosuresCount: number;
    failedClosuresCount: number;
    activeTrashCount: number;
    expiringSoonTrashCount: number; // <= 7 days
  };
}>;

export function calculateTimeRemaining(purgeEligibleAt: string, now = new Date()): {
  days: number;
  hours: number;
  isExpired: boolean;
} {
  const targetMs = new Date(purgeEligibleAt).getTime();
  const diffMs = targetMs - now.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return { days: 0, hours: 0, isExpired: true };
  }
  const totalHours = Math.floor(diffMs / (3600 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return { days, hours, isExpired: false };
}

/**
 * Loads all active/recent account closures and items in the trash bin
 * across the entire platform.
 */
export async function loadPendingIrreversibleWork(
  admin: SupabaseClient,
  limit = 100,
): Promise<AdminPendingIrreversibleWork> {
  const [closuresResult, deletionsResult, accountsResult] = await Promise.all([
    admin
      .from('account_closure_jobs')
      .select('id, closure_subject_id, account_id, requested_by_user_id, requested_by_role, access_revoked_at, local_disposal_state, stripe_state, quickbooks_state, storage_state, auth_cleanup_state, attempts, max_attempts, next_retry_at, last_error, completed_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit),
    admin
      .from('recoverable_deletions')
      .select('id, account_id, entity_type, entity_id, display_snapshot, status, deleted_at, purge_eligible_at, deleted_by_user_id, deletion_reason')
      .order('deleted_at', { ascending: false })
      .limit(limit),
    admin
      .from('accounts')
      .select('id, business_name, account_number'),
  ]);

  const accountMap = new Map<string, { businessName: string | null; accountNumber: string | null }>();
  for (const acc of accountsResult.data ?? []) {
    const a = acc as { id?: unknown; business_name?: unknown; account_number?: unknown };
    accountMap.set(String(a.id), {
      businessName: a.business_name ? String(a.business_name) : null,
      accountNumber: a.account_number ? String(a.account_number) : null,
    });
  }

  const allClosures: AdminAccountClosureJob[] = (closuresResult.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const subjectId = String(r.closure_subject_id || r.account_id || '');
    const acc = accountMap.get(subjectId);
    return {
      id: String(r.id),
      closureSubjectId: subjectId,
      accountId: r.account_id ? String(r.account_id) : null,
      businessName: acc?.businessName ?? null,
      accountNumber: acc?.accountNumber ?? null,
      requestedByUserId: r.requested_by_user_id ? String(r.requested_by_user_id) : null,
      requestedByRole: String(r.requested_by_role || 'owner'),
      accessRevokedAt: String(r.access_revoked_at || r.created_at),
      localDisposalState: String(r.local_disposal_state || 'pending'),
      stripeState: String(r.stripe_state || 'pending'),
      quickbooksState: String(r.quickbooks_state || 'pending'),
      storageState: String(r.storage_state || 'pending'),
      authCleanupState: String(r.auth_cleanup_state || 'pending'),
      attempts: Number(r.attempts ?? 0),
      maxAttempts: Number(r.max_attempts ?? 5),
      nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : null,
      lastError: r.last_error ? String(r.last_error) : null,
      completedAt: r.completed_at ? String(r.completed_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  });

  const activeClosures = allClosures.filter((c) => !c.completedAt);
  const completedClosures = allClosures.filter((c) => Boolean(c.completedAt));

  const now = new Date();
  const recoverableDeletions: AdminRecoverableDeletion[] = (deletionsResult.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const accId = String(r.account_id || '');
    const acc = accountMap.get(accId);
    const purgeEligibleAt = String(r.purge_eligible_at || '');
    const { days, hours, isExpired } = calculateTimeRemaining(purgeEligibleAt, now);
    const snap = (r.display_snapshot as Record<string, unknown> | null) ?? {};

    return {
      id: String(r.id),
      accountId: accId,
      businessName: acc?.businessName ?? null,
      accountNumber: acc?.accountNumber ?? null,
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      title: String(snap.title || `${r.entity_type} ${r.entity_id}`),
      subtitle: snap.subtitle ? String(snap.subtitle) : null,
      status: String(r.status || 'trashed'),
      deletedAt: String(r.deleted_at),
      purgeEligibleAt,
      deletedByUserId: r.deleted_by_user_id ? String(r.deleted_by_user_id) : null,
      deletionReason: r.deletion_reason ? String(r.deletion_reason) : null,
      daysRemaining: days,
      hoursRemaining: hours,
      isExpired,
    };
  });

  const activeTrash = recoverableDeletions.filter((d) => d.status === 'trashed' && !d.isExpired);
  const expiringSoonTrash = activeTrash.filter((d) => d.daysRemaining <= 7);
  const failedClosures = activeClosures.filter(
    (c) => c.localDisposalState === 'failed' || c.attempts >= c.maxAttempts,
  );

  return {
    activeClosures,
    completedClosures,
    recoverableDeletions,
    metrics: {
      pendingClosuresCount: activeClosures.length,
      failedClosuresCount: failedClosures.length,
      activeTrashCount: activeTrash.length,
      expiringSoonTrashCount: expiringSoonTrash.length,
    },
  };
}

/**
 * Loads pending closure and recoverable deletions for a specific account.
 */
export async function loadAccountIrreversibleWork(
  admin: SupabaseClient,
  accountId: string,
): Promise<{
  activeClosure: AdminAccountClosureJob | null;
  recoverableDeletions: readonly AdminRecoverableDeletion[];
}> {
  const [closureResult, deletionsResult] = await Promise.all([
    admin
      .from('account_closure_jobs')
      .select('id, closure_subject_id, account_id, requested_by_user_id, requested_by_role, access_revoked_at, local_disposal_state, stripe_state, quickbooks_state, storage_state, auth_cleanup_state, attempts, max_attempts, next_retry_at, last_error, completed_at, created_at, updated_at')
      .eq('closure_subject_id', accountId)
      .is('completed_at', null)
      .maybeSingle(),
    admin
      .from('recoverable_deletions')
      .select('id, account_id, entity_type, entity_id, display_snapshot, status, deleted_at, purge_eligible_at, deleted_by_user_id, deletion_reason')
      .eq('account_id', accountId)
      .order('deleted_at', { ascending: false })
      .limit(25),
  ]);

  let activeClosure: AdminAccountClosureJob | null = null;
  if (closureResult.data) {
    const r = closureResult.data as Record<string, unknown>;
    activeClosure = {
      id: String(r.id),
      closureSubjectId: String(r.closure_subject_id || r.account_id || accountId),
      accountId: r.account_id ? String(r.account_id) : null,
      businessName: null,
      accountNumber: null,
      requestedByUserId: r.requested_by_user_id ? String(r.requested_by_user_id) : null,
      requestedByRole: String(r.requested_by_role || 'owner'),
      accessRevokedAt: String(r.access_revoked_at || r.created_at),
      localDisposalState: String(r.local_disposal_state || 'pending'),
      stripeState: String(r.stripe_state || 'pending'),
      quickbooksState: String(r.quickbooks_state || 'pending'),
      storageState: String(r.storage_state || 'pending'),
      authCleanupState: String(r.auth_cleanup_state || 'pending'),
      attempts: Number(r.attempts ?? 0),
      maxAttempts: Number(r.max_attempts ?? 5),
      nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : null,
      lastError: r.last_error ? String(r.last_error) : null,
      completedAt: r.completed_at ? String(r.completed_at) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  const now = new Date();
  const recoverableDeletions = (deletionsResult.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const purgeEligibleAt = String(r.purge_eligible_at || '');
    const { days, hours, isExpired } = calculateTimeRemaining(purgeEligibleAt, now);
    const snap = (r.display_snapshot as Record<string, unknown> | null) ?? {};

    return {
      id: String(r.id),
      accountId,
      businessName: null,
      accountNumber: null,
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      title: String(snap.title || `${r.entity_type} ${r.entity_id}`),
      subtitle: snap.subtitle ? String(snap.subtitle) : null,
      status: String(r.status || 'trashed'),
      deletedAt: String(r.deleted_at),
      purgeEligibleAt,
      deletedByUserId: r.deleted_by_user_id ? String(r.deleted_by_user_id) : null,
      deletionReason: r.deletion_reason ? String(r.deletion_reason) : null,
      daysRemaining: days,
      hoursRemaining: hours,
      isExpired,
    };
  });

  return { activeClosure, recoverableDeletions };
}
