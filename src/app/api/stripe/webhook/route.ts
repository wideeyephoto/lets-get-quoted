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
import { handleAdBudgetWebhookEvent } from '@/lib/ad-billing';
import {
  coordinateLegacyDestinationPaymentProjection,
  legacyPaymentPlanProjectionEnabled,
  legacyQuickStopReconciliationEnabled,
  type LegacyProjectionCallbacks,
  type LegacyProjectionEventType,
  type LegacyProjectionSavedCardEvidence,
} from '@/lib/billing/legacy-payment-projection-coordinator';
import {
  inspectLegacyDestinationPaymentRail,
  isLegacyDestinationPayment,
  reversedPlatformFee,
} from '@/lib/payments';
import {
  legacyDestinationCheckoutProjectionEnabled,
  legacyDestinationCompareAndSetStandsDown,
} from '@/lib/billing/legacy-destination-checkout-projection';

// Stripe webhooks require the raw request body for signature verification,
// so this route must not be statically optimized or have its body parsed.
export const dynamic = 'force-dynamic';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
const STRIPE_CHECKOUT_SESSION_PATTERN = /^cs_(?:test_)?[A-Za-z0-9_]+$/;
const STRIPE_PAYMENT_INTENT_PATTERN = /^pi_[A-Za-z0-9_]+$/;
const LEGACY_PROVIDER_BINDING_CONTRADICTION =
  'legacy_payment_provider_binding_contradiction';
const LEGACY_PROVIDER_BINDING_LOOKUP_FAILED =
  'legacy_payment_provider_binding_lookup_failed';
const LEGACY_PROVIDER_BINDING_MISSING =
  'legacy_payment_provider_binding_missing';
const LEGACY_WEBHOOK_HANDLER_ERROR = 'legacy_payment_webhook_handler_error';
const FIXED_LEGACY_WEBHOOK_ERRORS = new Set([
  LEGACY_PROVIDER_BINDING_CONTRADICTION,
  LEGACY_PROVIDER_BINDING_LOOKUP_FAILED,
  LEGACY_PROVIDER_BINDING_MISSING,
]);

function expandableStripeId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function paymentIntentId(value: unknown): string | null {
  return expandableStripeId(value);
}

function normalizedLegacyWebhookError(error: unknown): string {
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const code = (error as { code?: unknown }).code;
    if (
      typeof code === 'string'
      && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)
    ) {
      return `legacy_payment_database_error_${code.toLowerCase()}`;
    }
  }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const contract = error as { name?: unknown; code?: unknown };
    if (
      contract.name === 'LegacyPaymentProjectionContractError'
      && typeof contract.code === 'string'
      && /^[a-z][a-z0-9_]{2,80}$/.test(contract.code)
    ) {
      return contract.code;
    }
  }
  if (error instanceof Error && FIXED_LEGACY_WEBHOOK_ERRORS.has(error.message)) {
    return error.message;
  }
  return LEGACY_WEBHOOK_HANDLER_ERROR;
}

type LegacyPaymentIntentCheckoutBinding = Readonly<{
  checkoutSessionId: string | null;
}>;

/**
 * Session-less Charge and PaymentIntent events still need a Checkout-generation
 * identity before an enabled cutover may mutate a row. Stripe's filtered list
 * is authoritative for that reverse lookup. No matching Session means this is
 * a true off-session intent, which is bound only to a row with no Session.
 */
async function resolveLegacyPaymentIntentCheckoutBinding(
  stripe: ReturnType<typeof getStripeClient>,
  exactPaymentIntentId: string,
  paymentId: string,
): Promise<LegacyPaymentIntentCheckoutBinding> {
  if (!STRIPE_PAYMENT_INTENT_PATTERN.test(exactPaymentIntentId)) {
    throw new Error(LEGACY_PROVIDER_BINDING_CONTRADICTION);
  }

  const sessions = await stripe.checkout.sessions.list({
    payment_intent: exactPaymentIntentId,
    limit: 2,
  }).catch(() => {
    throw new Error(LEGACY_PROVIDER_BINDING_LOOKUP_FAILED);
  });
  if (!Array.isArray(sessions.data) || sessions.data.length > 1) {
    throw new Error(LEGACY_PROVIDER_BINDING_CONTRADICTION);
  }
  if (sessions.data.length === 0) {
    return Object.freeze({ checkoutSessionId: null });
  }

  const [session] = sessions.data;
  if (
    !session
    || !STRIPE_CHECKOUT_SESSION_PATTERN.test(session.id)
    || session.mode !== 'payment'
    || paymentIntentId(session.payment_intent) !== exactPaymentIntentId
    || session.metadata?.payment_id !== paymentId
  ) {
    throw new Error(LEGACY_PROVIDER_BINDING_CONTRADICTION);
  }

  return Object.freeze({ checkoutSessionId: session.id });
}

