import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import { createAdminClient } from '@/lib/auth';
import { getRecipientTransferStatus } from '@/lib/stripe-connect';
import { sendPaymentSmsEvent } from '@/lib/sms';

// Stripe webhooks require the raw request body for signature verification,
// so this route must not be statically optimized or have its body parsed.
export const dynamic = 'force-dynamic';

async function markPaymentPaid(admin: ReturnType<typeof createAdminClient>, paymentId: string, stripePaymentIntent: string | null) {
  const { data: payment, error: fetchError } = await admin
    .from('payments')
    .select('invoice_id, status')
    .eq('id', paymentId)
    .maybeSingle();

  if (fetchError) {
    console.error('Failed to fetch payment:', fetchError);
    return;
  }

  // Update payment status to paid
  const { error: paymentError } = await admin
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent: stripePaymentIntent,
    })
    .eq('id', paymentId);

  if (paymentError) {
    console.error('Failed to mark payment paid:', paymentError);
    return;
  }

  // If payment is linked to an invoice, mark invoice as paid
  if (payment?.invoice_id) {
    const { error: invoiceError } = await admin
      .from('invoices')
      .update({
        status: 'paid',
        signed_at: new Date().toISOString(),
      })
      .eq('id', payment.invoice_id);

    if (invoiceError) {
      console.error('Failed to mark invoice paid:', invoiceError);
    }
  }

  if (payment?.status !== 'paid') await sendPaymentSmsEvent(paymentId, 'payment_paid');
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Checkout session completed — payment succeeded
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;

    if (paymentId && session.payment_status === 'paid') {
      const stripePaymentIntent =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
      await markPaymentPaid(admin, paymentId, stripePaymentIntent);
    }
  }

  // Checkout session expired — payment abandoned
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;

    if (paymentId) {
      const { data: transitioned } = await admin
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .eq('stripe_checkout_session', session.id)
        .eq('status', 'processing')
        .select('id')
        .maybeSingle();
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
    }
  }

  // Charge failed — card declined, insufficient funds, etc.
  if (event.type === 'charge.failed') {
    const charge = event.data.object;
    const paymentId = charge.metadata?.payment_id;

    if (paymentId) {
      console.log(`Charge failed for payment ${paymentId}:`, charge.failure_message);
      const { data: transitioned } = await admin
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .in('status', ['requested', 'processing'])
        .select('id')
        .maybeSingle();
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
    }
  }

  // Charge refunded — either via webhook or from our refundPayment() call
  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentId = charge.metadata?.payment_id;

    if (paymentId) {
      console.log(`Charge refunded for payment ${paymentId}: ${charge.amount_refunded} cents`);
      const { data: transitioned } = await admin
        .from('payments')
        .update({ status: 'refunded' })
        .eq('id', paymentId)
        .eq('status', 'paid')
        .select('id')
        .maybeSingle();
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_refunded');
    }
  }

  // Payment intent failed — alternative to charge.failed for some scenarios
  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const paymentId = paymentIntent.metadata?.payment_id;

    if (paymentId) {
      console.log(`Payment intent failed for payment ${paymentId}:`, paymentIntent.last_payment_error);
      const { data: transitioned } = await admin
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .in('status', ['requested', 'processing'])
        .select('id')
        .maybeSingle();
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
    }
  }

  // Connect account updated — capabilities may have changed
  if (event.type === 'account.updated') {
    const stripeAccount = event.data.object;
    const accountId = stripeAccount.id;

    // Legacy account.updated events contain a v1 Account shape. Retrieve the
    // authoritative Recipient capability through Accounts v2 before updating.
    const transferStatus = await getRecipientTransferStatus(accountId);
    await admin
      .from('accounts')
      .update({ connect_onboarded: transferStatus === 'active' })
      .eq('stripe_connect_id', accountId);
    console.log(`Connect account ${accountId} stripe_transfers status: ${transferStatus ?? 'unavailable'}`);
  }

  return NextResponse.json({ received: true });
}
