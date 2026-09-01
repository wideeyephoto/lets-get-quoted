'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMfaPermission, requirePermission } from '@/lib/auth';
import { logAdminAction, issueAccountCredit } from '@/lib/admin';
import { getAccountOwnerEmail } from '@/lib/email';
import { sendMagicLinkEmail } from '@/lib/magic-link';
import { addAccountNote, addAccountTag, removeAccountTag } from '@/lib/account-notes';
import { uploadAccountAttachment, deleteAccountAttachment, isAttachmentFile } from '@/lib/account-attachments';
import { logPrivacyRequest, resolvePrivacyRequest, isPrivacyRequestKind } from '@/lib/privacy-requests';
import { isAccountFlag } from '@/lib/account-flags';
import { executeAccountClosureSaga } from '@/lib/account-deletion-saga';

// All account-level staff actions. Each re-runs requireAdmin() (a server action
// is its own entry point — never trust that the page guarded it) and writes to
// the audit trail. Destructive/irreversible actions require typed confirmation.

function backTo(id: string, query: string): never {
  redirect(`/admin/accounts/${id}?${query}`);
}

function actionReason(accountId: string, formData: FormData): string {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 4) backTo(accountId, 'error=reason_required');
  return reason;
}

function requireConfirmation(accountId: string, formData: FormData, expected: string) {
  if (String(formData.get('confirm') ?? '') !== expected) backTo(accountId, 'error=confirm');
}

export async function suspendAccountAction(accountId: string, formData: FormData) {
  // Read first so the trail can say what it WAS. "Suspended" with no prior
  // state cannot distinguish a first suspension from re-suspending somebody
  // who was already blocked, and those are different conversations later.
  const { data: was } = await admin.from('accounts').select('suspended_at, suspended_reason').eq('id', accountId).maybeSingle();
  const { error: updateError } = await admin.from('accounts').update({ suspended_at: nowIso, suspended_reason: reason, suspended_by: ctx.adminEmail }).eq('id', accountId);
  if (updateError) {
    console.error('suspendAccountAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, {
    action: 'account_suspend', accountId, targetType: 'account', targetId: accountId,
    reason,
    before: (was as Record<string, unknown> | null) ?? null,
    after: { suspended_at: nowIso, suspended_reason: reason },
  });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=suspended');
}

export async function unsuspendAccountAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.enforce');
  const { admin } = ctx;
  const reason = actionReason(accountId, formData);
  const { data: was } = await admin.from('accounts').select('suspended_at, suspended_reason').eq('id', accountId).maybeSingle();
  const { error: updateError } = await admin.from('accounts').update({ suspended_at: null, suspended_reason: null, suspended_by: null }).eq('id', accountId);
  if (updateError) {
    console.error('unsuspendAccountAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, {
    action: 'account_unsuspend', accountId, targetType: 'account', targetId: accountId,
    before: (was as Record<string, unknown> | null) ?? null,
    after: { suspended_at: null, suspended_reason: null },
    reason,
  });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=unsuspended');
}

export async function issueAccountCreditAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('money.credit');
  const { admin } = ctx;
  const dollars = Number(String(formData.get('amount') ?? '').replace(/[^0-9.]/g, ''));
  const reason = actionReason(accountId, formData);
  if (!Number.isFinite(dollars) || dollars <= 0) backTo(accountId, 'error=amount');
  try {
    await issueAccountCredit(admin, ctx, { accountId, amountCents: Math.round(dollars * 100), reason, source: 'admin' });
  } catch (error) {
    console.error('issueAccountCreditAction failed:', error);
    backTo(accountId, 'error=update_failed');
  }
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=credit');
}

export async function lockQuickStopAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.enforce');
  const { admin } = ctx;
  const days = Math.max(1, Math.min(365, Math.round(Number(formData.get('days') ?? 10)) || 10));
  const reason = actionReason(accountId, formData);
  const until = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
  const { error: updateError } = await admin.from('accounts').update({ extra_stop_locked_until: until, extra_stop_lock_reason: reason }).eq('id', accountId);
  if (updateError) {
    console.error('lockQuickStopAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, { action: 'extra_stop_lock', accountId, targetType: 'account', targetId: accountId, reason, meta: { days, until } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=es_locked');
}

