import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';
import { logQuickStopEvent } from '@/lib/quick-stop-requests';
import { sendQuickStopStatusSms } from '@/lib/sms';

/** The booking is canceled even while returning its money needs another try. */
export type QuickStopRefundState = 'none' | 'pending' | 'processing' | 'retry' | 'completed' | 'review';
export type QuickStopRefundTask = {
  id: string;
  request_id: string;
  account_id: string;
  payment_id: string;
  target_cents: number;
  lease_token: string;
  attempts: number;
  stripe_payment_intent: string | null;
  attempt_cents: number | null;
  first_attempt_at: string | null;
};
export type RefundPaymentEvidence = {
  id: string;
  account_id: string;
  amount: number | string;
  stripe_payment_intent: string | null;
  charge_model: unknown;
};
type RefundOutcome = { state: 'completed' | 'retry' | 'review'; refundedCents: number; error?: string };
type RefundProvider = Pick<Stripe, 'paymentIntents' | 'refunds'>;
const failed = (error: string, state: 'retry' | 'review' = 'review'): RefundOutcome => ({ state, refundedCents: 0, error });

/**
 * Read provider truth on EVERY retry. Stripe keys can expire after 24h: an
 * uncertain old request is reviewed, never replayed as a fresh partial refund.
 * A persisted key/amount is reused only while both the age and balance agree.
 */
export async function executeQuickStopRefundTask(
  task: QuickStopRefundTask,
  payment: RefundPaymentEvidence,
  stripe: RefundProvider,
  prepare: (amountCents: number, paymentIntent: string) => Promise<QuickStopRefundTask>,
  now = Date.now(),
  options: { allowCreate?: boolean; deadlineMs?: number } = {},
): Promise<RefundOutcome> {
  const deadline = options.deadlineMs ?? Date.now() + 20_000;
  const providerOptions = (): Stripe.RequestOptions => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Refund processing time budget exhausted');
    return { timeout: Math.min(8_000, remaining), maxNetworkRetries: 0 };
  };
  if (payment.id !== task.payment_id || payment.account_id !== task.account_id || payment.charge_model !== 'destination') {
    return failed('payment_rail_or_account_mismatch');
  }
  const intentId = payment.stripe_payment_intent;
  const grossCents = Math.round(Number(payment.amount) * 100);
  if (!intentId || !Number.isSafeInteger(grossCents) || task.target_cents <= 0 || task.target_cents > grossCents) {
    return failed('payment_evidence_invalid');
  }
  if (task.stripe_payment_intent && task.stripe_payment_intent !== intentId) return failed('payment_intent_changed');
  const intent = await stripe.paymentIntents.retrieve(intentId, {}, providerOptions());
  if (intent.status !== 'succeeded' || intent.currency !== 'usd' || intent.amount_received !== grossCents) {
    return failed('provider_payment_evidence_mismatch');
  }
  // Bounded and fail-closed: never mistake an incomplete page for proof that a
  // prior request did not create a refund. Quick Stop charges should have few.
  const refunds = await stripe.refunds.list({ payment_intent: intentId, limit: 100 }, providerOptions());
  if (refunds.has_more) return failed('provider_refunds_need_full_review');
  const succeeded = refunds.data.filter((r) => r.status === 'succeeded');
  const refundedCents = succeeded.reduce((sum, r) => sum + r.amount, 0);
  if (refundedCents >= task.target_cents) return { state: 'completed', refundedCents };
  // Staff review reconciles external/manual provider resolution. It has no
  // authority to invent another refund, even when the original key has expired.
  if (options.allowCreate === false) return failed('provider_refund_target_not_met');
  const ours = refunds.data.filter((r) => r.metadata?.quick_stop_refund_task === task.id);
  if (ours.length) {
    if (ours.some((r) => r.status === 'failed' || r.status === 'canceled')) return failed('provider_refund_failed');
    if (ours.some((r) => r.status === 'succeeded')) return failed('provider_refund_amount_changed');
    return failed('provider_refund_pending', 'retry');
  }
  if (refunds.data.some((r) => r.status !== 'succeeded' && r.status !== 'failed' && r.status !== 'canceled')) {
    return failed('another_refund_pending', 'retry');
  }
  const amountCents = task.target_cents - refundedCents;
  if (task.attempt_cents !== null) {
    // Another refund changed the balance after our attempt. A different amount
    // with the old key is invalid; a new key risks double money. Staff reconcile.
    if (task.attempt_cents !== amountCents) return failed('refund_balance_changed_after_attempt');
    const attemptedAt = task.first_attempt_at ? Date.parse(task.first_attempt_at) : NaN;
    if (!Number.isFinite(attemptedAt) || now - attemptedAt >= 23 * 60 * 60_000) return failed('provider_result_unknown_after_retry_window');
  }
  const prepared = await prepare(amountCents, intentId);
  if (prepared.attempt_cents !== amountCents || prepared.stripe_payment_intent !== intentId) {
    return failed('refund_snapshot_mismatch');
  }
  const refund = await stripe.refunds.create({
    payment_intent: intentId,
    amount: amountCents,
    reverse_transfer: true,
    refund_application_fee: true,
    metadata: { payment_id: task.payment_id, quick_stop_refund_task: task.id },
  }, { ...providerOptions(), idempotencyKey: `quick_stop_refund_${task.id}` });
  if (refund.status === 'failed' || refund.status === 'canceled') return failed('provider_refund_failed');
  if (refund.status !== 'succeeded') return failed('provider_refund_pending', 'retry');
  if (refund.amount !== amountCents) return failed('provider_refund_amount_mismatch');
  return { state: 'completed', refundedCents: refundedCents + refund.amount };
}

