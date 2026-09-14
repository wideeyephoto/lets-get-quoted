import type { SupabaseClient } from '@supabase/supabase-js';
import { logQuickStopEvent, type QuickStopRequest } from '@/lib/quick-stop-requests';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { DEFAULT_QUICK_STOP_TIME_ZONE } from '@/lib/quick-stop';
import { zonedInstant } from '@/lib/arrival';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export type SweepSummary = { paymentExpired: number; responseExpired: number; autoCompleted: number; offerAbandoned: number };

/**
 * One page per status bucket per run.
 *
 * Every select here was unbounded. PostgREST caps a response at its own max-rows
 * and returns the truncated page without complaint, so a busy day silently swept
 * a prefix of the work and reported that count as if it were all of it. A row
 * that misses a run is picked up by the next one — the sweep is idempotent — but
 * the cap needs to be ours and visible rather than the transport's and invisible.
 */
const SWEEP_BATCH = 500;

/** The zone each account's bare arrival date/time is written in. */
async function timeZonesFor(admin: SupabaseClient, accountIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(accountIds));
  if (unique.length === 0) return out;
  const { data } = await admin.from('accounts').select('id, timezone').in('id', unique);
  for (const row of (data ?? []) as { id: string; timezone: string | null }[]) {
    out.set(row.id, row.timezone || DEFAULT_QUICK_STOP_TIME_ZONE);
  }
  return out;
}

const AUTO_COMPLETE_GRACE_MS = 2 * 60 * 60 * 1000; // assume done 2h after the window
// How long `contractor_offer_sent` may sit with no payment attached before it is
// treated as a failed hand-off. The real path takes seconds; this is generous
// enough that a slow-but-working Stripe call is never mistaken for a dead one.
const OFFER_HANDOFF_GRACE_MS = 15 * 60 * 1000;

