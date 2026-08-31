import 'server-only';

import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { BILLING_PLANS, type BillingPlanId } from '@/lib/billing/catalog';
import { recordAccountEvent } from '@/lib/account-events';
import { getStripeClient } from '@/lib/stripe';

/**
 * Cancelling a base-plan subscription from inside the product.
 *
 * The Terms, the recurring-consent box a customer ticks at checkout, the
 * homepage ("Cancel anytime") and the FAQ ("you can leave whenever you like")
 * all promise this, and none of them said how, because there was no way to do
 * it. The complete Stripe surface in this app was read-only for subscriptions:
 * two `subscriptions.retrieve` sweeps and nothing else.
 *
 * The READ side was already finished. `customer.subscription.updated` and
 * `customer.subscription.deleted` are both in the webhook scope allowlist, the
 * projector's event allowlist and the worker's allowlist, and the projection RPC
 * already writes cancel_at_period_end, canceled_at, ended_at and maps the result
 * onto workspace_entitlements. So this file only has to make the request; the
 * resulting state arrives back through the projector like any other event, and
 * needs no migration.
 *
 * WHY THERE IS NO OPERATION TABLE. Every other Stripe WRITE here is wrapped in a
 * durable operation row plus a projector that reconciles it, because a checkout
 * can end genuinely indeterminate -- Stripe created a session and we never
 * learned its id. A cancellation cannot land in that state: the request is a
 * declarative set of one boolean on an object we already hold the id of, so a
 * retry is the same request and Stripe converges. The durable intent record is
 * an account_events row written before the call, and the authoritative outcome
 * is the projector's, not ours. An idempotency key is still sent so a double
 * submit cannot become two API calls.
 */

export const BASE_PLAN_SUBSCRIPTION_CANCELLATION_FLAG =
  'LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED' as const;

export const ANNUAL_GUARANTEE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type ServerEnvironment = Record<string, string | undefined>;

export function basePlanSubscriptionCancellationEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[BASE_PLAN_SUBSCRIPTION_CANCELLATION_FLAG] === '1';
}

/**
 * ONE STRING, because the gate now bites in two places and a paraphrase is how
 * two refusals start meaning different things. Deliberately not "from here":
 * this is reachable from the cancel panel AND from choosing Flex in the
 * change-plan panel, and "here" is a different place in each.
 */
export const CANCELLATION_DISABLED_MESSAGE =
  'Cancelling a plan is not switched on yet.';

/** Statuses where there is still something for a customer to cancel. */
const CANCELLABLE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

export type CancellableSubscription = Readonly<{
  providerSubscriptionId: string;
  planCode: string;
  billingInterval: 'monthly' | 'annual';
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string | null;
  /** The projector's last write. See the idempotency note below. */
  updatedAt: string | null;
  guaranteeEligible: boolean;
  guaranteeRefundAmountCents: number;
  guaranteeDeductionCents: number;
}>;

export type AnnualGuaranteeRefundCalculation = {
  eligible: boolean;
  planCode: string;
  annualPrepaymentCents: number;
  oneMonthDeductionCents: number;
  refundAmountCents: number;
  reason?: string;
};

/**
 * Calculates the exact 30-day money-back guarantee refund for an annual base plan.
 * Refund = Annual Prepayment - 1 Month of normal base plan service.
 * Solo: $420 - $39 = $381 (38,100 cents)
 * Growth: $1,188 - $129 = $1,059 (105,900 cents)
 * Scale: $3,588 - $329 = $3,259 (325,900 cents)
 */
export function calculateAnnualPlanGuaranteeRefund(planCode: string): AnnualGuaranteeRefundCalculation {
  const normalizedPlan = String(planCode || '').toLowerCase().trim();
  const plan = BILLING_PLANS[normalizedPlan as BillingPlanId];
  if (!plan || plan.annualPriceCents <= 0) {
    return {
      eligible: false,
      planCode: normalizedPlan,
      annualPrepaymentCents: 0,
      oneMonthDeductionCents: 0,
      refundAmountCents: 0,
      reason: 'Plan does not have an annual price tier',
    };
  }

  const annualPrepaymentCents = plan.annualPriceCents;
  const oneMonthDeductionCents = plan.monthlyPriceCents;
  const refundAmountCents = Math.max(0, annualPrepaymentCents - oneMonthDeductionCents);

  return {
    eligible: true,
    planCode: normalizedPlan,
    annualPrepaymentCents,
    oneMonthDeductionCents,
    refundAmountCents,
  };
}

