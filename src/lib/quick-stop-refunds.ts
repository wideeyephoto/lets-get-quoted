import type { SupabaseClient } from '@supabase/supabase-js';
import { refundPayment } from '@/lib/payments';
import { getQuickStopRequest, logQuickStopEvent, type QuickStopRequest } from '@/lib/quick-stop-requests';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { sendQuickStopStatusSms } from '@/lib/sms';
import { centsToDollars, quickStopNoShowLock, DEFAULT_QUICK_STOP_TIME_ZONE, type QuickStopStatus } from '@/lib/quick-stop';
import { zonedInstant } from '@/lib/arrival';
import { logAdminAction, systemActor, type AuditActor } from '@/lib/admin';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Cancellation refund tiers (percent of the Quick Stop fee). These are the spec
// defaults; kept as one constant so they're trivial to make per-account editable
// later without hunting through the logic.
export const QUICK_STOP_REFUND_TIERS = {
  withinGraceMinutes: 5, // within N min of payment → full refund
  grace: 100,
  beforeEnRoute: 75,
  afterEnRoute: 25, // en route but not yet arrived
  afterArrived: 0,
  contractorMissedWindow: 100, // fixed by policy (contractor fault)
  contractorCancel: 100, // fixed by policy
  noShow: 100, // fixed by policy
};

export type RefundTiers = typeof QUICK_STOP_REFUND_TIERS;

const pct = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
};

// Merge a per-account override object onto the defaults. Only the customer-cancel
// tiers are configurable; the contractor-fault tiers stay fixed at 100%.
export function mergeRefundTiers(stored: unknown): RefundTiers {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const graceMins = Math.round(Number(s.withinGraceMinutes));
  return {
    ...QUICK_STOP_REFUND_TIERS,
    withinGraceMinutes: Number.isFinite(graceMins) ? Math.min(120, Math.max(0, graceMins)) : QUICK_STOP_REFUND_TIERS.withinGraceMinutes,
    grace: pct(s.grace, QUICK_STOP_REFUND_TIERS.grace),
    beforeEnRoute: pct(s.beforeEnRoute, QUICK_STOP_REFUND_TIERS.beforeEnRoute),
    afterEnRoute: pct(s.afterEnRoute, QUICK_STOP_REFUND_TIERS.afterEnRoute),
    afterArrived: pct(s.afterArrived, QUICK_STOP_REFUND_TIERS.afterArrived),
  };
}

// Load an account's refund tiers. Defensive: a missing column (pre-migration) or
// a read error degrades to the built-in defaults rather than throwing.
export async function loadRefundTiers(admin: SupabaseClient, accountId: string): Promise<RefundTiers> {
  const { data, error } = await admin.from('accounts').select('extra_stop_refund_tiers').eq('id', accountId).maybeSingle();
  if (error) return { ...QUICK_STOP_REFUND_TIERS };
  return mergeRefundTiers((data as { extra_stop_refund_tiers?: unknown } | null)?.extra_stop_refund_tiers);
}

/**
 * The two account facts resolving a cancellation needs, read in one trip: the
 * refund tiers, and the zone the arrival window's bare date/time are written in.
 *
 * Together on purpose. loadRefundTiers already existed and the tier maths already
 * worked; what was missing was the zone, and a caller that remembers the tiers but
 * forgets the zone is exactly how the missed-window tier came to fire hours early.
 * Asking for them as a pair removes the chance to fetch half of what you need.
 */
export async function loadRefundContext(
  admin: SupabaseClient,
  accountId: string,
): Promise<{ tiers: RefundTiers; timeZone: string }> {
  const { data, error } = await admin
    .from('accounts')
    .select('extra_stop_refund_tiers, timezone')
    .eq('id', accountId)
    .maybeSingle();
  if (error) return { tiers: { ...QUICK_STOP_REFUND_TIERS }, timeZone: DEFAULT_QUICK_STOP_TIME_ZONE };
  const row = data as { extra_stop_refund_tiers?: unknown; timezone?: string | null } | null;
  return {
    tiers: mergeRefundTiers(row?.extra_stop_refund_tiers),
    timeZone: row?.timezone || DEFAULT_QUICK_STOP_TIME_ZONE,
  };
}

