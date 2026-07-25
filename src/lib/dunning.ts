import { createAdminClient } from '@/lib/auth';
import { getStripeClient, toCents } from '@/lib/stripe';
import { normalizeUsPhone } from '@/lib/phone';
import { createPaymentFeedEvent } from '@/lib/job-feed';
import { sendPaymentSmsEvent, sendCardUpdateSms } from '@/lib/sms';
import { sendContractorAlertEmail, getAccountOwnerEmail, sendCardUpdateEmail } from '@/lib/email';
import { createCardSetupSession } from '@/lib/card-on-file';
import type { RecurringPlan } from '@/lib/recurring';

// Dunning for recurring off-session charges: capture the decline, then either
// schedule automated retries (transient declines) or route the client to a
// "update your card" link (expired card, SCA — a blind retry can never succeed),
// and alert the owner. All owner-only data; runs on the admin (service-role)
// client from the cron / the recurring charge path / the card-update webhook.

const DAY_MS = 24 * 60 * 60 * 1000;
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');
// Automated retries after the initial failure, at these day offsets from "now".
const RETRY_OFFSET_DAYS = [1, 3, 5];
const MAX_DUNNING_ATTEMPTS = RETRY_OFFSET_DAYS.length; // 3
const MAX_RETRIES_PER_RUN = 200;

type AdminClient = ReturnType<typeof createAdminClient>;
type DunningState = 'scheduled' | 'needs_card' | 'exhausted' | 'recovered';

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

// Error codes where a blind off-session retry can NEVER succeed — the customer
// must update/authenticate the card. Everything else (insufficient_funds,
// do_not_honor, generic_decline, processing_error, try_again_later…) is treated
// as transient and worth an automated retry.
const NEEDS_CARD_CODES = new Set([
  'authentication_required', 'expired_card', 'incorrect_cvc', 'invalid_cvc',
  'incorrect_number', 'invalid_number', 'incorrect_zip', 'setup_intent_authentication_failure',
  'payment_method_not_available',
]);
const NEEDS_CARD_DECLINE_CODES = new Set([
  'fraudulent', 'stolen_card', 'lost_card', 'pickup_card', 'restricted_card', 'security_violation',
  'revocation_of_authorization', 'revocation_of_all_authorizations', 'do_not_try_again', 'not_permitted',
  'transaction_not_allowed', 'currency_not_supported', 'card_not_supported', 'invalid_account',
  'new_account_information_available', 'no_action_taken', 'incorrect_pin', 'invalid_amount',
]);

export function classifyDecline(code: string | null, declineCode: string | null): 'retry' | 'needs_card' {
  if (code && NEEDS_CARD_CODES.has(code)) return 'needs_card';
  if (declineCode && NEEDS_CARD_DECLINE_CODES.has(declineCode)) return 'needs_card';
  return 'retry';
}

// A short, client-safe reason label for owner-facing messaging.
function declineLabel(code: string | null, declineCode: string | null): string {
  if (declineCode === 'insufficient_funds') return 'insufficient funds';
  if (code === 'expired_card') return 'the card has expired';
  if (code === 'authentication_required') return 'the card needs verification';
  if (code === 'incorrect_cvc' || code === 'invalid_cvc') return 'an incorrect security code';
  if (declineCode === 'lost_card' || declineCode === 'stolen_card') return 'the card was reported lost or stolen';
  if (code === 'card_declined' || declineCode === 'generic_decline' || declineCode === 'do_not_honor') return 'the card was declined';
  return 'the card was declined';
}

