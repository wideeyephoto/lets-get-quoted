import { randomUUID } from 'node:crypto';
import { runOwnerEventNotices } from '@/lib/owner-event-notices';
import { createAdminClient } from '@/lib/auth';
import { getStripeClient, toCents, canCreateConnectCharge, CONNECT_CHARGE_COLUMNS } from '@/lib/stripe';
import { normalizeUsPhone } from '@/lib/phone';
import { createPaymentFeedEvent } from '@/lib/job-feed';
import { sendPaymentSmsEvent, sendCardUpdateSms } from '@/lib/sms';
import { sendCardUpdateEmail } from '@/lib/email';
import { createCardSetupSession } from '@/lib/card-on-file';
import { markInvoicePaidForPayment } from '@/lib/invoices';
import type { RecurringPlan } from '@/lib/recurring';
import { pickBusinessName } from '@/lib/business-name';

// Dunning for recurring off-session charges: capture the decline, then either
// schedule automated retries (transient declines) or route the client to a
// "update your card" link (expired card, SCA — a blind retry can never succeed),
// and alert the owner. All owner-only data; runs on the admin (service-role)
// client from the cron / the recurring charge path / the card-update webhook.

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
// Automated retries within one backoff cycle, at these day offsets from "now".
const RETRY_OFFSET_DAYS = [1, 3, 5];
const MAX_DUNNING_ATTEMPTS = RETRY_OFFSET_DAYS.length; // 3 per cycle
// Hard lifetime cap on real charge attempts (across card updates / re-arms) so a
// persistently-bad card can't loop forever burning charges + alerts.
const LIFETIME_MAX_CHARGE_ATTEMPTS = 8;
const MAX_RETRIES_PER_RUN = 200;

type AdminClient = ReturnType<typeof createAdminClient>;
export type DunningState = 'scheduled' | 'needs_card' | 'exhausted' | 'recovered';

export type StripeDecline = { code: string | null; declineCode: string | null; message: string | null; intentId: string | null };

// Pull the decline shape out of a thrown Stripe error (create+confirm off-session).
export function extractStripeDecline(error: unknown): StripeDecline {
  const e = (error ?? {}) as {
    code?: string; decline_code?: string; message?: string;
    payment_intent?: { id?: string; last_payment_error?: { code?: string; decline_code?: string; message?: string } };
    raw?: { code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string } };
  };
  const pi = e.payment_intent;
  const lpe = pi?.last_payment_error;
  return {
    code: e.code ?? e.raw?.code ?? lpe?.code ?? null,
    declineCode: e.decline_code ?? e.raw?.decline_code ?? lpe?.decline_code ?? null,
    message: e.message ?? e.raw?.message ?? lpe?.message ?? null,
    intentId: e.raw?.payment_intent?.id ?? pi?.id ?? null,
  };
}

// Declines where a blind off-session retry can NEVER succeed — the customer must
// update/re-authenticate the card. Includes both top-level error codes AND
// decline_code tokens (an off-session card decline arrives as code='card_declined'
// with the granular reason in decline_code — e.g. expired_card, incorrect_cvc —
// so we check BOTH fields against this one set). Everything else is transient and
// worth an automated retry (insufficient_funds, do_not_honor, generic_decline,
// try_again_later, processing_error, no_action_taken…).
const NEEDS_CARD = new Set([
  'authentication_required', 'setup_intent_authentication_failure', 'payment_method_not_available',
  'expired_card', 'incorrect_cvc', 'invalid_cvc', 'incorrect_number', 'invalid_number',
  'incorrect_zip', 'invalid_expiry_month', 'invalid_expiry_year',
  'fraudulent', 'stolen_card', 'lost_card', 'pickup_card', 'restricted_card', 'security_violation',
  'revocation_of_authorization', 'revocation_of_all_authorizations', 'do_not_try_again', 'not_permitted',
  'transaction_not_allowed', 'currency_not_supported', 'card_not_supported', 'invalid_account',
  'new_account_information_available',
]);

export function classifyDecline(code: string | null, declineCode: string | null): 'retry' | 'needs_card' {
  if (code && NEEDS_CARD.has(code)) return 'needs_card';
  if (declineCode && NEEDS_CARD.has(declineCode)) return 'needs_card';
  return 'retry';
}

export type DunningTransition = { state: DunningState; newAttempts: number; nextRetryAt: string | null };

