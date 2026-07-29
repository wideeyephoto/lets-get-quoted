'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getExtraStopRequestById } from '@/lib/extra-stop-requests';
import { resolveExtraStopCancellation } from '@/lib/extra-stop-refunds';

const NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours after the window to report

// Customer cancels their Extra Stop. Refund follows the tier policy (full within
// 5 min of paying, then decreasing as the visit gets closer). Public — keyed by
// the unguessable request id.
export async function customerCancelExtraStopAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getExtraStopRequestById(admin, requestId);
  if (!req) redirect(`/extra-stop/${requestId}?error=notfound`);
  if (!['awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'].includes(req.status)) {
    redirect(`/extra-stop/${requestId}?error=state`);
  }
  await resolveExtraStopCancellation(admin, req.account_id, requestId, { kind: 'customer_cancel', reason: 'Canceled by customer' });
  redirect(`/extra-stop/${requestId}?done=canceled`);
}

// Customer reports a no-show. Allowed only if the tech never marked arrived and
// we're within 2 hours of the arrival window's end. A verified no-show is a full
// refund + record + notify (no contractor lockout — deferred per Phase-1 scope).
export async function reportNoShowExtraStopAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getExtraStopRequestById(admin, requestId);
  if (!req) redirect(`/extra-stop/${requestId}?error=notfound`);
  if (req.arrived_at || !['confirmed', 'en_route'].includes(req.status)) {
    redirect(`/extra-stop/${requestId}?error=state`);
  }
  const endMs = req.arrival_date && req.arrival_end ? new Date(`${req.arrival_date}T${req.arrival_end}`).getTime() : NaN;
  if (Number.isFinite(endMs) && Date.now() > endMs + NO_SHOW_GRACE_MS) {
    redirect(`/extra-stop/${requestId}?error=late`);
  }
  await admin.from('extra_stop_requests').update({ no_show_reported_at: new Date().toISOString() }).eq('id', requestId);
  await resolveExtraStopCancellation(admin, req.account_id, requestId, { kind: 'no_show', reason: 'Customer reported no-show' });
  redirect(`/extra-stop/${requestId}?done=no_show`);
}
