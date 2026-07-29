'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction, issueAccountCredit } from '@/lib/admin';

// All account-level staff actions. Each re-runs requireAdmin() (a server action
// is its own entry point — never trust that the page guarded it) and writes to
// the audit trail. Destructive/irreversible actions require typed confirmation.

function backTo(id: string, query: string): never {
  redirect(`/admin/accounts/${id}?${query}`);
}

export async function suspendAccountAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const reason = String(formData.get('reason') ?? '').trim() || null;
  const nowIso = new Date().toISOString();
  await admin.from('accounts').update({ suspended_at: nowIso, suspended_reason: reason, suspended_by: adminEmail }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'account_suspend', accountId, targetType: 'account', targetId: accountId, meta: { reason } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=suspended');
}

export async function unsuspendAccountAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  await admin.from('accounts').update({ suspended_at: null, suspended_reason: null, suspended_by: null }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'account_unsuspend', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=unsuspended');
}

export async function issueAccountCreditAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const dollars = Number(String(formData.get('amount') ?? '').replace(/[^0-9.]/g, ''));
  const reason = String(formData.get('reason') ?? '').trim() || 'Staff credit';
  if (!Number.isFinite(dollars) || dollars <= 0) backTo(accountId, 'error=amount');
  await issueAccountCredit(admin, adminEmail, { accountId, amountCents: Math.round(dollars * 100), reason, source: 'admin' });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=credit');
}

export async function lockExtraStopAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const days = Math.max(1, Math.min(365, Math.round(Number(formData.get('days') ?? 10)) || 10));
  const reason = String(formData.get('reason') ?? '').trim() || 'No-show penalty';
  const until = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  await admin.from('accounts').update({ extra_stop_locked_until: until, extra_stop_lock_reason: reason }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'extra_stop_lock', accountId, targetType: 'account', targetId: accountId, meta: { days, reason, until } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=es_locked');
}

export async function unlockExtraStopAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  await admin.from('accounts').update({ extra_stop_locked_until: null, extra_stop_lock_reason: null }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'extra_stop_unlock', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=es_unlocked');
}

// Hard delete — irreversible. Requires the operator to type the account number.
// Cascades all account-owned data (FKs are ON DELETE CASCADE); then removes the
// owner's auth user if they belong to no other account (a real data-deletion
// request), best-effort.
export async function deleteAccountAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const typed = String(formData.get('confirm') ?? '').trim();

  const { data: acct } = await admin.from('accounts').select('account_number').eq('id', accountId).maybeSingle();
  const expected = acct ? String((acct as { account_number: number }).account_number ?? '') : '';
  if (!expected || typed !== expected) backTo(accountId, 'error=confirm');

  // Resolve the owner(s) before the cascade wipes the memberships.
  const { data: owners } = await admin.from('memberships').select('user_id').eq('account_id', accountId).eq('role', 'owner');
  const ownerIds = (owners ?? []).map((m) => (m as { user_id: string }).user_id).filter(Boolean);

  await logAdminAction(admin, adminEmail, { action: 'account_delete', accountId, targetType: 'account', targetId: accountId, meta: { accountNumber: expected } });
  await admin.from('accounts').delete().eq('id', accountId);

  for (const userId of ownerIds) {
    try {
      const { count } = await admin.from('memberships').select('id', { count: 'exact', head: true }).eq('user_id', userId);
      if (!count) await admin.auth.admin.deleteUser(userId);
    } catch (error) {
      console.error('deleteAccount owner cleanup failed:', error instanceof Error ? error.message : error);
    }
  }

  redirect('/admin/accounts?deleted=1');
}