// The pure dunning decision: given the lifetime + per-cycle attempt counters, the
// decline classification, and whether this is a retry, decide the next state and
// (for a scheduled retry) when it's due. Extracted from recordRecurringChargeFailure
// so the money-safety transition table is unit-testable; `now` is injectable so the
// scheduled-retry timestamp is deterministic in tests.
export function decideDunningTransition(
  input: { chargeAttempts: number; dunningAttempts: number; classification: 'retry' | 'needs_card'; isRetry: boolean },
  now: number = Date.now(),
): DunningTransition {
  const newAttempts = input.isRetry ? input.dunningAttempts + 1 : input.dunningAttempts;
  // Hard lifetime cap wins over everything — stop regardless of the decline kind.
  if (input.chargeAttempts >= LIFETIME_MAX_CHARGE_ATTEMPTS) return { state: 'exhausted', newAttempts, nextRetryAt: null };
  // A card a blind retry can never fix — route to a card update, don't schedule.
  if (input.classification === 'needs_card') return { state: 'needs_card', newAttempts, nextRetryAt: null };
  // Out of automated retries for this cycle.
  if (newAttempts >= MAX_DUNNING_ATTEMPTS) return { state: 'exhausted', newAttempts, nextRetryAt: null };
  // Schedule the next retry at this cycle's backoff offset.
  return { state: 'scheduled', newAttempts, nextRetryAt: new Date(now + RETRY_OFFSET_DAYS[newAttempts] * DAY_MS).toISOString() };
}