async function resolveBusinessName(admin: AdminClient, accountId: string): Promise<string> {
  const [{ data: site }, { data: account }] = await Promise.all([
    admin.from('sites').select('company_name').eq('account_id', accountId).limit(1).maybeSingle(),
    admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  return site?.company_name || account?.business_name || "Let's Get Quoted contractor";
}

// Best-effort owner email alert about a failed recurring charge. Never throws
// (the caller must not let a notification failure sink the charge/retry path).
async function alertOwnerChargeFailed(
  admin: AdminClient,
  plan: Pick<RecurringPlan, 'account_id' | 'title' | 'client_name' | 'amount'>,
  businessName: string,
  reasonLabel: string,
  disposition: 'retrying' | 'needs_card' | 'exhausted',
): Promise<void> {
  try {
    const to = await getAccountOwnerEmail(admin, plan.account_id);
    if (!to) return;
    // Coerce: a numeric column can arrive as a string, so never call .toFixed on
    // it directly (that would throw and silently drop the owner alert).
    const money = `$${(Number(plan.amount) || 0).toFixed(2)}`;
    const dispositionLine =
      disposition === 'retrying'
        ? "We'll automatically retry the card over the next few days. No action needed unless it keeps failing."
        : disposition === 'needs_card'
          ? "We've asked the client to update their card — we'll charge it automatically once they do."
          : `The card failed after ${MAX_DUNNING_ATTEMPTS} automatic retries. We've asked the client to update their card; you may also want to follow up.`;
    await sendContractorAlertEmail({
      recipientEmail: to,
      businessName,
      subject: `A recurring charge for ${plan.client_name} couldn't be collected`,
      heading: 'Recurring payment failed',
      bodyLines: [
        `${plan.client_name}'s ${plan.title} payment of ${money} was declined — ${reasonLabel}.`,
        dispositionLine,
      ],
      ctaLabel: 'Open recurring plans',
      ctaUrl: `${APP_ORIGIN}/dashboard/recurring`,
      tone: 'warning',
    });
  } catch (err) {
    console.error('Dunning owner alert failed:', err instanceof Error ? err.message : err);
  }
}

// Best-effort "update your card" nudge to the client — email when there's an
// address, SMS when opted in. Reuses the hosted card-setup session (the write-back
// overwrites the plan's saved card, so an update just works). Never throws.
async function notifyClientUpdateCard(admin: AdminClient, plan: RecurringPlan, businessName: string): Promise<void> {
  try {
    const url = await createCardSetupSession(plan, APP_ORIGIN);
    if (plan.client_email) {
      try {
        await sendCardUpdateEmail({ recipientEmail: plan.client_email, businessName, planTitle: plan.title, url });
      } catch (err) {
        console.error('Card update email failed:', err instanceof Error ? err.message : err);
      }
    }
    const phone = plan.client_phone ? normalizeUsPhone(plan.client_phone) : null;
    if (phone) {
      const { data: consent } = await admin.from('sms_consent').select('status').eq('account_id', plan.account_id).eq('phone_number', phone).maybeSingle();
      if (consent?.status === 'opted_in') {
        try {
          await sendCardUpdateSms({ phone, businessName, url, accountId: plan.account_id });
        } catch (err) {
          console.error('Card update SMS failed:', err instanceof Error ? err.message : err);
        }
      }
    }
  } catch (err) {
    console.error('Could not create/send card-update link:', err instanceof Error ? err.message : err);
  }
}

type FailingPayment = { id: string; amount: number; dunning_attempts: number; dunning_state: string | null; failed_at: string | null };

// THE single place a recurring-charge failure is recorded. Captures the decline,
// advances the dunning state (schedule a retry, ask for a new card, or give up),
// and fires the right notifications. Called from the initial charge (recurring.ts)
// and from a retry (below). Best-effort on side effects; the payment update is
// the one thing that must land.
export async function recordRecurringChargeFailure(
  admin: AdminClient,
  plan: RecurringPlan,
  payment: FailingPayment,
  decline: StripeDecline,
  canText: boolean,
  isRetry: boolean,
): Promise<DunningState> {
  const classification = classifyDecline(decline.code, decline.declineCode);
  const newAttempts = isRetry ? payment.dunning_attempts + 1 : payment.dunning_attempts;

  let state: DunningState;
  let nextRetryAt: string | null;
  if (classification === 'needs_card') {
    state = 'needs_card';
    nextRetryAt = null;
  } else if (newAttempts >= MAX_DUNNING_ATTEMPTS) {
    state = 'exhausted';
    nextRetryAt = null;
  } else {
    state = 'scheduled';
    nextRetryAt = new Date(Date.now() + RETRY_OFFSET_DAYS[newAttempts] * DAY_MS).toISOString();
  }
  const terminal = state === 'needs_card' || state === 'exhausted';
  const wasTerminal = payment.dunning_state === 'needs_card' || payment.dunning_state === 'exhausted';

  await admin
    .from('payments')
    .update({
      status: 'failed',
      failure_code: decline.code,
      failure_message: decline.declineCode || decline.message,
      failed_at: payment.failed_at ?? new Date().toISOString(),
      dunning_attempts: newAttempts,
      next_retry_at: nextRetryAt,
      dunning_state: state,
      ...(decline.intentId ? { stripe_payment_intent: decline.intentId } : {}),
    })
    .eq('id', payment.id);

  // Feed event only on the first failure (retries shouldn't spam the job feed).
  if (!isRetry) await createPaymentFeedEvent(admin, payment.id, 'payment_failed');

  const businessName = await resolveBusinessName(admin, plan.account_id);
  const reasonLabel = declineLabel(decline.code, decline.declineCode);

  // Client: on entering a terminal state (needs card), send the update-card link
  // — but only once per transition. On a transient first failure, keep the
  // existing "here's a manual pay link" text so they're informed and can pay now.
  if (terminal && !wasTerminal) {
    await notifyClientUpdateCard(admin, plan, businessName);
  } else if (!isRetry && !terminal && canText) {
    await sendPaymentSmsEvent(payment.id, 'payment_failed');
  }

  // Owner: alert on the first failure (any disposition), and when a retry run
  // finally gives up (terminal). Never on intermediate retries.
  if (!isRetry || terminal) {
    const disposition = state === 'scheduled' ? 'retrying' : state === 'needs_card' ? 'needs_card' : 'exhausted';
    await alertOwnerChargeFailed(admin, plan, businessName, reasonLabel, disposition);
  }

  return state;
}

// Retry one due failed payment against the plan's (possibly updated) saved card.
async function retryDunningPayment(admin: AdminClient, payment: {
  id: string; account_id: string; amount: number; platform_fee: number | null;
  dunning_attempts: number; dunning_state: string | null; failed_at: string | null;
  recurring_plan_id: string | null; sms_consent: boolean;
}): Promise<'paid' | 'failed' | 'gave_up'> {
  // Load the plan (saved card lives here). If it's gone (plan deleted) we can't
  // retry — give up cleanly.
  if (!payment.recurring_plan_id) {
    await admin.from('payments').update({ dunning_state: 'exhausted', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }
  const { data: plan } = await admin.from('recurring_plans').select('*').eq('id', payment.recurring_plan_id).maybeSingle();
  if (!plan || !plan.stripe_customer_id || !plan.stripe_payment_method_id) {
    await admin.from('payments').update({ dunning_state: 'needs_card', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }
  const { data: account } = await admin.from('accounts').select('stripe_connect_id, connect_onboarded').eq('id', payment.account_id).maybeSingle();
  if (!account?.stripe_connect_id || !account.connect_onboarded) {
    // Payouts not connected — can't move money. Hold as needs-attention, no retry churn.
    await admin.from('payments').update({ dunning_state: 'exhausted', next_retry_at: null }).eq('id', payment.id);
    return 'gave_up';
  }

  const attemptNumber = payment.dunning_attempts + 1; // the attempt about to run
  const stripe = getStripeClient();
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: toCents(payment.amount),
        currency: 'usd',
        customer: plan.stripe_customer_id,
        payment_method: plan.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        application_fee_amount: toCents(Number(payment.platform_fee) || 0),
        transfer_data: { destination: account.stripe_connect_id },
        description: `Recurring retry — ${plan.title}`,
        metadata: { payment_id: payment.id, recurring_plan_id: plan.id, dunning_attempt: String(attemptNumber) },
      },
      // Unique per attempt (so it actually re-hits the card) but stable within an
      // attempt (a crash-and-rerun of the same attempt returns Stripe's cached
      // result within 24h instead of double-charging).
      { idempotencyKey: `recurring_retry_${payment.id}_${attemptNumber}` },
    );

    if (intent.status === 'succeeded') {
      await admin
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: intent.id, dunning_state: 'recovered', next_retry_at: null, dunning_attempts: attemptNumber })
        .eq('id', payment.id);
      await createPaymentFeedEvent(admin, payment.id, 'payment_paid');
      if (payment.sms_consent) await sendPaymentSmsEvent(payment.id, 'payment_paid');
      return 'paid';
    }
    // requires_action off-session → needs the customer; treat as an SCA decline.
    await recordRecurringChargeFailure(admin, plan as RecurringPlan, payment, { code: 'authentication_required', declineCode: null, message: null, intentId: intent.id }, payment.sms_consent, true);
    return 'failed';
  } catch (error) {
    const decline = extractStripeDecline(error);
    await recordRecurringChargeFailure(admin, plan as RecurringPlan, payment, decline, payment.sms_consent, true);
    console.error(`Dunning retry failed for payment ${payment.id}:`, error instanceof Error ? error.message : error);
    return 'failed';
  }
}

export type DunningRunSummary = { due: number; recovered: number; failed: number; gaveUp: number; reason?: string };

// Cron entry point: retry every failed recurring payment whose next_retry_at is
// due. Best-effort per payment. Idempotency keys make a re-run safe.
export async function runDunningRetries(now: Date = new Date()): Promise<DunningRunSummary> {
  const admin = createAdminClient();
  const { data: dueRows, error } = await admin
    .from('payments')
    .select('id, account_id, amount, platform_fee, dunning_attempts, dunning_state, failed_at, recurring_plan_id, sms_consent')
    .eq('status', 'failed')
    .eq('dunning_state', 'scheduled')
    .lte('next_retry_at', now.toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(MAX_RETRIES_PER_RUN);
  if (error) {
    return { due: 0, recovered: 0, failed: 0, gaveUp: 0, reason: 'dunning columns not available' };
  }
  const due = dueRows ?? [];
  if (due.length === 0) return { due: 0, recovered: 0, failed: 0, gaveUp: 0, reason: 'nothing due' };

  let recovered = 0, failed = 0, gaveUp = 0;
  for (const payment of due) {
    try {
      const result = await retryDunningPayment(admin, payment as Parameters<typeof retryDunningPayment>[1]);
      if (result === 'paid') recovered++;
      else if (result === 'gave_up') gaveUp++;
      else failed++;
    } catch (err) {
      failed++;
      console.error(`Dunning retry threw for payment ${payment.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return { due: due.length, recovered, failed, gaveUp };
}

// After a client updates their card (setup webhook), re-arm any of that plan's
// payments that had stalled awaiting a new card so the next dunning run charges
// the fresh card. Idempotent; best-effort.
export async function rescheduleDunningAfterCardUpdate(admin: AdminClient, planId: string): Promise<void> {
  try {
    await admin
      .from('payments')
      .update({ dunning_state: 'scheduled', next_retry_at: new Date().toISOString(), dunning_attempts: 0 })
      .eq('recurring_plan_id', planId)
      .eq('status', 'failed')
      .in('dunning_state', ['needs_card', 'exhausted']);
  } catch (err) {
    console.error('rescheduleDunningAfterCardUpdate failed:', err instanceof Error ? err.message : err);
  }
}