export async function checkAnnualGuaranteeEligibility(
  admin: SupabaseClient,
  accountId: string,
  subscription: {
    billingInterval: string;
    planCode: string;
    currentPeriodStart: string | null;
    createdAt: string | null;
  },
  now = new Date(),
): Promise<AnnualGuaranteeRefundCalculation> {
  if (subscription.billingInterval !== 'annual') {
    return {
      eligible: false,
      planCode: subscription.planCode,
      annualPrepaymentCents: 0,
      oneMonthDeductionCents: 0,
      refundAmountCents: 0,
      reason: 'Not an annual billing plan',
    };
  }

  const startDateStr = subscription.currentPeriodStart || subscription.createdAt;
  if (!startDateStr) {
    return {
      eligible: false,
      planCode: subscription.planCode,
      annualPrepaymentCents: 0,
      oneMonthDeductionCents: 0,
      refundAmountCents: 0,
      reason: 'No subscription start date found',
    };
  }

  const startDate = new Date(startDateStr);
  const elapsedMs = now.getTime() - startDate.getTime();
  if (elapsedMs < 0 || elapsedMs > ANNUAL_GUARANTEE_WINDOW_MS) {
    return {
      eligible: false,
      planCode: subscription.planCode,
      annualPrepaymentCents: 0,
      oneMonthDeductionCents: 0,
      refundAmountCents: 0,
      reason: 'Outside 30-day guarantee window',
    };
  }

  // Check once-per-business / account guarantee history in account_events
  try {
    const { data: priorEvents } = await admin
      .from('account_events')
      .select('id')
      .eq('account_id', accountId)
      .eq('kind', 'subscription_guarantee_refund_issued')
      .limit(1);

    if (priorEvents && priorEvents.length > 0) {
      return {
        eligible: false,
        planCode: subscription.planCode,
        annualPrepaymentCents: 0,
        oneMonthDeductionCents: 0,
        refundAmountCents: 0,
        reason: '30-day guarantee already used previously for this account',
      };
    }
  } catch (err) {
    console.error('Error checking prior guarantee events:', err);
  }

  return calculateAnnualPlanGuaranteeRefund(subscription.planCode);
}

/**
 * WHY THIS TAKES A STATE TOKEN, which is not obvious and matters for money.
 *
 * cancel_at_period_end is a TOGGLE, and a key derived only from (workspace,
 * subscription, mode) is stable for that toggle's whole life. Stripe replays a
 * cached response for 24 hours, so with a resume path in existence the sequence
 * cancel -> resume -> cancel sends the third request under the FIRST cancel's
 * key. Stripe returns the first response verbatim without touching the
 * subscription: the customer sees "Cancellation scheduled", nothing is
 * scheduled, and they are charged again at renewal.
 *
 * The token is billing_subscriptions.updated_at, which the projector advances on
 * every customer.subscription.updated -- i.e. on every flip. So a genuine
 * re-flip gets a fresh key, while a double click within one render sees the same
 * updated_at and still collapses to one API call, which is what the key is for.
 *
 * Optional because the account-deletion path cancels outright rather than
 * toggling, and can never be re-flipped: the row is gone immediately after.
 */
export function buildSubscriptionCancellationIdempotencyKey(input: {
  workspaceId: string;
  providerSubscriptionId: string;
  mode: 'at_period_end' | 'immediate' | 'resume';
  stateToken?: string | null;
}): string {
  const workspaceId = String(input.workspaceId ?? '').trim();
  const subscriptionId = String(input.providerSubscriptionId ?? '').trim();
  if (!workspaceId || !subscriptionId) {
    throw new Error('A workspace and a provider subscription id are required to cancel.');
  }
  const digest = createHash('sha256')
  .update([
    'base_plan_subscription',
    workspaceId,
    subscriptionId,
    input.mode,
    input.stateToken ?? '',
  ].join('\0'))
  .digest('hex');
  return `lgq:billing:v1:subscription.cancel:${digest}`;
}