// Expire stale Quick Stop offers. The hard money-guard lives in
// createCheckoutSessionForPayment (a late payment is rejected regardless of this
// sweep); this cleans up the calendar placeholder, releases the day's slot,
// refuses the payment, and notifies the contractor. Runs both as a cron (global)
// and lazily on the Quick Stops dashboard (account-scoped) so an owner's view is
// always current even if the cron cadence is coarse.
export async function sweepQuickStopOffers(admin: SupabaseClient, accountId?: string): Promise<SweepSummary> {
  const nowIso = new Date().toISOString();
  const summary: SweepSummary = { paymentExpired: 0, responseExpired: 0, autoCompleted: 0, offerAbandoned: 0 };

  // 1) Payment window elapsed with no payment → expire, drop the hold, fail the
  //    pending payment, tell the contractor.
  let payQuery = admin
    .from('extra_stop_requests')
    .select('*')
    .eq('status', 'awaiting_customer_payment')
    .lt('payment_deadline_at', nowIso)
    .limit(SWEEP_BATCH);
  if (accountId) payQuery = payQuery.eq('account_id', accountId);
  const { data: payExpired } = await payQuery;

  for (const row of (payExpired ?? []) as QuickStopRequest[]) {
    // Atomic claim so a concurrent webhook confirmation always wins the race.
    const { data: claimed } = await admin
      .from('extra_stop_requests')
      .update({ status: 'offer_expired', updated_at: nowIso })
      .eq('id', row.id)
      .eq('status', 'awaiting_customer_payment')
      .select('id')
      .maybeSingle();
    if (!claimed) continue; // was paid/handled between select and update

    // Remove the tentative placeholder from the active calendar.
    if (row.job_id) {
      await admin.from('jobs').update({ status: 'archived' }).eq('id', row.job_id).eq('account_id', row.account_id);
    }
    // Refuse the pending payment (never touch a paid/refunded one).
    if (row.payment_id) {
      await admin
        .from('payments')
        .update({ status: 'failed', failed_at: nowIso })
        .eq('id', row.payment_id)
        .in('status', ['requested', 'processing']);
    }
    await logQuickStopEvent(admin, row.account_id, row.id, { actor: 'system', from: 'awaiting_customer_payment', to: 'offer_expired', meta: { reason: 'payment_window_elapsed' } });

    try {
      const ownerEmail = await getAccountOwnerEmail(admin, row.account_id);
      if (ownerEmail) {
        await sendContractorAlertEmail({
          accountId: row.account_id,
          recipientEmail: ownerEmail,
          businessName: 'Let’s Get Quoted',
          subject: 'Quick Stop offer expired unpaid',
          heading: 'A Quick Stop offer expired',
          bodyLines: [
            `${row.client_name} didn’t complete payment in time, so the hold was released.`,
            'No appointment was created and nothing was charged.',
          ],
          ctaLabel: 'View Quick Stops',
          ctaUrl: `${APP_ORIGIN}/dashboard/quick-stops`,
          tone: 'info',
        });
      }
    } catch (error) {
      console.error('Quick Stop expiry email failed:', error instanceof Error ? error.message : error);
    }
    summary.paymentExpired += 1;
  }

  // 2) Contractor never responded within their window → expire the request. No
  //    placeholder exists yet, so this is just a status close-out.
  let respQuery = admin
    .from('extra_stop_requests')
    .select('id, account_id')
    .in('status', ['awaiting_contractor', 'more_information_requested'])
    .lt('response_deadline_at', nowIso)
    .limit(SWEEP_BATCH);
  if (accountId) respQuery = respQuery.eq('account_id', accountId);
  const { data: respExpired } = await respQuery;

  for (const row of (respExpired ?? []) as { id: string; account_id: string }[]) {
    const { data: claimed } = await admin
      .from('extra_stop_requests')
      .update({ status: 'offer_expired', updated_at: nowIso })
      .eq('id', row.id)
      .in('status', ['awaiting_contractor', 'more_information_requested'])
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    await logQuickStopEvent(admin, row.account_id, row.id, { actor: 'system', to: 'offer_expired', meta: { reason: 'response_window_elapsed' } });
    summary.responseExpired += 1;
  }

  // 3) Arrival window elapsed (+2h) with no no-show reported → assume the tech
  //    made it and auto-complete (per spec: give the customer 2 hours to report,
  //    otherwise treat the visit as done). Candidate rows first, then filter by
  //    the bare date+time in JS.
  // A SUPERSET, deliberately. This bound only narrows the candidate rows; the real
  // decision is the zoned comparison below. Computing "today" in the server's zone
  // and using it as an upper bound would EXCLUDE a row whose local arrival date is
  // still today in a zone ahead of the server, so the bound is padded by a day —
  // no zone sits more than ~14h from UTC — and precision is left to zonedInstant.
  const tomorrowKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + 86_400_000));
  let doneQuery = admin
    .from('extra_stop_requests')
    .select('id, account_id, job_id, arrival_date, arrival_end, no_show_reported_at')
    .in('status', ['confirmed', 'en_route', 'arrived'])
    .lte('arrival_date', tomorrowKey)
    .limit(SWEEP_BATCH);
  if (accountId) doneQuery = doneQuery.eq('account_id', accountId);
  const { data: maybeDone } = await doneQuery;

  const doneRows = (maybeDone ?? []) as { id: string; account_id: string; job_id: string | null; arrival_date: string | null; arrival_end: string | null; no_show_reported_at: string | null }[];
  // One query for every zone involved, before the loop, rather than per row.
  const zones = await timeZonesFor(admin, doneRows.map((row) => row.account_id));

  for (const row of doneRows) {
    if (row.no_show_reported_at) continue; // a report is in play — leave it for resolution
    /* `arrival_date` + `arrival_end` are wall clock in the CONTRACTOR's zone. Read
       with `new Date(`${date}T${time}`)` they were resolved in the SERVER's zone,
       so on a UTC host this auto-completed a visit 4h early for an Eastern account
       and 7h early for a Pacific one — from `confirmed`, before the tech was even
       due to arrive, and before the customer's 2-hour no-show window had opened. */
    const end = row.arrival_date && row.arrival_end
      ? zonedInstant(row.arrival_date, row.arrival_end, zones.get(row.account_id) ?? DEFAULT_QUICK_STOP_TIME_ZONE)
      : null;
    if (!end || Date.now() < end.getTime() + AUTO_COMPLETE_GRACE_MS) continue;

    const { data: claimed } = await admin
      .from('extra_stop_requests')
      .update({ status: 'completed', completed_at: nowIso, updated_at: nowIso })
      .eq('id', row.id)
      .in('status', ['confirmed', 'en_route', 'arrived'])
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    if (row.job_id) await admin.from('jobs').update({ status: 'complete' }).eq('id', row.job_id).eq('account_id', row.account_id);
    await logQuickStopEvent(admin, row.account_id, row.id, { actor: 'system', to: 'completed', meta: { reason: 'auto_complete_after_window' } });
    summary.autoCompleted += 1;
  }

  // 4) An offer that was claimed but never reached the customer.
  //
  //    createQuickStopOfferAction claims `contractor_offer_sent`, creates the
  //    placeholder job, and only then calls sendQuickStopOffer — which creates the
  //    Stripe-backed payment and starts the clock. Nothing swept this status, so if
  //    that last call died (Stripe reachable-but-erroring, a timeout, a deploy
  //    mid-request) the row and its placeholder job were stranded permanently. And
  //    `contractor_offer_sent` counts in both QUICK_STOP_ACTIVE_STATUSES and the
  //    dashboard's DAY_OCCUPYING list, so each stranded row also ate one of the
  //    account's daily slots forever and blocked that customer's duplicate guard.
  //
  //    The action itself now rolls back in a catch; this is the backstop for the
  //    case where the process died before the catch could run. It hands the request
  //    back to the contractor rather than closing it — the lead is the valuable
  //    part — and if its response window has since passed, step 2 of a later run
  //    closes it out honestly.
  const abandonedBefore = new Date(Date.now() - OFFER_HANDOFF_GRACE_MS).toISOString();
  let abandonedQuery = admin
    .from('extra_stop_requests')
    .select('id, account_id, job_id')
    .eq('status', 'contractor_offer_sent')
    .is('payment_id', null)
    .lt('updated_at', abandonedBefore)
    .limit(SWEEP_BATCH);
  if (accountId) abandonedQuery = abandonedQuery.eq('account_id', accountId);
  const { data: abandoned } = await abandonedQuery;

  for (const row of (abandoned ?? []) as { id: string; account_id: string; job_id: string | null }[]) {
    const { data: claimed } = await admin
      .from('extra_stop_requests')
      .update({ status: 'awaiting_contractor', job_id: null, updated_at: nowIso })
      .eq('id', row.id)
      .eq('status', 'contractor_offer_sent')
      .is('payment_id', null)
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    if (row.job_id) {
      await admin.from('jobs').update({ status: 'archived' }).eq('id', row.job_id).eq('account_id', row.account_id);
    }
    await logQuickStopEvent(admin, row.account_id, row.id, {
      actor: 'system',
      from: 'contractor_offer_sent',
      to: 'awaiting_contractor',
      meta: { reason: 'offer_handoff_never_completed' },
    });
    summary.offerAbandoned += 1;
  }

  return summary;
}
