import 'server-only';

import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { recordAccountEvent } from '@/lib/account-events';
import { BILLING_PLAN_IDS, BILLING_PLANS, PRICING_CATALOG_VERSION, formatUsdFromCents, resolveBillingPlanId, type BillingPlanId, type BillingCycle } from '@/lib/billing/catalog';
import type { AllowancePeriodWindow } from '@/lib/billing/entitlement-catalog';
import { decidePlanTransition, type PlanTransitionDecision, type WorkspacePlanSelection } from '@/lib/billing/plan-transition';
import { SUBSCRIPTION_CHECKOUT_METADATA_KEYS } from '@/lib/billing/stripe-billing-subscription-checkout';
import { cancelBasePlanSubscriptionAtPeriodEnd } from '@/lib/billing/subscription-cancellation';
import { loadVerifiedStripePlanPrices } from '@/lib/billing/stripe-plan-prices';
import { getStripeClient } from '@/lib/stripe';

/**
 * Changing a base plan from inside the product.
 *
 * Until this landed, `canStartFirstSubscription` gated the only checkout surface
 * on `planCode === 'flex'`, so a paying customer had no way to move tier or
 * billing cycle at all -- and both seat top-ups are withheld. A Growth workspace
 * that outgrew its ten crew seats could not give us more money by any self-serve
 * route. That is also why seat enforcement stayed off: refusing somebody who has
 * no way to buy the fix is a dead end, not a conversion.
 *
 * THE ONE THING THAT WILL BREAK THIS IF IT IS EVER SPLIT UP. The projector does
 * not read the plan off the Price. `resolve_stripe_billing_subscription_projection_binding`
 * builds its contract from the SUBSCRIPTION METADATA (`lgq_plan_code`,
 * `lgq_billing_interval`, `lgq_catalog_version`) and then refuses the event with
 * `provider_price_contract_mismatch` if the retrieved Price disagrees. That code
 * is terminal, never retryable -- there is a dead-lettered row in production
 * carrying it right now.
 *
 * So `subscriptions.update` MUST carry the new price and the new metadata in the
 * SAME call. Change the price alone and Stripe invoices the customer for the
 * proration immediately, then every resulting event dead-letters: they have paid
 * for Growth and the product still says Solo, with no retry that can ever fix it.
 * `assertMetadataMatchesPrice` below exists so that cannot be done by accident.
 *
 * The policy lives in `plan-transition.ts` and is not re-derived here. Capacity
 * upgrades on the same interval activate after payment; downgrades and any
 * billing-cycle change wait for renewal, which is what stops an annual
 * subscriber escaping the term they bought by bundling a tier move with a switch
 * to monthly.
 */

export type PaidPlanCode = Exclude<BillingPlanId, 'flex'>;

/** Statuses where a plan change is a coherent request. */
const CHANGEABLE_STATUSES = new Set(['trialing', 'active', 'past_due']);

export type ChangeableSubscription = Readonly<{
  providerSubscriptionId: string;
  providerSubscriptionItemId: string | null;
  planCode: BillingPlanId;
  billingInterval: 'none' | BillingCycle;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pendingPlanCode: string | null;
  pendingBillingInterval: string | null;
  pendingEffectiveAt: string | null;
  /** The projector's last write. See the idempotency note below. */
  updatedAt: string | null;
}>;

/**
 * WHY THIS TAKES A STATE TOKEN.
 *
 * A plan change is a toggle in the same way `cancel_at_period_end` is: solo ->
 * growth -> solo is an ordinary sequence. A key derived only from (workspace,
 * subscription, target) is stable for that target forever, and Stripe replays a
 * cached response for 24 hours -- so the second move back to solo would be
 * answered with the FIRST one's response without touching the subscription. The
 * customer would see the change confirmed, be charged nothing, and stay where
 * they were.
 *
 * The token is `billing_subscriptions.updated_at`, which the projector advances
 * on every `customer.subscription.updated`. A genuine re-change gets a fresh
 * key; a double submit inside one render sees the same token and still collapses
 * to one API call, which is what the key is for.
 */
export function buildPlanChangeIdempotencyKey(input: {
  workspaceId: string;
  providerSubscriptionId: string;
  targetPlanCode: string;
  targetBillingInterval: string;
  stateToken?: string | null;
}): string {
  const workspaceId = String(input.workspaceId ?? '').trim();
  const subscriptionId = String(input.providerSubscriptionId ?? '').trim();
  if (!workspaceId || !subscriptionId) {
    throw new Error('A workspace and a provider subscription id are required to change a plan.');
  }
  const digest = createHash('sha256')
    .update([
      'base_plan_change',
      workspaceId,
      subscriptionId,
      input.targetPlanCode,
      input.targetBillingInterval,
      input.stateToken ?? '',
    ].join('\0'))
    .digest('hex');
  return `lgq:billing:v1:subscription.plan_change:${digest}`;
}

