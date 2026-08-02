'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/auth';
import { getQuickStopRequestById, logQuickStopEvent } from '@/lib/quick-stop-requests';
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';
import { updateJobSchedule } from '@/lib/jobs';
import { createDepositRequest } from '@/lib/payments';
import { sendQuickStopStatusSms } from '@/lib/sms';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

const NO_SHOW_GRACE_MS = 2 * 60 * 60 * 1000; // 2 hours after the window to report

// Customer cancels their Quick Stop. Refund follows the tier policy (full within
// 5 min of paying, then decreasing as the visit gets closer). Public — keyed by
// the unguessable request id.
export async function customerCancelQuickStopAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) redirect(`/quick-stop/${requestId}?error=notfound`);
  if (!['awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'].includes(req.status)) {
    redirect(`/quick-stop/${requestId}?error=state`);
  }
  await resolveQuickStopCancellation(admin, req.account_id, requestId, { kind: 'customer_cancel', reason: 'Canceled by customer' });
  redirect(`/quick-stop/${requestId}?done=canceled`);
}

// Customer reports a no-show. Allowed only if the tech never marked arrived and
// we're within 2 hours of the arrival window's end. A verified no-show is a full
// refund + record + notify (no contractor lockout — deferred per Phase-1 scope).
export async function reportNoShowQuickStopAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) redirect(`/quick-stop/${requestId}?error=notfound`);
  if (req.arrived_at || !['confirmed', 'en_route'].includes(req.status)) {
    redirect(`/quick-stop/${requestId}?error=state`);
  }
  const endMs = req.arrival_date && req.arrival_end ? new Date(`${req.arrival_date}T${req.arrival_end}`).getTime() : NaN;
  if (Number.isFinite(endMs) && Date.now() > endMs + NO_SHOW_GRACE_MS) {
    redirect(`/quick-stop/${requestId}?error=late`);
  }
  await admin.from('extra_stop_requests').update({ no_show_reported_at: new Date().toISOString() }).eq('id', requestId);
  await resolveQuickStopCancellation(admin, req.account_id, requestId, { kind: 'no_show', reason: 'Customer reported no-show' });
  redirect(`/quick-stop/${requestId}?done=no_show`);
}

// Customer accepts the contractor's revised arrival window → it replaces the
// live window and the placeholder job is rescheduled.
export async function acceptRevisedWindowQuickStopAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) redirect(`/quick-stop/${requestId}?error=notfound`);
  if (!req.proposed_arrival_date || !['confirmed', 'en_route'].includes(req.status)) {
    redirect(`/quick-stop/${requestId}?error=state`);
  }
  const nowIso = new Date().toISOString();
  await admin
    .from('extra_stop_requests')
    .update({
      arrival_date: req.proposed_arrival_date,
      arrival_start: req.proposed_arrival_start,
      arrival_end: req.proposed_arrival_end,
      proposed_arrival_date: null,
      proposed_arrival_start: null,
      proposed_arrival_end: null,
      proposed_window_at: null,
      updated_at: nowIso,
    })
    .eq('id', requestId);
  if (req.job_id && req.proposed_arrival_date) {
    try {
      await updateJobSchedule(admin, req.account_id, req.job_id, req.proposed_arrival_date, req.proposed_arrival_start);
    } catch (error) {
      console.error('Quick Stop reschedule failed:', error instanceof Error ? error.message : error);
    }
  }
  await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'customer', meta: { acceptedWindow: { date: req.proposed_arrival_date, start: req.proposed_arrival_start, end: req.proposed_arrival_end } } });
  redirect(`/quick-stop/${requestId}?done=window_accepted`);
}

// Customer declines the revised window → the original window stands.
export async function declineRevisedWindowQuickStopAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) redirect(`/quick-stop/${requestId}?error=notfound`);
  if (!req.proposed_arrival_date) redirect(`/quick-stop/${requestId}?error=state`);
  await admin
    .from('extra_stop_requests')
    .update({ proposed_arrival_date: null, proposed_arrival_start: null, proposed_arrival_end: null, proposed_window_at: null, updated_at: new Date().toISOString() })
    .eq('id', requestId);
  await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'customer', meta: { declinedWindow: true } });
  redirect(`/quick-stop/${requestId}?done=window_declined`);
}

// Customer approves converting the visit to a diagnostic appointment. The
// already-paid Quick Stop fee applies as a deposit; any amount above it is
// charged via a new payment link.
export async function approveDiagnosticConversionAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) redirect(`/quick-stop/${requestId}?error=notfound`);
  if (req.diagnostic_conversion !== 'proposed') redirect(`/quick-stop/${requestId}?error=state`);

  const feeCents = req.fee_cents ?? 0;
  const proposed = req.diagnostic_proposed_cents ?? 0;
  const additional = Math.max(0, proposed - feeCents);

  let paymentId: string | null = null;
  if (additional > 0 && req.job_id) {
    try {
      const payment = await createDepositRequest(admin, req.account_id, req.job_id, {
        label: 'Diagnostic charge (Quick Stop fee applied as deposit)',
        amount: additional / 100,
        kind: 'deposit',
        homeownerPhone: req.client_phone,
        smsConsent: Boolean(req.client_phone),
      });
      paymentId = payment.id;
    } catch (error) {
      console.error('Diagnostic charge creation failed:', error instanceof Error ? error.message : error);
    }
  }

  const nowIso = new Date().toISOString();
  await admin
    .from('extra_stop_requests')
    .update({ diagnostic_conversion: 'approved', diagnostic_decided_at: nowIso, diagnostic_payment_id: paymentId, updated_at: nowIso })
    .eq('id', requestId)
    .eq('diagnostic_conversion', 'proposed');
  await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'customer', meta: { diagnosticApproved: true, additionalCents: additional, paymentId } });

  if (paymentId && req.client_phone) {
    const label = `$${(additional / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    await sendQuickStopStatusSms({ accountId: req.account_id, toPhone: req.client_phone, message: `Thanks for approving the diagnostic visit. Pay the additional ${label} here: ${APP_ORIGIN}/pay/${paymentId}.` });
  }
  redirect(`/quick-stop/${requestId}?done=diag_approved`);
}

// Customer declines the diagnostic conversion → the Quick Stop stands as-is.
export async function declineDiagnosticConversionAction(requestId: string) {
  const admin = createAdminClient();
  const req = await getQuickStopRequestById(admin, requestId);
  if (!req) redirect(`/quick-stop/${requestId}?error=notfound`);
  if (req.diagnostic_conversion !== 'proposed') redirect(`/quick-stop/${requestId}?error=state`);
  await admin
    .from('extra_stop_requests')
    .update({ diagnostic_conversion: 'declined', diagnostic_decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('diagnostic_conversion', 'proposed');
  await logQuickStopEvent(admin, req.account_id, requestId, { actor: 'customer', meta: { diagnosticDeclined: true } });
  redirect(`/quick-stop/${requestId}?done=diag_declined`);
}