// How much of a CUSTOMER-initiated cancellation is refundable, by timeline.
//
// `timeZone` IS NOT OPTIONAL, and that is the point. `arrival_date` is a bare
// date and `arrival_end` a bare time — wall clock in the CONTRACTOR's zone (see
// the extra_stop_requests comment in schema.sql). This function used to resolve
// them with `new Date(`${date}T${time}`)`, which reads them in the SERVER's
// zone: on a UTC host a 3 PM window for an America/New_York account ended at
// 15:00Z instead of 19:00Z, so the contractorMissedWindow tier — a 100% refund
// — was handed out four hours (seven, on the west coast) before the contractor's
// window had actually run out.
// `timeZone` leads the signature so that it cannot be defaulted and cannot be
// forgotten: every existing call site became a compile error when it moved here,
// which is the only reliable way to keep a zone-sensitive comparison honest.
export function computeCustomerRefundPercent(
  req: QuickStopRequest,
  timeZone: string,
  now = Date.now(),
  tiers: RefundTiers = QUICK_STOP_REFUND_TIERS,
): number {
  const t = tiers;
  if (!req.paid_at) return 100; // nothing captured yet — full (no-op) refund
  if (now - new Date(req.paid_at).getTime() <= t.withinGraceMinutes * 60_000) return t.grace;
  // Contractor blew the arrival window without arriving → full refund.
  if (req.arrival_date && req.arrival_end && !req.arrived_at) {
    const end = zonedInstant(req.arrival_date, req.arrival_end, timeZone);
    if (end && now > end.getTime()) return t.contractorMissedWindow;
  }
  // Check arrival BEFORE en-route: a tech can mark "arrived" straight from
  // confirmed (skipping en_route), and an arrived visit is always the 0% tier.
  if (req.arrived_at) return t.afterArrived;
  if (!req.en_route_at) return t.beforeEnRoute;
  return t.afterEnRoute;
}

export type CancellationKind = 'customer_cancel' | 'contractor_cancel' | 'no_show';

/**
 * WHICH STATUSES EACH RESOLUTION MAY ACT ON.
 *
 * There was no such check. Two of the three callers guard their own status before
 * calling (the customer's cancel link and their no-show report); the third, the
 * admin console's resolve dropdown, guards nothing — so staff could record a
 * no-show against a request that had been declined, had expired unpaid, or was
 * already refunded. No money moved on those, because nothing had been captured,
 * but the escalating account lock further down fired regardless, and three of
 * those reach the tier-3 lock: 3650 days, "pending staff review".
 */
export const RESOLVABLE_FROM: Record<CancellationKind, QuickStopStatus[]> = {
  customer_cancel: ['awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'],
  contractor_cancel: ['contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'],
  // `completed` belongs here and the others do not. The sweep auto-completes on an
  // ASSUMPTION — the window elapsed and nobody reported anything — not on proof of
  // arrival, so staff must still be able to record a no-show against one. A request
  // that never reached `confirmed` never became a visit, so it cannot be missed.
  no_show: ['confirmed', 'en_route', 'completed'],
};

