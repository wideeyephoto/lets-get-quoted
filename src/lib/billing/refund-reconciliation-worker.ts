import 'server-only';

import { createAdminClient } from '@/lib/auth';
import { retrieveApplicationFee, retrieveDirectCharge } from '@/lib/billing/stripe-direct';

/**
 * DARK server-only worker: give a refunded payment its reconciliation back.
 *
 * WHY IT HAS TO EXIST. The refund gate requires `reconciliation_status =
 * 'reconciled'`, every refund sets it to `pending`, and the only thing that has
 * ever written `reconciled` runs on `checkout.session.completed` and never fires
 * again. So without this, the first refund permanently blocks every later one —
 * and a transient failure during the original projection makes a payment that
 * was never refunded at all permanently unrefundable.
 *
 * A SWEEP, NOT A WEBHOOK, for the reason the capacity lifecycle gives: refunds
 * arrive out of order and are redelivered, and a reconciliation computed from a
 * late event would compare the ledger against a stale snapshot. A sweep asks
 * Stripe what is true NOW, so the freshest read always wins.
 *
 * IT NEVER DECIDES ANYTHING. Stripe's figures go to `reconcile_direct_payment`,
 * which compares them with the ledger under a row lock and writes `reconciled`
 * or `mismatch`. Deciding here would mean reading the ledger unlocked and acting
 * on it later, which is how two workers disagree about one payment.
 *
 * TWO READS PER PAYMENT, one on the connected account for the charge and one on
 * the platform for the Application Fee — they are different objects owned by
 * different accounts, and that asymmetry is the whole reason the fee refund is
 * a separate call in the first place.
 */

export const REFUND_RECONCILIATION_WORKER_FLAG = 'LGQ_REFUND_RECONCILIATION_ENABLED';
export const REFUND_RECONCILIATION_BATCH_SIZE = 50;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function refundReconciliationWorkerEnabled(env: ServerEnvironment = process.env): boolean {
  return env[REFUND_RECONCILIATION_WORKER_FLAG] === '1';
}

export type RefundReconciliationSummary = Readonly<{
  examined: number;
  reconciled: number;
  /** Books and Stripe disagree. Stays unrefundable, and wants a human. */
  mismatched: number;
  disputed: number;
  /** Stripe could not be read. Retried next sweep; nothing was decided. */
  providerErrors: number;
  failures: number;
  batchSize: number;
  truncated: boolean;
}>;

type PendingRow = {
  payment_id: string;
  stripe_account_id: string | null;
  stripe_charge_id: string | null;
  stripe_application_fee_id: string | null;
};

/** Stripe reports money in the smallest currency unit already. */
function cents(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export async function runRefundReconciliationSweep(
  options: Readonly<{ batchSize?: number }> = {},
): Promise<RefundReconciliationSummary> {
  const batchSize = options.batchSize ?? REFUND_RECONCILIATION_BATCH_SIZE;
  const admin = createAdminClient();

  let examined = 0;
  let reconciled = 0;
  let mismatched = 0;
  let disputed = 0;
  let providerErrors = 0;
  let failures = 0;

  const { data, error } = await admin.rpc('direct_payments_pending_reconciliation', {
    p_limit: batchSize,
  });

  if (error || !Array.isArray(data)) {
    if (error) console.error('refund reconciliation work list failed:', error);
    return Object.freeze({
      examined: 0, reconciled: 0, mismatched: 0, disputed: 0,
      providerErrors: 0, failures: error ? 1 : 0, batchSize, truncated: false,
    });
  }

  for (const raw of data as PendingRow[]) {
    examined += 1;
    const { payment_id: paymentId } = raw;
    const account = raw.stripe_account_id;
    const chargeId = raw.stripe_charge_id;

    if (!account || !chargeId) {
      // The work list already filters these out, so reaching here means the row
      // changed underneath. Counted rather than skipped silently.
      failures += 1;
      continue;
    }

    try {
      const charge = await retrieveDirectCharge({ merchantAccountId: account, chargeId });

      // The fee is a separate object on a separate account. A payment with no
      // fee id has no fee to have refunded, which is zero rather than unknown.
      let feeRefunded = 0;
      if (raw.stripe_application_fee_id) {
        const fee = await retrieveApplicationFee({
          applicationFeeId: raw.stripe_application_fee_id,
        });
        feeRefunded = cents(fee.amount_refunded) ?? 0;
      }

      const grossRefunded = cents(charge.amount_refunded);
      if (grossRefunded === null) {
        // Stripe answered without the number this exists to compare. Deciding
        // anything from that would be deciding from nothing.
        providerErrors += 1;
        continue;
      }

      const { data: verdict, error: rpcError } = await admin.rpc('reconcile_direct_payment', {
        p_payment_id: paymentId,
        p_observed_refunded_cents: grossRefunded,
        p_observed_fee_refunded_cents: feeRefunded,
        p_observed_charge_id: chargeId,
        p_observed_disputed: Boolean(charge.disputed),
      });

      if (rpcError) {
        console.error('reconcile_direct_payment failed:', paymentId, rpcError);
        failures += 1;
        continue;
      }

      if (verdict === 'reconciled') reconciled += 1;
      else if (verdict === 'disputed') disputed += 1;
      else if (verdict === 'mismatch') {
        // Loud, because a payment whose books and provider disagree about money
        // is now unrefundable and no sweep will fix it. Somebody has to look.
        console.error('payment reconciliation MISMATCH:', paymentId);
        mismatched += 1;
      } else failures += 1;
    } catch (providerError) {
      // A Stripe read that failed is not evidence of anything. The payment stays
      // pending and the next sweep asks again.
      console.error('refund reconciliation provider read failed:', paymentId, providerError);
      providerErrors += 1;
    }
  }

  return Object.freeze({
    examined,
    reconciled,
    mismatched,
    disputed,
    providerErrors,
    failures,
    batchSize,
    // A full batch means more are waiting. Said out loud: a silent cap reads as
    // "everything was reconciled" when it was not.
    truncated: examined >= batchSize,
  });
}
