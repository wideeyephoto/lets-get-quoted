'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { getQuickStopRequestById, logQuickStopEvent } from '@/lib/quick-stop-requests';
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';
import { refundPayment } from '@/lib/payments';

function backTo(id: string, query: string): never {
  redirect(`/admin/quick-stops/${id}?${query}`);
}

// Manual refund on a Quick Stop's payment. Blank amount = refund the full
// remaining balance. Writes both the admin audit trail and the request's own
// event log, and flips the request to 'refunded' when fully refunded.
export async function adminRefundQuickStopAction(requestId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) backTo(requestId, 'error=notfound');
  if (!req.payment_id || !req.paid_at) backTo(requestId, 'error=nopayment');

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

  const nowIso = new Date().toISOString();
  await admin
    .from('extra_stop_requests')
    .update({ refund_cents: refundedTotalCents, ...(isFull ? { status: 'refunded' } : {}), updated_at: nowIso })
    .eq('id', requestId);

  await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'system', meta: { adminRefund: true, refundedTotalCents, by: adminEmail } });
  await logAdminAction(admin, adminEmail, { action: 'extra_stop_refund', accountId: req.account_id, targetType: 'extra_stop_request', targetId: requestId, meta: { amountDollars: amountDollars ?? 'full', refundedTotalCents, isFull } });

  revalidatePath(`/admin/quick-stops/${requestId}`);
  backTo(requestId, 'done=refunded');
}

// Adjudicate a request to a terminal state. no_show / contractor_cancel run the
// full cancellation path (tiered/forced refund + notify + archive job); the
// others just set the status for record-keeping.
export async function adminResolveQuickStopAction(requestId: string, formData: FormData) {
  const { admin, adminEmail } = await requireAdmin();
  const outcome = String(formData.get('outcome') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim() || `Resolved by ${adminEmail}`;
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) backTo(requestId, 'error=notfound');

  const nowIso = new Date().toISOString();
  if (outcome === 'no_show' || outcome === 'contractor_cancel') {
    await resolveQuickStopCancellation(admin, req.account_id, requestId, { kind: outcome === 'no_show' ? 'no_show' : 'contractor_cancel', reason });
  } else if (outcome === 'completed') {
    await admin.from('extra_stop_requests').update({ status: 'completed', completed_at: nowIso, updated_at: nowIso }).eq('id', requestId);
    await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'system', from: req.status, to: 'completed', meta: { adminForced: true, by: adminEmail } });
  } else if (outcome === 'disputed') {
    await admin.from('extra_stop_requests').update({ status: 'disputed', updated_at: nowIso }).eq('id', requestId);
    await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'system', from: req.status, to: 'disputed', meta: { adminForced: true, reason, by: adminEmail } });
  } else {
    backTo(requestId, 'error=outcome');
  }

  await logAdminAction(admin, adminEmail, { action: 'extra_stop_resolve', accountId: req.account_id, targetType: 'extra_stop_request', targetId: requestId, meta: { outcome, reason } });
  revalidatePath(`/admin/quick-stops/${requestId}`);
  backTo(requestId, 'done=resolved');
}
