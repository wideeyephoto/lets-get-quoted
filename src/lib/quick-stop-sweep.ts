import type { SupabaseClient } from '@supabase/supabase-js';
import { logQuickStopEvent, type QuickStopRequest } from '@/lib/quick-stop-requests';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

export type SweepSummary = { paymentExpired: number; responseExpired: number; autoCompleted: number };

const AUTO_COMPLETE_GRACE_MS = 2 * 60 * 60 * 1000; // assume done 2h after the window

// Expire stale Quick Stop offers. The hard money-guard lives in
// createCheckoutSessionForPayment (a late payment is rejected regardless of this
// sweep); this cleans up the calendar placeholder, releases the day's slot,
// refuses the payment, and notifies the contractor. Runs both as a cron (global)
// and lazily on the Quick Stops dashboard (account-scoped) so an owner's view is
// always current even if the cron cadence is coarse.
export async function sweepQuickStopOffers(admin: SupabaseClient, accountId?: string): Promise<SweepSummary> {
  const nowIso = new Date().toISOString();
  const summary: SweepSummary = { paymentExpired: 0, responseExpired: 0, autoCompleted: 0 };

  // 1) Payment window elapsed with no payment → expire, drop the hold, fail the
  //    pending payment, tell the contractor.
  let payQuery = admin
    .from('extra_stop_requests')
    .select('*')
    .eq('status', 'awaiting_customer_payment')
    .lt('payment_deadline_at', nowIso);
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
    .lt('response_deadline_at', nowIso);
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
  const todayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let doneQuery = admin
    .from('extra_stop_requests')
    .select('id, account_id, job_id, arrival_date, arrival_end, no_show_reported_at')
    .in('status', ['confirmed', 'en_route', 'arrived'])
    .lte('arrival_date', todayKey);
  if (accountId) doneQuery = doneQuery.eq('account_id', accountId);
  const { data: maybeDone } = await doneQuery;

  for (const row of (maybeDone ?? []) as { id: string; account_id: string; job_id: string | null; arrival_date: string | null; arrival_end: string | null; no_show_reported_at: string | null }[]) {
    if (row.no_show_reported_at) continue; // a report is in play — leave it for resolution
    const endMs = row.arrival_date && row.arrival_end ? new Date(`${row.arrival_date}T${row.arrival_end}`).getTime() : NaN;
    if (!Number.isFinite(endMs) || Date.now() < endMs + AUTO_COMPLETE_GRACE_MS) continue;

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

  return summary;
}
