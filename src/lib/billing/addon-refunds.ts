import 'server-only';

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/auth';
import { TOP_UPS, PRICING_CATALOG_VERSION, type TopUpId } from '@/lib/billing/catalog';
import { assertConfiguredStripeBillingMode } from '@/lib/billing/stripe-billing-subscription-checkout';
import { StripeEventInboxValidationError, StripeEventInboxVerificationError } from '@/lib/billing/stripe-event-inbox';
import { getStripeClient } from '@/lib/stripe';

export const ADDON_REFUND_FLAG = 'LGQ_ADDON_REFUND_REVERSAL_ENABLED';
export const ADDON_REFUND_EVENTS = ['charge.refunded', 'refund.created', 'refund.updated', 'refund.failed'] as const;
const SKUS = new Set<TopUpId>(['voice_minutes_100', 'ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth', 'storage_100gb', 'office_user']);
const CHARGE = /^(ch|py)_[A-Za-z0-9]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AddonRefundContractError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'AddonRefundContractError'; }
}

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new AddonRefundContractError(code);
}
function id(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id;
  return null;
}
function integer(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}
function iso(value: number): string {
  check(integer(value, 1) && Number.isFinite(new Date(value * 1000).getTime()), 'refund_period_invalid');
  return new Date(value * 1000).toISOString();
}

/** Unsigned data selects a verifier only; it never authorizes a receipt. */
export function isAddonRefundCandidate(raw: string): boolean {
  try { return (ADDON_REFUND_EVENTS as readonly unknown[]).includes(JSON.parse(raw)?.type); } catch { return false; }
}

export async function ingestAddonRefundDelivery(input: {
  rawBody: string; signature: string; webhookSecret: string;
}): Promise<{ inserted: boolean }> {
  const stripe = getStripeClient();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(input.rawBody, input.signature, input.webhookSecret); }
  catch { throw new StripeEventInboxVerificationError(); }
  const object = event.data.object;
  const chargeId = object.object === 'charge' ? object.id : object.object === 'refund' ? id(object.charge) : null;
  if (event.object !== 'event' || event.account || !/^evt_[A-Za-z0-9]+$/.test(event.id) || !isAddonRefundCandidate(input.rawBody) || !chargeId || !CHARGE.test(chargeId)) {
    throw new StripeEventInboxValidationError('Invalid platform refund envelope.');
  }
  try { assertConfiguredStripeBillingMode(event.livemode); }
  catch { throw new StripeEventInboxValidationError('Refund mode mismatch.'); }
  const { data, error } = await createAdminClient().rpc('ingest_addon_refund_event', {
    p_livemode: event.livemode, p_event_id: event.id, p_charge_id: chargeId,
    p_payload_sha256: createHash('sha256').update(input.rawBody).digest('hex'),
  });
  if (error || typeof data !== 'boolean') throw new Error('Refund receipt unavailable.');
  return { inserted: data };
}

export type AddonRefundContract = Readonly<{
  account_id: string; checkout_session_id: string; subscription_id: string | null;
  invoice_id: string | null; top_up_id: TopUpId; price_id: string;
  charge_amount: number; refunded_amount: number; period_start: string | null; period_end: string | null;
}>;

/** Round cumulative proportions once, so split refunds cannot duplicate units. */
export function refundedCreditUnits(units: number, refunded: number, paid: number): number {
  check(integer(units, 1) && integer(paid, 1) && integer(refunded) && refunded <= paid, 'refund_amount_invalid');
  return Number(BigInt(units) * BigInt(refunded) / BigInt(paid));
}

export function successfulRefundTotal(charge: Stripe.Charge, refunds: readonly Stripe.Refund[]): { amount: number; pending: boolean } {
  let amount = 0;
  let pending = false;
  const seen = new Set<string>();
  for (const refund of refunds) {
    check(id(refund.charge) === charge.id && refund.currency === charge.currency && integer(refund.amount, 1) && !seen.has(refund.id), 'refund_charge_mismatch');
    seen.add(refund.id);
    if (refund.status === 'succeeded') amount += refund.amount;
    else if (refund.status === 'pending' || refund.status === 'requires_action') pending = true;
    else check(refund.status === 'failed' || refund.status === 'canceled', 'refund_status_unknown');
  }
  check(integer(amount) && amount <= charge.amount, 'refund_amount_invalid');
  return { amount, pending };
}

