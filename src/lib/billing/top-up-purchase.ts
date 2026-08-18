import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PRICING_CATALOG_VERSION,
  TOP_UPS,
  TOP_UPS_WITHHELD,
  type BillingPlanId,
  type TopUpDefinition,
  type TopUpId,
} from '@/lib/billing/catalog';

/**
 * Buying a top-up.
 *
 * The eight SKUs have had settled prices and a published appendix entry for
 * days, and TOP_UPS had no consumer at all — a price list nobody read. The
 * fulfillment half was already built and in use (usage_credit_lots, its balance
 * view, and reservations, with source_type separating the promotional,
 * monthly-plan and purchased wallets). This is the middle: resolve a SKU to its
 * Stripe Price, build a Session, and turn a paid Session into a credit lot.
 *
 * Dark until LGQ_TOP_UP_PURCHASE_ENABLED is exactly '1'.
 *
 * Two decisions worth stating because they are not obvious from the code:
 *
 * Prices resolve by METADATA, not by an env binding. The six plan Prices bind
 * through six environment variables where one stale value fails the whole load —
 * which is exactly what bumping the catalog version forced us to redo in both
 * modes. Searching on lgq_top_up_id plus lgq_catalog_version leaves nothing to
 * drift, and adding a SKU needs no deploy.
 *
 * A purchased lot NEVER expires. That is the appendix rule and the database
 * already enforces it: usage_credit_lots carries
 * CHECK (source_type <> 'purchase' OR expires_at IS NULL). We pass null rather
 * than relying on a default, so the intent is visible at the call site.
 */

export const TOP_UP_PURCHASE_FLAG = 'LGQ_TOP_UP_PURCHASE_ENABLED' as const;

/** The wallet a bought lot lands in. Separate from flex_starter and plan_period. */
export const PURCHASED_LOT_SOURCE_TYPE = 'purchase' as const;

type PurchaseEnvironment = Readonly<Record<string, string | undefined>>;

export function topUpPurchaseEnabled(env: PurchaseEnvironment = process.env): boolean {
  return env[TOP_UP_PURCHASE_FLAG] === '1';
}

export type TopUpPurchaseErrorCode =
  | 'disabled'
  | 'unknown_sku'
  | 'sku_withheld'
  | 'plan_ineligible'
  | 'price_not_found'
  | 'price_ambiguous'
  | 'price_contract_mismatch';

/** Fixed-message error that never carries a Stripe response, key, or id. */
export class TopUpPurchaseError extends Error {
  override readonly name = 'TopUpPurchaseError';

  constructor(readonly code: TopUpPurchaseErrorCode, readonly topUpId: TopUpId | null = null) {
    super('Top-up purchase is unavailable.');
  }
}

function fail(code: TopUpPurchaseErrorCode, topUpId: TopUpId | null = null): never {
  throw new TopUpPurchaseError(code, topUpId);
}

/**
 * A SKU the caller may actually buy on this plan.
 *
 * Eligibility is checked here rather than in the UI because the UI is a hint and
 * this is the boundary. flex_text_250 is the case that matters: it is a cheaper
 * per-credit rate offered only to Flex, so a paid plan buying it would be an
 * unpriced discount.
 */
export function requireSellableTopUp(topUpId: string, planCode: BillingPlanId): TopUpDefinition {
  const sku = (TOP_UPS as Record<string, TopUpDefinition | undefined>)[topUpId];
  if (!sku) fail('unknown_sku');
  if (topUpId in TOP_UPS_WITHHELD) fail('sku_withheld', sku.id);
  if (!sku.eligiblePlans.includes(planCode)) fail('plan_ineligible', sku.id);
  return sku;
}

export type ResolvedTopUpPrice = Readonly<{
  priceId: string;
  productId: string;
  unitAmountCents: number;
  recurring: boolean;
}>;

type PriceSearcher = (query: string) => Promise<{ data: Stripe.Price[] }>;

/**
 * Find the Price for a SKU at the current catalog version and prove it matches
 * the catalog before it can be charged.
 *
 * The contract check is not ceremony. A Price is customer-visible money that
 * lives outside this repository, so nothing stops someone editing an amount in
 * the dashboard. Charging an amount the catalog does not publish is the failure
 * this prevents.
 */
export async function resolveTopUpPrice(
  search: PriceSearcher,
  sku: TopUpDefinition,
  catalogVersion: string = PRICING_CATALOG_VERSION,
): Promise<ResolvedTopUpPrice> {
  const { data } = await search(
    `active:'true' AND metadata['lgq_top_up_id']:'${sku.id}'`
    + ` AND metadata['lgq_catalog_version']:'${catalogVersion}'`,
  );

  if (data.length === 0) fail('price_not_found', sku.id);
  // Two active Prices for one SKU at one catalog version is unresolvable: picking
  // either would be picking a price for the customer at random.
  if (data.length > 1) fail('price_ambiguous', sku.id);

  const price = data[0];
  const productId = typeof price.product === 'string' ? price.product : price.product?.id;
  const ok = price.active === true
    && price.currency === 'usd'
    && price.unit_amount === sku.priceCents
    && price.tax_behavior === 'exclusive'
    && Boolean(price.recurring) === sku.recurring
    && (!sku.recurring || (price.recurring?.interval === 'month' && price.recurring?.interval_count === 1))
    && price.recurring?.trial_period_days == null
    && price.metadata?.lgq_price_purpose === 'top_up'
    && price.metadata?.lgq_resource_code === sku.resourceCode
    && price.metadata?.lgq_units === String(sku.units)
    && Boolean(productId);

  if (!ok) fail('price_contract_mismatch', sku.id);

  return Object.freeze({
    priceId: price.id,
    productId: productId as string,
    unitAmountCents: price.unit_amount as number,
    recurring: sku.recurring,
  });
}

