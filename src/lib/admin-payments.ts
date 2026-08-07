import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * One payment, everything staff need to decide what to do about it.
 *
 * The console could refund exactly one thing: a Quick Stop. /admin/money is
 * entirely read-only, the account page's Recent payments table is five columns
 * with no controls, and Universal Search matches a Stripe payment_intent or
 * dispute_id only to drop you on the account page — its own comment said "no
 * standalone payment detail page today". So a finance staffer told "refund the
 * $2,400 deposit on job 118" had to leave for the Stripe dashboard, and a
 * refund issued there lands in no admin_actions row, carries no reason, and is
 * invisible on /admin/audit. The money moved correctly; the accountability did
 * not exist.
 */

export type AdminPaymentDetail = {
  id: string;
  account_id: string;
  job_id: string | null;
  invoice_id: string | null;
  kind: string | null;
  label: string | null;
  amount: number | null;
  status: string | null;
  platform_fee: number | null;
  fee_rate: number | null;
  refunded_amount: number | null;
  platform_fee_refunded: number | null;
  refunded_at: string | null;
  stripe_payment_intent: string | null;
  stripe_checkout_session: string | null;
  stripe_dispute_id: string | null;
  disputed_at: string | null;
  dispute_reason: string | null;
  dispute_status: string | null;
  dispute_due_by: string | null;
  dunning_state: string | null;
  failure_message: string | null;
  failed_at: string | null;
  requested_at: string | null;
  paid_at: string | null;
  created_at: string | null;
};

const DETAIL_COLUMNS = `
  id, account_id, job_id, invoice_id, kind, label, amount, status,
  platform_fee, fee_rate, refunded_amount, platform_fee_refunded, refunded_at,
  stripe_payment_intent, stripe_checkout_session, stripe_dispute_id,
  disputed_at, dispute_reason, dispute_status, dispute_due_by,
  dunning_state, failure_message, failed_at,
  requested_at, paid_at, created_at
`.replace(/\s+/g, ' ').trim();

export async function getPaymentForAdmin(admin: SupabaseClient, paymentId: string): Promise<AdminPaymentDetail | null> {
  const { data, error } = await admin.from('payments').select(DETAIL_COLUMNS).eq('id', paymentId).maybeSingle();
  if (error) {
    console.error('getPaymentForAdmin failed:', error);
    return null;
  }
  return (data as AdminPaymentDetail | null) ?? null;
}

const money = (v: number | null | undefined): number => Number(v) || 0;

/**
 * What is left to give back, in cents.
 *
 * Integer cents rather than dollars because the refund form compares against
 * this to decide whether to offer itself, and refundPayment works in cents for
 * the same reason: a float comparison here would let a $0.004 remainder render
 * a refund box that Stripe then refuses.
 */
export function refundableCents(payment: Pick<AdminPaymentDetail, 'amount' | 'refunded_amount' | 'status'>): number {
  // Only a `paid` row can be refunded — refundPayment enforces this too, and a
  // fully-refunded payment has already flipped to 'refunded'. A `disputed` row
  // is Stripe's to resolve; refunding one here would be paying twice.
  if (payment.status !== 'paid') return 0;
  const total = Math.round(money(payment.amount) * 100);
  const already = Math.round(money(payment.refunded_amount) * 100);
  return Math.max(0, total - already);
}

/** Why the refund form is not being offered, in the words a person would use. */
export function refundBlockedReason(payment: AdminPaymentDetail): string | null {
  if (payment.status === 'refunded') return 'This payment has already been fully refunded.';
  if (payment.status === 'disputed') {
    return 'This payment is disputed. Resolve it on Stripe — refunding here as well would pay the customer twice.';
  }
  if (payment.status !== 'paid') return 'Only a payment that has actually been collected can be refunded.';
  if (!payment.stripe_payment_intent) {
    return 'No Stripe payment intent on this row, so there is nothing to refund against. It was probably recorded by hand or imported.';
  }
  if (refundableCents(payment) <= 0) return 'Nothing left to refund on this payment.';
  return null;
}

/** The Stripe dashboard page for whatever identifier this payment carries. */
export function stripePaymentUrl(payment: AdminPaymentDetail): string | null {
  if (payment.stripe_payment_intent) return `https://dashboard.stripe.com/payments/${payment.stripe_payment_intent}`;
  if (payment.stripe_checkout_session) return `https://dashboard.stripe.com/checkout/sessions/${payment.stripe_checkout_session}`;
  return null;
}