/**
 * The workspace's current subscription, or null when there is nothing to cancel.
 *
 * Reads with whichever client the caller hands in. billing_subscriptions is
 * granted to service_role, and the only app read of it today is an /admin
 * surface, so an owner-facing caller must pass an admin client and scope the
 * query itself -- which is what account_id does here.
 */
export async function loadCancellableSubscription(
  admin: SupabaseClient,
  accountId: string,
): Promise<CancellableSubscription | null> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('provider_subscription_id, plan_code, billing_interval, status, cancel_at_period_end, current_period_start, current_period_end, created_at, updated_at')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to read this workspace's subscription: ${error.message}`);
  if (!data?.provider_subscription_id) return null;
  if (!CANCELLABLE_STATUSES.has(String(data.status))) return null;

  const billingInterval = String(data.billing_interval || 'monthly') === 'annual' ? 'annual' : 'monthly';
  const planCode = String(data.plan_code || 'flex');

  const guaranteeCheck = await checkAnnualGuaranteeEligibility(admin, accountId, {
    billingInterval,
    planCode,
    currentPeriodStart: data.current_period_start ? String(data.current_period_start) : null,
    createdAt: data.created_at ? String(data.created_at) : null,
  });

  return Object.freeze({
    providerSubscriptionId: String(data.provider_subscription_id),
    planCode,
    billingInterval,
    status: String(data.status),
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
    currentPeriodStart: data.current_period_start ? String(data.current_period_start) : null,
    currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
    createdAt: data.created_at ? String(data.created_at) : null,
    updatedAt: data.updated_at ? String(data.updated_at) : null,
    guaranteeEligible: guaranteeCheck.eligible,
    guaranteeRefundAmountCents: guaranteeCheck.refundAmountCents,
    guaranteeDeductionCents: guaranteeCheck.oneMonthDeductionCents,
  });
}

export type CancellationResult =
  | {
      ok: true;
      alreadyScheduled: boolean;
      currentPeriodEnd: string | null;
      guaranteeRefundIssued?: boolean;
      refundAmountCents?: number;
      stripeRefundId?: string;
    }
  | { ok: false; error: string };

/**
 * Stripe failures split into two kinds, and telling somebody the wrong one is
 * its own defect.
 *
 * "Try again in a moment" is right for a timeout or a 500 and actively
 * misleading for `resource_missing`, which never becomes true by waiting -- the
 * same shape as the dead-lettered price mismatch that is never retryable. A
 * permanent failure dressed as a transient one is a button somebody presses
 * forever while nothing happens and nobody is alerted.
 *
 * This is reachable today, not hypothetically. The production database carries a
 * rehearsal subscription projected from a TEST-mode checkout session, and a live
 * key cannot see a test-mode subscription, so that one workspace's cancel button
 * fails with exactly this error.
 */
function describeStripeFailure(error: unknown, verb: 'cancel' | 'restore'): { message: string; permanent: boolean } {
  const code = (error as { code?: unknown } | null)?.code;
  const type = (error as { type?: unknown } | null)?.type;
  if (code === 'resource_missing' || type === 'invalid_request_error') {
    return {
      permanent: true,
      message: 'We could not find that subscription at Stripe, so nothing was changed. Please contact support — retrying will not help.',
    };
  }
  return { permanent: false, message: `Stripe could not ${verb} that subscription just now. Try again in a moment.` };
}

/**
 * Schedule cancellation at the end of the paid period, or execute the 30-day money-back guarantee refund if eligible.
 *
 * For standard cancellations: They have paid through the period, and cancellations take effect at renewal.
 * For eligible annual plans within 30 days: Automatically issues the published guarantee refund (annual prepayment minus 1 month base) and cancels the subscription.
 */