export type TopUpCheckoutRequest = Readonly<{
  accountId: string;
  sku: TopUpDefinition;
  price: ResolvedTopUpPrice;
  successUrl: string;
  cancelUrl: string;
  catalogVersion?: string;
}>;

/**
 * Session parameters for one top-up purchase.
 *
 * Storage is the only recurring SKU among those sellable today, so mode is
 * derived from the SKU rather than assumed. Getting that backwards would bill a
 * one-time credit pack every month forever, which a test pins.
 */
export function buildTopUpCheckoutParams(
  request: TopUpCheckoutRequest,
): Stripe.Checkout.SessionCreateParams {
  const { accountId, sku, price, successUrl, cancelUrl } = request;
  const catalogVersion = request.catalogVersion ?? PRICING_CATALOG_VERSION;

  // Carried on the Session AND the resulting object, because fulfillment reads
  // it back from whichever Stripe hands us and must never infer the workspace.
  const metadata = {
    lgq_purpose: 'top_up',
    lgq_top_up_id: sku.id,
    lgq_account_id: accountId,
    lgq_resource_code: sku.resourceCode,
    lgq_units: String(sku.units),
    lgq_catalog_version: catalogVersion,
  } as const;

  return {
    mode: sku.recurring ? 'subscription' : 'payment',
    line_items: [{ price: price.priceId, quantity: 1 }],
    metadata,
    ...(sku.recurring
      ? { subscription_data: { metadata } }
      : { payment_intent_data: { metadata } }),
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

export type TopUpFulfillment = Readonly<{
  accountId: string;
  resourceCode: string;
  units: number;
  idempotencyKey: string;
  catalogVersion: string;
  billingEventId?: string | null;
  metadata?: Record<string, unknown>;
}>;

/**
 * Read a fulfillment instruction out of a paid Stripe object.
 *
 * Everything comes from the metadata we wrote at Session creation. Nothing is
 * inferred from amounts or line items, because an amount is not an identity and
 * a workspace must never be guessed from one.
 */
export function fulfillmentFromMetadata(
  metadata: Record<string, string | undefined> | null | undefined,
  idempotencyKey: string,
  billingEventId: string | null = null,
): TopUpFulfillment | null {
  if (!metadata || metadata.lgq_purpose !== 'top_up') return null;

  const topUpId = metadata.lgq_top_up_id as TopUpId | undefined;
  const accountId = metadata.lgq_account_id;
  const catalogVersion = metadata.lgq_catalog_version;
  const sku = topUpId ? TOP_UPS[topUpId] : undefined;
  if (!sku || !accountId || !catalogVersion) return null;

  // Trust the catalog for units, not the metadata copy. The metadata proves WHICH
  // SKU was bought; how much that SKU grants is the catalog's answer, and it is
  // the one place a customer-visible quantity is allowed to come from.
  return Object.freeze({
    accountId,
    resourceCode: sku.resourceCode,
    units: sku.units,
    idempotencyKey,
    catalogVersion,
    billingEventId,
    metadata: { lgq_top_up_id: sku.id },
  });
}

/**
 * Write the purchased lot.
 *
 * grant_usage_credits already owns the hard parts — positive units, resource
 * code shape, an advisory lock per workspace and resource, and idempotency on
 * the key — so this passes through rather than reimplementing any of it.
 */
export async function grantPurchasedTopUpCredits(
  admin: SupabaseClient,
  fulfillment: TopUpFulfillment,
): Promise<string> {
  const { data, error } = await admin.rpc('grant_usage_credits', {
    p_account_id: fulfillment.accountId,
    p_resource_code: fulfillment.resourceCode,
    p_units: fulfillment.units,
    p_source_type: PURCHASED_LOT_SOURCE_TYPE,
    p_idempotency_key: fulfillment.idempotencyKey,
    p_catalog_version: fulfillment.catalogVersion,
    p_billing_event_id: fulfillment.billingEventId ?? null,
    p_available_from: null,
    // Purchased credits never expire. The database enforces this too; passing it
    // explicitly keeps the rule readable where the decision is made.
    p_expires_at: null,
    p_metadata: fulfillment.metadata ?? {},
  });

  if (error) throw new Error(`Top-up credit grant failed: ${error.code ?? 'unknown'}`);
  return data as string;
}
