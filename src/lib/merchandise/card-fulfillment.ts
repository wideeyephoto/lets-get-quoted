import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCardFulfillmentArtwork } from './card-proof-storage';
import { createPrintfulOrder } from './printful-client';
import type { MerchandiseOrderItem } from './types';
import { getStripeClient } from '@/lib/stripe';

export async function fulfillPaidCardOrder(admin: SupabaseClient, order: Record<string, any>, session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return true;
  if (session.metadata?.account_id !== order.account_id || session.metadata?.order_id !== order.id || session.currency !== 'usd') throw new Error('Card payment ownership or currency mismatch.');
  const tax = session.total_details?.amount_tax || 0;
  if (!Number.isSafeInteger(session.amount_total) || session.amount_subtotal !== Math.round(Number(order.subtotal) * 100)
    || (session.total_details?.amount_shipping || 0) !== Math.round(Number(order.shipping_cost) * 100)) throw new Error('Card payment does not match the saved quote.');
  const lease = randomUUID();
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error('Verified card payment intent is missing.');
  const intent = await getStripeClient().paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge.balance_transaction'] });
  const charge = intent.latest_charge as Stripe.Charge | null;
  const transaction = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  if (!transaction || !Number.isSafeInteger(transaction.fee) || transaction.fee < 0) throw new Error('Payment processing fee is not yet available; retry reconciliation.');
  const claimed = await admin.rpc('claim_card_fulfillment', { p_account_id: order.account_id, p_order_id: order.id,
    p_session_id: session.id, p_payment_intent_id: paymentIntentId,
    p_total_cents: session.amount_total, p_tax_cents: tax, p_lease: lease, p_fee_cents: transaction.fee });
  if (claimed.error || !claimed.data) throw new Error(claimed.error?.message || 'Could not claim card fulfillment.');
  if (claimed.data.completed) return true;
  let result;
  try {
    const quote = await admin.from('merchandise_order_quotes').select('selected_shipping_rate_id').eq('id', order.quote_id).eq('account_id', order.account_id).single();
    if (quote.error || !quote.data?.selected_shipping_rate_id) throw new Error('Saved delivery service is unavailable.');
    const artwork = await getCardFulfillmentArtwork(admin, order.account_id, order.proof_id);
    const items = (order.items as MerchandiseOrderItem[]).map(item => ({ ...item, customizationDetails: {
      ...item.customizationDetails, customArtworkUrl: artwork.frontUrl, backDesign: artwork.backUrl, finish: 'uncoated',
    } }));
    result = await createPrintfulOrder({ orderNumber: order.order_number, items, shippingAddress: order.shipping_address,
      shippingRateId: quote.data.selected_shipping_rate_id,
      retailTotal: session.amount_total! / 100, companyName: items[0]?.customizationDetails.businessName || 'Contractor Brand' });
  } catch (error) { result = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  const finished = await admin.rpc('finish_card_fulfillment', { p_account_id: order.account_id, p_order_id: order.id, p_lease: lease, p_result: result });
  if (finished.error || finished.data !== true) throw new Error('Could not persist fulfillment result; retry will reconcile the provider order.');
  if (!result.ok) throw new Error(result.error || 'Card fulfillment needs retry.');
  return true;
}