export function validateAddonRefundContract(input: {
  livemode: boolean; charge: Stripe.Charge; session: Stripe.Checkout.Session;
  line: Stripe.LineItem | Stripe.InvoiceLineItem; invoice?: Stripe.Invoice;
  subscription?: Stripe.Subscription; refundedAmount: number;
}): AddonRefundContract | null {
  const { charge, session, line, invoice, subscription, livemode } = input;
  const metadata = session.metadata;
  if (metadata?.lgq_purpose !== 'top_up' || !SKUS.has(metadata.lgq_top_up_id as TopUpId)) return null;
  const sku = TOP_UPS[metadata.lgq_top_up_id as TopUpId];
  check(metadata.lgq_catalog_version === PRICING_CATALOG_VERSION && UUID.test(metadata.lgq_account_id ?? '') && metadata.lgq_resource_code === sku.resourceCode && metadata.lgq_units === String(sku.units), 'refund_purchase_metadata_mismatch');
  check(charge.livemode === livemode && session.livemode === livemode && charge.paid && charge.captured && charge.amount_captured === charge.amount && charge.currency === 'usd' && integer(charge.amount, 1), 'refund_payment_contract_mismatch');
  check(!charge.application && !charge.application_fee && !charge.on_behalf_of && !charge.transfer_data, 'refund_connected_charge_forbidden');
  check(session.status === 'complete' && session.payment_status === 'paid' && line.quantity === 1 && line.currency === 'usd', 'refund_checkout_unpaid_or_ambiguous');
  check(integer(input.refundedAmount) && input.refundedAmount <= charge.amount, 'refund_amount_invalid');
  let priceId: string | null;
  let start: string | null = null;
  let end: string | null = null;
  if (sku.recurring) {
    check(invoice && subscription && line.object === 'line_item', 'refund_subscription_missing');
    check(invoice.livemode === livemode && subscription.livemode === livemode && invoice.status === 'paid' && invoice.currency === 'usd'
      && invoice.amount_paid === charge.amount && invoice.amount_due === charge.amount && invoice.amount_remaining === 0, 'refund_invoice_payment_ambiguous');
    check(id(session.subscription) === subscription.id && id(invoice.parent?.subscription_details?.subscription) === subscription.id
      && id(charge.customer) === id(invoice.customer) && id(charge.customer) === id(subscription.customer), 'refund_subscription_identity_mismatch');
    check(subscription.metadata.lgq_account_id === metadata.lgq_account_id && subscription.metadata.lgq_top_up_id === sku.id, 'refund_subscription_metadata_mismatch');
    const details = line.parent?.subscription_item_details;
    check(details && !details.proration && details.subscription === subscription.id && line.amount === sku.priceCents, 'refund_invoice_line_ambiguous');
    priceId = id(line.pricing?.price_details?.price);
    start = iso(line.period.start); end = iso(line.period.end);
    check(line.period.end > line.period.start, 'refund_period_invalid');
  } else {
    check(!invoice && !subscription && session.mode === 'payment' && id(session.payment_intent) === id(charge.payment_intent)
      && session.amount_total === charge.amount && line.object === 'item' && line.amount_subtotal === sku.priceCents, 'refund_one_off_identity_mismatch');
    priceId = id(line.price);
  }
  check(priceId && /^price_[A-Za-z0-9]+$/.test(priceId), 'refund_price_missing');
  return {
    account_id: metadata.lgq_account_id, checkout_session_id: session.id, subscription_id: subscription?.id ?? null,
    invoice_id: invoice?.id ?? null, top_up_id: sku.id, price_id: priceId, charge_amount: charge.amount,
    refunded_amount: input.refundedAmount, period_start: start, period_end: end,
  };
}

/** Resolve current provider state. Incomplete pagination is never interpreted as a full refund. */
export async function resolveAddonRefund(stripe: Stripe, chargeId: string, livemode: boolean): Promise<{
  contract: AddonRefundContract | null; pending: boolean;
}> {
  const charge = await stripe.charges.retrieve(chargeId);
  check(charge.livemode === livemode, 'refund_mode_mismatch');
  const refunds: Stripe.Refund[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await stripe.refunds.list({ charge: chargeId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    refunds.push(...result.data);
    if (!result.has_more) break;
    check(result.data.length > 0 && page < 9, 'refund_pagination_incomplete');
    cursor = result.data[result.data.length - 1].id;
  }
  const total = successfulRefundTotal(charge, refunds);
  const paymentIntent = id(charge.payment_intent);
  check(paymentIntent, 'refund_payment_intent_missing');
  const payments = await stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: paymentIntent }, limit: 2 });
  check(!payments.has_more && payments.data.length <= 1, 'refund_invoice_payment_ambiguous');
  let invoice: Stripe.Invoice | undefined;
  let subscription: Stripe.Subscription | undefined;
  let sessions: Stripe.ApiList<Stripe.Checkout.Session>;
  let line: Stripe.LineItem | Stripe.InvoiceLineItem;
  if (payments.data.length === 1) {
    const payment = payments.data[0];
    check(payment.status === 'paid' && payment.livemode === livemode && payment.amount_paid === charge.amount, 'refund_invoice_payment_ambiguous');
    invoice = await stripe.invoices.retrieve(id(payment.invoice)!);
    const subId = id(invoice.parent?.subscription_details?.subscription);
    if (!subId) return { contract: null, pending: false };
    subscription = await stripe.subscriptions.retrieve(subId);
    if (subscription.metadata.lgq_purpose !== 'top_up' || !SKUS.has(subscription.metadata.lgq_top_up_id as TopUpId)) return { contract: null, pending: false };
    sessions = await stripe.checkout.sessions.list({ subscription: subId, limit: 2 });
    const lines = await stripe.invoices.listLineItems(invoice.id, { limit: 2 });
    check(!lines.has_more && lines.data.length === 1, 'refund_invoice_line_ambiguous');
    line = lines.data[0];
  } else {
    sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent, limit: 2 });
    if (!sessions.has_more && sessions.data.length === 0) return { contract: null, pending: false };
    check(!sessions.has_more && sessions.data.length === 1, 'refund_checkout_ambiguous');
    if (sessions.data[0].metadata?.lgq_purpose !== 'top_up') return { contract: null, pending: false };
    const lines = await stripe.checkout.sessions.listLineItems(sessions.data[0].id, { limit: 2 });
    check(!lines.has_more && lines.data.length === 1, 'refund_checkout_line_ambiguous');
    line = lines.data[0];
  }
  check(!sessions.has_more && sessions.data.length === 1, 'refund_checkout_ambiguous');
  return { contract: validateAddonRefundContract({ livemode, charge, session: sessions.data[0], line, invoice, subscription, refundedAmount: total.amount }), pending: total.pending };
}