/**
 * The workspace's current subscription, or null when there is nothing to change.
 *
 * `billing_subscriptions` is granted to service_role, so the caller passes an
 * admin client and this scopes the read by account_id.
 */
export async function loadChangeableSubscription(
  admin: SupabaseClient,
  accountId: string,
): Promise<ChangeableSubscription | null> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    // One string literal on purpose: supabase-js infers the row type from this
    // argument statically, and a concatenated expression collapses it to
    // GenericStringError so every field read below becomes a type error.
    .select('provider_subscription_id, provider_subscription_item_id, plan_code, billing_interval, status, current_period_start, current_period_end, pending_plan_code, pending_billing_interval, pending_effective_at, updated_at')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to read this workspace's subscription: ${error.message}`);
  if (!data?.provider_subscription_id) return null;
  if (!CHANGEABLE_STATUSES.has(String(data.status))) return null;

  return Object.freeze({
    providerSubscriptionId: String(data.provider_subscription_id),
    providerSubscriptionItemId: data.provider_subscription_item_id
      ? String(data.provider_subscription_item_id)
      : null,
    planCode: resolveBillingPlanId(String(data.plan_code)),
    billingInterval: (data.billing_interval ?? 'none') as 'none' | BillingCycle,
    status: String(data.status),
    currentPeriodStart: data.current_period_start ? String(data.current_period_start) : null,
    currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
    pendingPlanCode: data.pending_plan_code ? String(data.pending_plan_code) : null,
    pendingBillingInterval: data.pending_billing_interval ? String(data.pending_billing_interval) : null,
    pendingEffectiveAt: data.pending_effective_at ? String(data.pending_effective_at) : null,
    updatedAt: data.updated_at ? String(data.updated_at) : null,
  });
}

export type PlanChangeResult =
  | Readonly<{ ok: true; kind: 'no_change'; planCode: BillingPlanId }>
  | Readonly<{ ok: true; kind: 'activated'; planCode: PaidPlanCode; billingInterval: BillingCycle }>
  | Readonly<{ ok: true; kind: 'scheduled'; planCode: BillingPlanId; billingInterval: 'none' | BillingCycle; effectiveAt: string | null }>
  | Readonly<{ ok: false; error: string }>;

/**
 * The guard that makes the metadata/price coupling unforgeable.
 *
 * Called immediately before the Stripe write with what is about to be sent. If
 * the metadata and the Price ever disagree, this throws rather than letting the
 * request reach Stripe -- because once Stripe has invoiced the proration, the
 * money has moved and the projection failure is terminal.
 */
export function assertMetadataMatchesPrice(
  metadata: Readonly<Record<string, string>>,
  price: Readonly<{ planCode: string; billingInterval: string; catalogVersion: string }>,
): void {
  const declaredPlan = metadata[SUBSCRIPTION_CHECKOUT_METADATA_KEYS.planCode];
  const declaredInterval = metadata[SUBSCRIPTION_CHECKOUT_METADATA_KEYS.billingInterval];
  const declaredCatalog = metadata[SUBSCRIPTION_CHECKOUT_METADATA_KEYS.catalogVersion];
  if (
    declaredPlan !== price.planCode
    || declaredInterval !== price.billingInterval
    || declaredCatalog !== price.catalogVersion
  ) {
    throw new Error(
      'Refusing to change a subscription whose metadata would disagree with its Price: '
      + `metadata says ${declaredPlan}/${declaredInterval}/${declaredCatalog}, `
      + `Price says ${price.planCode}/${price.billingInterval}/${price.catalogVersion}. `
      + 'The projector would dead-letter every event for this subscription with '
      + 'provider_price_contract_mismatch after the customer had already been charged.',
    );
  }
}

function planChangeMetadata(target: { planCode: PaidPlanCode; billingInterval: BillingCycle }): Record<string, string> {
  // Stripe MERGES metadata on update, so only the keys that move are sent. The
  // workspace id, terms version and recurring-consent evidence set at checkout
  // are preserved untouched -- rewriting them here would risk losing the
  // acceptance trail that migration 20260816060000 pins.
  return {
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.planCode]: target.planCode,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.billingInterval]: target.billingInterval,
    [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.catalogVersion]: PRICING_CATALOG_VERSION,
  };
}

