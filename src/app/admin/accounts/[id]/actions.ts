'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction, issueAccountCredit } from '@/lib/admin';
import { getAccountOwnerEmail } from '@/lib/email';
import { sendMagicLinkEmail } from '@/lib/magic-link';
import { addAccountNote, addAccountTag, removeAccountTag } from '@/lib/account-notes';
import { uploadAccountAttachment, deleteAccountAttachment, isAttachmentFile } from '@/lib/account-attachments';
import { logPrivacyRequest, resolvePrivacyRequest, isPrivacyRequestKind } from '@/lib/privacy-requests';

const PLAN_TARGETS = ['free', 'pro', 'crew_plus'] as const;
type PlanTarget = (typeof PLAN_TARGETS)[number];
function isPlanTarget(v: string): v is PlanTarget {
  return (PLAN_TARGETS as readonly string[]).includes(v);
}

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

export async function lockQuickStopAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const days = Math.max(1, Math.min(365, Math.round(Number(formData.get('days') ?? 10)) || 10));
  const reason = String(formData.get('reason') ?? '').trim() || 'No-show penalty';
  const until = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  await admin.from('accounts').update({ extra_stop_locked_until: until, extra_stop_lock_reason: reason }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'extra_stop_lock', accountId, targetType: 'account', targetId: accountId, meta: { days, reason, until } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=es_locked');
}

export async function unlockQuickStopAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  await admin.from('accounts').update({ extra_stop_locked_until: null, extra_stop_lock_reason: null }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'extra_stop_unlock', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=es_unlocked');
}

// Clears the Connect identity so the owner has to redo onboarding from
// scratch. There are no separate identity/KYC columns to reset — this is the
// full scope of "reset verification" against today's schema.
export async function resetVerificationAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  await admin.from('accounts').update({ stripe_connect_id: null, connect_onboarded: false }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'account_reset_verification', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=reset_verification');
}

export async function restrictPayoutsAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const reason = String(formData.get('reason') ?? '').trim() || null;
  const nowIso = new Date().toISOString();
  await admin.from('accounts').update({ payouts_restricted_at: nowIso, payouts_restricted_reason: reason, payouts_restricted_by: adminEmail }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'account_restrict_payouts', accountId, targetType: 'account', targetId: accountId, meta: { reason } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=payouts_restricted');
}

export async function unrestrictPayoutsAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  await admin.from('accounts').update({ payouts_restricted_at: null, payouts_restricted_reason: null, payouts_restricted_by: null }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'account_unrestrict_payouts', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=payouts_unrestricted');
}

// Target is deliberately restricted to the three real billing plans — the
// plan_tier enum's legacy 'suspended' value must never be reachable here;
// account suspension is the separate suspended_at/_reason/_by triple above.
export async function changePlanAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const plan = String(formData.get('plan') ?? '').trim();
  if (!isPlanTarget(plan)) backTo(accountId, 'error=plan');
  await admin.from('accounts').update({ plan }).eq('id', accountId);
  await logAdminAction(admin, adminEmail, { action: 'account_change_plan', accountId, targetType: 'account', targetId: accountId, meta: { plan } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=plan_changed');
}

// Reuses the owner's own magic link, landing on /dashboard/settings where
// their existing "Connect payouts" button generates a fresh Stripe Account
// Link at click-time. Deliberately does not mint a Connect link server-side
// from the admin context — no safe request-derived origin exists there.
export async function resendOnboardingAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  const ownerEmail = await getAccountOwnerEmail(admin, accountId);
  if (!ownerEmail) backTo(accountId, 'error=no_owner');
  await sendMagicLinkEmail(ownerEmail, '/dashboard/settings');
  await logAdminAction(admin, adminEmail, { action: 'account_resend_onboarding', accountId, targetType: 'account', targetId: accountId });
  backTo(accountId, 'done=onboarding_resent');
}

// Bans every member's user id for 24h, which blocks their next token refresh —
// it does NOT retroactively revoke an already-issued access token still inside
// its own short lifetime. The UI says this explicitly so staff don't treat it
// as an instant kill switch.
export async function signOutAllSessionsAction(accountId: string) {
  const { admin, adminEmail } = await requireAdmin();
  const { data: members } = await admin.from('memberships').select('user_id').eq('account_id', accountId);
  const userIds = (members ?? []).map((m) => (m as { user_id: string }).user_id).filter(Boolean);
  for (const userId of userIds) {
    try {
      await admin.auth.admin.updateUserById(userId, { ban_duration: '24h' });
    } catch (error) {
      console.error('signOutAllSessions ban failed:', error instanceof Error ? error.message : error);
    }
  }
  await logAdminAction(admin, adminEmail, { action: 'account_sign_out_all', accountId, targetType: 'account', targetId: accountId, meta: { userCount: userIds.length } });
  backTo(accountId, 'done=signed_out');
}

export async function addAccountNoteAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) backTo(accountId, 'error=note');
  await addAccountNote(admin, accountId, adminEmail, body);
  await logAdminAction(admin, adminEmail, { action: 'account_note_add', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=noted');
}

export async function addAccountTagAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const tag = String(formData.get('tag') ?? '').trim();
  if (!tag) backTo(accountId, 'error=tag');
  await addAccountTag(admin, accountId, adminEmail, tag);
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=tagged');
}

export async function removeAccountTagAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const tagId = String(formData.get('tag_id') ?? '').trim();
  if (tagId) await removeAccountTag(admin, accountId, tagId);
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=untagged');
}

export async function uploadAccountAttachmentAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const file = formData.get('file');
  if (!isAttachmentFile(file)) backTo(accountId, 'error=attachment');
  try {
    await uploadAccountAttachment(admin, accountId, adminEmail, file);
  } catch (error) {
    console.error('uploadAccountAttachmentAction failed:', error instanceof Error ? error.message : error);
    backTo(accountId, 'error=attachment');
  }
  await logAdminAction(admin, adminEmail, { action: 'account_attachment_upload', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=attached');
}

export async function deleteAccountAttachmentAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const attachmentId = String(formData.get('attachment_id') ?? '').trim();
  if (attachmentId) await deleteAccountAttachment(admin, accountId, attachmentId);
  await logAdminAction(admin, adminEmail, { action: 'account_attachment_delete', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=attachment_deleted');
}

export async function logPrivacyRequestAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const kind = String(formData.get('kind') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim() || null;
  if (!isPrivacyRequestKind(kind)) backTo(accountId, 'error=privacy_kind');
  await logPrivacyRequest(admin, adminEmail, accountId, kind, details);
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=privacy_logged');
}

export async function resolvePrivacyRequestAction(accountId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const requestId = String(formData.get('request_id') ?? '').trim();
  if (requestId) await resolvePrivacyRequest(admin, adminEmail, requestId);
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=privacy_resolved');
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
