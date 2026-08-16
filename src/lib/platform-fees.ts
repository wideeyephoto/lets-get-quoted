import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingPaymentChargeModelColumnError } from '@/lib/payments';

/**
 * Cash-basis LGQ fee reporting across both payment rails.
 *
 * Destination-charge rows keep their historical treatment: recognize the fee
 * when the payment is collected (`paid_at`). A direct charge is different. The
 * amount stored in `platform_fee` is only the fee we expected to collect until
 * Stripe evidence has been reconciled, so it is recognized only when the row
 * is explicitly `reconciled` and is dated by `reconciled_at`.
 *
 * Refund reversals are still cash events of their own and remain dated by
 * `refunded_at`. That makes a refund issued in July a July reversal even when
 * the original fee was recognized in June.
 */

export type FeePaymentRow = {
  platform_fee: number | null;
  // Absent means the database predates the direct-charge schema and is a real
  // legacy destination row. Explicit unknown values must fail closed.
  charge_model?: unknown;
  reconciliation_status?: unknown;
  reconciled_at?: string | null;
};

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
  /** Reconciled/legacy-recognized fees before reversals. */
  grossFees: number;
  /** Fees Stripe returned with refunds issued in this window. */
  feesReversed: number;
  /** grossFees - feesReversed. */
  netFees: number;
  /** Customer money returned in this window. */
  refunds: number;
  refundRows: FeeRefundRow[];
  /** Independent query health. A missing source is never presented as zero. */
  availability: { payments: boolean; fees: boolean; refunds: boolean };
};

const num = (value: unknown): number => Number(value) || 0;
const owns = (row: object, key: string): boolean => Object.prototype.hasOwnProperty.call(row, key);

/** Whether a paid-at row contributes a legacy/destination fee. */
export function isLegacyRecognizedFee(row: FeePaymentRow): boolean {
  return !owns(row, 'charge_model') || row.charge_model === 'destination';
}

/**
 * Whether a reconciled-at row contributes a direct fee. The timestamp is part
 * of the recognition evidence, not optional display metadata.
 */
export function isReconciledDirectFee(row: FeePaymentRow): boolean {
  return row.charge_model === 'direct'
    && row.reconciliation_status === 'reconciled'
    && typeof row.reconciled_at === 'string'
    && row.reconciled_at.length > 0;
}

/**
 * Pure arithmetic. `paidRows` defines the processed-payment count and carries
 * legacy/destination fees dated by paid_at. `reconciledDirectRows` is queried
 * separately by reconciled_at, so a direct fee is never accidentally dated by
 * collection time.
 */
export function summarizeFeeWindow(
  paidRows: FeePaymentRow[],
  refundRows: FeeRefundRow[],
  reconciledDirectRows: FeePaymentRow[] = [],
): Omit<FeeWindow, 'refundRows' | 'availability'> {
  const legacyFees = paidRows.reduce(
    (sum, row) => sum + (isLegacyRecognizedFee(row) ? num(row.platform_fee) : 0),
    0,
  );
  const directFees = reconciledDirectRows.reduce(
    (sum, row) => sum + (isReconciledDirectFee(row) ? num(row.platform_fee) : 0),
    0,
  );
  const grossFees = legacyFees + directFees;
  const feesReversed = refundRows.reduce((sum, row) => sum + num(row.platform_fee_refunded), 0);
  return {
    paymentsProcessed: paidRows.length,
    grossFees,
    feesReversed,
    netFees: grossFees - feesReversed,
    refunds: refundRows.reduce((sum, row) => sum + num(row.refunded_amount), 0),
  };
}

const REPORTING_COLUMNS = 'platform_fee, charge_model, reconciliation_status, reconciled_at';
const CHARGE_MODEL_COLUMNS = 'platform_fee, charge_model';