export async function unlockQuickStopAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.enforce');
  const { admin } = ctx;
  const reason = actionReason(accountId, formData);
  const { error: updateError } = await admin.from('accounts').update({ extra_stop_locked_until: null, extra_stop_lock_reason: null }).eq('id', accountId);
  if (updateError) {
    console.error('unlockQuickStopAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, { action: 'extra_stop_unlock', accountId, targetType: 'account', targetId: accountId, reason });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=es_unlocked');
}

// Clears the Connect identity so the owner has to redo onboarding from
// scratch. There are no separate identity/KYC columns to reset — this is the
// full scope of "reset verification" against today's schema.
export async function resetVerificationAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.enforce');
  const { admin } = ctx;
  const reason = actionReason(accountId, formData);
  requireConfirmation(accountId, formData, 'RESET');
  const { error: updateError } = await admin.from('accounts').update({ stripe_connect_id: null, connect_onboarded: false }).eq('id', accountId);
  if (updateError) {
    console.error('resetVerificationAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, { action: 'account_reset_verification', accountId, targetType: 'account', targetId: accountId, reason });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=reset_verification');
}

export async function restrictPayoutsAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('money.payouts');
  const { admin } = ctx;
  const reason = actionReason(accountId, formData);
  requireConfirmation(accountId, formData, 'RESTRICT');
  const nowIso = new Date().toISOString();
  const { error: updateError } = await admin.from('accounts').update({ payouts_restricted_at: nowIso, payouts_restricted_reason: reason, payouts_restricted_by: ctx.adminEmail }).eq('id', accountId);
  if (updateError) {
    console.error('restrictPayoutsAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, {
    action: 'account_restrict_payouts', accountId, targetType: 'account', targetId: accountId,
    reason,
    after: { payouts_restricted_at: nowIso },
  });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=payouts_restricted');
}

export async function unrestrictPayoutsAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('money.payouts');
  const { admin } = ctx;
  const reason = actionReason(accountId, formData);
  const { error: updateError } = await admin.from('accounts').update({ payouts_restricted_at: null, payouts_restricted_reason: null, payouts_restricted_by: null }).eq('id', accountId);
  if (updateError) {
    console.error('unrestrictPayoutsAction failed:', updateError);
    backTo(accountId, 'error=update_failed');
  }
  await logAdminAction(admin, ctx, { action: 'account_unrestrict_payouts', accountId, targetType: 'account', targetId: accountId, reason });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=payouts_unrestricted');
}

// Reuses the owner's own magic link, landing on /dashboard/settings where
// their existing "Connect payouts" button generates a fresh Stripe Account
// Link at click-time. Deliberately does not mint a Connect link server-side
// from the admin context — no safe request-derived origin exists there.
export async function resendOnboardingAction(accountId: string) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const ownerEmail = await getAccountOwnerEmail(admin, accountId);
  if (!ownerEmail) backTo(accountId, 'error=no_owner');
  await sendMagicLinkEmail(ownerEmail, '/dashboard/settings');
  await logAdminAction(admin, ctx, { action: 'account_resend_onboarding', accountId, targetType: 'account', targetId: accountId });
  backTo(accountId, 'done=onboarding_resent');
}

export async function setAccountSyntheticAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const reason = String(formData.get('reason') ?? '').trim();
  const synthetic = String(formData.get('synthetic') ?? '') === 'true';
  if (reason.length < 4) backTo(accountId, 'error=reason_required');
  const { data: was } = await ctx.admin.from('accounts').select('test_marker').eq('id', accountId).maybeSingle();
  const testMarker = synthetic ? `staff:${ctx.adminEmail}` : null;
  const { error } = await ctx.admin.from('accounts').update({ test_marker: testMarker }).eq('id', accountId);
  if (error) backTo(accountId, 'error=update_failed');
  await logAdminAction(ctx.admin, ctx, {
    action: synthetic ? 'account_mark_synthetic' : 'account_mark_production',
    accountId,
    targetType: 'account',
    targetId: accountId,
    reason,
    before: { test_marker: (was as { test_marker?: string | null } | null)?.test_marker ?? null },
    after: { test_marker: testMarker },
  });
  revalidatePath('/admin');
  revalidatePath('/admin/accounts');
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, synthetic ? 'done=marked_synthetic' : 'done=marked_production');
}

