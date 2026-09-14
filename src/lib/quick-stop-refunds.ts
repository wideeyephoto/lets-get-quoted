import type { SupabaseClient } from '@supabase/supabase-js';
import { processQuickStopRefunds } from '@/lib/quick-stop-refund-recovery';
import { loadQuickStopTimeZone, quickStopWindowEndMs, quickStopNoShowEligibility } from '@/lib/quick-stop-time';
import { getQuickStopRequest, logQuickStopEvent, type QuickStopRequest } from '@/lib/quick-stop-requests';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { sendQuickStopStatusSms } from '@/lib/sms';
import { centsToDollars, type QuickStopStatus } from '@/lib/quick-stop';
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

// How much of a CUSTOMER-initiated cancellation is refundable, by timeline.
//
// `timeZone` IS NOT OPTIONAL, and that is the point. `arrival_date` is a bare
// date and `arrival_end` a bare time — wall clock in the CONTRACTOR's zone. A
// default here reads them in whatever zone the caller forgot to think about: on
// a UTC host a 3 PM window for an America/New_York account ends at 15:00Z
// instead of 19:00Z, handing out the contractorMissedWindow tier — a 100% refund
// — four hours (seven, on the west coast) before the window had actually run
// out. It leads the signature so it cannot be defaulted and cannot be skipped
// past: every call site becomes a compile error rather than a quiet wrong answer.
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
    const endMs = quickStopWindowEndMs(req, timeZone);
    if (endMs === null) throw new Error('The Quick Stop arrival window or time zone is invalid.');
    if (now > endMs) return t.contractorMissedWindow;
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
 * A MIRROR, NOT THE GATE. cancel_quick_stop_request enforces these same three
 * allowlists inside the cancellation transaction, and that is the copy that is
 * authoritative — it holds the row lock, so it is the only one that can be right
 * under concurrency. This exists for two reasons the SQL cannot serve: it fails a
 * bad request fast with a sentence naming the status, instead of a round trip
 * ending in a raw `raise exception`; and it lets the guard be pinned against
 * QUICK_STOP_TRANSITIONS by a test, so the table and the rule that implements it
 * cannot drift apart unnoticed. Keep it in step with the migration.
 *
 * The admin console's resolve dropdown is the one caller that guards nothing of
 * its own, which is how staff could aim a no-show at a request that had been
 * declined, had expired unpaid, or was already refunded — no money moved, but the
 * escalating account lock fired regardless, and its third tier is 3650 days.
 *
 * `completed` belongs under no_show and the closed statuses do not: the sweep
 * auto-completes on an ASSUMPTION — the window elapsed and nobody reported
 * anything — not on proof of arrival, so staff must still be able to record a
 * no-show against one. A request that never reached `confirmed` never became a
 * visit, so it cannot have been missed.
 */
export const RESOLVABLE_FROM: Record<CancellationKind, QuickStopStatus[]> = {
  customer_cancel: ['awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'],
  contractor_cancel: ['contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'],
  no_show: ['confirmed', 'en_route', 'completed', 'disputed', 'no_show_reported'],
};