export async function queueQuickStopRefund(admin: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await admin.rpc('queue_quick_stop_refund', { p_request_id: requestId });
  if (error) throw new Error(`Could not preserve the Quick Stop refund: ${error.message}`);
}

/** Called by the existing sweep, and once after cancellation/late settlement. */
export async function processQuickStopRefunds(
  admin: SupabaseClient,
  limit = 25,
  accountId?: string,
  requestId?: string,
  options: { deadlineMs?: number; reviewOnly?: boolean } = {},
): Promise<{ completed: number; pending: number; review: number }> {
  const counts = { completed: 0, pending: 0, review: 0 };
  const deadlineMs = options.deadlineMs ?? Date.now() + 20_000;
  // Claim one at a time so exhausting the route budget never strands a batch
  // of work behind leases that this invocation could not even attempt.
  for (let index = 0; index < Math.max(1, Math.min(100, limit)) && Date.now() < deadlineMs; index += 1) {
    const { data, error } = options.reviewOnly
      ? await admin.rpc('claim_quick_stop_refund_review', { p_account_id: accountId, p_request_id: requestId })
      : await admin.rpc('claim_quick_stop_refunds', { p_limit: 1, p_account_id: accountId ?? null, p_request_id: requestId ?? null });
    if (error) throw new Error(`Quick Stop refund queue unavailable: ${error.message}`);
    const task = data?.[0] as QuickStopRefundTask | undefined;
    if (!task) break;
    let outcome: RefundOutcome;
    try {
      const { data: payment, error: paymentError } = await admin.from('payments')
        .select('id, account_id, amount, stripe_payment_intent, charge_model')
        .eq('id', task.payment_id).eq('account_id', task.account_id).single();
      if (paymentError || !payment) throw new Error('Refund payment unavailable');
      outcome = await executeQuickStopRefundTask(task, payment as RefundPaymentEvidence, getStripeClient(), async (amount, intent) => {
        const { data: prepared, error: prepareError } = await admin.rpc('prepare_quick_stop_refund', {
          p_task_id: task.id, p_lease_token: task.lease_token, p_payment_intent: intent, p_amount_cents: amount,
        });
        if (prepareError || !prepared?.[0]) throw new Error('Refund lease or snapshot changed');
        return prepared[0] as QuickStopRefundTask;
      }, Date.now(), { allowCreate: !options.reviewOnly, deadlineMs });
    } catch (error) {
      // Includes provider timeouts AND a local failure after provider success.
      // The next attempt reads Stripe before deciding whether to submit again.
      console.error('Quick Stop refund needs reconciliation:', error instanceof Error ? error.message : error);
      outcome = failed('provider_or_database_result_unknown', options.reviewOnly || task.attempts >= 12 ? 'review' : 'retry');
    }
    const { data: finished, error: finishError } = await admin.rpc('finish_quick_stop_refund', {
      p_task_id: task.id, p_lease_token: task.lease_token, p_state: outcome.state,
      p_refunded_cents: outcome.refundedCents, p_error: outcome.error ?? null,
    });
    if (finishError || !finished) {
      // Keep the lease/immutable snapshot. It is recovered when the lease ends.
      console.error('Quick Stop refund outcome could not be recorded:', finishError?.message ?? 'lease changed');
      counts.pending += 1;
      continue;
    }
    counts[outcome.state === 'completed' ? 'completed' : outcome.state === 'review' ? 'review' : 'pending'] += 1;
    await logQuickStopEvent(admin, task.account_id, task.request_id, {
      actor: 'system', meta: { refundTaskId: task.id, refundState: outcome.state, refundCents: outcome.refundedCents, error: outcome.error },
    });
    if (outcome.state === 'completed') {
      const { data: request } = await admin.from('extra_stop_requests').select('client_phone')
        .eq('id', task.request_id).eq('account_id', task.account_id).maybeSingle();
      if (request?.client_phone) {
        try {
          await sendQuickStopStatusSms({ accountId: task.account_id, toPhone: request.client_phone,
            message: `Your Quick Stop refund of $${(outcome.refundedCents / 100).toFixed(2)} has been issued.`,
            idempotencyKey: `quick-stop:${task.request_id}:refund-recovered:${task.id}` });
        } catch (error) {
          console.error('Quick Stop refund receipt could not be queued:', error instanceof Error ? error.message : error);
        }
      }
    }
  }
  return counts;
}

export async function reconcileQuickStopRefund(admin: SupabaseClient, accountId: string, requestId: string) {
  return processQuickStopRefunds(admin, 1, accountId, requestId, { reviewOnly: true });
}
