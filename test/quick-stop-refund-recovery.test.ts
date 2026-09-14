import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { executeQuickStopRefundTask, type QuickStopRefundTask, type RefundPaymentEvidence } from '@/lib/quick-stop-refund-recovery';

const NOW = Date.parse('2026-09-14T15:00:00Z');
const task: QuickStopRefundTask = {
  id: 'task-1', request_id: 'request-1', account_id: 'account-1', payment_id: 'payment-1',
  target_cents: 7500, attempts: 1, lease_token: 'lease-1',
  stripe_payment_intent: null, attempt_cents: null, first_attempt_at: null,
};
const payment: RefundPaymentEvidence = {
  id: 'payment-1', account_id: 'account-1', amount: 100, stripe_payment_intent: 'pi_test', charge_model: 'destination',
};
function harness(rows: Array<Partial<Stripe.Refund>> = []) {
  const stripe = {
    paymentIntents: { retrieve: vi.fn(async () => ({ status: 'succeeded', currency: 'usd', amount_received: 10000 })) },
    refunds: {
      list: vi.fn(async () => ({ data: rows, has_more: false })),
      create: vi.fn(async (params: { amount: number }) => ({ id: 're_test', amount: params.amount, status: 'succeeded' })),
    },
  };
  const prepare = vi.fn(async (amount: number, intent: string) => ({ ...task,
    attempt_cents: amount, stripe_payment_intent: intent, first_attempt_at: new Date(NOW).toISOString() }));
  const run = (overrides: Partial<QuickStopRefundTask> = {}, paymentOverrides: Partial<RefundPaymentEvidence> = {}) =>
    executeQuickStopRefundTask({ ...task, ...overrides }, { ...payment, ...paymentOverrides }, stripe as unknown as Stripe, prepare, NOW);
  return { stripe, prepare, run };
}
describe('durable Quick Stop refund provider recovery', () => {
  it('persists exact cents before the Stripe request and uses one task key', async () => {
    const h = harness();
    expect(await h.run()).toEqual({ state: 'completed', refundedCents: 7500 });
    expect(h.prepare.mock.invocationCallOrder[0]).toBeLessThan(h.stripe.refunds.create.mock.invocationCallOrder[0]);
    expect(h.stripe.refunds.create).toHaveBeenCalledWith({
      payment_intent: 'pi_test', amount: 7500, reverse_transfer: true, refund_application_fee: true,
      metadata: { payment_id: 'payment-1', quick_stop_refund_task: 'task-1' },
    }, expect.objectContaining({ idempotencyKey: 'quick_stop_refund_task-1', maxNetworkRetries: 0 }));
  });
  it('uses the remaining amount of the promised cumulative refund', async () => {
    const h = harness([{ id: 're_manual', amount: 2500, status: 'succeeded' }]);
    expect(await h.run()).toEqual({ state: 'completed', refundedCents: 7500 });
    expect(h.prepare).toHaveBeenCalledWith(5000, 'pi_test');
  });
  it('repairs local failure after Stripe success without issuing more money', async () => {
    const h = harness([{ id: 're_prior', amount: 7500, status: 'succeeded', metadata: { quick_stop_refund_task: 'task-1' } }]);
    expect(await h.run({ attempt_cents: 7500, first_attempt_at: new Date(NOW - 2 * 86_400_000).toISOString() })).toEqual({ state: 'completed', refundedCents: 7500 });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('does not resubmit a refund still pending at Stripe', async () => {
    const h = harness([{ id: 're_pending', amount: 7500, status: 'pending', metadata: { quick_stop_refund_task: 'task-1' } }]);
    expect(await h.run()).toMatchObject({ state: 'retry', error: 'provider_refund_pending' });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('waits for another pending refund before fixing the target balance', async () => {
    const h = harness([{ amount: 3000, status: 'pending' }]);
    expect(await h.run()).toMatchObject({ state: 'retry', error: 'another_refund_pending' });
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it('reviews an unknown result after the idempotency retention window', async () => {
    const h = harness();
    expect(await h.run({ attempt_cents: 7500, first_attempt_at: new Date(NOW - 24 * 60 * 60_000).toISOString() })).toMatchObject({ state: 'review', error: 'provider_result_unknown_after_retry_window' });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('retries recent unknown results with the original amount and key', async () => {
    const h = harness();
    await h.run({ attempt_cents: 7500, stripe_payment_intent: 'pi_test', first_attempt_at: new Date(NOW - 60_000).toISOString() });
    expect(h.stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 7500 }), expect.objectContaining({ idempotencyKey: 'quick_stop_refund_task-1' }));
  });
  it('does not change the amount/key when a manual refund races an unknown result', async () => {
    const h = harness([{ id: 're_manual', amount: 1000, status: 'succeeded' }]);
    expect(await h.run({ attempt_cents: 7500, first_attempt_at: new Date(NOW - 60_000).toISOString() })).toMatchObject({ state: 'review', error: 'refund_balance_changed_after_attempt' });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('does not retry a provider-confirmed failed refund with a new key', async () => {
    const h = harness([{ amount: 7500, status: 'failed', metadata: { quick_stop_refund_task: 'task-1' } }]);
    expect(await h.run()).toMatchObject({ state: 'review', error: 'provider_refund_failed' });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('requires a complete provider refund list before new egress', async () => {
    const h = harness();
    h.stripe.refunds.list.mockResolvedValue({ data: [], has_more: true });
    expect(await h.run()).toMatchObject({ state: 'review', error: 'provider_refunds_need_full_review' });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
  });
  it.each(['direct', null, undefined])('fails closed for charge rail %s', async (charge_model) => {
    const h = harness();
    expect(await h.run({}, { charge_model })).toMatchObject({ state: 'review' });
    expect(h.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
  it('does not move money before the durable snapshot succeeds', async () => {
    const h = harness();
    h.prepare.mockRejectedValue(new Error('database unavailable'));
    await expect(h.run()).rejects.toThrow('database unavailable');
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('staff reconciliation only reads provider truth and never creates money', async () => {
    const h = harness();
    expect(await executeQuickStopRefundTask(task,payment,h.stripe as unknown as Stripe,h.prepare,NOW,{allowCreate:false}))
      .toMatchObject({ state:'review',error:'provider_refund_target_not_met' });
    expect(h.stripe.refunds.create).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
  });
});
