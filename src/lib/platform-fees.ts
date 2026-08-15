import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * What we earned in a window, and what we handed back in it.
 *
 * This existed twice — once in the Money page and once in the Command Center —
 * and both copies had the same bug, which is the argument for it existing once.
 *
 * THE BUG, because the fix looks like a pointless widening otherwise:
 *
 * Gross fees were summed over `status = 'paid'`. Reversals were summed over any
 * row with a `refunded_at` in the window. Those are disjoint populations, and a
 * full refund moves a row from the first to the second — `status` flips to
 * 'refunded' in the same write that sets `refunded_at` and
 * `platform_fee_refunded`. So a $1,000 charge with a $30 fee, collected and
 * fully refunded inside one window, contributed $0 to gross and −$30 to
 * reversals: net −$30, for a payment on which precisely nothing happened. Enough
 * of them and the platform's headline fee number goes negative.
 *
 * The window is now taken on the EVENT, not on the row's current status: a
 * payment counts as gross if the money arrived in this window, whatever became
 * of it afterwards. That is the cash-basis reading the labels already implied —
 * "Platform fees (30 days)" is fees charged in those 30 days, less fees returned
 * in those same 30 days. A payment collected in June and refunded in July is
 * +$30 in June and −$30 in July, and each month's number is right on its own.
 */

export type FeeRefundRow = {
  id: string;
  account_id: string;
  label: string | null;
  amount: number | null;
  refunded_amount: number | null;
  platform_fee_refunded: number | null;
  refunded_at: string | null;
};

export type FeeWindow = {
  /** Payments whose money arrived in this window, whatever their status is now. */
  paymentsProcessed: number;
  /** Fees on those payments, before anything was handed back. */
  grossFees: number;
  /** Fees Stripe returned with refunds issued in this window. */
  feesReversed: number;
  /** grossFees − feesReversed. The figure the pages headline. */
  netFees: number;
  /** Customer money returned in this window. */
  refunds: number;
  refundRows: FeeRefundRow[];
  /** Which independent source queries returned a trustworthy result. */
  availability: { payments: boolean; refunds: boolean };
};

const num = (v: unknown): number => Number(v) || 0;

/**
 * The arithmetic, given rows. Pure so the sign of the answer is testable
 * without a database — which is the whole reason the original defect survived.
 */
export function summarizeFeeWindow(
  paidRows: { platform_fee: number | null }[],
  refundRows: FeeRefundRow[],
): Omit<FeeWindow, 'refundRows' | 'availability'> {
  const grossFees = paidRows.reduce((s, r) => s + num(r.platform_fee), 0);
  const feesReversed = refundRows.reduce((s, r) => s + num(r.platform_fee_refunded), 0);
  return {
    paymentsProcessed: paidRows.length,
    grossFees,
    feesReversed,
    netFees: grossFees - feesReversed,
    refunds: refundRows.reduce((s, r) => s + num(r.refunded_amount), 0),
  };
}

/**
 * Never throws. Both callers await this inside a Promise.all beside a dozen
 * other signals, and one failed query must degrade to zeros rather than blank
 * the page — the same contract every fetcher in admin-alerts.ts keeps.
 */
export async function fetchFeeWindow(admin: SupabaseClient, startIso: string, endIso: string): Promise<FeeWindow> {
  const [paidRes, refundRes] = await Promise.all([
    // `paid_at is not null` rather than `status = 'paid'`. Every write that sets
    // paid_at sets status 'paid' in the same statement, so this is "the money
    // arrived" — and unlike the status, it stays true after a later refund or
    // chargeback moves the row on.
    admin
      .from('payments')
      .select('platform_fee')
      .is('test_marker', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', startIso)
      .lt('paid_at', endIso),
    // Windowed on refunded_at, not paid_at. Dating a refund by the day the
    // payment was collected put it in the wrong month whenever the two differed
    // — which is every refund that is not same-day.
    admin
      .from('payments')
      .select('id, account_id, label, amount, refunded_amount, platform_fee_refunded, refunded_at')
      .is('test_marker', null)
      .gt('refunded_amount', 0)
      .gte('refunded_at', startIso)
      .lt('refunded_at', endIso)
      .order('refunded_at', { ascending: false }),
  ]);
  if (paidRes.error) console.error('fetchFeeWindow (payments) failed:', paidRes.error);
  if (refundRes.error) console.error('fetchFeeWindow (refunds) failed:', refundRes.error);

  const refundRows = (refundRes.data ?? []) as FeeRefundRow[];
  return {
    ...summarizeFeeWindow((paidRes.data ?? []) as { platform_fee: number | null }[], refundRows),
    refundRows,
    availability: { payments: !paidRes.error, refunds: !refundRes.error },
  };
}
