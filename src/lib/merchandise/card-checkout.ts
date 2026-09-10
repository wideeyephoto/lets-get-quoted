import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { APP_ORIGIN } from '@/lib/app-origin';
import { generateOrderNumber } from './orders';
import { validateQuoteIntegrity, type CardQuoteRecord } from './card-operations';
import type { ShippingAddress } from './types';

export async function createVerifiedCardCheckout(admin: SupabaseClient, stripe: Stripe, accountId: string, params: {
  quote: Pick<CardQuoteRecord, 'id'>; proofId: string; approvalHash: string; shippingAddress: ShippingAddress;
}) {
  const { data: row, error } = await admin.from('merchandise_order_quotes').select('*').eq('id', params.quote?.id).eq('account_id', accountId).maybeSingle();
  if (error || !row) throw new Error('Saved order quote is unavailable. Please request a new quote.');
  const quote: CardQuoteRecord = {
    id: row.id, accountId: row.account_id, proofId: row.proof_id, cardCount: row.card_count, packPlan: row.pack_plan,
    currency: row.currency, subtotalCents: row.subtotal_cents, shippingCostCents: row.shipping_cost_cents,
    estimatedTaxCents: row.estimated_tax_cents, totalCents: row.total_cents, wholesaleCostCents: row.wholesale_cost_cents,
    platformFeeCents: row.platform_fee_cents, destinationFingerprint: row.destination_fingerprint,
    selectedShippingRateId: row.selected_shipping_rate_id, expiresAt: row.expires_at, createdAt: row.created_at,
  };
  const integrity = validateQuoteIntegrity(quote, params.shippingAddress);
  if (!integrity.valid) throw new Error(integrity.reason);
  if (quote.proofId !== params.proofId || quote.currency !== 'USD' || !Number.isSafeInteger(quote.totalCents)
    || quote.totalCents <= 0 || quote.totalCents !== quote.subtotalCents + quote.shippingCostCents) {
    throw new Error('Quote does not match the approved order.');
  }
  const lease = randomUUID();
  const { data: op, error: claimError } = await admin.rpc('claim_card_checkout', {
    p_account_id: accountId, p_quote_id: quote.id, p_proof_id: params.proofId, p_approval_hash: params.approvalHash,
    p_address: params.shippingAddress, p_order_number: generateOrderNumber(), p_lease_token: lease,
  });
  if (claimError || !op?.order_id) throw new Error(claimError?.message || 'Could not reserve checkout.');
  if (op.session_id) {
    const existing = await stripe.checkout.sessions.retrieve(op.session_id);
    if (!existing.url || existing.status !== 'open') throw new Error('Checkout is no longer open.');
    return { ok: true as const, checkoutUrl: existing.url, operationKey: op.operation_key };
  }
  // Every retry uses identical parameters and the same provider idempotency key.
  const address = params.shippingAddress;
  const customer = await stripe.customers.create({
    name: address.fullName, email: address.email, phone: address.phone,
    shipping: { name: address.fullName, phone: address.phone, address: {
      line1: address.streetAddress, line2: address.apartmentSuite || '', city: address.city,
      state: address.state, postal_code: address.postalCode, country: 'US',
    } }, metadata: { account_id: accountId, card_quote_id: quote.id },
  }, { idempotencyKey: `card-customer:${quote.id}` });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment', payment_method_types: ['card'], customer: customer.id,
    line_items: [{ price_data: { currency: 'usd', product_data: { name: `${quote.cardCount} Business Cards` },
      unit_amount: quote.subtotalCents, tax_behavior: 'exclusive' }, quantity: 1 }],
    shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: quote.shippingCostCents, currency: 'usd' },
      display_name: 'Tracked shipping', tax_behavior: 'exclusive' } }],
    automatic_tax: { enabled: true },
    payment_intent_data: { receipt_email: address.email },
    metadata: { merchandise_order: 'true', account_id: accountId, order_id: op.order_id, quote_id: quote.id,
      operation_key: op.operation_key, shipping_method: 'standard', wholesale_cost: String(quote.wholesaleCostCents / 100) },
    success_url: `${APP_ORIGIN}/dashboard/merchandise?order_success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_ORIGIN}/dashboard/merchandise?order_cancelled=true`,
  }, { idempotencyKey: `card-checkout:${quote.id}` });
  if (!session.url) throw new Error('Payment provider did not return a checkout URL.');
  const linked = await admin.rpc('complete_card_checkout', { p_account_id: accountId, p_operation_key: op.operation_key, p_lease_token: lease, p_session_id: session.id });
  if (linked.error || linked.data !== true) throw new Error('Checkout was created but could not be saved. Retry this quote to recover it.');
  return { ok: true as const, checkoutUrl: session.url, operationKey: op.operation_key, orderNumber: op.order_number };
}