function selectionOf(subscription: ChangeableSubscription): WorkspacePlanSelection {
  return { planCode: subscription.planCode, billingInterval: subscription.billingInterval };
}

/**
 * The window a prorated upgrade is measured against.
 *
 * `effectiveAtMs` is now, because an upgrade activates on payment. Returning
 * undefined rather than guessing matters: decidePlanTransition throws for a paid
 * mid-cycle upgrade without a window, and that refusal is better than pricing a
 * proration against invented dates.
 */
function allowancePeriod(subscription: ChangeableSubscription, nowMs: number):
  AllowancePeriodWindow | undefined {
  if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd) return undefined;
  const periodStartMs = new Date(subscription.currentPeriodStart).getTime();
  const periodEndMs = new Date(subscription.currentPeriodEnd).getTime();
  if (!Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs)) return undefined;
  // Clamp rather than fail: a renewal that has fired but not yet projected would
  // otherwise put `now` outside the window and throw inside the decision.
  const effectiveAtMs = Math.min(Math.max(nowMs, periodStartMs), periodEndMs);
  return { periodStartMs, periodEndMs, effectiveAtMs };
}

/**
 * Move a workspace to a different plan or billing cycle.
 *
 * Never throws for an ordinary refusal -- a plan change failing must not 500 the
 * settings page. It DOES throw from `assertMetadataMatchesPrice`, deliberately,
 * because that condition means the code is wrong rather than the request.
 */
export async function changeBasePlan(input: {
  admin: SupabaseClient;
  accountId: string;
  targetPlanCode: BillingPlanId;
  targetBillingInterval: 'none' | BillingCycle;
  actorEmail?: string | null;
}): Promise<PlanChangeResult> {
  const subscription = await loadChangeableSubscription(input.admin, input.accountId);
  if (!subscription) {
    return { ok: false, error: 'There is no active subscription on this workspace to change.' };
  }

  let decision: PlanTransitionDecision;
  try {
    decision = decidePlanTransition(
      selectionOf(subscription),
      { planCode: input.targetPlanCode, billingInterval: input.targetBillingInterval },
      allowancePeriod(subscription, Date.now()),
    );
  } catch (error) {
    // decidePlanTransition throws on incoherent selections (Flex with an
    // interval, a paid plan with none, a mid-cycle upgrade with no period).
    console.error('decidePlanTransition refused a plan change:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'That plan change is not something we can make from here.' };
  }

  if (decision.kind === 'no_change') {
    return { ok: true, kind: 'no_change', planCode: subscription.planCode };
  }

  if (decision.kind === 'schedule_at_renewal') {
    return scheduleAtRenewal({ ...input, subscription, decision });
  }

  return activateAfterPayment({ ...input, subscription, decision });
}

async function activateAfterPayment(input: {
  admin: SupabaseClient;
  accountId: string;
  actorEmail?: string | null;
  subscription: ChangeableSubscription;
  decision: Extract<PlanTransitionDecision, { kind: 'activate_after_payment' }>;
}): Promise<PlanChangeResult> {
  const { subscription, decision } = input;
  const target = decision.target;
  if (target.planCode === 'flex' || target.billingInterval === 'none') {
    return { ok: false, error: 'A paid upgrade cannot target the free plan.' };
  }
  const planCode = target.planCode as PaidPlanCode;
  const billingInterval = target.billingInterval as BillingCycle;

  if (!subscription.providerSubscriptionItemId) {
    // Without the item id there is nothing to point at a new Price. Guessing by
    // retrieving the subscription and taking items[0] would be wrong for any
    // subscription that ever gains a second line.
    return { ok: false, error: 'This subscription is missing its Stripe line item, so it cannot be changed here.' };
  }

  const prices = await loadVerifiedStripePlanPrices();
  const verified = prices[`${planCode}_${billingInterval}` as const];
  if (!verified) {
    return { ok: false, error: 'That plan is not currently available for purchase.' };
  }

  const metadata = planChangeMetadata({ planCode, billingInterval });
  // Throws rather than returning: this is a code defect, not a user error, and
  // proceeding would move money before failing.
  assertMetadataMatchesPrice(metadata, verified);

  await recordAccountEvent({
    accountId: input.accountId,
    kind: 'plan_change_requested',
    summary: `Requested an upgrade from ${subscription.planCode} to ${planCode} (${billingInterval}), effective on payment`,
    actorEmail: input.actorEmail ?? null,
    meta: {
      from_plan_code: subscription.planCode,
      to_plan_code: planCode,
      billing_interval: billingInterval,
      provider_subscription_id: subscription.providerSubscriptionId,
      mode: 'activate_after_payment',
    },
  });

  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.update(
      subscription.providerSubscriptionId,
      {
        items: [{ id: subscription.providerSubscriptionItemId, price: verified.priceId }],
        // The customer is moving up mid-cycle and should be billed the
        // difference now, which is what makes the upgrade activate on payment
        // rather than at renewal.
        proration_behavior: 'always_invoice',
        metadata,
      },
      {
        idempotencyKey: buildPlanChangeIdempotencyKey({
          workspaceId: input.accountId,
          providerSubscriptionId: subscription.providerSubscriptionId,
          targetPlanCode: planCode,
          targetBillingInterval: billingInterval,
          stateToken: subscription.updatedAt,
        }),
      },
    );
    // Deliberately not written back to billing_subscriptions. The projector owns
    // that row and customer.subscription.updated carries this same state.
    return { ok: true, kind: 'activated', planCode, billingInterval };
  } catch (error) {
    return { ok: false, error: describeStripeFailure(error, subscription.providerSubscriptionId, 'upgrade') };
  }
}

