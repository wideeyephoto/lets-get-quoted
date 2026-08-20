import 'server-only';

import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

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

type ServerEnvironment = Record<string, string | undefined>;

export function basePlanSubscriptionCancellationEnabled(
  env: ServerEnvironment = process.env,
): boolean {
  return env[BASE_PLAN_SUBSCRIPTION_CANCELLATION_FLAG] === '1';
}

/** Statuses where there is still something for a customer to cancel. */
const CANCELLABLE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

export type CancellableSubscription = Readonly<{
  providerSubscriptionId: string;
  planCode: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}>;

export function buildSubscriptionCancellationIdempotencyKey(input: {
  workspaceId: string;
  providerSubscriptionId: string;
  mode: 'at_period_end' | 'immediate';
}): string {
  const workspaceId = String(input.workspaceId ?? '').trim();
  const subscriptionId = String(input.providerSubscriptionId ?? '').trim();
  if (!workspaceId || !subscriptionId) {
    throw new Error('A workspace and a provider subscription id are required to cancel.');
  }
  const digest = createHash('sha256')
    .update(['base_plan_subscription', workspaceId, subscriptionId, input.mode].join('\0'))
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
    .select('provider_subscription_id, plan_code, status, cancel_at_period_end, current_period_end')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to read this workspace's subscription: ${error.message}`);
  if (!data?.provider_subscription_id) return null;
  if (!CANCELLABLE_STATUSES.has(String(data.status))) return null;

  return Object.freeze({
    providerSubscriptionId: String(data.provider_subscription_id),
    planCode: String(data.plan_code),
    status: String(data.status),
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
    currentPeriodEnd: data.current_period_end ? String(data.current_period_end) : null,
  });
}

export type CancellationResult =
  | { ok: true; alreadyScheduled: boolean; currentPeriodEnd: string | null }
  | { ok: false; error: string };

/**
 * Schedule cancellation at the end of the paid period.
 *
 * Not an immediate cancel: they have paid through the period, and the FAQ says
 * plainly that "cancellations take effect at renewal". Taking the workspace away
 * the moment they click would contradict the page and delete access they are
 * still owed.
 */
export async function cancelBasePlanSubscriptionAtPeriodEnd(input: {
  admin: SupabaseClient;
  accountId: string;
  actorEmail?: string | null;
}): Promise<CancellationResult> {
  const subscription = await loadCancellableSubscription(input.admin, input.accountId);
  if (!subscription) {
    return { ok: false, error: 'There is no active subscription on this workspace to cancel.' };
  }
  if (subscription.cancelAtPeriodEnd) {
    // Already scheduled. Saying so beats sending a second write and beats an
    // error, because from the customer's side the thing they asked for is true.
    return { ok: true, alreadyScheduled: true, currentPeriodEnd: subscription.currentPeriodEnd };
  }

  // Written BEFORE the call: if the process dies mid-request, the record of what
  // was asked for survives, and the projector supplies what actually happened.
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
        }),
      },
    );
    // Deliberately not written back to billing_subscriptions here. The projector
    // owns that row, and a second writer racing it is how two sources of truth
    // start. customer.subscription.updated carries this same state.
    return {
      ok: true,
      alreadyScheduled: false,
      currentPeriodEnd: updated.cancel_at
        ? new Date(updated.cancel_at * 1000).toISOString()
        : subscription.currentPeriodEnd,
    };
  } catch (error) {
    console.error('cancelBasePlanSubscriptionAtPeriodEnd failed:', error instanceof Error ? error.message : error);
    return { ok: false, error: 'Stripe could not cancel that subscription just now. Try again in a moment.' };
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
}): Promise<{ canceled: boolean; subscriptionId: string | null; error: string | null }> {
  let subscription: CancellableSubscription | null = null;
  try {
    subscription = await loadCancellableSubscription(input.admin, input.accountId);
  } catch (error) {
    return { canceled: false, subscriptionId: null, error: error instanceof Error ? error.message : 'read failed' };
  }
  if (!subscription) return { canceled: false, subscriptionId: null, error: null };

  try {
    const stripe = getStripeClient();
    await stripe.subscriptions.cancel(subscription.providerSubscriptionId, {
      idempotencyKey: buildSubscriptionCancellationIdempotencyKey({
        workspaceId: input.accountId,
        providerSubscriptionId: subscription.providerSubscriptionId,
        mode: 'immediate',
      }),
    } as never);
    return { canceled: true, subscriptionId: subscription.providerSubscriptionId, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown Stripe error';
    // Loud, and with the id in it: this is the line an operator needs to find
    // the still-billing subscription whose local row no longer exists.
    console.error(
      `ACCOUNT DELETED WITH A LIVE STRIPE SUBSCRIPTION. Cancel ${subscription.providerSubscriptionId} by hand. ${message}`,
    );
    return { canceled: false, subscriptionId: subscription.providerSubscriptionId, error: message };
  }
}