function savedCardEvidenceFromPaymentIntent(
  intent: Stripe.PaymentIntent,
  fallbackCustomer: unknown = null,
): LegacyProjectionSavedCardEvidence {
  const paymentMethod = intent.payment_method;
  const expandedPaymentMethod = paymentMethod && typeof paymentMethod === 'object'
    ? paymentMethod
    : null;

  return Object.freeze({
    stripeCustomerId: expandableStripeId(intent.customer)
      ?? expandableStripeId(fallbackCustomer),
    stripePaymentMethodId: expandableStripeId(paymentMethod),
    cardBrand: expandedPaymentMethod?.card?.brand ?? null,
    cardLast4: expandedPaymentMethod?.card?.last4 ?? null,
  });
}

/**
 * Preserve the legacy deposit activation's best-effort saved-card capture.
 * This function is passed lazily to the coordinator, so it performs no provider
 * work unless the plan flag is exactly 1 and the bound payment is a deposit.
 */
async function loadLegacySavedCardEvidence(
  stripe: ReturnType<typeof getStripeClient>,
  paymentIntent: string | Stripe.PaymentIntent | null,
  fallbackCustomer: unknown = null,
): Promise<LegacyProjectionSavedCardEvidence> {
  if (!paymentIntent) {
    return Object.freeze({
      stripeCustomerId: expandableStripeId(fallbackCustomer),
    });
  }

  const signedEvidence = typeof paymentIntent === 'object'
    ? savedCardEvidenceFromPaymentIntent(paymentIntent, fallbackCustomer)
    : Object.freeze({
        stripeCustomerId: expandableStripeId(fallbackCustomer),
      });
  if (
    typeof paymentIntent === 'object'
    && paymentIntent.payment_method
    && typeof paymentIntent.payment_method === 'object'
  ) {
    return signedEvidence;
  }

  const exactPaymentIntentId = typeof paymentIntent === 'string'
    ? paymentIntent
    : paymentIntent.id;

  try {
    const intent = await stripe.paymentIntents.retrieve(exactPaymentIntentId, {
      expand: ['payment_method'],
    });
    if (intent.id !== exactPaymentIntentId) {
      throw new Error('Stripe returned a different PaymentIntent.');
    }
    return savedCardEvidenceFromPaymentIntent(intent, fallbackCustomer);
  } catch {
    // This is intentionally best-effort, matching the pre-cutover activation.
    // The transactional projector may still activate the plan without card
    // evidence; installments remain unchargeable until a card is captured.
    console.error('Legacy payment-plan saved-card lookup failed.');
    // Preserve the customer / PaymentMethod IDs from the signed event even when
    // Stripe's best-effort expansion read is temporarily unavailable.
    return signedEvidence;
  }
}

async function coordinateLegacyPaymentSideEffects(input: Readonly<{
  eventId: string;
  eventType: LegacyProjectionEventType;
  eventObjectId: string;
  paymentIntentId: string | null;
  paymentId: string;
  outcome: 'settled' | 'failed';
  legacy: LegacyProjectionCallbacks;
  savedCard?: () => Promise<LegacyProjectionSavedCardEvidence>;
}>): Promise<void> {
  await coordinateLegacyDestinationPaymentProjection({
    event: {
      eventId: input.eventId,
      eventType: input.eventType,
      eventObjectId: input.eventObjectId,
      paymentIntentId: input.paymentIntentId,
      paymentId: input.paymentId,
      outcome: input.outcome,
    },
    legacy: input.legacy,
    savedCard: input.savedCard,
  });
}

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
      accountId,
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