async function scheduleAtRenewal(input: {
  admin: SupabaseClient;
  accountId: string;
  actorEmail?: string | null;
  subscription: ChangeableSubscription;
  decision: Extract<PlanTransitionDecision, { kind: 'schedule_at_renewal' }>;
}): Promise<PlanChangeResult> {
  const { subscription, decision } = input;
  const target = decision.target;

  if (!subscription.currentPeriodEnd) {
    // Nothing to schedule against. Refusing beats picking a date, because the
    // whole promise of a scheduled change is that it happens on a day the
    // customer was told.
    return { ok: false, error: 'We cannot schedule a change until this subscription reports its renewal date.' };
  }

  // DOWNGRADING TO FLEX IS CANCELLING, and must not be stored as a pending plan.
  // `pending_plan_code`'s CHECK admits only paid codes, so writing 'flex' would
  // raise and writing null would mean "nothing scheduled" while this function
  // still reported success -- a scheduled downgrade that silently never happens.
  // The cancellation path already schedules at period end, keeps access through
  // the paid term and drops the workspace to Flex when it lapses, which is
  // exactly this transition.
  if (target.planCode === 'flex') {
    const cancelled = await cancelBasePlanSubscriptionAtPeriodEnd({
      admin: input.admin,
      accountId: input.accountId,
      actorEmail: input.actorEmail ?? null,
    });
    if (!cancelled.ok) return { ok: false, error: cancelled.error };
    return {
      ok: true,
      kind: 'scheduled',
      planCode: 'flex',
      billingInterval: 'none',
      effectiveAt: cancelled.currentPeriodEnd ?? subscription.currentPeriodEnd,
    };
  }

  await recordAccountEvent({
    accountId: input.accountId,
    kind: 'plan_change_scheduled',
    summary: `Scheduled a change from ${subscription.planCode} to ${target.planCode} (${target.billingInterval}) at renewal`,
    actorEmail: input.actorEmail ?? null,
    meta: {
      from_plan_code: subscription.planCode,
      to_plan_code: target.planCode,
      billing_interval: target.billingInterval,
      provider_subscription_id: subscription.providerSubscriptionId,
      effective_at: subscription.currentPeriodEnd,
      mode: 'schedule_at_renewal',
    },
  });

  // No Stripe call. A scheduled change is a local intent until the renewal
  // worker applies it -- sending the price change now would take effect
  // immediately, which is exactly what schedule_at_renewal exists to prevent.
  const { data, error } = await input.admin.rpc('set_billing_subscription_pending_plan', {
    p_account_id: input.accountId,
    p_provider_subscription_id: subscription.providerSubscriptionId,
    p_pending_plan_code: target.planCode,
    p_pending_billing_interval: target.billingInterval,
    p_pending_effective_at: subscription.currentPeriodEnd,
  });

  if (error || data !== true) {
    console.error('set_billing_subscription_pending_plan failed:', error?.message ?? 'rpc did not confirm');
    return { ok: false, error: 'We could not schedule that change just now. Try again in a moment.' };
  }

  return {
    ok: true,
    kind: 'scheduled',
    planCode: target.planCode,
    billingInterval: target.billingInterval,
    effectiveAt: subscription.currentPeriodEnd,
  };
}

/**
 * Cancel a scheduled change before it takes effect.
 *
 * The mirror of the cancellation undo shipped alongside this: a customer who
 * scheduled a downgrade and changed their mind must not have to contact support.
 */
