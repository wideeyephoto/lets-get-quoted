import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeClient, fromCents, toCents } from '@/lib/stripe';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { getRecipientTransferStatus } from '@/lib/stripe-connect';
import { sendPaymentSmsEvent } from '@/lib/sms';
import { createPaymentFeedEvent, createDisputeFeedEvent } from '@/lib/job-feed';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { storeSavedCardFromSetup } from '@/lib/card-on-file';
import { rescheduleDunningAfterCardUpdate } from '@/lib/dunning';
import { markInvoicePaidForPayment } from '@/lib/invoices';
import { handlePlanPaymentSettled, handlePlanPaymentFailed } from '@/lib/payment-plans';
import { confirmQuickStopPayment } from '@/lib/quick-stop-payments';
import { reversedPlatformFee } from '@/lib/payments';

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
    const [businessName, ownerEmail] = await Promise.all([
      loadBusinessName(admin, accountId),
      getAccountOwnerEmail(admin, accountId),
    ]);
    if (!ownerEmail) {
      console.warn(`No owner email for account ${accountId}; alert "${alert.subject}" not emailed.`);
      return;
    }
    await sendContractorAlertEmail({
      recipientEmail: ownerEmail,
      businessName,
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
  // Stripe delivers webhooks at-least-once and can overlap a retry with a still-
  // in-flight first delivery, so this must be an atomic compare-and-set, not a
  // read-then-write: the conditional UPDATE both flips the row and tells us
  // whether THIS delivery is the one that won. Only the winner runs the
  // side-effects below, so duplicates never double-notify.
  //
  // The status filter does double duty: it makes a delivery for an already-paid
  // payment a no-op (so a duplicate can't overwrite `paid_at` with a later
  // timestamp, nor stomp a real e-signature `signed_at` downstream), and it
  // refuses to resurrect a `refunded`/`disputed` payment back to `paid` on a
  // late-arriving checkout.session.completed. Mirrors the payment_intent.succeeded
  // handler and every other transition in this file.
  const { data: transitioned, error: paymentError } = await admin
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent: stripePaymentIntent,
    })
    .eq('id', paymentId)
    .in('status', ['requested', 'processing', 'failed'])
    .select('invoice_id')
    .maybeSingle();

  if (paymentError) {
    console.error('Failed to mark payment paid:', paymentError);
    return;
  }

  // Already paid (or no longer in a payable state) — nothing transitioned, so
  // don't re-run the reconcile or re-notify.
  if (!transitioned) {
    return;
  }

  // If payment is linked to an invoice, mark invoice as paid (shared reconcile —
  // preserves a real e-signature, idempotent, never revives a voided invoice).
  if (transitioned.invoice_id) {
    await markInvoicePaidForPayment(admin, transitioned.invoice_id);
  }

  await sendPaymentSmsEvent(paymentId, 'payment_paid');
  await createPaymentFeedEvent(admin, paymentId, 'payment_paid');

  // If this payment belongs to a payment plan, advance the plan: a deposit
  // activates + schedules the installments, a payoff closes the plan, an
  // installment checks for completion. No-ops for one-off payments.
  await handlePlanPaymentSettled(admin, paymentId);
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    await logWebhookFailure({
      source: 'stripe',
      errorMessage: err instanceof Error ? err.message : 'Signature verification failed',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // A signature-verified event that then throws mid-dispatch (a bad write, an
  // unexpected shape) still needs to come back as a 500 so Stripe retries it —
  // but only after we've logged which event tripped it, so a string of these
  // shows up as a Command Center signal instead of silent 500s in a log.
  try {
    await dispatchStripeEvent(admin, event);
  } catch (err) {
    console.error(`Stripe webhook handler threw for event ${event.type} (${event.id}):`, err);
    await logWebhookFailure({
      source: 'stripe',
      eventType: event.type,
      referenceId: event.id,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Webhook handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function dispatchStripeEvent(admin: ReturnType<typeof createAdminClient>, event: Stripe.Event) {
  // Checkout session completed — a one-off payment succeeded, OR a recurring
  // plan's card-setup session finished (mode='setup', no charge).
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;
    const recurringPlanId = session.metadata?.recurring_plan_id;

    if (session.mode === 'setup' && recurringPlanId) {
      const setupIntentId = typeof session.setup_intent === 'string' ? session.setup_intent : session.setup_intent?.id ?? null;
      if (setupIntentId) {
        await storeSavedCardFromSetup(setupIntentId, recurringPlanId);
        // If any of this plan's charges stalled waiting for a good card, re-arm
        // them so the next dunning run charges the freshly-saved card.
        await rescheduleDunningAfterCardUpdate(admin, recurringPlanId);
      }
    } else if (paymentId && session.payment_status === 'paid') {
      const stripePaymentIntent =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
      await markPaymentPaid(admin, paymentId, stripePaymentIntent);
      // If this payment is a live Quick Stop offer, confirm the appointment
      // (idempotent compare-and-set; a no-op for every other payment).
      await confirmQuickStopPayment(admin, paymentId);
    }
  }

  // ACH (and other delayed methods) settle asynchronously: the Checkout session
  // completes with the payment still 'processing', then Stripe fires one of these
  // when the bank debit clears or bounces, often days later. "Paid" is set only
  // here (or via payment_intent.succeeded), never from the completion redirect.
  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;
    if (paymentId) {
      const stripePaymentIntent =
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
      await markPaymentPaid(admin, paymentId, stripePaymentIntent);
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;
    if (paymentId) {
      const { data: transitioned } = await admin
        .from('payments')
        .update({ status: 'failed' })
        .eq('id', paymentId)
        .in('status', ['requested', 'processing'])
        .select('id')
        .maybeSingle();
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
      // Release a held payoff lock if a large ACH payoff bounced.
      await handlePlanPaymentFailed(admin, paymentId);
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
      // A payment-plan payoff was abandoned — release its lock so the plan
      // resumes its normal installment schedule.
      await handlePlanPaymentFailed(admin, paymentId);
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
      // Release a held payoff lock if this failed charge was a plan payoff.
      await handlePlanPaymentFailed(admin, paymentId);
    }
  }

  // Charge refunded — either from our own refundPayment() call or a refund issued
  // directly in the Stripe Dashboard (which carries no metadata beyond what the
  // charge already had). `amount_refunded` is CUMULATIVE cents across all refunds
  // on this charge, so a $20-then-$30 sequence arrives as 20 then 50. Treat it as
  // the source of truth: store the running dollar total and only mark the payment
  // fully `refunded` once it reaches the charge total. A partial refund keeps it
  // `paid` (still collectible/refundable) and leaves any linked invoice intact.
  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentId = charge.metadata?.payment_id;

    if (paymentId) {
      console.log(`Charge refunded for payment ${paymentId}: ${charge.amount_refunded}/${charge.amount} cents`);
      const refundedTotal = fromCents(charge.amount_refunded);
      const isFull = charge.amount_refunded >= charge.amount;

      const { data: payment } = await admin
        .from('payments')
        // amount + platform_fee ride along so the fee reversal can be computed
        // from the same cumulative total Stripe just sent us.
        .select('id, invoice_id, status, refunded_amount, amount, platform_fee')
        .eq('id', paymentId)
        .maybeSingle();

      // Reconcile only a collected payment; never resurrect a disputed one, and
      // never walk the refunded total backwards. Acting only on NEW progress makes
      // at-least-once redelivery and the synchronous refundPayment() write no-ops.
      if (
        payment &&
        (payment.status === 'paid' || payment.status === 'refunded') &&
        toCents(refundedTotal) > toCents(Number(payment.refunded_amount) || 0)
      ) {
        const { data: transitioned } = await admin
          .from('payments')
          .update({
            refunded_amount: refundedTotal,
            status: isFull ? 'refunded' : 'paid',
            // This branch only runs on NEW progress, so stamping the time here
            // dates the refund that just happened rather than re-dating an old
            // one on a redelivered event.
            refunded_at: new Date().toISOString(),
            // Derived from the cumulative total, so it agrees with the
            // synchronous write in refundPayment whichever lands first.
            platform_fee_refunded: reversedPlatformFee({
              amount: payment.amount,
              platformFee: payment.platform_fee,
              refundedTotal,
            }),
          })
          .eq('id', payment.id)
          .in('status', ['paid', 'refunded'])
          .select('id, invoice_id')
          .maybeSingle();
        if (transitioned) {
          // Only a full refund voids the linked invoice and texts the homeowner
          // (the refund SMS states the full amount, so it's wrong for a partial).
          if (isFull && transitioned.invoice_id) {
            await admin.from('invoices').update({ status: 'void' }).eq('id', transitioned.invoice_id);
          }
          if (isFull) await sendPaymentSmsEvent(paymentId, 'payment_refunded');
          await createPaymentFeedEvent(admin, paymentId, 'payment_refunded');
        }
      }
    }
  }

  // Payment intent failed — alternative to charge.failed for some scenarios.
  if (event.type === 'payment_intent.payment_failed') {
    const paymentIntent = event.data.object;
    const paymentId = paymentIntent.metadata?.payment_id;
    const recurringPlanId = paymentIntent.metadata?.recurring_plan_id;
    const paymentPlanId = paymentIntent.metadata?.payment_plan_id;

    // Recurring charges are owned by the dunning path, and payment-plan
    // installments are recorded + notified synchronously by chargePlanInstallment
    // (which also records the decline). Skip both here so we don't double-notify.
    if (paymentId && !recurringPlanId && !paymentPlanId) {
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

  // Payment intent succeeded — out-of-band reconciliation for off-session
  // (recurring/dunning) charges: mark the payment paid idempotently even if the
  // synchronous DB write was lost (crash between the Stripe charge and the write).
  // The status guard means a payment already marked paid is a no-op (no double
  // notification), so a normal charge that recorded itself is untouched.
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    const paymentId = paymentIntent.metadata?.payment_id;
    if (paymentId) {
      const { data: transitioned } = await admin
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: paymentIntent.id, dunning_state: 'recovered', next_retry_at: null })
        .eq('id', paymentId)
        .in('status', ['requested', 'processing', 'failed'])
        .select('id, invoice_id')
        .maybeSingle();
      if (transitioned) {
        // Keep the visit invoice in lockstep with the settled off-session charge.
        if (transitioned.invoice_id) await markInvoicePaidForPayment(admin, transitioned.invoice_id);
        await createPaymentFeedEvent(admin, paymentId, 'payment_paid');
        await sendPaymentSmsEvent(paymentId, 'payment_paid');
        // Out-of-band safety net for a plan installment/payoff whose synchronous
        // write was lost — advance the plan idempotently.
        await handlePlanPaymentSettled(admin, paymentId);
      }
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
            stripe_dispute_id: dispute.id ?? null,
            dispute_due_by: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
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
            // Says what is certainly true, and no more.
            //
            // These three strings used to tell the contractor the money came out
            // of THEIR balance — while the comment on the dispute-created handler
            // above says this platform is the losses_collector, i.e. it comes out
            // of OURS. Both can't be right, and a message about whose money moved
            // is exactly the kind a contractor will act on: reconciling against a
            // balance that never changed, or chasing us about one that did.
            //
            // What holds either way is that the payment is no longer collected
            // and the invoice is void. Whose balance settles it is a Connect
            // controller setting, so it doesn't belong in a hardcoded sentence.
            await createDisputeFeedEvent(admin, payment.id, 'dispute_lost', 'Chargeback lost', 'The dispute was resolved in the homeowner’s favour, so this payment no longer counts as collected.');
            await emailContractorAlert(admin, payment.account_id, {
              subject: 'Chargeback lost',
              heading: 'A chargeback was resolved against you',
              bodyLines: [
                'The homeowner’s bank decided the dispute in their favour, so this payment no longer counts as collected.',
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
}
