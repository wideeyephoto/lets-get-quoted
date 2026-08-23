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
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** The projector's last write. See the idempotency note below. */
  updatedAt: string | null;
}>;

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
    .select('provider_subscription_id, plan_code, status, cancel_at_period_end, current_period_end, updated_at')
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
    updatedAt: data.updated_at ? String(data.updated_at) : null,
  });
}

export type CancellationResult =
  | { ok: true; alreadyScheduled: boolean; currentPeriodEnd: string | null }
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
  // THE GATE BELONGS HERE, NOT ONLY ON THE ACTION THAT RENDERS THE BUTTON.
  //
  // It used to live solely in `cancelBasePlanSubscriptionAction`, which made it
  // a gate on ONE ROUTE rather than on the operation. `changeBasePlan` reaches
  // this function directly when a customer picks Flex -- downgrading to Flex IS
  // cancelling -- and that action checks no flag at all, so the switch named
  // "cancellation enabled" did not decide whether a subscription could be
  // cancelled. It decided which of two buttons was visible.
  //
  // Checked BEFORE the read, so a refusal costs no query and, more importantly,
  // writes no `subscription_cancellation_requested` event for something that
  // will not happen.
  if (!basePlanSubscriptionCancellationEnabled()) {
    return { ok: false, error: CANCELLATION_DISABLED_MESSAGE };
  }

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
          stateToken: subscription.updatedAt,
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
}): Promise<{ canceled: boolean; subscriptionId: string | null; error: string | null }> {
  let subscription: CancellableSubscription | null = null;
  if (input.preloaded !== undefined) {
    subscription = input.preloaded;
  } else {
    try {
      subscription = await loadCancellableSubscription(input.admin, input.accountId);
    } catch (error) {
      return { canceled: false, subscriptionId: null, error: error instanceof Error ? error.message : 'read failed' };
    }
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