export async function clearScheduledPlanChange(input: {
  admin: SupabaseClient;
  accountId: string;
  actorEmail?: string | null;
}): Promise<PlanChangeResult> {
  const subscription = await loadChangeableSubscription(input.admin, input.accountId);
  if (!subscription) {
    return { ok: false, error: 'There is no active subscription on this workspace.' };
  }
  if (!subscription.pendingPlanCode) {
    return { ok: true, kind: 'no_change', planCode: subscription.planCode };
  }

  await recordAccountEvent({
    accountId: input.accountId,
    kind: 'plan_change_cancelled',
    summary: `Cancelled the scheduled change to ${subscription.pendingPlanCode} before it took effect`,
    actorEmail: input.actorEmail ?? null,
    meta: {
      provider_subscription_id: subscription.providerSubscriptionId,
      cancelled_plan_code: subscription.pendingPlanCode,
    },
  });

  const { data, error } = await input.admin.rpc('set_billing_subscription_pending_plan', {
    p_account_id: input.accountId,
    p_provider_subscription_id: subscription.providerSubscriptionId,
    p_pending_plan_code: null,
    p_pending_billing_interval: null,
    p_pending_effective_at: null,
  });
  if (error || data !== true) {
    console.error('clearScheduledPlanChange failed:', error?.message ?? 'rpc did not confirm');
    return { ok: false, error: 'We could not cancel that scheduled change just now. Try again in a moment.' };
  }
  return { ok: true, kind: 'no_change', planCode: subscription.planCode };
}

/**
 * Permanent failures must not be dressed as transient ones.
 *
 * `resource_missing` and `invalid_request_error` never come good by waiting, and
 * telling somebody to retry a permanent error is a button they press forever
 * while nothing happens. Same split as the cancellation path.
 */
function describeStripeFailure(error: unknown, subscriptionId: string, verb: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  const type = (error as { type?: unknown } | null)?.type;
  const permanent = code === 'resource_missing' || type === 'invalid_request_error';
  console.error(
    `changeBasePlan ${verb} failed (${permanent ? 'PERMANENT' : 'transient'}) for ${subscriptionId}:`,
    error instanceof Error ? error.message : error,
  );
  if (code === 'card_declined') {
    return 'Your card was declined for the amount due on the upgrade, so the plan has not changed. Update your payment method and try again.';
  }
  if (permanent) {
    return 'We could not find that subscription at Stripe, so nothing was changed. Please contact support — retrying will not help.';
  }
  return `Stripe could not ${verb} that subscription just now. Try again in a moment.`;
}

export type PlanChangeOption = Readonly<{
  planCode: BillingPlanId;
  billingInterval: 'none' | BillingCycle;
  label: string;
  effect: 'immediate' | 'at_renewal';
  priceLabel: string;
}>;

/**
 * Every move this workspace could make, labelled with when it would take effect.
 *
 * The labels come from `decidePlanTransition` rather than from a rule restated
 * in the component, because the interesting case is not obvious: Growth ->
 * Scale is immediate on the same cycle and AT RENEWAL if it also switches
 * monthly to annual. A UI that guessed "upgrades are immediate" would tell the
 * customer the wrong thing for exactly the move most likely to be made.
 */
export function planChangeOptions(
  subscription: ChangeableSubscription,
  nowMs: number = Date.now(),
): readonly PlanChangeOption[] {
  const period = allowancePeriod(subscription, nowMs);
  const current = selectionOf(subscription);
  const options: PlanChangeOption[] = [];

  for (const planCode of BILLING_PLAN_IDS) {
    const intervals: Array<'none' | BillingCycle> = planCode === 'flex' ? ['none'] : ['monthly', 'annual'];
    for (const billingInterval of intervals) {
      if (planCode === current.planCode && billingInterval === current.billingInterval) continue;
      let decision: PlanTransitionDecision;
      try {
        decision = decidePlanTransition(current, { planCode, billingInterval }, period);
      } catch {
        // An incoherent or unpriceable move is simply not offered. Throwing here
        // would take the whole settings page down over one unavailable option.
        continue;
      }
      if (decision.kind === 'no_change') continue;
      const plan = BILLING_PLANS[planCode];
      const cents = billingInterval === 'annual' ? plan.annualPriceCents : plan.monthlyPriceCents;
      options.push(Object.freeze({
        planCode,
        billingInterval,
        label: billingInterval === 'none' ? plan.name : `${plan.name}, ${billingInterval}`,
        effect: decision.kind === 'activate_after_payment' ? 'immediate' : 'at_renewal',
        priceLabel: cents === 0
          ? '$0/month'
          : `${formatUsdFromCents(cents)}/${billingInterval === 'annual' ? 'year' : 'month'}`,
      }));
    }
  }
  return Object.freeze(options);
}