async function resolveBusinessName(admin: AdminClient, accountId: string): Promise<string> {
  const [{ data: site }, { data: account }] = await Promise.all([
    admin.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return pickBusinessName(site, account);
}

// Best-effort "update your card" nudge to the client — email when there's an
// address, SMS when opted in. Reuses the hosted card-setup session (the write-back
// overwrites the plan's saved card, so an update just works). Returns whether it
// actually reached the client on any channel. Never throws.
async function notifyClientUpdateCard(admin: AdminClient, plan: RecurringPlan, businessName: string): Promise<boolean> {
  let reached = false;
  try {
    const url = await createCardSetupSession(plan, APP_ORIGIN);
    if (plan.client_email) {
      try {
        await sendCardUpdateEmail({ recipientEmail: plan.client_email, businessName, planTitle: plan.title, url, accountId: plan.account_id });
        reached = true;
      } catch (err) {
        console.error('Card update email failed:', err instanceof Error ? err.message : err);
      }
    }
    const phone = plan.client_phone ? normalizeUsPhone(plan.client_phone) : null;
    if (phone) {
      const { data: consent } = await admin.from('sms_consent').select('status').eq('account_id', plan.account_id).eq('phone_number', phone).maybeSingle();
      if (consent?.status === 'opted_in') {
        try {
          await sendCardUpdateSms({
            phone,
            businessName,
            url,
            accountId: plan.account_id,
            idempotencyKey: `card-update:${plan.id}:${plan.updated_at}`,
          });
          reached = true;
        } catch (err) {
          console.error('Card update SMS failed:', err instanceof Error ? err.message : err);
        }
      }
    }
  } catch (err) {
    console.error('Could not create/send card-update link:', err instanceof Error ? err.message : err);
  }
  return reached;
}

type FailingPayment = { id: string; amount: number; dunning_attempts: number; charge_attempts: number; dunning_state: string | null; failed_at: string | null };

// THE single place a recurring-charge failure is recorded. Captures the decline,
// advances the dunning state (schedule a retry, ask for a new card, or give up),
// and fires the right notifications. Called from the initial charge (recurring.ts)
// and from a retry (below). charge_attempts is managed by the caller (the payment
// insert for the initial charge, the atomic claim for a retry) — never here.
export async function recordRecurringChargeFailure(
  admin: AdminClient,
  plan: RecurringPlan,
  payment: FailingPayment,
  decline: StripeDecline,
  canText: boolean,
  isRetry: boolean,
): Promise<DunningState> {
  if (!Number.isSafeInteger(payment.charge_attempts) || payment.charge_attempts < 1
    || !Number.isSafeInteger(payment.dunning_attempts) || payment.dunning_attempts < 0) {
    throw new Error('Invalid recurring charge attempt');
  }
  const failureEventId = randomUUID();
  const classification = classifyDecline(decline.code, decline.declineCode);
  const { state, newAttempts, nextRetryAt } = decideDunningTransition({
    chargeAttempts: payment.charge_attempts,
    dunningAttempts: payment.dunning_attempts,
    classification,
    isRetry,
  });
  const terminal = state === 'needs_card' || state === 'exhausted';
  const wasTerminal = payment.dunning_state === 'needs_card' || payment.dunning_state === 'exhausted';

  let failureUpdate = admin
    .from('payments')
    .update({
      status: 'failed',
      dunning_failure_event_id: failureEventId,
      dunning_failure_attempt: payment.charge_attempts,
      failure_code: decline.code,
      failure_message: decline.declineCode || decline.message,
      failed_at: payment.failed_at ?? new Date().toISOString(),
      dunning_attempts: newAttempts,
      next_retry_at: nextRetryAt,
      dunning_state: state,
      ...(decline.intentId ? { stripe_payment_intent: decline.intentId } : {}),
    })
    .eq('id', payment.id).eq('account_id', plan.account_id).eq('recurring_plan_id', plan.id)
    .eq('amount', payment.amount).eq('charge_attempts', payment.charge_attempts)
    .eq('dunning_attempts', payment.dunning_attempts).in('status', ['requested','processing','failed'])
    .or('dunning_failure_attempt.is.null,dunning_failure_attempt.lt.' + payment.charge_attempts);
  failureUpdate = payment.dunning_state === null ? failureUpdate.is('dunning_state', null) : failureUpdate.eq('dunning_state', payment.dunning_state);
  const { data: saved, error: updateError } = await failureUpdate.select('id').maybeSingle();
  if (updateError) {
    const error = new Error('Could not persist recurring charge failure');
    error.name = 'RecurringFailureSaveError';
    throw error;
  }
  if (!saved) return state; // Another handler or payment outcome won; no repeated effects.
  if (payment.charge_attempts === 1 || terminal) {
    try { await runOwnerEventNotices(admin, { sourceId: failureEventId, accountId: plan.account_id }); }
    catch { console.error('Recurring failure notice remains saved for pickup'); }
  }

  // Feed event only on the first failure (retries shouldn't spam the job feed).
  if (!isRetry) await createPaymentFeedEvent(admin, payment.id, 'payment_failed');

  const businessName = await resolveBusinessName(admin, plan.account_id);

  // Client: on entering a terminal state, send the update-card link (once per
  // transition). On a transient first failure, keep the existing "here's a manual
  // pay link" text so an opted-in client is informed and can pay now.
  if (terminal && !wasTerminal) {
    await notifyClientUpdateCard(admin, plan, businessName);
  } else if (!isRetry && !terminal && canText) {
    await sendPaymentSmsEvent(payment.id, 'payment_failed');
  }

  return state;
}

type SweptPayment = {
  id: string; account_id: string; amount: number; platform_fee: number | null;
  dunning_attempts: number; charge_attempts: number; dunning_state: string | null; failed_at: string | null;
  recurring_plan_id: string | null; sms_consent: boolean; stripe_payment_intent: string | null; invoice_id: string | null;
};

type RetryResult = 'paid' | 'failed' | 'gave_up' | 'held' | 'skipped';

// Retry one due failed payment against the plan's (possibly updated) saved card.
async function retryDunningPayment(admin: AdminClient, payment: SweptPayment): Promise<RetryResult> {
  if (!payment.recurring_plan_id) {
    await admin.from('payments').update({ dunning_state: 'exhausted', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }
  const { data: plan } = await admin.from('recurring_plans').select('*').eq('id', payment.recurring_plan_id).maybeSingle();
  if (!plan) {
    await admin.from('payments').update({ dunning_state: 'exhausted', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }
  // Owner paused the plan — do NOT auto-charge (matches runRecurringPlanNow's rule).
  // Re-check in a few days in case they resume; not a decline, so no notification.
  if (!plan.active) {
    await admin.from('payments').update({ next_retry_at: new Date(Date.now() + 3 * DAY_MS).toISOString() }).eq('id', payment.id);
    return 'held';
  }
  if (!plan.stripe_customer_id || !plan.stripe_payment_method_id) {
    await admin.from('payments').update({ dunning_state: 'needs_card', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }
  // The same gate as the other three Connect charge sites, then a decision this
  // one has to make on its own: whether the reason is reversible.
  //
  // This site was the one the payout restriction originally missed. The other
  // three run because a person did something; this is a cron retrying saved
  // cards unattended — which is exactly the traffic staff mean to stop when they
  // restrict an account they suspect of fraud or a chargeback storm.
  const { data: account } = await admin.from('accounts').select(CONNECT_CHARGE_COLUMNS).eq('id', payment.account_id).maybeSingle();
  if (!canCreateConnectCharge(account)) {
    // HELD, not exhausted, when the block is a staff restriction: it is
    // reversible by the staff member who set it, so defer and re-check like a
    // paused plan does above. Marking it exhausted would mean lifting the
    // restriction never resumed the payment. A missing Connect account, by
    // contrast, is terminal for this payment.
    if (account?.payouts_restricted_at) {
      await admin.from('payments').update({ next_retry_at: new Date(Date.now() + 3 * DAY_MS).toISOString() }).eq('id', payment.id);
      return 'held';
    }
    await admin.from('payments').update({ dunning_state: 'exhausted', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }
  // Hard lifetime cap.
  if (payment.charge_attempts >= LIFETIME_MAX_CHARGE_ATTEMPTS) {
    await admin.from('payments').update({ dunning_state: 'exhausted', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }

  const stripe = getStripeClient();

  // Reconcile a prior crashed success: if the last attempt's PaymentIntent
  // actually succeeded (but the DB write was lost), mark paid instead of charging
  // again. The payment_intent.succeeded webhook normally does this within seconds;
  // this is the belt-and-suspenders for a lost/delayed webhook.
  if (payment.stripe_payment_intent) {
    try {
      const prior = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent);
      if (prior.status === 'succeeded') {
        await admin.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), dunning_state: 'recovered', next_retry_at: null }).eq('id', payment.id);
        if (payment.invoice_id) await markInvoicePaidForPayment(admin, payment.invoice_id);
        return 'paid';
      }
    } catch (err) {
      console.error(`Dunning: could not retrieve prior intent ${payment.stripe_payment_intent}:`, err instanceof Error ? err.message : err);
    }
  }

  // CLAIM this retry in a single update: bump the lifetime charge counter + push the next
  // retry out, conditional on the row being unchanged since the sweep. If another
  // concurrent run already claimed it, 0 rows change and we bail — no double work,
  // and the bumped counter guarantees a fresh idempotency key so this attempt
  // actually re-hits the card.
  const seq = payment.charge_attempts + 1;
  const { data: claimed } = await admin
    .from('payments')
    .update({ charge_attempts: seq, next_retry_at: new Date(Date.now() + DAY_MS).toISOString() })
    .eq('id', payment.id)
    .eq('charge_attempts', payment.charge_attempts)
    .eq('dunning_state', 'scheduled')
    .select('id')
    .maybeSingle();
  if (!claimed) return 'skipped';

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: toCents(Number(payment.amount) || 0),
        currency: 'usd',
        customer: plan.stripe_customer_id,
        payment_method: plan.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: toCents(Number(payment.platform_fee) || 0),
        transfer_data: { destination: account.stripe_connect_id },
        description: `Recurring retry — ${plan.title}`,
        metadata: { payment_id: payment.id, recurring_plan_id: plan.id, dunning_attempt: String(seq) },
      },
      // Unique per lifetime attempt (charge_attempts never resets), so it always
      // re-hits the card; stable within an attempt so a crash-and-rerun returns
      // Stripe's cached result instead of double-charging.
      { idempotencyKey: `recurring_retry_${payment.id}_${seq}` },
    );

    // Persist the intent id immediately, before branching, so a crash right after
    // the charge still leaves a reconcilable id for the pre-charge check + webhook.
    await admin.from('payments').update({ stripe_payment_intent: intent.id }).eq('id', payment.id);

    if (intent.status === 'succeeded') {
      const { error: paidErr } = await admin
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), dunning_state: 'recovered', next_retry_at: null })
        .eq('id', payment.id);
      if (paidErr) {
        // The card WAS charged. The webhook/pre-charge reconcile will mark paid;
        // do not treat this as a failure (that could schedule a re-charge).
        console.error(`Dunning: charge succeeded but paid-write failed for ${payment.id} (will reconcile via webhook):`, paidErr.message);
      } else {
        if (payment.invoice_id) await markInvoicePaidForPayment(admin, payment.invoice_id);
        await createPaymentFeedEvent(admin, payment.id, 'payment_paid');
        if (payment.sms_consent) await sendPaymentSmsEvent(payment.id, 'payment_paid');
      }
      return 'paid';
    }
    if (intent.status === 'processing' || intent.status === 'requires_capture') {
      // Settling asynchronously — leave it pending and let the webhook reconcile;
      // do NOT dun. Park so the sweep doesn't re-charge it.
      await admin.from('payments').update({ next_retry_at: null }).eq('id', payment.id);
      return 'skipped';
    }
    // requires_action / requires_payment_method / canceled → needs the customer.
    await recordRecurringChargeFailure(admin, plan as RecurringPlan, { id: payment.id, amount: Number(payment.amount) || 0, dunning_attempts: payment.dunning_attempts, charge_attempts: seq, dunning_state: 'scheduled', failed_at: payment.failed_at }, { code: 'authentication_required', declineCode: null, message: null, intentId: intent.id }, payment.sms_consent, true);
    return 'failed';
  } catch (error) {
    if (error instanceof Error && error.name === 'RecurringFailureSaveError') throw error;
    const decline = extractStripeDecline(error);
    await recordRecurringChargeFailure(admin, plan as RecurringPlan, { id: payment.id, amount: Number(payment.amount) || 0, dunning_attempts: payment.dunning_attempts, charge_attempts: seq, dunning_state: 'scheduled', failed_at: payment.failed_at }, decline, payment.sms_consent, true);
    console.error(`Dunning retry failed for payment ${payment.id}:`, error instanceof Error ? error.message : error);
    return 'failed';
  }
}

export type DunningRunSummary = { due: number; recovered: number; failed: number; gaveUp: number; held: number; skipped: number; reason?: string };

// Cron entry point: retry every failed recurring payment whose next_retry_at is
// due. Best-effort per payment. The atomic claim + idempotency keys make a
// concurrent or repeated run safe.
export async function runDunningRetries(now: Date = new Date()): Promise<DunningRunSummary> {
  const admin = createAdminClient();
  const { data: dueRows, error } = await admin
    .from('payments')
    .select('id, account_id, amount, platform_fee, dunning_attempts, charge_attempts, dunning_state, failed_at, recurring_plan_id, sms_consent, stripe_payment_intent, invoice_id')
    .eq('status', 'failed')
    .eq('dunning_state', 'scheduled')
    .lte('next_retry_at', now.toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(MAX_RETRIES_PER_RUN);
  if (error) {
    return { due: 0, recovered: 0, failed: 0, gaveUp: 0, held: 0, skipped: 0, reason: 'dunning columns not available' };
  }
  const due = dueRows ?? [];
  if (due.length === 0) return { due: 0, recovered: 0, failed: 0, gaveUp: 0, held: 0, skipped: 0, reason: 'nothing due' };

  let recovered = 0, failed = 0, gaveUp = 0, held = 0, skipped = 0;
  for (const payment of due) {
    try {
      const result = await retryDunningPayment(admin, payment as SweptPayment);
      if (result === 'paid') recovered++;
      else if (result === 'gave_up') gaveUp++;
      else if (result === 'held') held++;
      else if (result === 'skipped') skipped++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`Dunning retry threw for payment ${payment.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { due: due.length, recovered, failed, gaveUp, held, skipped };
}

// After a client updates their card (setup webhook), re-arm that plan's stalled
// charges so the next dunning run charges the fresh card — but never past the
// lifetime cap, and WITHOUT resetting charge_attempts (that counter seeds the
// idempotency key, so resetting it would reuse a key and skip the new card).
export async function rescheduleDunningAfterCardUpdate(admin: AdminClient, planId: string): Promise<void> {
  try {
    await admin
      .from('payments')
      .update({ dunning_state: 'scheduled', next_retry_at: new Date().toISOString(), dunning_attempts: 0 })
      .eq('recurring_plan_id', planId)
      .eq('status', 'failed')
      .in('dunning_state', ['needs_card', 'exhausted'])
      .lt('charge_attempts', LIFETIME_MAX_CHARGE_ATTEMPTS);
  } catch (err) {
    console.error('rescheduleDunningAfterCardUpdate failed:', err instanceof Error ? err.message : err);
  }
}