// Bans every member's user id for 24h, which blocks their next token refresh —
// it does NOT retroactively revoke an already-issued access token still inside
// its own short lifetime. The UI says this explicitly so staff don't treat it
// as an instant kill switch.
export async function signOutAllSessionsAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.enforce');
  const { admin } = ctx;
  const reason = actionReason(accountId, formData);
  requireConfirmation(accountId, formData, 'SIGN OUT');
  const { data: members, error: membershipError } = await admin.from('memberships').select('user_id').eq('account_id', accountId);
  if (membershipError) {
    console.error('signOutAllSessions membership read failed:', membershipError);
    backTo(accountId, 'error=update_failed');
  }
  const userIds = (members ?? []).map((m) => (m as { user_id: string }).user_id).filter(Boolean);
  const failedUserIds: string[] = [];
  for (const userId of userIds) {
    try {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: '24h' });
      if (error) throw error;
    } catch (error) {
      console.error('signOutAllSessions ban failed:', error instanceof Error ? error.message : error);
      failedUserIds.push(userId);
    }
  }
  await logAdminAction(admin, ctx, { action: 'account_sign_out_all', accountId, targetType: 'account', targetId: accountId, reason, meta: { userCount: userIds.length, failedCount: failedUserIds.length } });
  if (failedUserIds.length) backTo(accountId, 'error=partial_signout');
  backTo(accountId, 'done=signed_out');
}

/**
 * Flip one per-account feature switch.
 *
 * Gated on account.support rather than anything sharper because none of these
 * move money or access — they are the settings the owner can already change
 * themselves, and the reason staff need them is the sentence "kill their auto
 * review requests, they are complaining", which support should not have to
 * escalate.
 *
 * The column name is validated against the allowlist in lib/account-flags.ts
 * before it reaches the update. It arrives from a form, and a form field that
 * names its own column is how `connect_onboarded` gets set to true.
 */
export async function setAccountFlagAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const flag = String(formData.get('flag') ?? '').trim();
  if (!isAccountFlag(flag)) backTo(accountId, 'error=flag');
  const next = String(formData.get('next') ?? '') === 'on';
  const reason = String(formData.get('reason') ?? '').trim() || null;

  // Read first so the trail says what it WAS. Turning something on that was
  // already on is a different event from turning it on, and only the before
  // value can tell them apart later.
  const { data: was } = await admin.from('accounts').select(flag).eq('id', accountId).maybeSingle();
  const before = (was as Record<string, unknown> | null)?.[flag] === true;

  const { error } = await admin.from('accounts').update({ [flag]: next }).eq('id', accountId);
  if (error) {
    console.error('setAccountFlagAction failed:', error);
    backTo(accountId, 'error=flag_save');
  }

  await logAdminAction(admin, ctx, {
    action: 'account_flag_change',
    accountId,
    targetType: 'account',
    targetId: accountId,
    reason,
    before: { [flag]: before },
    after: { [flag]: next },
    meta: { flag },
  });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=flag_changed');
}

