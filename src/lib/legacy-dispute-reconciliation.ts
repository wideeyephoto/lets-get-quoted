import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { inspectLegacyDestinationPaymentRail } from '@/lib/payments';
import { toCents } from '@/lib/stripe';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import { createDisputeFeedEvent } from '@/lib/job-feed';

const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id ?? null;

/** Signed events are wakeups; current provider evidence determines the outcome. */
export async function reconcileLegacyDispute(admin: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  if (event.account) throw new Error('legacy_dispute_connected_scope');
  const source = event.data.object as Stripe.Dispute;
  const intent = objectId(source.payment_intent);
  if (!intent) return; // No PaymentIntent means this cannot identify an app payment.
  const loaded = await admin.from('payments')
    .select('id,account_id,job_id,invoice_id,status,amount,refunded_amount,stripe_payment_intent,stripe_dispute_id,dispute_status,dispute_notice_event_id')
    .eq('stripe_payment_intent', intent).maybeSingle();
  if (loaded.error) throw loaded.error;
  const payment = loaded.data;
  if (!payment) return;
  const rail = await inspectLegacyDestinationPaymentRail(admin, payment.id);
  if (rail.kind !== 'allowed') return;
  if (!source.id) throw new Error('legacy_dispute_identity_missing');
  const current = await stripe.disputes.retrieve(source.id);
  if (current.id !== source.id || objectId(current.payment_intent) !== intent
    || payment.stripe_payment_intent !== intent || current.livemode !== event.livemode
    || typeof event.livemode !== 'boolean' || current.currency !== 'usd'
    || !Number.isSafeInteger(current.amount) || current.amount <= 0) {
    throw new Error('legacy_dispute_evidence_mismatch');
  }
  // Partial/currency-adjusted losses need a separate accounting decision; never
  // turn the whole payment into a refund based on a smaller disputed amount.
  if (current.amount !== toCents(Number(payment.amount))) throw new Error('legacy_dispute_amount_review_required');
  if (payment.stripe_dispute_id && payment.stripe_dispute_id !== current.id) throw new Error('legacy_dispute_identity_conflict');
  if (['warning_needs_response','warning_under_review','warning_closed','prevented'].includes(current.status)) return;
  if (!['needs_response','under_review','won','lost'].includes(current.status)) throw new Error('legacy_dispute_status_unknown');
  if (payment.dispute_status === 'won' || payment.dispute_status === 'lost') {
    if (payment.dispute_status === current.status && payment.stripe_dispute_id === current.id) return;
    throw new Error('legacy_dispute_terminal_conflict');
  }
  if (!['paid','disputed'].includes(payment.status)) throw new Error('legacy_dispute_payment_state_review_required');
  if (Number(payment.refunded_amount ?? 0) !== 0) throw new Error('legacy_dispute_payment_state_review_required');
  const outcome = current.status === 'won' ? 'won' : current.status === 'lost' ? 'lost' : 'opened';
  if (outcome === 'opened' && payment.status === 'disputed' && payment.stripe_dispute_id === current.id) return;
  const eventId = randomUUID();
  let update = admin.from('payments').update({
    status: outcome === 'won' ? 'paid' : outcome === 'lost' ? 'refunded' : 'disputed',
    dispute_status: current.status, stripe_dispute_id: current.id,
    dispute_reason: current.reason, dispute_notice_event_id: eventId,
    disputed_at: new Date(current.created * 1000).toISOString(),
    dispute_due_by: current.evidence_details?.due_by ? new Date(current.evidence_details.due_by * 1000).toISOString() : null,
  }).eq('id', payment.id).eq('account_id', payment.account_id)
    .eq('stripe_payment_intent', intent).eq('amount', payment.amount).eq('status', payment.status);
  for (const field of ['stripe_dispute_id','dispute_status','dispute_notice_event_id','refunded_amount'] as const) {
    update = payment[field] == null ? update.is(field, null) : update.eq(field, payment[field]);
  }
  if (rail.chargeModelColumnPresent) update = update.eq('charge_model', 'destination');
  const saved = await update.select('id').maybeSingle();
  if (saved.error) throw saved.error;
  if (!saved.data) throw new Error('legacy_dispute_concurrent_update');
  if (outcome !== 'won') {
    try { await runOwnerEventNotices(admin, { sourceId: eventId, accountId: payment.account_id }); }
    catch { console.error('Dispute notice remains saved for pickup'); }
  }
  if (outcome === 'lost' && payment.invoice_id) {
    const invoice = await admin.from('invoices').update({ status: 'void' })
      .eq('id', payment.invoice_id).eq('account_id', payment.account_id);
    if (invoice.error) throw invoice.error;
  }
  await createDisputeFeedEvent(admin, payment.id,
    outcome === 'opened' ? 'payment_disputed' : outcome === 'won' ? 'dispute_won' : 'dispute_lost',
    outcome === 'opened' ? 'Chargeback opened' : outcome === 'won' ? 'Chargeback won' : 'Chargeback lost',
    outcome === 'opened' ? 'A payment dispute is open. Review its current status and any evidence deadline in Stripe.'
      : outcome === 'won' ? 'Stripe resolved the dispute in your favor. The payment stands.'
        : 'Stripe reports that the dispute was resolved in the customer’s favor. Review the payment and invoice records.');
}