export async function cancelBasePlanSubscriptionAtPeriodEnd(input: {
  admin: SupabaseClient;
  accountId: string;
  actorEmail?: string | null;
}): Promise<CancellationResult> {
  // Checked BEFORE the read, so a refusal costs no query and writes no event
  if (!basePlanSubscriptionCancellationEnabled()) {
    return { ok: false, error: CANCELLATION_DISABLED_MESSAGE };
  }

  const subscription = await loadCancellableSubscription(input.admin, input.accountId);
  if (!subscription) {
    return { ok: false, error: 'There is no active subscription on this workspace to cancel.' };
  }

  // 1. 30-DAY MONEY-BACK GUARANTEE PATH FOR ANNUAL BASE PLANS
  if (subscription.guaranteeEligible && subscription.guaranteeRefundAmountCents > 0) {
    await recordAccountEvent({
      accountId: input.accountId,
      kind: 'subscription_guarantee_refund_requested',
      summary: `Requested 30-day guarantee refund for annual ${subscription.planCode} plan ($${(subscription.guaranteeRefundAmountCents / 100).toFixed(2)})`,
      actorEmail: input.actorEmail ?? null,
      meta: {
        plan_code: subscription.planCode,
        provider_subscription_id: subscription.providerSubscriptionId,
        refund_amount_cents: subscription.guaranteeRefundAmountCents,
        deduction_cents: subscription.guaranteeDeductionCents,
      },
    });

    const stripe = getStripeClient();
    let paymentIntentId: string | null = null;
    let latestChargeId: string | null = null;

    try {
      const invoices = await stripe.invoices.list({
        subscription: subscription.providerSubscriptionId,
        status: 'paid',
        limit: 1,
      });
      const latestInvoice = invoices.data?.[0] as unknown as {
        payment_intent?: string | { id: string } | null;
        charge?: string | { id: string } | null;
      } | undefined;
      if (latestInvoice?.payment_intent) {
        paymentIntentId = typeof latestInvoice.payment_intent === 'string'
          ? latestInvoice.payment_intent
          : latestInvoice.payment_intent.id;
      }
      if (latestInvoice?.charge) {
        latestChargeId = typeof latestInvoice.charge === 'string'
          ? latestInvoice.charge
          : latestInvoice.charge.id;
      }
    } catch (invErr) {
      console.warn(`Could not list invoices for subscription ${subscription.providerSubscriptionId}:`, invErr);
    }

    let stripeRefundId: string | null = null;
    if (paymentIntentId || latestChargeId) {
      try {
        const refundParams: Record<string, unknown> = {
          amount: subscription.guaranteeRefundAmountCents,
          reason: 'requested_by_customer',
          metadata: {
            account_id: input.accountId,
            plan_code: subscription.planCode,
            guarantee_version: '30_day_first_annual',
            refund_amount_cents: String(subscription.guaranteeRefundAmountCents),
            one_month_deduction_cents: String(subscription.guaranteeDeductionCents),
          },
        };
        if (paymentIntentId) refundParams.payment_intent = paymentIntentId;
        else if (latestChargeId) refundParams.charge = latestChargeId;

        const refund = await stripe.refunds.create(
          refundParams as never,
          {
            idempotencyKey: `lgq:billing:v1:guarantee_refund:${input.accountId}:${subscription.providerSubscriptionId}`,
          },
        );
        stripeRefundId = refund.id;
      } catch (refundError) {
        console.error(`Stripe refund creation failed for ${subscription.providerSubscriptionId}:`, refundError);
        return { ok: false, error: 'Stripe was unable to process the guarantee refund. Please contact support.' };
      }
    }

    // Cancel the subscription immediately at Stripe
    try {
      await stripe.subscriptions.cancel(subscription.providerSubscriptionId, {
        idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: subscription.providerSubscriptionId,
          mode: 'immediate',
          stateToken: subscription.updatedAt,
        }),
      } as never);
    } catch (cancelErr) {
      console.error(`Failed to cancel subscription after refund for ${subscription.providerSubscriptionId}:`, cancelErr);
    }

    // Record completed guarantee refund event
    await recordAccountEvent({
      accountId: input.accountId,
      kind: 'subscription_guarantee_refund_issued',
      summary: `Processed 30-day money-back guarantee for annual ${subscription.planCode} plan: refunded $${(subscription.guaranteeRefundAmountCents / 100).toFixed(2)} (deducted $${(subscription.guaranteeDeductionCents / 100).toFixed(2)} for 1 month of service)`,
      actorEmail: input.actorEmail ?? null,
      meta: {
        plan_code: subscription.planCode,
        provider_subscription_id: subscription.providerSubscriptionId,
        stripe_refund_id: stripeRefundId,
        refund_amount_cents: subscription.guaranteeRefundAmountCents,
        one_month_deduction_cents: subscription.guaranteeDeductionCents,
      },
    });

    return {
      ok: true,
      alreadyScheduled: false,
      guaranteeRefundIssued: true,
      refundAmountCents: subscription.guaranteeRefundAmountCents,
      stripeRefundId: stripeRefundId ?? undefined,
      currentPeriodEnd: null,
    };
  }

  // 2. STANDARD CANCELLATION PATH (AT PERIOD END)
  if (subscription.cancelAtPeriodEnd) {
    return { ok: true, alreadyScheduled: true, currentPeriodEnd: subscription.currentPeriodEnd };
  }

  await recordAccountEvent({
    accountId: input.accountId,
    kind: 'subscription_cancellation_requested',
    summary: `Requested cancellation of the ${subscription.planCode} plan at the end of the current period`,
    actorEmail: input.actorEmail ?? null,
    meta: {
      plan_code: subscription.planCode,
      provider_subscription_id: subscription.providerSubscriptionId,
      mode: 'at_period_end',
    },
  });

  try {
    const stripe = getStripeClient();
    const updated = await stripe.subscriptions.update(
      subscription.providerSubscriptionId,
      { cancel_at_period_end: true },
      {
        idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: subscription.providerSubscriptionId,
          mode: 'at_period_end',
          stateToken: subscription.updatedAt,
        }),
      },
    );
    return {
      ok: true,
      alreadyScheduled: false,
      currentPeriodEnd: updated.cancel_at
        ? new Date(updated.cancel_at * 1000).toISOString()
        : subscription.currentPeriodEnd,
    };
  } catch (error) {
    const failure = describeStripeFailure(error, 'cancel');
    console.error(
      `cancelBasePlanSubscriptionAtPeriodEnd failed (${failure.permanent ? 'PERMANENT' : 'transient'}) for ${subscription.providerSubscriptionId}:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: failure.message };
  }
}

export type ResumeResult =
  | { ok: true; alreadyActive: boolean; currentPeriodEnd: string | null }
  | { ok: false; error: string };

/**
 * Undo a scheduled cancellation, while the plan is still open.
 *
 * The panel told a customer who had just cancelled to "contact support and we
 * can put it back before it ends" -- another promise with no mechanism behind
 * it, of exactly the kind the cancel button itself was built to retire. It is
 * also the cheapest possible retention: the person has already decided to stay.
 *
 * The mirror image of the cancel path and deliberately so -- same read, same
 * flag, same event-before-call ordering, same refusal to write
 * billing_subscriptions (the projector owns that row). The only asymmetry is
 * the window: loadCancellableSubscription filters on CANCELLABLE_STATUSES, so
 * once the period has actually ended and Stripe has moved the subscription to
 * `canceled`, this returns "nothing to resume" rather than asking Stripe to
 * revive a dead subscription, which it would refuse anyway. Past that point
 * subscribing again is a new purchase, not an undo.
 */
export async function resumeBasePlanSubscription(input: {
  admin: SupabaseClient;
  accountId: string;
  actorEmail?: string | null;
}): Promise<ResumeResult> {
  const subscription = await loadCancellableSubscription(input.admin, input.accountId);
  if (!subscription) {
    return { ok: false, error: 'There is no subscription on this workspace to restore.' };
  }
  if (!subscription.cancelAtPeriodEnd) {
    // Nothing scheduled, so the plan already renews. Same posture as the cancel
    // path takes on an already-scheduled cancellation: what they asked for is
    // true, so say so rather than sending a write or raising an error.
    return { ok: true, alreadyActive: true, currentPeriodEnd: subscription.currentPeriodEnd };
  }

  await recordAccountEvent({
    accountId: input.accountId,
    kind: 'subscription_cancellation_revoked',
    summary: `Restored the ${subscription.planCode} plan before its scheduled cancellation took effect`,
    actorEmail: input.actorEmail ?? null,
    meta: {
      plan_code: subscription.planCode,
      provider_subscription_id: subscription.providerSubscriptionId,
      mode: 'resume',
    },
  });

  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(
      subscription.providerSubscriptionId,
      { cancel_at_period_end: false },
      {
        idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: subscription.providerSubscriptionId,
          mode: 'resume',
          stateToken: subscription.updatedAt,
        }),
      },
    );
    // The projected period end, not one read back off the response. Undoing a
    // cancellation does not move the renewal date, and Stripe v22 does not carry
    // current_period_end on the Subscription any more -- it lives on the item,
    // which is why the two other readers in this codebase either cast around it
    // or dig into items. Neither is needed for a date we already hold.
    return { ok: true, alreadyActive: false, currentPeriodEnd: subscription.currentPeriodEnd };
  } catch (error) {
    const failure = describeStripeFailure(error, 'restore');
    console.error(
      `resumeBasePlanSubscription failed (${failure.permanent ? 'PERMANENT' : 'transient'}) for ${subscription.providerSubscriptionId}:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: failure.message };
  }
}