export async function addAccountNoteAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const body = String(formData.get('body') ?? '').trim();
  if (!body) backTo(accountId, 'error=note');
  await addAccountNote(admin, accountId, ctx.adminEmail, body);
  await logAdminAction(admin, ctx, { action: 'account_note_add', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=noted');
}

// Both tag actions write to the audit log, like every other staff action on
// this page. Removing a tag was destructuring ctx.adminEmail and then using it for
// nothing — the lint error that surfaced was the symptom, not the bug: a tag can
// carry "chargeback risk" or "do not call", so who took it off and when is
// exactly the kind of thing the audit trail exists to answer. Adding one was
// unlogged for the same reason.
export async function addAccountTagAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const tag = String(formData.get('tag') ?? '').trim();
  if (!tag) backTo(accountId, 'error=tag');
  await addAccountTag(admin, accountId, ctx.adminEmail, tag);
  await logAdminAction(admin, ctx, { action: 'account_tag_add', accountId, targetType: 'account', targetId: accountId, meta: { tag } });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=tagged');
}

export async function removeAccountTagAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const tagId = String(formData.get('tag_id') ?? '').trim();
  if (tagId) {
    await removeAccountTag(admin, accountId, tagId);
    await logAdminAction(admin, ctx, { action: 'account_tag_remove', accountId, targetType: 'account', targetId: accountId, meta: { tag_id: tagId } });
  }
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=untagged');
}

export async function uploadAccountAttachmentAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const file = formData.get('file');
  if (!isAttachmentFile(file)) backTo(accountId, 'error=attachment');
  try {
    await uploadAccountAttachment(admin, accountId, ctx.adminEmail, file);
  } catch (error) {
    console.error('uploadAccountAttachmentAction failed:', error instanceof Error ? error.message : error);
    backTo(accountId, 'error=attachment');
  }
  await logAdminAction(admin, ctx, { action: 'account_attachment_upload', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=attached');
}

export async function deleteAccountAttachmentAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('account.support');
  const { admin } = ctx;
  const attachmentId = String(formData.get('attachment_id') ?? '').trim();
  if (attachmentId) await deleteAccountAttachment(admin, accountId, attachmentId);
  await logAdminAction(admin, ctx, { action: 'account_attachment_delete', accountId, targetType: 'account', targetId: accountId });
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=attachment_deleted');
}

export async function logPrivacyRequestAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('privacy.manage');
  const { admin } = ctx;
  const kind = String(formData.get('kind') ?? '').trim();
  const details = String(formData.get('details') ?? '').trim() || null;
  if (!isPrivacyRequestKind(kind)) backTo(accountId, 'error=privacy_kind');
  try {
    await logPrivacyRequest(admin, ctx, accountId, kind, details);
  } catch (error) {
    console.error('logPrivacyRequestAction failed:', error);
    backTo(accountId, 'error=update_failed');
  }
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=privacy_logged');
}

export async function resolvePrivacyRequestAction(accountId: string, formData: FormData) {
  const ctx = await requirePermission('privacy.manage');
  const { admin } = ctx;
  const requestId = String(formData.get('request_id') ?? '').trim();
  if (!requestId) backTo(accountId, 'error=request_id_required');
  try {
    await resolvePrivacyRequest(admin, ctx, requestId);
  } catch (error) {
    console.error('resolvePrivacyRequestAction failed:', error);
    backTo(accountId, 'error=update_failed');
  }
  revalidatePath(`/admin/accounts/${accountId}`);
  backTo(accountId, 'done=privacy_resolved');
}

