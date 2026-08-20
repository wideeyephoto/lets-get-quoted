import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { recordAccountEvent } from '@/lib/account-events';
import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import { buildPlanChangeIdempotencyKey } from '@/lib/billing/plan-change';
import { SUBSCRIPTION_CHECKOUT_METADATA_KEYS } from '@/lib/billing/stripe-billing-subscription-checkout';
import { loadVerifiedStripePlanPrices } from '@/lib/billing/stripe-plan-prices';
import { getStripeClient } from '@/lib/stripe';

/**
 * Applies plan changes that were scheduled for renewal.
 *
 * `schedule_at_renewal` writes `pending_plan_code` and a `pending_effective_at`
 * and makes no Stripe call, because sending the price change at request time
 * would take effect immediately. This worker is the half that makes the schedule
 * real. Without it a scheduled downgrade is a row nobody acts on -- the customer
 * is told their plan changes on a date and it never does.
 *
 * It carries the SAME metadata rule as the interactive path, and for the same
 * reason: the projector derives its contract from subscription metadata, so a
 * price changed without `lgq_plan_code` moving with it dead-letters every
 * subsequent event as `provider_price_contract_mismatch`, terminally.
 */

export const PLAN_CHANGE_APPLY_BATCH_SIZE = 10;

export type PlanChangeApplySummary = Readonly<{
  selected: number;
  applied: number;
  failures: number;
  skipped_no_item: number;
  skipped_unpriceable: number;
}>;

type DueRow = Readonly<{
  account_id: string;
  provider_subscription_id: string;
  provider_subscription_item_id: string | null;
  plan_code: string;
  pending_plan_code: string;
  pending_billing_interval: string;
  updated_at: string | null;
}>;

/**
 * Due rows only. `pending_effective_at <= now()` is the whole selector: the RPC
 * that writes it refuses a past date, so anything due here became due by the
 * clock rather than by being backdated.
 */
async function loadDue(admin: SupabaseClient, limit: number): Promise<DueRow[]> {
  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('account_id, provider_subscription_id, provider_subscription_item_id, plan_code, pending_plan_code, pending_billing_interval, updated_at')
    .not('pending_plan_code', 'is', null)
    .lte('pending_effective_at', new Date().toISOString())
    .in('status', ['trialing', 'active', 'past_due'])
    .order('pending_effective_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Unable to read due plan changes: ${error.message}`);
  return (data ?? []) as unknown as DueRow[];
}

export async function applyDuePlanChanges(input: {
  admin: SupabaseClient;
  limit?: number;
}): Promise<PlanChangeApplySummary> {
  const rows = await loadDue(input.admin, input.limit ?? PLAN_CHANGE_APPLY_BATCH_SIZE);
  let applied = 0;
  let failures = 0;
  let skippedNoItem = 0;
  let skippedUnpriceable = 0;

  // Loaded once for the batch rather than per row: it re-retrieves every Price
  // from Stripe and the contract is identical for all of them.
  const prices = rows.length > 0 ? await loadVerifiedStripePlanPrices() : null;

  for (const row of rows) {
    if (!row.provider_subscription_item_id) {
      // Cannot point a line item at a new Price without its id, and taking
      // items[0] would be wrong for any subscription that ever gains a second.
      skippedNoItem += 1;
      continue;
    }
    const key = `${row.pending_plan_code}_${row.pending_billing_interval}`;
    const verified = prices ? (prices as Record<string, { priceId: string; planCode: string; billingInterval: string; catalogVersion: string } | undefined>)[key] : undefined;
    if (!verified) {
      // The scheduled plan is no longer sellable, or the Price failed its
      // contract check. Leaving the row pending is correct: a later pass can
      // succeed once the binding is fixed, and applying a wrong Price would
      // charge the customer for something we could not verify.
      skippedUnpriceable += 1;
      continue;
    }

    const metadata = {
      [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.planCode]: verified.planCode,
      [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.billingInterval]: verified.billingInterval,
      [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.catalogVersion]: PRICING_CATALOG_VERSION,
    };

    try {
      const stripe = getStripeClient();
      await stripe.subscriptions.update(
        row.provider_subscription_id,
        {
          items: [{ id: row.provider_subscription_item_id, price: verified.priceId }],
          // The customer already served the term they paid for, so there is
          // nothing to prorate -- this takes effect at the boundary and the next
          // invoice is simply the new price.
          proration_behavior: 'none',
          metadata,
        },
        {
          idempotencyKey: buildPlanChangeIdempotencyKey({
            workspaceId: row.account_id,
            providerSubscriptionId: row.provider_subscription_id,
            targetPlanCode: verified.planCode,
            targetBillingInterval: verified.billingInterval,
            stateToken: row.updated_at,
          }),
        },
      );

      // Cleared only AFTER Stripe accepted. Clearing first would lose the intent
      // if the call failed, and the customer would silently stay where they are.
      const { error } = await input.admin.rpc('set_billing_subscription_pending_plan', {
        p_account_id: row.account_id,
        p_provider_subscription_id: row.provider_subscription_id,
        p_pending_plan_code: null,
        p_pending_billing_interval: null,
        p_pending_effective_at: null,
      });
      if (error) throw new Error(`pending clear failed: ${error.message}`);

      await recordAccountEvent({
        accountId: row.account_id,
        kind: 'plan_change_applied',
        summary: `Applied the scheduled change from ${row.plan_code} to ${verified.planCode} (${verified.billingInterval})`,
        meta: {
          from_plan_code: row.plan_code,
          to_plan_code: verified.planCode,
          billing_interval: verified.billingInterval,
          provider_subscription_id: row.provider_subscription_id,
        },
      });
      applied += 1;
    } catch (error) {
      // Left pending on purpose so the next pass retries. A scheduled change is
      // idempotent by construction: the same target produces the same request.
      console.error(
        `applyDuePlanChanges failed for ${row.provider_subscription_id}:`,
        error instanceof Error ? error.message : error,
      );
      failures += 1;
    }
  }

  return Object.freeze({
    selected: rows.length,
    applied,
    failures,
    skipped_no_item: skippedNoItem,
    skipped_unpriceable: skippedUnpriceable,
  });
}