// Atomically cancel the booking and preserve its refund obligation, then attempt
// the durable refund and notify both parties. Verified contractor no-shows apply
// the documented escalating lock inside the cancellation transaction.
export async function resolveQuickStopCancellation(
  admin: SupabaseClient,
  accountId: string,
  requestId: string,
  // `actor` attributes the no-show lock below. It defaults to systemActor()
  // because two of the three callers genuinely are the system — the sweep and
  // the customer's own cancel link — but the admin console is a person, and
  // recording their enforcement action as 'system' hid it from every review
  // that reads the audit log by staff member or by permission.
  opts: { kind: CancellationKind; reason?: string | null; actor?: AuditActor; requireReportingWindow?: boolean },
): Promise<{ pct: number; refundCents: number; refundPending: boolean }> {
  const req = await getQuickStopRequest(admin, accountId, requestId);
  if (!req) throw new Error('Request not found.');

  const status = opts.kind === 'no_show' ? 'no_show_confirmed' : opts.kind === 'contractor_cancel' ? 'contractor_canceled' : 'customer_canceled';
  if (req.status === status) {
    return { pct: 0, refundCents: req.refund_cents ?? 0, refundPending: Boolean(req.refund_due_cents && req.refund_state !== 'completed') };
  }
  if (!RESOLVABLE_FROM[opts.kind].includes(req.status as QuickStopStatus)) {
    throw new Error(
      `A ${opts.kind.replace(/_/g, ' ')} can't be recorded against a request that is ${req.status.replace(/_/g, ' ')}.`,
    );
  }
  const timeZone = await loadQuickStopTimeZone(admin, accountId);
  if (!timeZone) throw new Error('The account time zone could not be verified.');
  if (opts.kind === 'no_show' && opts.requireReportingWindow && quickStopNoShowEligibility(req, timeZone) !== 'eligible') {
    throw new Error('This Quick Stop cannot be reported as a no-show at this time.');
  }
  const tiers = await loadRefundTiers(admin, accountId);
  const refundPct = opts.kind === 'no_show' ? tiers.noShow : opts.kind === 'contractor_cancel'
    ? tiers.contractorCancel : computeCustomerRefundPercent(req, timeZone, Date.now(), tiers);
  // Booking transition, evidence checks, calendar archival, and refund intent
  // commit together. An application crash cannot lose the financial obligation.
  const { data: claimed, error: claimError } = await admin.rpc('cancel_quick_stop_request', {
    p_account_id: accountId, p_request_id: requestId, p_expected_status: req.status,
    p_kind: opts.kind, p_refund_pct: refundPct, p_reason: opts.reason ?? null,
    p_require_reporting_window: opts.requireReportingWindow ?? false,
  });
  if (claimError) throw new Error(claimError.message);
  if (!claimed) {
    const current = await getQuickStopRequest(admin, accountId, requestId);
    if (current?.status !== status) throw new Error('The Quick Stop changed before the cancellation was applied. Refresh and try again.');
    return { pct: refundPct, refundCents: current.refund_cents ?? 0,
      refundPending: (current.refund_due_cents ?? 0) > (current.refund_cents ?? 0) };
  }

  // SQL has already applied enforcement atomically and saved its immutable
  // outcome. Only the winning cancellation writes this actor-attributed audit;
  // retries cannot extend a lock or replace a stronger manual suspension.
  if (opts.kind === 'no_show') {
    const { data: enforcement, error: enforcementError } = await admin
      .from('quick_stop_no_show_enforcements')
      .select('result')
      .eq('account_id', accountId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (enforcementError || !enforcement?.result) {
      console.error('Quick Stop enforcement audit result unavailable:', enforcementError?.message ?? 'missing result');
    } else {
      const lock = enforcement.result as { tier: number; untilIso: string | null; reason: string | null; priorNoShows: number; changed: boolean };
      if (lock.changed) await logAdminAction(admin, opts.actor ?? systemActor(), {
        action: 'extra_stop_auto_lock', accountId, targetType: 'account', targetId: accountId,
        meta: { tier: lock.tier, until: lock.untilIso, reason: lock.reason, requestId, priorNoShows: lock.priorNoShows },
      });
    }
  }

  try {
    await processQuickStopRefunds(admin, 1, accountId, requestId);
  } catch (error) {
    console.error('Quick Stop refund queued for recovery:', error instanceof Error ? error.message : error);
  }
  const refreshed = await getQuickStopRequest(admin, accountId, requestId);
  const refundCents = refreshed?.refund_cents ?? req.refund_cents ?? 0;
  // A failed refresh is uncertainty, not proof that no refund is owed.
  const intendedCents = req.payment_id ? Math.round((req.fee_cents ?? 0) * (req.paid_at ? refundPct : 100) / 100) : 0;
  const refundPending = (refreshed?.refund_due_cents ?? intendedCents) > refundCents;

  const actor = opts.kind === 'contractor_cancel' ? 'contractor' : 'customer';
  await logQuickStopEvent(admin, accountId, requestId, { actor, from: req.status, to: status, meta: { pct: refundPct, refundCents, refundPending, reason: opts.reason ?? null } });

  // Notify. Customer gets a refund text; owner gets an email trail.
  const refundLabel = refundPending
    ? !req.paid_at && !(refreshed?.paid_at)
      ? 'Any payment that completes for this canceled visit will be refunded.'
      : 'Your refund is pending. We are tracking it and will confirm when it has been issued.'
    : refundCents > 0 ? `A refund of $${centsToDollars(refundCents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} has been issued.` : 'No charge was refunded.';
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
        subject: opts.kind === 'no_show' ? 'Quick Stop no-show recorded' : 'Quick Stop canceled',
        heading: opts.kind === 'no_show' ? 'A no-show was recorded' : 'A Quick Stop was canceled',
        bodyLines: [
          `${req.client_name}: ${status.replace(/_/g, ' ')}.`,
          `${refundLabel}`,
          opts.reason ? `Reason: ${opts.reason}` : 'No reason given.',
        ],
        ctaLabel: 'View Quick Stops',
        ctaUrl: `${APP_ORIGIN}/dashboard/quick-stops`,
        tone: 'warning',
      });
    }
  } catch (error) {
    console.error('Quick Stop cancel owner email failed:', error instanceof Error ? error.message : error);
  }

  return { pct: refundPct, refundCents, refundPending };
}
