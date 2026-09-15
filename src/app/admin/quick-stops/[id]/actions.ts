'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireMfaPermission, requireMfaPermissions, requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { QUICK_STOP_OUTCOME, isQuickStopOutcome } from '@/lib/quick-stop-outcomes';
import { getQuickStopRequestById, logQuickStopEvent } from '@/lib/quick-stop-requests';
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';
import { refundPayment } from '@/lib/payments';
import { canTransition } from '@/lib/quick-stop';
import { transitionQuickStopRequest } from '@/lib/quick-stop-transition';
import { reconcileQuickStopRefund } from '@/lib/quick-stop-refund-recovery';

function backTo(id: string, query: string): never {
  redirect(`/admin/quick-stops/${id}?${query}`);
}

// Re-read provider truth for a refund marked for review. This operation never
// issues another provider refund; staff resolve uncertain money in Stripe first.
export async function adminReconcileQuickStopRefundAction(requestId: string) {
  const ctx = await requireMfaPermission('money.refund');
  const req = await getQuickStopRequestById(ctx.admin, requestId);
  if (!req) backTo(requestId, 'error=notfound');
  if (req.refund_state !== 'review') backTo(requestId, 'error=refund_pending');
  const result = await reconcileQuickStopRefund(ctx.admin, req.account_id, requestId);
  await logAdminAction(ctx.admin, ctx, {
    action: 'extra_stop_refund_reconcile', accountId: req.account_id,
    targetType: 'extra_stop_request', targetId: requestId, meta: result,
  });
  revalidatePath(`/admin/quick-stops/${requestId}`);
  backTo(requestId, result.completed ? 'done=refunded' : 'error=refund_pending');
}

// Manual refund on a Quick Stop's payment. Blank amount = refund the full
// remaining balance. Writes both the admin audit trail and the request's own
// event log. A discretionary refund preserves the appointment; cancellation is
// an explicit resolution that closes the job and records a refund obligation.
export async function adminRefundQuickStopAction(requestId: string, formData: FormData) {
  const ctx = await requireMfaPermission('money.refund');
  const { admin } = ctx;
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) backTo(requestId, 'error=notfound');
  if (!req.payment_id || !req.paid_at) backTo(requestId, 'error=nopayment');
  if (req.refund_state && ['pending', 'processing', 'retry', 'review'].includes(req.refund_state)) {
    backTo(requestId, 'error=refund_pending');
  }
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 4) backTo(requestId, 'error=reason');

  const raw = String(formData.get('amount') ?? '').replace(/[^0-9.]/g, '').trim();
  const amountDollars = raw ? Number(raw) : undefined;
  if (raw && (!Number.isFinite(amountDollars) || (amountDollars ?? 0) <= 0)) backTo(requestId, 'error=amount');

  let refundedTotalCents = req.refund_cents ?? 0;
  let isFull = false;
  try {
    const result = await refundPayment(admin, req.account_id, req.payment_id, amountDollars);
    refundedTotalCents = Math.round(result.refundedTotal * 100);
    isFull = result.isFull;
  } catch (error) {
    console.error('Admin Quick Stop refund failed:', error instanceof Error ? error.message : error);
    backTo(requestId, 'error=refund');
  }

  // refundPayment's finish transaction synchronizes the confirmed amount with
  // this request. Do not overwrite a concurrent booking resolution afterward.
  const refreshed = await getQuickStopRequestById(admin, requestId);
  const stateUpdateFailed = !refreshed || (refreshed.refund_cents ?? 0) < refundedTotalCents;

  await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'system', meta: { adminRefund: true, refundedTotalCents, by: ctx.adminEmail } });
  await logAdminAction(admin, ctx, { action: 'extra_stop_refund', accountId: req.account_id, targetType: 'extra_stop_request', targetId: requestId, reason, meta: { amountDollars: amountDollars ?? 'full', refundedTotalCents, isFull, stateUpdateFailed } });

  revalidatePath(`/admin/quick-stops/${requestId}`);
  if (stateUpdateFailed) {
    console.error('Admin Quick Stop refund state could not be confirmed');
    backTo(requestId, 'error=refund_state');
  }
  backTo(requestId, 'done=refunded');
}

// Adjudicate a request to a terminal state. no_show / contractor_cancel run the
// full cancellation path (tiered/forced refund + notify + archive job); the
// others just set the status for record-keeping.
//
// Which permission that takes depends on the outcome, and the map lives in
// lib/quick-stop-outcomes.ts so the dropdown offering the options and the gate
// enforcing them read from one place.
export async function adminResolveQuickStopAction(requestId: string, formData: FormData) {
  // The outcome has to be read before the gate, because the outcome is what
  // decides the gate. Parsed against the allowlist first so an unrecognised
  // value cannot pick its own permission.
  const outcome = String(formData.get('outcome') ?? '').trim();
  if (!isQuickStopOutcome(outcome)) {
    // Still requires a staff member: this branch is reachable by anyone who can
    // post to the action, and it should not reveal anything to a stranger.
    await requirePermission('account.support');
    backTo(requestId, 'error=outcome');
  }

  const ctx = await requireMfaPermissions(...QUICK_STOP_OUTCOME[outcome].permissions);
  const { admin } = ctx;
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 4) backTo(requestId, 'error=reason');
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) backTo(requestId, 'error=notfound');

  const nowIso = new Date().toISOString();
  if (outcome === 'no_show' || outcome === 'contractor_cancel') {
    await resolveQuickStopCancellation(admin, req.account_id, requestId, {
      kind: outcome === 'no_show' ? 'no_show' : 'contractor_cancel',
      reason,
      // So the no-show lock is audited as the person who ordered it rather than
      // as 'system'. Without this the only row naming them says
      // 'extra_stop_resolve / account.support', and an access review asking who
      // exercised enforcement powers finds nobody.
      actor: ctx,
    });
  } else if (outcome === 'completed' || outcome === 'disputed') {
    if (!req.payment_id || !req.paid_at || !canTransition(req.status, outcome)) backTo(requestId, 'error=state');
    const claimed = await transitionQuickStopRequest(admin, {
      accountId: req.account_id, requestId, from: req.status, to: outcome,
      patch: { ...(outcome === 'completed' ? { completed_at: nowIso } : {}), updated_at: nowIso },
      expected: { updated_at: req.updated_at },
    });
    if (!claimed) backTo(requestId, 'error=state');
    await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'system', from: req.status, to: outcome, meta: { adminForced: true, reason, by: ctx.adminEmail } });
  } else {
    backTo(requestId, 'error=outcome');
  }

  await logAdminAction(admin, ctx, { action: 'extra_stop_resolve', accountId: req.account_id, targetType: 'extra_stop_request', targetId: requestId, reason, meta: { outcome } });
  revalidatePath(`/admin/quick-stops/${requestId}`);
  backTo(requestId, 'done=resolved');
}
