import type { SupabaseClient } from '@supabase/supabase-js';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { processQuickStopRefunds } from '@/lib/quick-stop-refund-recovery';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
const BATCH_SIZE = 25;

export type SweepSummary = {
  paymentExpired: number; responseExpired: number; autoCompleted: number;
  interruptedOffersExpired: number; refundsCompleted: number;
  refundsPending: number; refundsNeedReview: number;
};
type SweepRow = {
  kind: 'payment_expired' | 'response_expired' | 'auto_completed';
  request_id: string; account_id: string; client_name: string;
};

/** SQL filters eligible rows before LIMIT and atomically closes each request
 * with its job, payment and audit. Each completed row leaves the next batch;
 * future or malformed rows cannot indefinitely occupy its first page.
 */
export async function sweepQuickStopOffers(admin: SupabaseClient, accountId?: string): Promise<SweepSummary> {
  const startedAt = Date.now();
  const summary: SweepSummary = {
    paymentExpired: 0, responseExpired: 0, autoCompleted: 0, interruptedOffersExpired: 0,
    refundsCompleted: 0, refundsPending: 0, refundsNeedReview: 0,
  };
  const { data: recovered, error: recoveryError } = await admin.rpc('recover_stale_quick_stop_offers', {
    p_account_id: accountId ?? null, p_limit: BATCH_SIZE,
  }).abortSignal(AbortSignal.timeout(10_000));
  if (recoveryError) throw new Error(`Quick Stop offer recovery failed: ${recoveryError.message}`);
  summary.interruptedOffersExpired = Number(recovered) || 0;

  const { data, error } = await admin.rpc('sweep_quick_stop_requests', {
    p_account_id: accountId ?? null, p_limit: BATCH_SIZE,
  }).abortSignal(AbortSignal.timeout(10_000));
  if (error) throw new Error(`Quick Stop sweep failed: ${error.message}`);
  const rows = (data ?? []) as SweepRow[];
  for (const row of rows) {
    if (row.kind === 'payment_expired') summary.paymentExpired += 1;
    else if (row.kind === 'response_expired') summary.responseExpired += 1;
    else if (row.kind === 'auto_completed') summary.autoCompleted += 1;
  }
  const refunds = await processQuickStopRefunds(admin, accountId ? 2 : 5, accountId);
  summary.refundsCompleted = refunds.completed;
  summary.refundsPending = refunds.pending;
  summary.refundsNeedReview = refunds.review;

  const ownerEmails = new Map<string, Promise<string | null>>();
  for (const row of rows.filter((r) => r.kind === 'payment_expired')) {
    if (Date.now() - startedAt >= 45_000) break;
    try {
      let emailPromise = ownerEmails.get(row.account_id);
      if (!emailPromise) {
        emailPromise = getAccountOwnerEmail(admin, row.account_id);
        ownerEmails.set(row.account_id, emailPromise);
      }
      const ownerEmail = await emailPromise;
      if (ownerEmail) await sendContractorAlertEmail({
        accountId: row.account_id, recipientEmail: ownerEmail, businessName: 'Let’s Get Quoted',
        subject: 'Quick Stop offer expired unpaid', heading: 'A Quick Stop offer expired',
        bodyLines: [
          `${row.client_name} didn’t complete payment in time, so the hold was released.`,
          'The appointment hold is closed. Any payment that settles after closure will be reconciled for refund.',
        ],
        ctaLabel: 'View Quick Stops', ctaUrl: `${APP_ORIGIN}/dashboard/quick-stops`, tone: 'info',
      });
    } catch (notificationError) {
      console.error('Quick Stop expiry email failed:', notificationError instanceof Error ? notificationError.message : notificationError);
    }
  }
  return summary;
}
