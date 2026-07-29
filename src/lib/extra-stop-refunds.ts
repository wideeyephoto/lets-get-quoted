import type { SupabaseClient } from '@supabase/supabase-js';
import { refundPayment } from '@/lib/payments';
import { getExtraStopRequest, logExtraStopEvent, type ExtraStopRequest } from '@/lib/extra-stop-requests';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { sendExtraStopStatusSms } from '@/lib/sms';
import { centsToDollars } from '@/lib/extra-stop';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Cancellation refund tiers (percent of the Extra Stop fee). These are the spec
// defaults; kept as one constant so they're trivial to make per-account editable
// later without hunting through the logic.
export const EXTRA_STOP_REFUND_TIERS = {
  withinGraceMinutes: 5, // within N min of payment → full refund
  grace: 100,
  beforeEnRoute: 75,
  afterEnRoute: 25, // en route but not yet arrived
  afterArrived: 0,
  contractorMissedWindow: 100,
  contractorCancel: 100,
  noShow: 100,
};

// How much of a CUSTOMER-initiated cancellation is refundable, by timeline.
export function computeCustomerRefundPercent(req: ExtraStopRequest, now = Date.now()): number {
  const t = EXTRA_STOP_REFUND_TIERS;
  if (!req.paid_at) return 100; // nothing captured yet — full (no-op) refund
  if (now - new Date(req.paid_at).getTime() <= t.withinGraceMinutes * 60_000) return t.grace;
  // Contractor blew the arrival window without arriving → full refund.
  if (req.arrival_date && req.arrival_end && !req.arrived_at) {
    const endMs = new Date(`${req.arrival_date}T${req.arrival_end}`).getTime();
    if (Number.isFinite(endMs) && now > endMs) return t.contractorMissedWindow;
  }
  // Check arrival BEFORE en-route: a tech can mark "arrived" straight from
  // confirmed (skipping en_route), and an arrived visit is always the 0% tier.
  if (req.arrived_at) return t.afterArrived;
  if (!req.en_route_at) return t.beforeEnRoute;
  return t.afterEnRoute;
}

export type CancellationKind = 'customer_cancel' | 'contractor_cancel' | 'no_show';

// One place to resolve a cancellation / no-show: compute the refund %, issue the
// Stripe refund (cents-safe), set the terminal status + refund_cents, archive the
// placeholder job, log it, and notify both parties. Idempotent via a
// compare-and-set on the current status. No lockouts/credits (deferred, per the
// agreed Phase-1 scope) — a verified no-show is refund + record + notify.
export async function resolveExtraStopCancellation(
  admin: SupabaseClient,
  accountId: string,
  requestId: string,
  opts: { kind: CancellationKind; reason?: string | null },
): Promise<{ pct: number; refundCents: number }> {
  const req = await getExtraStopRequest(admin, accountId, requestId);
  if (!req) throw new Error('Request not found.');

  const pct =
    opts.kind === 'no_show'
      ? EXTRA_STOP_REFUND_TIERS.noShow
      : opts.kind === 'contractor_cancel'
        ? EXTRA_STOP_REFUND_TIERS.contractorCancel
        : computeCustomerRefundPercent(req);

  // Issue the refund only if money was actually captured.
  let refundCents = 0;
  if (req.paid_at && req.payment_id && req.fee_cents && pct > 0) {
    refundCents = Math.round((req.fee_cents * pct) / 100);
    if (refundCents > 0) {
      try {
        await refundPayment(admin, accountId, req.payment_id, centsToDollars(refundCents));
      } catch (error) {
        console.error('Extra Stop refund failed:', error instanceof Error ? error.message : error);
        refundCents = 0; // record the intent; contractor can retry from the payment
      }
    }
  }

  const nowIso = new Date().toISOString();
  const status = opts.kind === 'no_show' ? 'no_show_confirmed' : opts.kind === 'contractor_cancel' ? 'contractor_canceled' : 'customer_canceled';
  const patch: Record<string, unknown> = { status, refund_cents: refundCents, cancel_reason: opts.reason ?? null, updated_at: nowIso };
  if (opts.kind === 'no_show') {
    patch.no_show_confirmed_at = nowIso;
    patch.no_show_reported_at = req.no_show_reported_at ?? nowIso;
  } else {
    patch.canceled_at = nowIso;
  }

  const { data: claimed } = await admin
    .from('extra_stop_requests')
    .update(patch)
    .eq('account_id', accountId)
    .eq('id', requestId)
    .eq('status', req.status)
    .select('id')
    .maybeSingle();
  if (!claimed) return { pct, refundCents }; // already resolved by a concurrent path

  // Drop the placeholder / appointment from the active calendar.
  if (req.job_id) {
    await admin.from('jobs').update({ status: 'archived' }).eq('id', req.job_id).eq('account_id', accountId);
  }

  const actor = opts.kind === 'contractor_cancel' ? 'contractor' : 'customer';
  await logExtraStopEvent(admin, accountId, requestId, { actor, from: req.status, to: status, meta: { pct, refundCents, reason: opts.reason ?? null } });

  // Notify. Customer gets a refund text; owner gets an email trail.
  const refundLabel = refundCents > 0 ? `A refund of $${centsToDollars(refundCents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} has been issued.` : 'No charge was refunded.';
  if (req.client_phone) {
    const message =
      opts.kind === 'no_show'
        ? `Sorry your Extra Stop didn’t happen. ${refundLabel}`
        : opts.kind === 'contractor_cancel'
          ? `Your Extra Stop was canceled by the contractor. ${refundLabel}`
          : `Your Extra Stop has been canceled. ${refundLabel}`;
    await sendExtraStopStatusSms({ accountId, toPhone: req.client_phone, message });
  }
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName: 'Let’s Get Quoted',
        subject: opts.kind === 'no_show' ? 'Extra Stop no-show recorded' : 'Extra Stop canceled',
        heading: opts.kind === 'no_show' ? 'A no-show was recorded' : 'An Extra Stop was canceled',
        bodyLines: [
          `${req.client_name}: ${status.replace(/_/g, ' ')}.`,
          `${refundLabel}`,
          opts.reason ? `Reason: ${opts.reason}` : 'No reason given.',
        ],
        ctaLabel: 'View Extra Stops',
        ctaUrl: `${APP_ORIGIN}/dashboard/extra-stops`,
        tone: 'warning',
      });
    }
  } catch (error) {
    console.error('Extra Stop cancel owner email failed:', error instanceof Error ? error.message : error);
  }

  return { pct, refundCents };
}