async function markPaymentPaid(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  stripePaymentIntent: string | null,
  exactProviderBinding: Readonly<{
    checkoutSessionId: string | null;
    requirePaymentIntent: boolean;
    replacePaymentIntent?: boolean;
  }> | null = null,
): Promise<{ legacyRailAuthorized: boolean; transitioned: boolean; alreadyPaid: boolean }> {
  const rail = await inspectLegacyDestinationPaymentRail(admin, paymentId);
  // Standing down covers both "never on this rail" and "the generation ledger
  // owns it now". Callers already run no side effects on this answer, so the
  // second case inherits that behavior rather than needing a parallel path.
  // The explicit kind test stays first so the rail stays narrowed below; a
  // boolean helper cannot narrow a union on its own.
  if (
    rail.kind !== 'allowed'
    || legacyDestinationCompareAndSetStandsDown({
      railKind: rail.kind,
      projectionEnabled: legacyDestinationCheckoutProjectionEnabled(),
    })
  ) {
    return { legacyRailAuthorized: false, transitioned: false, alreadyPaid: false };
  }
  if (
    exactProviderBinding?.requirePaymentIntent
    && (!stripePaymentIntent || !STRIPE_PAYMENT_INTENT_PATTERN.test(stripePaymentIntent))
  ) {
    throw new Error(LEGACY_PROVIDER_BINDING_MISSING);
  }

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
  let transition = admin
    .from('payments')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent: stripePaymentIntent,
      // The bank transfer has landed, so it is no longer in flight. Cleared in
      // the same UPDATE as the status it belongs to, rather than afterwards: a
      // second write could fail on its own and leave /pay/[id] telling a
      // homeowner their settled payment is still clearing. Advisory either way
      // -- readers check `status` first -- which is exactly why this column
      // carries no CHECK constraint. See migration 20260821001000.
      async_payment_pending_at: null,
    })
    .eq('id', paymentId);
  if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
  if (exactProviderBinding) {
    transition = exactProviderBinding.checkoutSessionId === null
      ? transition.is('stripe_checkout_session', null)
      : transition.eq('stripe_checkout_session', exactProviderBinding.checkoutSessionId);
    if (!exactProviderBinding.replacePaymentIntent) {
      // A true off-session event has no Session generation to prove ownership,
      // so it may bind only NULL or its already-exact PaymentIntent.
      transition = transition.or(
        `stripe_payment_intent.is.null,stripe_payment_intent.eq.${stripePaymentIntent}`,
      );
    }
  }
  const { data: transitioned, error: paymentError } = await transition
    .in('status', ['requested', 'processing', 'failed'])
    .select('invoice_id')
    .maybeSingle();

  if (paymentError) {
    throw paymentError;
  }

  // Already paid (or no longer in a payable state) — nothing transitioned, so
  // don't re-run the reconcile or re-notify.
  if (!transitioned) {
    if (exactProviderBinding) {
      return {
        legacyRailAuthorized: true,
        transitioned: false,
        alreadyPaid: await classifyLegacyPaymentProjectionNoop(admin, {
          paymentId,
          expectedStatus: 'paid',
          outcome: 'settled',
          chargeModelColumnPresent: rail.chargeModelColumnPresent,
          checkoutSessionId: exactProviderBinding.checkoutSessionId,
          stripePaymentIntent,
        }),
      };
    }

    // A webhook replay is the repair path for a crash after the payment CAS
    // won but before Quick Stop confirmation. Prove the row is already paid on
    // the same authorized rail; a refunded/disputed/canceled row must not
    // confirm an appointment merely because the payment UPDATE was a no-op.
    let paidReplay = admin
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .eq('status', 'paid');
    if (rail.chargeModelColumnPresent) paidReplay = paidReplay.eq('charge_model', 'destination');
    const { data: alreadyPaid, error: paidReplayError } = await paidReplay.maybeSingle();
    if (paidReplayError) throw paidReplayError;
    return {
      legacyRailAuthorized: true,
      transitioned: false,
      alreadyPaid: Boolean(alreadyPaid),
    };
  }

  // If payment is linked to an invoice, mark invoice as paid (shared reconcile —
  // preserves a real e-signature, idempotent, never revives a voided invoice).
  if (transitioned.invoice_id) {
    await markInvoicePaidForPayment(admin, transitioned.invoice_id);
  }

  await sendPaymentSmsEvent(paymentId, 'payment_paid');
  await createPaymentFeedEvent(admin, paymentId, 'payment_paid');
  return { legacyRailAuthorized: true, transitioned: true, alreadyPaid: false };
}