// Hard delete — irreversible. Requires the operator to type the account number.
// Cascades all account-owned data (FKs are ON DELETE CASCADE); then removes the
// owner's auth user if they belong to no other account (a real data-deletion
// request), best-effort.
export async function deleteAccountAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.delete');
  const { admin } = ctx;
  const typed = String(formData.get('confirm') ?? '').trim();

  const { data: acct } = await admin.from('accounts').select('account_number').eq('id', accountId).maybeSingle();
  const expected = acct ? String((acct as { account_number: number }).account_number ?? '') : '';
  if (!expected || typed !== expected) backTo(accountId, 'error=confirm');

  // Resolve the owner(s) before the cascade wipes the memberships.
  const { data: owners } = await admin.from('memberships').select('user_id').eq('account_id', accountId).eq('role', 'owner');
  const ownerIds = (owners ?? []).map((m) => (m as { user_id: string }).user_id).filter(Boolean);

  // The privacy log outlives the account on purpose — a deletion request has to
  // stay provable after the deletion. But `details` is free text a staff member
  // typed, and it may quote the very personal data the request was about, so it
  // goes while the record of the request stays. Everything that makes the log
  // useful later (kind, status, who resolved it, when) is structured and kept.
  // THE DELETE GOES FIRST, AND ITS ERROR IS READ.
  //
  // This used to scrub the privacy request, write an `account_delete` audit
  // line, and then fire the delete WITHOUT DESTRUCTURING ITS ERROR before
  // redirecting `deleted=1`. Twenty-four tables hold a RESTRICT foreign key to
  // `accounts` -- `payments` among them -- so for any workspace that has taken a
  // customer payment the delete always failed. A GDPR erasure was reported as
  // done, the audit log said it had happened, the free-text record of what the
  // customer actually asked for was destroyed, and every row of their personal
  // data was still there. Silence on the most consequential write in the
  // product.
  //
  // So: delete, check, and only then scrub and log. If it fails, nothing has
  // been touched and the operator is told.
  const sagaResult = await executeAccountClosureSaga(admin, accountId);
  if (!sagaResult.success) {
    console.error('account hard delete saga failed:', sagaResult.errors);
    backTo(accountId, 'error=delete_failed');
  }

  // Everything below is after a CONFIRMED delete. `details` is free text a staff
  // member typed and may quote the very personal data the request was about, so
  // it goes while the structured record of the request stays.
  const { error: scrubError } = await admin
    .from('privacy_requests')
    .update({ details: null })
    .eq('account_id', accountId);
  if (scrubError) console.error('privacy request scrub failed:', scrubError);

  await logAdminAction(admin, ctx, { action: 'account_delete', accountId, targetType: 'account', targetId: accountId, meta: { accountNumber: expected } });

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

export async function closeAndAnonymizeAccountAction(accountId: string, formData: FormData) {
  const ctx = await requireMfaPermission('account.delete');
  const { admin } = ctx;
  const typed = String(formData.get('confirm') ?? '').trim();

  const { data: acct } = await admin.from('accounts').select('account_number, stripe_customer_id, quickbooks_realm_id').eq('id', accountId).maybeSingle();
  const expected = acct ? String((acct as { account_number: number }).account_number ?? '') : '';
  if (!expected || typed !== expected) backTo(accountId, 'error=confirm');

  const { data: owners } = await admin.from('memberships').select('user_id').eq('account_id', accountId).eq('role', 'owner');
  const ownerIds = (owners ?? []).map((m) => (m as { user_id: string }).user_id).filter(Boolean);

  const { requestAccountClosure, processClosureJob, buildProductionClosureAdapters } = await import('@/lib/account-closure-orchestrator');
  const { jobId } = await requestAccountClosure(admin, {
    accountId,
    requestedByUserId: null,
    requestedByRole: 'admin',
    vendorHandles: {
      stripeCustomerId: (acct as { stripe_customer_id?: string })?.stripe_customer_id ?? null,
      quickbooksRealmId: (acct as { quickbooks_realm_id?: string })?.quickbooks_realm_id ?? null,
      storageFolderPrefix: accountId,
      ownerUserIds: ownerIds,
    },
  });

  const adapters = buildProductionClosureAdapters(admin);
  const result = await processClosureJob(admin, jobId, adapters);

  if (!result.success || !result.completed) {
    console.error('closeAndAnonymizeAccountAction completed with errors:', result.errors);
    backTo(accountId, 'error=delete_failed');
  }

  const { error: scrubError } = await admin
    .from('privacy_requests')
    .update({ details: null })
    .eq('account_id', accountId);
  if (scrubError) console.error('privacy request scrub failed:', scrubError);

  await logAdminAction(admin, ctx, {
    action: 'account_delete',
    accountId,
    targetType: 'account',
    targetId: accountId,
    meta: {
      accountNumber: expected,
      closureJobId: jobId,
    },
  });

  redirect('/admin/accounts?deleted=1');
}