/**
 * Never throws. App code can deploy before the pricing migration: both
 * direct-aware reads then return PostgREST's missing-column error and we retry
 * the exact legacy paid-at query. An unrelated error, or a partially available
 * direct schema, fails closed instead of treating explicit direct rows as
 * legacy revenue.
 */
export async function fetchFeeWindow(admin: SupabaseClient, startIso: string, endIso: string): Promise<FeeWindow> {
  const [paidAwareRes, directRes, refundRes] = await Promise.all([
    admin
      .from('payments')
      .select(REPORTING_COLUMNS)
      .is('test_marker', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', startIso)
      .lt('paid_at', endIso),
    admin
      .from('payments')
      .select(REPORTING_COLUMNS)
      .is('test_marker', null)
      .eq('charge_model', 'direct')
      .eq('reconciliation_status', 'reconciled')
      .not('reconciled_at', 'is', null)
      .gte('reconciled_at', startIso)
      .lt('reconciled_at', endIso),
    admin
      .from('payments')
      .select('id, account_id, label, amount, refunded_amount, platform_fee_refunded, refunded_at')
      .is('test_marker', null)
      .gt('refunded_amount', 0)
      .gte('refunded_at', startIso)
      .lt('refunded_at', endIso)
      .order('refunded_at', { ascending: false }),
  ]);

  let paidRows = (paidAwareRes.data ?? []) as FeePaymentRow[];
  let directRows = (directRes.data ?? []) as FeePaymentRow[];
  let paymentsAvailable = !paidAwareRes.error;
  let feesAvailable = !paidAwareRes.error && !directRes.error;

  const reportingColumnsMissing = isMissingPaymentChargeModelColumnError(paidAwareRes.error)
    && isMissingPaymentChargeModelColumnError(directRes.error);
  if (reportingColumnsMissing) {
    // Always probe the discriminator itself. A code-only missing-column error
    // cannot prove that charge_model is absent, and dropping it without this
    // read would turn direct expectations into legacy recognized revenue.
    const chargeModelRes = await admin
      .from('payments')
      .select(CHARGE_MODEL_COLUMNS)
      .is('test_marker', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', startIso)
      .lt('paid_at', endIso);

    if (!chargeModelRes.error) {
      // This is a partial direct schema, not the pre-migration schema. The
      // processed count and legacy rows are safe, but reconciled direct fees
      // remain unavailable until every reporting column exists.
      paidRows = (chargeModelRes.data ?? []) as FeePaymentRow[];
      directRows = [];
      paymentsAvailable = true;
      feesAvailable = false;
    } else if (isMissingPaymentChargeModelColumnError(chargeModelRes.error)) {
      const legacyRes = await admin
        .from('payments')
        .select('platform_fee')
        .is('test_marker', null)
        .not('paid_at', 'is', null)
        .gte('paid_at', startIso)
        .lt('paid_at', endIso);
      if (legacyRes.error) console.error('fetchFeeWindow (legacy payments) failed:', legacyRes.error);
      paidRows = (legacyRes.data ?? []) as FeePaymentRow[];
      directRows = [];
      paymentsAvailable = !legacyRes.error;
      feesAvailable = !legacyRes.error;
    } else {
      console.error('fetchFeeWindow (charge model probe) failed:', chargeModelRes.error);
      paidRows = [];
      directRows = [];
      paymentsAvailable = false;
      feesAvailable = false;
    }
  } else {
    if (paidAwareRes.error) console.error('fetchFeeWindow (processed payments) failed:', paidAwareRes.error);
    if (directRes.error) console.error('fetchFeeWindow (direct fee reconciliation) failed:', directRes.error);
  }
  if (refundRes.error) console.error('fetchFeeWindow (refunds) failed:', refundRes.error);

  const refundRows = (refundRes.data ?? []) as FeeRefundRow[];
  return {
    ...summarizeFeeWindow(paidRows, refundRows, directRows),
    refundRows,
    availability: {
      payments: paymentsAvailable,
      fees: feesAvailable,
      refunds: !refundRes.error,
    },
  };
}