// One place to resolve a cancellation / no-show: compute the refund %, issue the
// Stripe refund (cents-safe), set the terminal status + refund_cents, archive the
// placeholder job, log it, and notify both parties. Idempotent via a
// compare-and-set on the current status. No lockouts/credits (deferred, per the
// agreed Phase-1 scope) — a verified no-show is refund + record + notify.
export async function resolveQuickStopCancellation(
  admin: SupabaseClient,
  accountId: string,
  requestId: string,
  // `actor` attributes the no-show lock below. It defaults to systemActor()
  // because two of the three callers genuinely are the system — the sweep and
  // the customer's own cancel link — but the admin console is a person, and
  // recording their enforcement action as 'system' hid it from every review
  // that reads the audit log by staff member or by permission.
  opts: { kind: CancellationKind; reason?: string | null; actor?: AuditActor },
): Promise<{ pct: number; refundCents: number; refundFailed: boolean }> {
  const req = await getQuickStopRequest(admin, accountId, requestId);
  if (!req) throw new Error('Request not found.');

  const allowed = RESOLVABLE_FROM[opts.kind];
  if (!allowed.includes(req.status as QuickStopStatus)) {
    throw new Error(
      `A ${opts.kind.replace(/_/g, ' ')} can't be recorded against a request that is ${req.status.replace(/_/g, ' ')}.`,
    );
  }

  const { tiers, timeZone } = await loadRefundContext(admin, accountId);
  const refundPct =
    opts.kind === 'no_show'
      ? tiers.noShow
      : opts.kind === 'contractor_cancel'
        ? tiers.contractorCancel
        : computeCustomerRefundPercent(req, timeZone, Date.now(), tiers);

  // Compute the intended refund up front, but DON'T move money yet.
  const intendedRefundCents =
    req.paid_at && req.payment_id && req.fee_cents && refundPct > 0 ? Math.round((req.fee_cents * refundPct) / 100) : 0;

  const nowIso = new Date().toISOString();
  const status = opts.kind === 'no_show' ? 'no_show_confirmed' : opts.kind === 'contractor_cancel' ? 'contractor_canceled' : 'customer_canceled';
  const patch: Record<string, unknown> = { status, refund_cents: intendedRefundCents, cancel_reason: opts.reason ?? null, updated_at: nowIso };
  if (opts.kind === 'no_show') {
    patch.no_show_confirmed_at = nowIso;
    patch.no_show_reported_at = req.no_show_reported_at ?? nowIso;
  } else {
    patch.canceled_at = nowIso;
  }

  // Claim the terminal transition FIRST — only the winner moves money, so two
  // concurrent resolutions (customer-cancel racing admin-resolve, or a double
  // submit) can't both issue a refund.
  const { data: claimed } = await admin
    .from('extra_stop_requests')
    .update(patch)
    .eq('account_id', accountId)
    .eq('id', requestId)
    .eq('status', req.status)
    .select('id')
    .maybeSingle();
  if (!claimed) return { pct: refundPct, refundCents: intendedRefundCents, refundFailed: false }; // already resolved by a concurrent path

  // Winner issues the refund (refundPayment is itself idempotency-keyed). On
  // failure, correct the recorded amount back to 0 so the row never claims money
  // that didn't move — the contractor can retry from the payment.
  let refundCents = intendedRefundCents;
  let refundFailed = false;
  if (intendedRefundCents > 0 && req.payment_id) {
    try {
      await refundPayment(admin, accountId, req.payment_id, centsToDollars(intendedRefundCents));
    } catch (error) {
      console.error('Quick Stop refund failed:', error instanceof Error ? error.message : error);
      refundCents = 0;
      // Zeroing the column is right — the row must never claim money that didn't
      // move — but the zero on its own is indistinguishable from "nothing was
      // owed", and every sentence downstream read it that way. The flag carries
      // the difference the column cannot.
      refundFailed = true;
      await admin.from('extra_stop_requests').update({ refund_cents: 0 }).eq('id', requestId).eq('account_id', accountId);
    }
  }

  // No-show escalation: auto-lock Quick Stop on a verified no-show, escalating by
  // how many the account has had recently (10-day → 30-day → disabled pending
  // review). Staff can clear it from the admin console.
  //
  // This writes the same two columns as lockQuickStopAction, which the console
  // gates on account.enforce — so when a staff member drove it, the audit row
  // has to name them. Attributed to `opts.actor` when there is one, and to the
  // system only when the system really did it.
  // AND ONLY WHEN THE CUSTOMER ACTUALLY PAID. The status allowlist above already
  // implies it — `confirmed` is only reachable through a successful charge — but
  // the admin console can force a request to `completed` from any status at all,
  // which puts an unpaid request back inside the allowlist. Checked against the
  // money rather than inferred from the lifecycle, because it is the money that
  // makes a missed visit worth locking an account over.
  if (opts.kind === 'no_show' && req.paid_at) {
    const { data: priors } = await admin
      .from('extra_stop_requests')
      .select('no_show_confirmed_at')
      .eq('account_id', accountId)
      .eq('status', 'no_show_confirmed')
      .neq('id', requestId)
      .not('no_show_confirmed_at', 'is', null);
    const priorDates = (priors ?? [])
      .map((r) => new Date(String((r as { no_show_confirmed_at: string }).no_show_confirmed_at)))
      .filter((d) => !Number.isNaN(d.getTime()));
    const lock = quickStopNoShowLock(priorDates);
    await admin.from('accounts').update({ extra_stop_locked_until: lock.untilIso, extra_stop_lock_reason: lock.reason }).eq('id', accountId);
    await logAdminAction(admin, opts.actor ?? systemActor(), {
      action: 'extra_stop_auto_lock',
      accountId,
      targetType: 'account',
      targetId: accountId,
      meta: { tier: lock.tier, until: lock.untilIso, reason: lock.reason, requestId, priorNoShows: priorDates.length },
    });
  }

  // Drop the placeholder / appointment from the active calendar.
  if (req.job_id) {
    await admin.from('jobs').update({ status: 'archived' }).eq('id', req.job_id).eq('account_id', accountId);
  }

  const actor = opts.kind === 'contractor_cancel' ? 'contractor' : 'customer';
  await logQuickStopEvent(admin, accountId, requestId, {
    actor,
    from: req.status,
    to: status,
    // intendedRefundCents as well as refundCents: when they disagree the event log
    // is the only durable record of what is still owed, so it has to carry both.
    meta: { pct: refundPct, refundCents, intendedRefundCents, refundFailed, reason: opts.reason ?? null },
  });

  // Notify. Customer gets a refund text; owner gets an email trail.
  const money = (cents: number) =>
    `$${centsToDollars(cents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  /* THIS SENTENCE USED TO CONTRADICT THE FACTS. It read refundCents, which the
     catch above resets to 0 on a Stripe failure — so somebody who cancelled inside
     the grace window, owed every cent back, was texted "No charge was refunded."
     A failed refund is money still owed and it now says so, to the customer and to
     the owner, instead of being a console.error nobody reads. */
  const refundLabel = refundFailed
    ? `Your refund of ${money(intendedRefundCents)} didn't complete on the first attempt — we're finishing it by hand and will confirm once it lands.`
    : refundCents > 0
      ? `A refund of ${money(refundCents)} has been issued.`
      : 'No charge was refunded.';
  if (req.client_phone) {
    const message =
      opts.kind === 'no_show'
        ? `Sorry your Quick Stop didn’t happen. ${refundLabel}`
        : opts.kind === 'contractor_cancel'
          ? `Your Quick Stop was canceled by the contractor. ${refundLabel}`
          : `Your Quick Stop has been canceled. ${refundLabel}`;
    await sendQuickStopStatusSms({
      accountId,
      toPhone: req.client_phone,
      message,
      idempotencyKey: `quick-stop:${requestId}:refund:${status}`,
    });
  }
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        accountId,
        recipientEmail: ownerEmail,
        businessName: 'Let’s Get Quoted',
        subject: refundFailed
          ? 'Action needed: Quick Stop refund failed'
          : opts.kind === 'no_show'
            ? 'Quick Stop no-show recorded'
            : 'Quick Stop canceled',
        heading: refundFailed
          ? 'A Quick Stop refund did not go through'
          : opts.kind === 'no_show'
            ? 'A no-show was recorded'
            : 'A Quick Stop was canceled',
        bodyLines: [
          `${req.client_name}: ${status.replace(/_/g, ' ')}.`,
          refundFailed
            ? `The ${money(intendedRefundCents)} refund was declined by Stripe and has NOT been sent. Retry it from the payment — the customer has been told it is still coming.`
            : `${refundLabel}`,
          opts.reason ? `Reason: ${opts.reason}` : 'No reason given.',
        ],
        // /dashboard/payments is a single ledger screen — there is no per-payment
        // route to deep-link to, so this points at the ledger rather than at a 404.
        ctaLabel: refundFailed ? 'Open the payments ledger' : 'View Quick Stops',
        ctaUrl: refundFailed ? `${APP_ORIGIN}/dashboard/payments` : `${APP_ORIGIN}/dashboard/quick-stops`,
        tone: 'warning',
      });
    }
  } catch (error) {
    console.error('Quick Stop cancel owner email failed:', error instanceof Error ? error.message : error);
  }

  return { pct: refundPct, refundCents, refundFailed };
}
