import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import { AddonRefundContractError, refundedCreditUnits, successfulRefundTotal, validateAddonRefundContract, type AddonRefundContract } from '@/lib/billing/addon-refunds';
import { runAddonRefundBatch, type AddonRefundWorkerDependencies, type RefundJob } from '@/lib/billing/addon-refund-worker';
import { handleStripeTopUpWebhook } from '@/lib/billing/stripe-top-up-webhook';

const account = '8accc474-58c4-43f1-881b-d1328842e191';
const metadata = { lgq_purpose: 'top_up', lgq_top_up_id: 'voice_minutes_100', lgq_account_id: account,
  lgq_catalog_version: PRICING_CATALOG_VERSION, lgq_resource_code: 'voice_minutes', lgq_units: '100' };
function fixture() {
  const charge = { id: 'ch_refundfixture', livemode: false, amount: 3500, amount_captured: 3500, paid: true, captured: true, currency: 'usd', payment_intent: 'pi_fixture' } as unknown as Stripe.Charge;
  const session = { id: 'cs_test_fixture', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid', amount_total: 3500, payment_intent: 'pi_fixture', metadata: { ...metadata } } as unknown as Stripe.Checkout.Session;
  const line = { object: 'item', quantity: 1, currency: 'usd', amount_subtotal: 3500, price: { id: 'price_fixture' } } as unknown as Stripe.LineItem;
  return { livemode: false, charge, session, line, refundedAmount: 1750 };
}
function recurringFixture() {
  const data = fixture();
  const recurringMetadata = { ...metadata, lgq_top_up_id: 'ai_voice_solo' };
  const session = { ...data.session, mode: 'subscription', subscription: 'sub_fixture', metadata: recurringMetadata } as Stripe.Checkout.Session;
  const charge = { ...data.charge, amount: 5900, amount_captured: 5900, customer: 'cus_fixture' };
  const subscription = { id: 'sub_fixture', livemode: false, customer: 'cus_fixture', metadata: recurringMetadata } as unknown as Stripe.Subscription;
  const invoice = { id: 'in_fixture', livemode: false, status: 'paid', currency: 'usd', amount_paid: 5900, amount_due: 5900, amount_remaining: 0,
    customer: 'cus_fixture', parent: { subscription_details: { subscription: 'sub_fixture' } } } as unknown as Stripe.Invoice;
  const line = { object: 'line_item', quantity: 1, currency: 'usd', amount: 5900, period: { start: 1788888607, end: 1791480607 },
    parent: { subscription_item_details: { subscription: 'sub_fixture', proration: false } }, pricing: { price_details: { price: 'price_fixture' } } } as unknown as Stripe.InvoiceLineItem;
  return { ...data, charge, session, subscription, invoice, line };
}

describe('refund amount and purchase identity', () => {
  it('uses cumulative integer arithmetic, including indivisible seats and a final full refund', () => {
    expect(refundedCreditUnits(100, 1750, 3500)).toBe(50);
    expect(refundedCreditUnits(1, 750, 1500)).toBe(0);
    expect(refundedCreditUnits(1, 1500, 1500)).toBe(1);
    expect(refundedCreditUnits(Number.MAX_SAFE_INTEGER, 2, 3)).toBe(6004799503160660);
    expect(() => refundedCreditUnits(100, 3501, 3500)).toThrow();
  });
  it('counts only succeeded refunds and retains pending work', () => {
    const data = fixture();
    const refunds = ['succeeded', 'pending', 'failed', 'canceled'].map((status, i) => ({ id: `re_${i}`, charge: data.charge.id, amount: 500, currency: 'usd', status })) as Stripe.Refund[];
    expect(successfulRefundTotal(data.charge, refunds)).toEqual({ amount: 500, pending: true });
    expect(() => successfulRefundTotal(data.charge, [refunds[0], refunds[0]])).toThrow('refund_charge_mismatch');
    expect(() => successfulRefundTotal(data.charge, [{ ...refunds[0], charge: 'ch_other' }])).toThrow();
    expect(() => successfulRefundTotal(data.charge, [{ ...refunds[0], status: 'new_unknown_state' }])).toThrow('refund_status_unknown');
  });
  it('binds the one-off refund to the exact payment, SKU and catalog', () => {
    expect(validateAddonRefundContract(fixture())).toMatchObject({ account_id: account, top_up_id: 'voice_minutes_100', refunded_amount: 1750, subscription_id: null });
  });
  it.each(['livemode', 'payment', 'unpaid', 'quantity', 'catalog', 'units', 'connect'])('rejects a mismatched %s contract', (mutation) => {
    const data = fixture();
    if (mutation === 'livemode') data.charge.livemode = true;
    if (mutation === 'payment') data.session.payment_intent = 'pi_other';
    if (mutation === 'unpaid') data.session.payment_status = 'unpaid';
    if (mutation === 'quantity') data.line.quantity = 2;
    if (mutation === 'catalog') data.session.metadata!.lgq_catalog_version = 'other';
    if (mutation === 'units') data.session.metadata!.lgq_units = '1000';
    if (mutation === 'connect') data.charge.on_behalf_of = 'acct_other';
    expect(() => validateAddonRefundContract(data)).toThrow(AddonRefundContractError);
  });
  it('ignores unrelated platform purchases without inventing an add-on identity', () => {
    const data = fixture(); data.session.metadata!.lgq_purpose = 'other';
    expect(validateAddonRefundContract(data)).toBeNull();
  });
  it('uses the invoice service period, including a subscription that is already canceled', () => {
    const data = recurringFixture(); data.subscription.status = 'canceled';
    expect(validateAddonRefundContract(data)).toMatchObject({ subscription_id: 'sub_fixture', invoice_id: 'in_fixture', period_start: '2026-09-08T17:30:07.000Z', period_end: '2026-10-08T17:30:07.000Z' });
  });
  it.each(['subscription', 'customer', 'partial_payment', 'proration', 'period'])('refuses ambiguous recurring %s attribution', (mutation) => {
    const data = recurringFixture();
    if (mutation === 'subscription') data.session.subscription = 'sub_other';
    if (mutation === 'customer') data.charge.customer = 'cus_other';
    if (mutation === 'partial_payment') data.invoice.amount_paid = 2000;
    if (mutation === 'proration') data.line.parent!.subscription_item_details!.proration = true;
    if (mutation === 'period') data.line.period.end = data.line.period.start;
    expect(() => validateAddonRefundContract(data)).toThrow();
  });
});

describe('durable refund worker', () => {
  const job: RefundJob = { id: 'job', claim_token: 'claim', charge_id: 'ch_fixture', livemode: false };
  const contract = validateAddonRefundContract(fixture()) as AddonRefundContract;
  let dependencies: AddonRefundWorkerDependencies;
  beforeEach(() => {
    vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '0'); vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture123456');
    dependencies = {
      claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValue(null),
      resolve: vi.fn().mockResolvedValue({ contract, pending: false }),
      apply: vi.fn().mockResolvedValue({ cancel_subscription: null }),
      cancel: vi.fn().mockResolvedValue(undefined), finish: vi.fn().mockResolvedValue(true),
    };
  });
  afterEach(() => vi.unstubAllEnvs());
  it('finishes only after applying the durable reversal', async () => {
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ completed: 1, failures: 0 });
    expect(dependencies.apply).toHaveBeenCalledWith(job, contract);
    expect(dependencies.cancel).not.toHaveBeenCalled();
  });
  it('cancels a fully refunded subscription after the database reversal and before finishing', async () => {
    vi.mocked(dependencies.apply).mockResolvedValue({ cancel_subscription: 'sub_fixture' });
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ completed: 1 });
    expect(dependencies.cancel).toHaveBeenCalledWith('sub_fixture', account, false);
    expect(vi.mocked(dependencies.apply).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(dependencies.cancel).mock.invocationCallOrder[0]);
    expect(vi.mocked(dependencies.cancel).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(dependencies.finish).mock.invocationCallOrder[0]);
  });
  it('retries a failed cancellation without marking the refund complete', async () => {
    vi.mocked(dependencies.apply).mockResolvedValue({ cancel_subscription: 'sub_fixture' });
    vi.mocked(dependencies.cancel).mockRejectedValue(new Error('temporary provider failure'));
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ pending: 1, completed: 0, failures: 1 });
    expect(dependencies.finish).toHaveBeenCalledWith(job, 'pending', 'refund_retry_required');
  });
  it('keeps a partially pending refund in the retry queue', async () => {
    vi.mocked(dependencies.resolve).mockResolvedValue({ contract, pending: true });
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ pending: 1, completed: 0 });
  });
  it('records ambiguous contracts for review without applying them', async () => {
    vi.mocked(dependencies.resolve).mockRejectedValue(new AddonRefundContractError('refund_invoice_line_ambiguous'));
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ review: 1, failures: 1 });
    expect(dependencies.apply).not.toHaveBeenCalled();
  });
  it('ignores an unrelated charge', async () => {
    vi.mocked(dependencies.resolve).mockResolvedValue({ contract: null, pending: false });
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ ignored: 1, failures: 0 });
    expect(dependencies.apply).not.toHaveBeenCalled();
  });
  it('does not report success after losing its lease', async () => {
    vi.mocked(dependencies.finish).mockResolvedValue(false);
    expect(await runAddonRefundBatch({ dependencies })).toMatchObject({ completed: 0, failures: 1 });
  });
  it('refuses a live credential in a test-mode worker before claiming anything', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture123456');
    await expect(runAddonRefundBatch({ dependencies })).rejects.toThrow();
    expect(dependencies.claim).not.toHaveBeenCalled();
  });
});

it('routes a refund to its verifier only when enabled, retaining durable duplicate acknowledgement', async () => {
  const ingest = vi.fn(); const ingestRefund = vi.fn().mockResolvedValue({ inserted: false });
  const response = await handleStripeTopUpWebhook(new Request('http://localhost/webhook', { method: 'POST', headers: { 'stripe-signature': 'signed' }, body: JSON.stringify({ type: 'charge.refunded' }) }), {
    env: { LGQ_STRIPE_TOP_UP_WEBHOOK_ENABLED: '1', LGQ_ADDON_REFUND_REVERSAL_ENABLED: '1', STRIPE_TOP_UP_WEBHOOK_SECRET: 'whsec_unique' }, ingest, ingestRefund,
  });
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ received: true, duplicate: true });
  expect(ingestRefund).toHaveBeenCalledOnce(); expect(ingest).not.toHaveBeenCalled();
});