async function markLegacyPaymentFailed(
  admin: ReturnType<typeof createAdminClient>,
  paymentId: string,
  match: {
    statuses?: string[];
    status?: string;
    checkoutSessionId?: string | null;
    stripePaymentIntent?: string | null;
    bindPaymentIntent?: boolean;
    replacePaymentIntent?: boolean;
  } = {},
): Promise<{
  handled: boolean;
  chargeModelColumnPresent: boolean;
  transitioned: { id: string } | null;
}> {
  const rail = await inspectLegacyDestinationPaymentRail(admin, paymentId);
  // Failure projection stands down on exactly the same terms as settlement: a
  // rail with two authorities to fail a payment is as wrong as two to pay it.
  if (
    rail.kind !== 'allowed'
    || legacyDestinationCompareAndSetStandsDown({
      railKind: rail.kind,
      projectionEnabled: legacyDestinationCheckoutProjectionEnabled(),
    })
  ) {
    return {
      handled: false,
      chargeModelColumnPresent: false,
      transitioned: null,
    };
  }
  const writesPaymentIntent = match.bindPaymentIntent || match.replacePaymentIntent;
  if (
    writesPaymentIntent
    && match.stripePaymentIntent !== null
    && (
      typeof match.stripePaymentIntent !== 'string'
      || !STRIPE_PAYMENT_INTENT_PATTERN.test(match.stripePaymentIntent)
    )
  ) {
    throw new Error(LEGACY_PROVIDER_BINDING_MISSING);
  }
  if (match.bindPaymentIntent && !match.stripePaymentIntent) {
    throw new Error(LEGACY_PROVIDER_BINDING_MISSING);
  }

  let transition = admin
    .from('payments')
    .update({
      status: 'failed',
      // The bank debit bounced, so nothing is in flight any more. Same reasoning
      // as the settle path: cleared in the same UPDATE as the status, so a
      // homeowner is never shown "your transfer is clearing" over a payment that
      // has already failed and needs paying again.
      async_payment_pending_at: null,
      ...(writesPaymentIntent
        ? { stripe_payment_intent: match.stripePaymentIntent }
        : {}),
    })
    .eq('id', paymentId);
  if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
  if (Object.prototype.hasOwnProperty.call(match, 'checkoutSessionId')) {
    transition = match.checkoutSessionId === null
      ? transition.is('stripe_checkout_session', null)
      : transition.eq('stripe_checkout_session', match.checkoutSessionId);
  }
  if (Object.prototype.hasOwnProperty.call(match, 'stripePaymentIntent')) {
    // The exact current Checkout Session is the generation boundary. Its
    // signed provider fact may replace a predecessor generation's PI.
    if (!match.replacePaymentIntent && match.bindPaymentIntent) {
      // The first failed provider event may be the first place a legacy row sees
      // an off-session PI. Bind NULL once; a conflict cannot win this CAS.
      transition = transition.or(
        `stripe_payment_intent.is.null,stripe_payment_intent.eq.${match.stripePaymentIntent}`,
      );
    } else if (!match.replacePaymentIntent) {
      transition = match.stripePaymentIntent === null
        ? transition.is('stripe_payment_intent', null)
        : transition.eq('stripe_payment_intent', match.stripePaymentIntent);
    }
  }
  if (match.status) transition = transition.eq('status', match.status);
  if (match.statuses) transition = transition.in('status', match.statuses);
  const { data: transitioned, error } = await transition.select('id').maybeSingle();
  if (error) throw error;
  return {
    handled: true,
    chargeModelColumnPresent: rail.chargeModelColumnPresent,
    transitioned,
  };
}

/**
 * A projector/reconciler error happens after the primary payment CAS. On the
 * Stripe retry, prove that exact CAS result still owns the row before retrying
 * only the flagged projection. The disabled path never calls this read.
 */
