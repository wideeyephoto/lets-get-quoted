'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin';
import { getPaymentForAdmin, refundBlockedReason } from '@/lib/admin-payments';
import { refundPayment } from '@/lib/payments';

function backTo(id: string, query: string): never {
  redirect(`/admin/payments/${id}?${query}`);
}

/**
 * Refund a payment from the console.
 *
 * The gap this closes is not "staff could not refund" — they could, in the
 * Stripe dashboard, and the charge.refunded webhook reconciles those back into
 * our tables correctly. It is that a refund issued there leaves no
 * admin_actions row, carries no reason, and never appears on /admin/audit. So
 * the question "who gave this customer $2,400 back, and why" had no answer
 * inside the product.
 *
 * A reason is REQUIRED here, unlike on the Quick Stop refund, which defaults to
 * "Resolved by <email>". A Quick Stop refund is one of four fixed adjudications
 * with the outcome itself as the explanation; this is a free-amount refund
 * against an arbitrary charge, and "why" is the entire audit value.
 */
export async function refundPaymentAction(paymentId: string, formData: FormData) {
  const ctx = await requirePermission('money.refund');
  const { admin } = ctx;

  const payment = await getPaymentForAdmin(admin, paymentId);
  if (!payment) backTo(paymentId, 'error=notfound');

  const reason = String(formData.get('reason') ?? '').trim();
  if (!reason) backTo(paymentId, 'error=reason');

  // Re-checked server-side. The form is only rendered when this passes, but a
  // server action is a public endpoint and the row can change between render
  // and submit — a dispute opening in that window is exactly the case where
  // refunding anyway pays the customer twice.
  if (refundBlockedReason(payment)) backTo(paymentId, 'error=blocked');

  const raw = String(formData.get('amount') ?? '').replace(/[^0-9.]/g, '').trim();
  const amountDollars = raw ? Number(raw) : undefined;
  if (raw && (!Number.isFinite(amountDollars) || (amountDollars ?? 0) <= 0)) backTo(paymentId, 'error=amount');

  let result: { amount: number; isFull: boolean; refundedTotal: number };
  try {
    // refundPayment carries the idempotency key that makes a double submit
    // return the ORIGINAL refund rather than creating a second one, and it
    // reverses our application fee and the contractor's transfer in proportion.
    result = await refundPayment(admin, payment.account_id, paymentId, amountDollars);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('admin refundPaymentAction failed:', message);
    // Stripe's own refusal is more useful than anything generic — "you can
    // refund at most $X" tells the operator what to type next.
    backTo(paymentId, `error=refund&detail=${encodeURIComponent(message.slice(0, 200))}`);
  }

  await logAdminAction(admin, ctx, {
    action: 'payment_refund',
    accountId: payment.account_id,
    targetType: 'payment',
    targetId: paymentId,
    reason,
    before: { refunded_amount: payment.refunded_amount, status: payment.status },
    after: { refunded_amount: result.refundedTotal, status: result.isFull ? 'refunded' : 'paid' },
    meta: {
      amountDollars: amountDollars ?? 'full remaining',
      refundedThisTime: result.amount,
      isFull: result.isFull,
      stripePaymentIntent: payment.stripe_payment_intent,
    },
  });

  revalidatePath(`/admin/payments/${paymentId}`);
  revalidatePath(`/admin/accounts/${payment.account_id}`);
  backTo(paymentId, 'done=refunded');
}