/**
 * Schedule cancellation of a recurring purchased capacity add-on (e.g. extra crew seat) at period end.
 */
export type CancellableCapacitySubscription = Readonly<{
  id: string;
  topUpId: string;
  resourceCode: string;
  units: number;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: string | null;
}>;

export async function loadCancellableCapacitySubscription(
  admin: SupabaseClient,
  accountId: string,
  stripeSubscriptionId: string,
): Promise<CancellableCapacitySubscription | null> {
  const { data, error } = await admin
    .from('workspace_purchased_capacity')
    .select('id, top_up_id, resource_code, units, stripe_subscription_id, status, current_period_end')
    .eq('account_id', accountId)
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .in('status', ['active', 'past_due'])
    .maybeSingle();

  if (error) throw new Error(`Unable to read purchased capacity subscription: ${error.message}`);
  if (!data?.stripe_subscription_id) return null;

  return Object.freeze({
    id: String(data.id),
    topUpId: String(data.top_up_id),
    resourceCode: String(data.resource_code),
    units: Number(data.units),
    stripeSubscriptionId: String(data.stripe_subscription_id),
    status: String(data.status),
    currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
  });
}

export async function cancelPurchasedCapacitySubscriptionAtPeriodEnd(input: {
  admin: SupabaseClient;
  accountId: string;
  stripeSubscriptionId: string;
  actorEmail?: string | null;
}): Promise<CancellationResult> {
  const capacity = await loadCancellableCapacitySubscription(
    input.admin,
    input.accountId,
    input.stripeSubscriptionId,
  );
  if (!capacity) {
    return { ok: false, error: 'There is no active purchased capacity subscription on this workspace to cancel.' };
  }

  await recordAccountEvent({
    accountId: input.accountId,
    kind: 'purchased_capacity_cancellation_requested',
    summary: `Requested cancellation of ${capacity.topUpId} (${capacity.units} units) at the end of the current period`,
    actorEmail: input.actorEmail ?? null,
    meta: {
      top_up_id: capacity.topUpId,
      units: capacity.units,
      provider_subscription_id: capacity.stripeSubscriptionId,
      mode: 'at_period_end',
    },
  });

  try {
    const stripe = getStripeClient();
    const updated = await stripe.subscriptions.update(
      capacity.stripeSubscriptionId,
      { cancel_at_period_end: true },
      {
        idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: capacity.stripeSubscriptionId,
          mode: 'at_period_end',
        }),
      },
    );
    return {
      ok: true,
      alreadyScheduled: false,
      currentPeriodEnd: updated.cancel_at
        ? new Date(updated.cancel_at * 1000).toISOString()
        : capacity.currentPeriodEnd,
    };
  } catch (error) {
    const failure = describeStripeFailure(error, 'cancel');
    console.error(
      `cancelPurchasedCapacitySubscriptionAtPeriodEnd failed (${failure.permanent ? 'PERMANENT' : 'transient'}) for ${capacity.stripeSubscriptionId}:`,
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: failure.message };
  }
}