async function classifyLegacyPaymentProjectionNoop(
  admin: ReturnType<typeof createAdminClient>,
  input: Readonly<{
    paymentId: string;
    expectedStatus: 'paid' | 'failed';
    outcome: 'settled' | 'failed';
    chargeModelColumnPresent: boolean;
    checkoutSessionId?: string | null;
    stripePaymentIntent: string | null;
  }>,
): Promise<boolean> {
  const columns = [
    'id',
    'status',
    'stripe_checkout_session',
    'stripe_payment_intent',
    ...(input.chargeModelColumnPresent ? ['charge_model'] : []),
  ].join(', ');
  let replay = admin
    .from('payments')
    .select(columns)
    .eq('id', input.paymentId);
  if (input.chargeModelColumnPresent) replay = replay.eq('charge_model', 'destination');
  const { data, error } = await replay.maybeSingle();
  if (error) throw error;
  if (!data) return false;

  const row = data as {
    status?: unknown;
    stripe_checkout_session?: unknown;
    stripe_payment_intent?: unknown;
  };
  const providerIdentityExact = (
    input.checkoutSessionId === undefined
    || row.stripe_checkout_session === input.checkoutSessionId
  ) && row.stripe_payment_intent === input.stripePaymentIntent;
  if (row.status === input.expectedStatus && providerIdentityExact) return true;

  // A signed failure for a provider-verified predecessor Session is harmless
  // once a different valid Session is current. It must not fail or project the
  // successor generation. Settled predecessor facts remain contradictions
  // because money may have moved and require operator reconciliation.
  if (
    input.outcome === 'failed'
    && typeof input.checkoutSessionId === 'string'
    && typeof row.stripe_checkout_session === 'string'
    && STRIPE_CHECKOUT_SESSION_PATTERN.test(row.stripe_checkout_session)
    && row.stripe_checkout_session !== input.checkoutSessionId
  ) {
    return false;
  }

  const legitimateTerminalStatuses = input.outcome === 'settled'
    ? new Set(['refunded', 'disputed', 'canceled'])
    : new Set(['paid', 'refunded', 'disputed', 'canceled']);
  if (typeof row.status === 'string' && legitimateTerminalStatuses.has(row.status)) {
    return false;
  }

  // A current/nonterminal row with a different Session or PI is not a harmless
  // duplicate. Surface one fixed, PII-free failure so Stripe retries and the
  // existing webhook-failure signal remains operator-visible.
  throw new Error(LEGACY_PROVIDER_BINDING_CONTRADICTION);
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
    await dispatchStripeEvent(admin, event, stripe);
  } catch (err) {
    const errorMessage = normalizedLegacyWebhookError(err);
    console.error(`Stripe webhook handler threw for event ${event.type} (${event.id}): ${errorMessage}`);
    await logWebhookFailure({
      source: 'stripe',
      eventType: event.type,
      referenceId: event.id,
      errorMessage,
    });
    return NextResponse.json({ error: 'Webhook handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function dispatchStripeEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: Stripe.Event,
  stripe: ReturnType<typeof getStripeClient>,
) {
  // Handle managed ad budget subscriptions & charges
  const handledAdEvent = await handleAdBudgetWebhookEvent(event, admin);
  if (handledAdEvent) return;

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
      const planProjectionEnabled = legacyPaymentPlanProjectionEnabled();
      const quickStopReconciliationEnabled = legacyQuickStopReconciliationEnabled();
      const settlement = await markPaymentPaid(
        admin,
        paymentId,
        stripePaymentIntent,
        planProjectionEnabled || quickStopReconciliationEnabled
          ? {
              checkoutSessionId: session.id,
              requirePaymentIntent: true,
              replacePaymentIntent: true,
            }
          : null,
      );
      // The coordinator runs only after the existing rail guard and payment CAS.
      // With both flags off it preserves the old plan-then-Quick-Stop order. An
      // enabled projector can repair a crash after the CAS on the already-paid
      // replay, while a blocked/direct row can never enter this caller.
      if (
        settlement.legacyRailAuthorized
        && (settlement.transitioned || settlement.alreadyPaid)
      ) {
        await coordinateLegacyPaymentSideEffects({
          eventId: event.id,
          eventType: event.type,
          eventObjectId: session.id,
          paymentIntentId: stripePaymentIntent,
          paymentId,
          outcome: 'settled',
          savedCard: () => loadLegacySavedCardEvidence(
            stripe,
            session.payment_intent,
            session.customer,
          ),
          legacy: {
            ...(settlement.transitioned || planProjectionEnabled
              ? { plan: () => handlePlanPaymentSettled(admin, paymentId) }
              : {}),
            quickStop: () => confirmQuickStopPayment(admin, paymentId),
          },
        });
      }
    } else if (paymentId && session.payment_status === 'unpaid' && session.payment_intent) {
      // THE CASE THIS FILE USED TO DROP ON THE FLOOR.
      //
      // A delayed payment method -- ACH above all -- completes the Checkout
      // Session with the money still moving: `completed` fires with
      // payment_status 'unpaid', and the settle handler above only runs on
      // 'paid'. So nothing was recorded, and the row sat at 'processing' with no
      // PaymentIntent: byte for byte identical to a homeowner who opened Stripe
      // and closed the tab.
      //
      // /pay/[id] then told both of them "This payment is processing. Bank
      // transfers can take a few business days to clear -- you'll be confirmed
      // once it settles," and rendered the Pay button underneath. The abandoned
      // one believes they have paid and has not; the in-flight one is invited to
      // pay a second time.
      //
      // An abandoned session never reaches this event at all -- it expires and
      // fires checkout.session.expired -- so `completed` with 'unpaid' really
      // does mean in flight. The payment_intent test is belt and braces: it is
      // the object that will later succeed or fail, and without one there is
      // nothing actually moving to report.
      //
      // Best-effort and deliberately unguarded by the CAS the settle path uses.
      // This writes no status and decides no money; the worst case if it loses a
      // race is the page falling back to offering the Pay button, which is where
      // it already was.
      const { error: pendingError } = await admin
        .from('payments')
        .update({ async_payment_pending_at: new Date().toISOString() })
        .eq('id', paymentId)
        .in('status', ['requested', 'processing', 'failed']);
      if (pendingError) {
        // Logged, never thrown. Failing the webhook here would make Stripe retry
        // a delivery that has nothing left to do, and the page's fallback is the
        // behavior that shipped for months.
        console.error(
          `Could not record async payment pending for ${paymentId}: ${pendingError.message}`,
        );
      }
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
      const planProjectionEnabled = legacyPaymentPlanProjectionEnabled();
      const settlement = await markPaymentPaid(
        admin,
        paymentId,
        stripePaymentIntent,
        planProjectionEnabled
          ? {
              checkoutSessionId: session.id,
              requirePaymentIntent: true,
              replacePaymentIntent: true,
            }
          : null,
      );
      if (
        settlement.legacyRailAuthorized
        && (settlement.transitioned || settlement.alreadyPaid)
      ) {
        await coordinateLegacyPaymentSideEffects({
          eventId: event.id,
          eventType: event.type,
          eventObjectId: session.id,
          paymentIntentId: stripePaymentIntent,
          paymentId,
          outcome: 'settled',
          savedCard: () => loadLegacySavedCardEvidence(
            stripe,
            session.payment_intent,
            session.customer,
          ),
          legacy: settlement.transitioned || planProjectionEnabled
            ? { plan: () => handlePlanPaymentSettled(admin, paymentId) }
            : {},
        });
      }
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;
    if (paymentId) {
      const planProjectionEnabled = legacyPaymentPlanProjectionEnabled();
      const stripePaymentIntent = paymentIntentId(session.payment_intent);
      const failure = await markLegacyPaymentFailed(admin, paymentId, {
        statuses: ['requested', 'processing'],
        ...(planProjectionEnabled
          ? {
              checkoutSessionId: session.id,
              stripePaymentIntent,
              bindPaymentIntent: true,
              replacePaymentIntent: true,
            }
          : {}),
      });
      const { transitioned } = failure;
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
      const replay = !transitioned
        && failure.handled
        && planProjectionEnabled
        && await classifyLegacyPaymentProjectionNoop(admin, {
          paymentId,
          expectedStatus: 'failed',
          outcome: 'failed',
          chargeModelColumnPresent: failure.chargeModelColumnPresent,
          checkoutSessionId: session.id,
          stripePaymentIntent,
        });
      if (transitioned || replay) {
        await coordinateLegacyPaymentSideEffects({
          eventId: event.id,
          eventType: event.type,
          eventObjectId: session.id,
          paymentIntentId: stripePaymentIntent,
          paymentId,
          outcome: 'failed',
          legacy: {
            // Release a held payoff lock if a large ACH payoff bounced.
            plan: () => handlePlanPaymentFailed(admin, paymentId),
          },
        });
      }
    }
  }

  // Checkout session expired — payment abandoned
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    const paymentId = session.metadata?.payment_id;

    if (paymentId) {
      const planProjectionEnabled = legacyPaymentPlanProjectionEnabled();
      const stripePaymentIntent = paymentIntentId(session.payment_intent);
      const failure = await markLegacyPaymentFailed(admin, paymentId, {
        checkoutSessionId: session.id,
        status: 'processing',
        ...(planProjectionEnabled
          ? {
              stripePaymentIntent,
              replacePaymentIntent: true,
            }
          : {}),
      });
      const { transitioned } = failure;
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
      const replay = !transitioned
        && failure.handled
        && planProjectionEnabled
        && await classifyLegacyPaymentProjectionNoop(admin, {
          paymentId,
          expectedStatus: 'failed',
          outcome: 'failed',
          chargeModelColumnPresent: failure.chargeModelColumnPresent,
          checkoutSessionId: session.id,
          stripePaymentIntent,
        });
      if (transitioned || replay) {
        await coordinateLegacyPaymentSideEffects({
          eventId: event.id,
          eventType: event.type,
          eventObjectId: session.id,
          paymentIntentId: stripePaymentIntent,
          paymentId,
          outcome: 'failed',
          legacy: {
            // Release the abandoned payoff lock so the plan resumes its normal
            // installment schedule.
            plan: () => handlePlanPaymentFailed(admin, paymentId),
          },
        });
      }
    }
  }

  // Charge failed — card declined, insufficient funds, etc.
  if (event.type === 'charge.failed') {
    const charge = event.data.object;
    const paymentId = charge.metadata?.payment_id;

    if (paymentId) {
      console.log(`Charge failed for payment ${paymentId}:`, charge.failure_message);
      const planProjectionEnabled = legacyPaymentPlanProjectionEnabled();
      const stripePaymentIntent = paymentIntentId(charge.payment_intent);
      if (planProjectionEnabled) {
        // Keep the reverse provider lookup behind the legacy destination-rail
        // guard. A direct/malformed row must never trigger legacy Stripe work.
        const providerLookupRail = await inspectLegacyDestinationPaymentRail(admin, paymentId);
        if (providerLookupRail.kind !== 'allowed') return;
      }
      const providerBinding = planProjectionEnabled
        ? await resolveLegacyPaymentIntentCheckoutBinding(
            stripe,
            stripePaymentIntent ?? '',
            paymentId,
          )
        : null;
      const failure = await markLegacyPaymentFailed(admin, paymentId, {
        statuses: ['requested', 'processing'],
        ...(planProjectionEnabled
          ? {
              checkoutSessionId: providerBinding?.checkoutSessionId ?? null,
              stripePaymentIntent,
              bindPaymentIntent: true,
              replacePaymentIntent: providerBinding?.checkoutSessionId !== null,
            }
          : {}),
      });
      const { transitioned } = failure;
      if (transitioned) await sendPaymentSmsEvent(paymentId, 'payment_failed');
      if (transitioned) await createPaymentFeedEvent(admin, paymentId, 'payment_failed');
      const replay = !transitioned
        && failure.handled
        && planProjectionEnabled
        && await classifyLegacyPaymentProjectionNoop(admin, {
          paymentId,
          expectedStatus: 'failed',
          outcome: 'failed',
          chargeModelColumnPresent: failure.chargeModelColumnPresent,
          checkoutSessionId: providerBinding?.checkoutSessionId ?? null,
          stripePaymentIntent,
        });
      if (transitioned || replay) {
        await coordinateLegacyPaymentSideEffects({
          eventId: event.id,
          eventType: event.type,
          eventObjectId: charge.id,
          paymentIntentId: stripePaymentIntent,
          paymentId,
          outcome: 'failed',
          legacy: {
            // Release a held payoff lock if this failed charge was a plan payoff.
            plan: () => handlePlanPaymentFailed(admin, paymentId),
          },
        });
      }
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

      const refundPaymentColumns = 'id, invoice_id, status, refunded_amount, amount, platform_fee';
      const refundRail = await inspectLegacyDestinationPaymentRail(admin, paymentId);
      const refundRead = (refundRail.kind === 'allowed'
        ? await admin
            .from('payments')
            // amount + platform_fee ride along so the fee reversal can be
            // computed from the same cumulative total Stripe just sent us.
            .select(refundRail.chargeModelColumnPresent
              ? `${refundPaymentColumns}, charge_model`
              : refundPaymentColumns)
            .eq('id', paymentId)
            .maybeSingle()
        : { data: null, error: null }) as unknown as {
          data: {
            id: string;
            invoice_id: string | null;
            status: string;
            refunded_amount: number | null;
            amount: number;
            platform_fee: number | null;
            charge_model?: unknown;
          } | null;
          error: { code?: string | null } | null;
        };
      const { data: payment, error: paymentError } = refundRead;
      if (paymentError) throw paymentError;

      const isFull = typeof charge.amount === 'number'
        ? charge.amount_refunded >= charge.amount
        : payment ? toCents(refundedTotal) >= toCents(payment.amount) : false;

      // Reconcile only a collected payment; never resurrect a disputed one, and
      // never walk the refunded total backwards. Acting only on NEW progress makes
      // at-least-once redelivery and the synchronous refundPayment() write no-ops.
      if (
        payment &&
        isLegacyDestinationPayment(payment) &&
        (payment.status === 'paid' || payment.status === 'refunded') &&
        toCents(refundedTotal) > toCents(Number(payment.refunded_amount) || 0)
      ) {
        let transition = admin
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
          .eq('id', payment.id);
        // Re-check the immutable rail at write time whenever the column exists.
        // The pre-migration fallback cannot name a column that is not there.
        if (refundRail.kind === 'allowed' && refundRail.chargeModelColumnPresent) {
          transition = transition.eq('charge_model', 'destination');
        }
        const { data: transitioned, error: transitionError } = await transition
          .in('status', ['paid', 'refunded'])
          // The event carries Stripe's cumulative refunded total. Make the
          // monotonicity check part of the UPDATE itself so concurrent 20-then-
          // 50 (or 50-then-20) deliveries can only move the stored total
          // forward. `refunded_amount` is null on older untouched rows.
          .or(`refunded_amount.is.null,refunded_amount.lt.${refundedTotal}`)
          .select('id, invoice_id')
          .maybeSingle();
        if (transitionError) throw transitionError;
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
      const err = paymentIntent.last_payment_error;
      console.log(`Payment intent failed for payment ${paymentId}:`, {
        code: err?.code,
        decline_code: err?.decline_code,
        message: err?.message,
      });
      const { transitioned } = await markLegacyPaymentFailed(admin, paymentId, {
        statuses: ['requested', 'processing'],
      });
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
      const planProjectionEnabled = legacyPaymentPlanProjectionEnabled();
      const rail = await inspectLegacyDestinationPaymentRail(admin, paymentId);
      // This handler writes the payment inline rather than through the shared
      // compare-and-set, so it needs the same stand-down or the out-of-band
      // reconciliation path would keep settling rows the ledger owns.
      if (
        rail.kind !== 'allowed'
        || legacyDestinationCompareAndSetStandsDown({
          railKind: rail.kind,
          projectionEnabled: legacyDestinationCheckoutProjectionEnabled(),
        })
      ) return;
      const providerBinding = planProjectionEnabled
        ? await resolveLegacyPaymentIntentCheckoutBinding(
            stripe,
            paymentIntent.id,
            paymentId,
          )
        : null;
      let transition = admin
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: paymentIntent.id, dunning_state: 'recovered', next_retry_at: null })
        .eq('id', paymentId);
      if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
      if (planProjectionEnabled) {
        transition = providerBinding?.checkoutSessionId === null
          ? transition.is('stripe_checkout_session', null)
          : transition.eq('stripe_checkout_session', providerBinding?.checkoutSessionId);
        if (providerBinding?.checkoutSessionId === null) {
          // No Checkout generation exists, so only NULL or the exact already-
          // persisted off-session PI may be bound by this event.
          transition = transition.or(
            `stripe_payment_intent.is.null,stripe_payment_intent.eq.${paymentIntent.id}`,
          );
        }
      }
      const { data: transitioned, error: transitionError } = await transition
        .in('status', ['requested', 'processing', 'failed'])
        .select('id, invoice_id')
        .maybeSingle();
      if (transitionError) throw transitionError;
      const replay = !transitioned
        && planProjectionEnabled
        && await classifyLegacyPaymentProjectionNoop(admin, {
          paymentId,
          expectedStatus: 'paid',
          outcome: 'settled',
          chargeModelColumnPresent: rail.chargeModelColumnPresent,
          checkoutSessionId: providerBinding?.checkoutSessionId ?? null,
          stripePaymentIntent: paymentIntent.id,
        });
      if (transitioned) {
        // Keep the visit invoice in lockstep with the settled off-session charge.
        if (transitioned.invoice_id) await markInvoicePaidForPayment(admin, transitioned.invoice_id);
        await createPaymentFeedEvent(admin, paymentId, 'payment_paid');
        await sendPaymentSmsEvent(paymentId, 'payment_paid');
      }
      if (transitioned || replay) {
        await coordinateLegacyPaymentSideEffects({
          eventId: event.id,
          eventType: event.type,
          eventObjectId: paymentIntent.id,
          paymentIntentId: paymentIntent.id,
          paymentId,
          outcome: 'settled',
          savedCard: () => loadLegacySavedCardEvidence(
            stripe,
            paymentIntent,
            paymentIntent.customer,
          ),
          legacy: {
            // Out-of-band safety net for a plan installment/payoff whose
            // synchronous write was lost — advance the plan idempotently.
            plan: () => handlePlanPaymentSettled(admin, paymentId),
          },
        });
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
      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .select('id, account_id, job_id, status')
        .eq('stripe_payment_intent', paymentIntentId)
        .maybeSingle();
      if (paymentError) throw paymentError;

      if (payment && payment.status === 'paid') {
        const rail = await inspectLegacyDestinationPaymentRail(admin, payment.id);
        if (rail.kind !== 'allowed') return;
        let transition = admin
          .from('payments')
          .update({
            status: 'disputed',
            disputed_at: new Date().toISOString(),
            dispute_reason: dispute.reason ?? null,
            dispute_status: dispute.status ?? null,
            stripe_dispute_id: dispute.id ?? null,
            dispute_due_by: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
          })
          .eq('id', payment.id);
        if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
        const { data: transitioned, error: transitionError } = await transition
          .eq('status', 'paid')
          .select('id')
          .maybeSingle();
        if (transitionError) throw transitionError;
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
      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .select('id, account_id, job_id, invoice_id, status')
        .eq('stripe_payment_intent', paymentIntentId)
        .maybeSingle();
      if (paymentError) throw paymentError;

      if (payment && payment.status === 'disputed') {
        const rail = await inspectLegacyDestinationPaymentRail(admin, payment.id);
        if (rail.kind !== 'allowed') return;
        if (dispute.status === 'won') {
          let transition = admin
            .from('payments')
            .update({ status: 'paid', dispute_status: 'won' })
            .eq('id', payment.id);
          if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
          const { data: transitioned, error: transitionError } = await transition
            .eq('status', 'disputed')
            .select('id')
            .maybeSingle();
          if (transitionError) throw transitionError;
          if (transitioned) {
            await createDisputeFeedEvent(admin, payment.id, 'dispute_won', 'Chargeback won', 'Stripe resolved the dispute in your favor. The payment stands.');
          }
        } else {
          let transition = admin
            .from('payments')
            .update({ status: 'refunded', dispute_status: 'lost' })
            .eq('id', payment.id);
          if (rail.chargeModelColumnPresent) transition = transition.eq('charge_model', 'destination');
          const { data: transitioned, error: transitionError } = await transition
            .eq('status', 'disputed')
            .select('id')
            .maybeSingle();
          if (transitionError) throw transitionError;
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
