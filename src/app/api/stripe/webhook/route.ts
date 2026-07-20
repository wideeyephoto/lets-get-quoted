import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import { createAdminClient } from '@/lib/auth';
import { getRecipientTransferStatus } from '@/lib/stripe-connect';
import { sendPaymentSmsEvent } from '@/lib/sms';
import { createPaymentFeedEvent, createDisputeFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';

// Stripe webhooks require the raw request body for signature verification,
// so this route must not be statically optimized or have its body parsed.
export const dynamic = 'force-dynamic';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Emails the account owner an out-of-band alert. Best-effort by contract: a
// send failure is swallowed so it can never bubble out of a webhook handler
// (that would make Stripe retry the whole event and re-run DB mutations).
async function emailContractorAlert(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  alert: { subject: string; heading: string; bodyLines: string[]; ctaLabel: string; ctaPath: string; tone?: 'warning' | 'info' }
) {
  try {
    const [{ data: account }, ownerEmail] = await Promise.all([
      admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
      getAccountOwnerEmail(admin, accountId),
    ]);
    if (!ownerEmail) {
      console.warn(`No owner email for account ${accountId}; alert "${alert.subject}" not emailed.`);
      return;
    }
    await sendContractorAlertEmail({
      recipientEmail: ownerEmail,
      businessName: account?.business_name || "Let's Get Quoted",
      subject: alert.subject,
      heading: alert.heading,
      bodyLines: alert.bodyLines,
      ctaLabel: alert.ctaLabel,
      ctaUrl: `${APP_ORIGIN}${alert.ctaPath}`,
      tone: alert.tone,
    });
  } catch (err) {
    console.error(`Contractor alert email failed (non-fatal) for account ${accountId}:`, err);
  }
}

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

  // Stripe delivers webhooks at-least-once, so the same event can arrive more
  // than once. Skip re-processing once already paid — otherwise a duplicate
  // delivery would overwrite `paid_at` with a later timestamp and, worse,
  // stomp a real e-signature `signed_at` (see signInvoice) with the payment
  // time below.
  if (payment?.status === 'paid') {
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

  // If payment is linked to an invoice, mark invoice as paid. Preserve a real
  // e-signature's `signed_at`/`signer_name` (signInvoice) — only backfill
  // `signed_at` here if the invoice was never actually signed by the client.
  if (payment?.invoice_id) {
    const { data: invoice, error: invoiceFetchError } = await admin
      .from('invoices')
      .select('signed_at')
      .eq('id', payment.invoice_id)
      .maybeSingle();

    if (invoiceFetchError) {
      console.error('Failed to fetch invoice before marking paid:', invoiceFetchError);
    }

    const { error: invoiceError } = await admin
      .from('invoices')
      .update({
        status: 'paid',
        ...(invoice?.signed_at ? {} : { signed_at: new Date().toISOString() }),
      })
      .eq('id', payment.invoice_id);

    if (invoiceError) {
      console.error('Failed to mark invoice paid:', invoiceError);
    }
  }

  await sendPaymentSmsEvent(paymentId, 'payment_paid');
  await createPaymentFeedEvent(admin, paymentId, 'payment_paid');
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
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
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
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
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
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_refunded');
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
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
    }
  }

  // Connect account updated — capabilities may have changed
  if (event.type === 'account.updated') {
    const stripeAccount = event.data.object;
    const stripeAccountId = stripeAccount.id;

    // Legacy account.updated events contain a v1 Account shape. Retrieve the
    // authoritative Recipient capability through Accounts v2 before updating.
    const transferStatus = await getRecipientTransferStatus(stripeAccountId);
    if (transferStatus === null) {
      // Status couldn't be read (missing/unavailable in the API response) —
      // don't let an ambiguous read force a working contractor's account
      // offline. Only flip `connect_onboarded` on a concrete status value;
      // Stripe will redeliver this event, so a transient read failure isn't lost.
      console.warn(`Connect account ${stripeAccountId}: stripe_transfers status unavailable, skipping connect_onboarded update.`);
    } else {
      const isActive = transferStatus === 'active';
      const { data: current } = await admin
        .from('accounts')
        .select('id, connect_onboarded, connect_disabled_at')
        .eq('stripe_connect_id', stripeAccountId)
        .maybeSingle();

      if (current) {
        if (isActive) {
          // Active (first activation or a recovery) — clear any prior disabled
          // stamp so the dashboard alert goes away.
          await admin
            .from('accounts')
            .update({ connect_onboarded: true, connect_disabled_at: null })
            .eq('id', current.id);
        } else {
          // Transfers are not active. Only stamp `connect_disabled_at` when a
          // PREVIOUSLY working account is being disabled — this distinguishes a
          // real revocation (contractor can no longer get paid, needs an alert)
          // from an account that simply never finished onboarding. Keep the
          // first disabled timestamp on redelivery.
          const wasWorking = current.connect_onboarded && !current.connect_disabled_at;
          await admin
            .from('accounts')
            .update({
              connect_onboarded: false,
              ...(wasWorking ? { connect_disabled_at: new Date().toISOString() } : {}),
            })
            .eq('id', current.id);
          if (wasWorking) {
            console.error(`[CONNECT] Account ${current.id} (${stripeAccountId}) transfers disabled: status=${transferStatus}`);
            await emailContractorAlert(admin, current.id, {
              subject: 'Your payouts are paused',
              heading: 'Stripe paused your payments',
              bodyLines: [
                'Stripe has turned off transfers for your account, so homeowner deposits and stage payments can’t be collected right now.',
                'This usually means Stripe needs more information to keep your account verified. Reconnect to see what’s required and restore payouts.',
              ],
              ctaLabel: 'Resolve payout issue',
              ctaPath: '/dashboard/settings',
            });
          }
        }
      }
      console.log(`Connect account ${stripeAccountId} stripe_transfers status: ${transferStatus}`);
    }
  }

  // Chargeback opened — the homeowner's bank is pulling the funds back. Since
  // this platform is losses_collector, a lost dispute is the platform's money,
  // so make it a first-class, contractor-visible state rather than a log line.
  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object;
    const paymentIntentId =
      typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
    console.error(
      `[DISPUTE] Chargeback opened: payment_intent=${paymentIntentId} amount=${dispute.amount} reason=${dispute.reason} status=${dispute.status}`
    );

    if (paymentIntentId) {
      // Disputes don't carry our charge metadata, so match on the stored
      // payment intent id rather than dispute.metadata (which is empty).
      const { data: payment } = await admin
        .from('payments')
        .select('id, account_id, job_id, status')
        .eq('stripe_payment_intent', paymentIntentId)
        .maybeSingle();

      if (payment && payment.status === 'paid') {
        const { data: transitioned } = await admin
          .from('payments')
          .update({
            status: 'disputed',
            disputed_at: new Date().toISOString(),
            dispute_reason: dispute.reason ?? null,
            dispute_status: dispute.status ?? null,
          })
          .eq('id', payment.id)
          .eq('status', 'paid')
          .select('id')
          .maybeSingle();
        if (transitioned) {
          await createDisputeFeedEvent(
            admin,
            payment.id,
            'payment_disputed',
            'Chargeback opened',
            `The homeowner disputed this payment${dispute.reason ? ` (${dispute.reason})` : ''}. Stripe is reviewing it — respond promptly with evidence.`
          );
          await emailContractorAlert(admin, payment.account_id, {
            subject: 'A payment was disputed',
            heading: 'A homeowner opened a chargeback',
            bodyLines: [
              `A homeowner disputed a payment${dispute.reason ? ` (reason: ${dispute.reason})` : ''}. Stripe is reviewing it and the funds are held until it resolves.`,
              'Respond promptly with evidence — photos, the signed invoice, and any messages help your case.',
            ],
            ctaLabel: 'Open the job',
            ctaPath: `/dashboard/jobs/${payment.job_id}`,
          });
        }
      }
    }
  }

  // Chargeback resolved. Won → the payment stands (revert to paid). Lost → the
  // funds are gone; treat like a refund (mark refunded, void any linked invoice).
  if (event.type === 'charge.dispute.closed') {
    const dispute = event.data.object;
    const paymentIntentId =
      typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
    console.error(`[DISPUTE] Chargeback closed: payment_intent=${paymentIntentId} status=${dispute.status}`);

    if (paymentIntentId && (dispute.status === 'won' || dispute.status === 'lost')) {
      const { data: payment } = await admin
        .from('payments')
        .select('id, account_id, job_id, invoice_id, status')
        .eq('stripe_payment_intent', paymentIntentId)
        .maybeSingle();

      if (payment && payment.status === 'disputed') {
        if (dispute.status === 'won') {
          const { data: transitioned } = await admin
            .from('payments')
            .update({ status: 'paid', dispute_status: 'won' })
            .eq('id', payment.id)
            .eq('status', 'disputed')
            .select('id')
            .maybeSingle();
          if (transitioned) {
            await createDisputeFeedEvent(admin, payment.id, 'dispute_won', 'Chargeback won', 'Stripe resolved the dispute in your favor. The payment stands.');
          }
        } else {
          const { data: transitioned } = await admin
            .from('payments')
            .update({ status: 'refunded', dispute_status: 'lost' })
            .eq('id', payment.id)
            .eq('status', 'disputed')
            .select('id')
            .maybeSingle();
          if (transitioned) {
            if (payment.invoice_id) {
              await admin.from('invoices').update({ status: 'void' }).eq('id', payment.invoice_id);
            }
            await createDisputeFeedEvent(admin, payment.id, 'dispute_lost', 'Chargeback lost', 'The dispute was lost and the funds were withdrawn from your balance.');
            await emailContractorAlert(admin, payment.account_id, {
              subject: 'Chargeback lost — funds withdrawn',
              heading: 'A chargeback was resolved against you',
              bodyLines: [
                'The payment dispute was lost, and the funds were withdrawn from your balance.',
                'Any invoice linked to this payment has been voided.',
              ],
              ctaLabel: 'Open the job',
              ctaPath: `/dashboard/jobs/${payment.job_id}`,
            });
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
