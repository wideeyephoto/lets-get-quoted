import 'server-only';

import { createAdminClient } from '@/lib/auth';
import { assertConfiguredStripeBillingMode } from '@/lib/billing/stripe-billing-subscription-checkout';
import {
  isCapacityReconcileOutcome,
  mapProviderSubscriptionStatus,
  periodEndIso,
  type CapacityReconcileOutcome,
} from '@/lib/billing/capacity-lifecycle';
import { getStripeClient } from '@/lib/stripe';

/**
 * DARK server-only worker: bring purchased capacity back in line with Stripe.
 *
 * A SWEEP, NOT A WEBHOOK, and the reason is ordering. active <-> past_due is
 * legal in both directions, the ledger carries no provider sequence column, and
 * Stripe redelivers and reorders — so a late past_due arriving after a recovery
 * would silently downgrade a healthy row and nothing would object. A sweep asks
 * for the CURRENT state, so the last writer is always the freshest read and the
 * question never arises. The cost is that a cancellation is honoured within one
 * sweep rather than instantly.
 *
 * ONE STRIPE READ PER ROW, bounded by the batch size, and canceled rows are
 * excluded by the work-list function because they are terminal — re-reading them
 * for ever would be provider egress that can never change an answer.
 */

export const CAPACITY_LIFECYCLE_BATCH_SIZE = 100;

export type CapacityLifecycleSweepResult =
  | Readonly<{
    status: 'completed';
    examined: number;
    canceled: number;
    changed: number;
    unchanged: number;
    /** A status Stripe reports that this app does not map. Never guessed at. */
    unmapped: number;
    /** The subscription is gone from Stripe entirely. */
    missing: number;
    providerErrors: number;
  }>
  | Readonly<{ status: 'failed' }>;

type PendingRow = {
  stripe_subscription_id: unknown;
  account_id: unknown;
  status: unknown;
};

function pendingSubscriptionId(row: PendingRow): string | null {
  const value = row.stripe_subscription_id;
  return typeof value === 'string' && /^sub_[A-Za-z0-9]{8,}$/.test(value) ? value : null;
}

/**
 * The configured mode, read the same way every other billing path reads it.
 * A sweep that guessed its own mode could read live subscriptions with a test
 * key, find nothing, and cancel every row it was asked about.
 */
function configuredLivemode(): boolean {
  const configured = process.env.LGQ_STRIPE_BILLING_LIVEMODE;
  if (configured !== '0' && configured !== '1') {
    throw new Error('LGQ_STRIPE_BILLING_LIVEMODE must be exactly 0 or 1.');
  }
  return configured === '1';
}

export async function runPurchasedCapacityLifecycleSweep(
  batchSize = CAPACITY_LIFECYCLE_BATCH_SIZE,
): Promise<CapacityLifecycleSweepResult> {
  let examined = 0;
  let canceled = 0;
  let changed = 0;
  let unchanged = 0;
  let unmapped = 0;
  let missing = 0;
  let providerErrors = 0;

  try {
    const livemode = configuredLivemode();
    // Throws unless the environment, the credential and the requested mode all
    // agree. Checked once, before any row is read, rather than per row.
    assertConfiguredStripeBillingMode(livemode);

    const admin = createAdminClient();
    const stripe = getStripeClient();

    const { data, error } = await admin.rpc('purchased_capacity_pending_reconciliation', {
      p_livemode: livemode,
      p_limit: batchSize,
    });
    if (error) {
      console.error('capacity lifecycle sweep could not read its work list:', error);
      return { status: 'failed' };
    }

    for (const row of (Array.isArray(data) ? data : []) as PendingRow[]) {
      const subscriptionId = pendingSubscriptionId(row);
      if (!subscriptionId) continue;
      examined += 1;

      let providerStatus: unknown;
      let providerPeriodEnd: unknown;
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription.livemode !== livemode) {
          // A row read in the wrong mode must never be acted on.
          providerErrors += 1;
          continue;
        }
        providerStatus = subscription.status;
        providerPeriodEnd = (subscription as { current_period_end?: unknown }).current_period_end;
      } catch (err) {
        // A subscription Stripe no longer has is NOT treated as a cancellation.
        // `canceled` is terminal and irreversible here, and a 404 from a
        // transient provider fault would destroy entitlement no later sweep
        // could restore. Counted and left alone.
        const code = (err as { code?: unknown })?.code;
        if (code === 'resource_missing') missing += 1;
        else providerErrors += 1;
        continue;
      }

      const mapped = mapProviderSubscriptionStatus(providerStatus);
      if (!mapped) {
        // A status Stripe added that this app has never seen. Surfaced as a
        // number rather than guessed into the nearest bucket.
        unmapped += 1;
        continue;
      }

      const { data: applied, error: applyError } = await admin.rpc(
        'apply_purchased_capacity_provider_state',
        {
          p_livemode: livemode,
          p_stripe_subscription_id: subscriptionId,
          p_status: mapped,
          p_current_period_end: periodEndIso(providerPeriodEnd),
        },
      );
      if (applyError) {
        console.error('capacity lifecycle sweep could not apply a status:', applyError);
        providerErrors += 1;
        continue;
      }

      const outcome: CapacityReconcileOutcome | null = isCapacityReconcileOutcome(applied)
        ? applied
        : null;
      if (outcome === 'canceled') canceled += 1;
      else if (outcome === 'active' || outcome === 'past_due') changed += 1;
      else unchanged += 1;
    }

    return {
      status: 'completed',
      examined,
      canceled,
      changed,
      unchanged,
      unmapped,
      missing,
      providerErrors,
    };
  } catch (err) {
    console.error('capacity lifecycle sweep threw:', err);
    return { status: 'failed' };
  }
}