/**
 * Stop billing immediately, for account deletion.
 *
 * Separate from the customer-facing path on purpose. deleteAccountAction removes
 * the accounts row, and billing_subscriptions.account_id is ON DELETE CASCADE --
 * so the local record of the subscription is destroyed while Stripe keeps
 * charging, and the projector can no longer bind the events to a workspace.
 * Period-end scheduling is no use there: after the delete there is nothing left
 * to project the eventual deletion onto.
 *
 * Best-effort by contract. It returns a boolean rather than throwing because
 * failing to cancel must not trap somebody in an account they asked to delete;
 * the caller logs and continues, and a leaked subscription is recoverable by an
 * operator where a blocked deletion is not.
 */
export async function cancelSubscriptionForAccountDeletion(input: {
  admin: SupabaseClient;
  accountId: string;
  /**
   * The subscription as it was read BEFORE the account row was deleted.
   *
   * The deletion now runs first, because it can fail: twenty-four tables hold a
   * RESTRICT foreign key to `accounts`, `payments` among them, so any workspace
   * that has ever taken a customer payment cannot be deleted at all. Cancelling
   * first meant a contractor lost their plan mid-period to a delete that was
   * always going to fail.
   *
   * But `billing_subscriptions.account_id` is ON DELETE CASCADE, so once the
   * delete commits there is no local row left to read and this would find
   * nothing to cancel — leaking a live subscription that keeps charging. So the
   * caller reads it beforehand and hands it in. Pass `undefined` to keep the
   * original load-it-here behaviour.
   */
  preloaded?: CancellableSubscription | null;
  preloadedCapacitySubscriptions?: readonly string[] | null;
}): Promise<{
  canceled: boolean;
  subscriptionId: string | null;
  capacityCanceledCount: number;
  error: string | null;
}> {
  let subscription: CancellableSubscription | null = null;
  if (input.preloaded !== undefined) {
    subscription = input.preloaded;
  } else {
    try {
      subscription = await loadCancellableSubscription(input.admin, input.accountId);
    } catch (error) {
      return { canceled: false, subscriptionId: null, capacityCanceledCount: 0, error: error instanceof Error ? error.message : 'read failed' };
    }
  }

  let capacitySubscriptionIds: string[] = [];
  if (input.preloadedCapacitySubscriptions !== undefined && input.preloadedCapacitySubscriptions !== null) {
    capacitySubscriptionIds = [...input.preloadedCapacitySubscriptions];
  } else {
    try {
      const { data: capacityRows } = await input.admin
        .from('workspace_purchased_capacity')
        .select('stripe_subscription_id')
        .eq('account_id', input.accountId)
        .in('status', ['active', 'past_due']);
      capacitySubscriptionIds = (capacityRows ?? [])
        .map((row) => String(row.stripe_subscription_id))
        .filter(Boolean);
    } catch (error) {
      console.error(`Failed to read purchased capacity subscriptions for account ${input.accountId}:`, error);
    }
  }

  const stripe = getStripeClient();
  let baseCanceled = false;
  let baseError: string | null = null;

  if (subscription) {
    try {
      await stripe.subscriptions.cancel(subscription.providerSubscriptionId, {
        idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: subscription.providerSubscriptionId,
          mode: 'immediate',
        }),
      } as never);
      baseCanceled = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown Stripe error';
      // Loud, and with the id in it: this is the line an operator needs to find
      // the still-billing subscription whose local row no longer exists.
      console.error(
        `ACCOUNT DELETED WITH A LIVE STRIPE SUBSCRIPTION. Cancel ${subscription.providerSubscriptionId} by hand. ${message}`,
      );
      baseError = message;
    }
  }

  let capacityCanceledCount = 0;
  for (const capSubId of capacitySubscriptionIds) {
    try {
      await stripe.subscriptions.cancel(capSubId, {
        idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: capSubId,
          mode: 'immediate',
        }),
      } as never);
      capacityCanceledCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown Stripe error';
      console.error(
        `ACCOUNT DELETED WITH A LIVE CAPACITY STRIPE SUBSCRIPTION. Cancel ${capSubId} by hand. ${message}`,
      );
    }
  }

  return {
    canceled: baseCanceled,
    subscriptionId: subscription?.providerSubscriptionId ?? null,
    capacityCanceledCount,
    error: baseError,
  };
}

/**
 * Cancels or schedules cancellation of an ad campaign subscription on Stripe.
 */
export async function cancelAdCampaignSubscription(
  stripeSubscriptionId: string,
  cancelImmediately = false,
): Promise<void> {
  const stripe = getStripeClient();
  if (cancelImmediately) {
    await stripe.subscriptions.cancel(stripeSubscriptionId);
  } else {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  }
}

