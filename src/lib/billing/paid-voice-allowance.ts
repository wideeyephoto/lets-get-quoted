import 'server-only';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/auth';
import { resolveAddonRefund } from '@/lib/billing/addon-refunds';

const VOICE = new Set(['ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth']);
function objectId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}

/** A paid add-on owns its invoice period, independently of the base plan's allowance. */
export async function grantPaidVoiceAllowance(
  stripe: Stripe, subscription: Stripe.Subscription, accountId: unknown, livemode: boolean,
): Promise<void> {
  if (subscription.metadata?.lgq_purpose !== 'top_up' || !VOICE.has(subscription.metadata.lgq_top_up_id)) return;
  if (subscription.status !== 'active') return;
  if (subscription.livemode !== livemode || subscription.metadata.lgq_account_id !== accountId) {
    throw new Error('paid_voice_subscription_identity_mismatch');
  }
  const invoiceId = objectId(subscription.latest_invoice);
  if (!invoiceId) throw new Error('paid_voice_invoice_missing');
  const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 2 });
  const payment = payments.data[0];
  if (payments.has_more || payments.data.length !== 1 || payment.status !== 'paid'
    || payment.livemode !== livemode || payment.payment.type !== 'payment_intent') {
    throw new Error('paid_voice_invoice_payment_unresolved');
  }
  const intentId = objectId(payment.payment.payment_intent);
  if (!intentId) throw new Error('paid_voice_payment_intent_missing');
  const intent = await stripe.paymentIntents.retrieve(intentId);
  const chargeId = objectId(intent.latest_charge);
  if (intent.status !== 'succeeded' || intent.livemode !== livemode || !chargeId) {
    throw new Error('paid_voice_charge_unsettled');
  }
  // Reuse the strict checkout, price, invoice, charge and subscription proof
  // used for reversals. A paid invoice label alone is insufficient evidence.
  const { contract } = await resolveAddonRefund(stripe, chargeId, livemode);
  const item = subscription.items.data[0];
  if (!contract || contract.account_id !== accountId || contract.subscription_id !== subscription.id
    || contract.invoice_id !== invoiceId || contract.top_up_id !== subscription.metadata.lgq_top_up_id
    || subscription.items.has_more || subscription.items.data.length !== 1
    || !Number.isSafeInteger(item.current_period_start) || !Number.isSafeInteger(item.current_period_end)
    || contract.period_start !== new Date(item.current_period_start * 1000).toISOString()
    || contract.period_end !== new Date(item.current_period_end * 1000).toISOString()) {
    throw new Error('paid_voice_period_identity_mismatch');
  }
  const { error } = await createAdminClient().rpc('grant_paid_voice_addon_period', {
    p_livemode: livemode, p_contract: contract,
  });
  if (error) throw new Error('paid_voice_grant_pending');
}
