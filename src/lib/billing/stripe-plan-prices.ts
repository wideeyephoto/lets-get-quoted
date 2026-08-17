import 'server-only';

import type Stripe from 'stripe';

import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  basePriceCents,
  type BillingCycle,
  type BillingPlanId,
} from '@/lib/billing/catalog';
import { getStripeClient } from '@/lib/stripe';

/**
 * Dark, read-only binding between LGQ's catalog and Stripe Billing Prices.
 *
 * This module does not create Prices, subscriptions, Checkout Sessions, or
 * mutate Stripe in any way. A future subscription flow may use a returned
 * snapshot only after every configured Price has passed this contract.
 */

export type PaidCatalogPlanId = Exclude<BillingPlanId, 'flex'>;
export type StripePlanPriceBindingKey = `${PaidCatalogPlanId}_${BillingCycle}`;

export const STRIPE_PLAN_PRICE_BINDINGS = Object.freeze([
  Object.freeze({
    key: 'solo_monthly',
    planCode: 'solo',
    billingInterval: 'monthly',
    envKey: 'STRIPE_PRICE_SOLO_MONTHLY',
  }),
  Object.freeze({
    key: 'solo_annual',
    planCode: 'solo',
    billingInterval: 'annual',
    envKey: 'STRIPE_PRICE_SOLO_ANNUAL',
  }),
  Object.freeze({
    key: 'growth_monthly',
    planCode: 'growth',
    billingInterval: 'monthly',
    envKey: 'STRIPE_PRICE_GROWTH_MONTHLY',
  }),
  Object.freeze({
    key: 'growth_annual',
    planCode: 'growth',
    billingInterval: 'annual',
    envKey: 'STRIPE_PRICE_GROWTH_ANNUAL',
  }),
  Object.freeze({
    key: 'scale_monthly',
    planCode: 'scale',
    billingInterval: 'monthly',
    envKey: 'STRIPE_PRICE_SCALE_MONTHLY',
  }),
  Object.freeze({
    key: 'scale_annual',
    planCode: 'scale',
    billingInterval: 'annual',
    envKey: 'STRIPE_PRICE_SCALE_ANNUAL',
  }),
] as const satisfies readonly Readonly<{
  key: StripePlanPriceBindingKey;
  planCode: PaidCatalogPlanId;
  billingInterval: BillingCycle;
  envKey: string;
}>[]);

export type StripePlanPriceEnvKey = typeof STRIPE_PLAN_PRICE_BINDINGS[number]['envKey'];

export const STRIPE_PLAN_PRICE_METADATA_KEYS = Object.freeze({
  purpose: 'lgq_price_purpose',
  planCode: 'lgq_plan_code',
  billingInterval: 'lgq_billing_interval',
  catalogVersion: 'lgq_catalog_version',
} as const);

const PRICE_ID_PATTERN = /^price_[A-Za-z0-9]{8,}$/;
const PRODUCT_ID_PATTERN = /^prod_[A-Za-z0-9]{8,}$/;
const STRIPE_SECRET_KEY_PATTERN = /^(?:sk|rk)_(test|live)_\S{8,}$/;
const EXPECTED_MODE_ENV_KEY = 'LGQ_STRIPE_BILLING_LIVEMODE' as const;
const PRICE_PURPOSE = 'base_plan' as const;

export type StripePlanPriceBindingErrorCode =
  | 'configuration_invalid'
  | 'credential_mode_invalid'
  | 'credential_mode_mismatch'
  | 'price_retrieve_failed'
  | 'price_contract_mismatch';

/** Fixed-message error that never retains Stripe responses, keys, IDs, or causes. */
export class StripePlanPriceBindingError extends Error {
  override readonly name = 'StripePlanPriceBindingError';

  constructor(
    readonly code: StripePlanPriceBindingErrorCode,
    readonly bindingKey: StripePlanPriceBindingKey | null = null,
  ) {
    super('Stripe Billing price binding verification failed.');
  }
}

export type StripePlanPriceContractMetadata = Readonly<{
  lgq_price_purpose: typeof PRICE_PURPOSE;
  lgq_plan_code: PaidCatalogPlanId;
  lgq_billing_interval: BillingCycle;
  lgq_catalog_version: typeof PRICING_CATALOG_VERSION;
}>;

export type StripePlanPriceSnapshot = Readonly<{
  bindingKey: StripePlanPriceBindingKey;
  priceId: string;
  productId: string;
  planCode: PaidCatalogPlanId;
  billingInterval: BillingCycle;
  catalogVersion: typeof PRICING_CATALOG_VERSION;
  livemode: boolean;
  currency: 'usd';
  unitAmountCents: number;
  recurringInterval: 'month' | 'year';
  recurringIntervalCount: 1;
  metadata: StripePlanPriceContractMetadata;
}>;

export type VerifiedStripePlanPrices = Readonly<
  Record<StripePlanPriceBindingKey, StripePlanPriceSnapshot>
>;

export type StripePlanPriceEnvironment = Readonly<Record<string, string | undefined>>;

export type StripePlanPriceDependencies = Readonly<{
  /** Must retrieve from the platform account; never pass a Stripe-Account option. */
  retrievePrice(priceId: string): Promise<unknown>;
  /** Mode of the credential/account used by retrievePrice. */
  credentialLivemode: boolean;
}>;

export type LoadVerifiedStripePlanPricesOptions = Readonly<{
  env?: StripePlanPriceEnvironment;
  /** Test seam. Production callers should omit this to bind to STRIPE_SECRET_KEY. */
  dependencies?: StripePlanPriceDependencies;
}>;

type BindingDefinition = typeof STRIPE_PLAN_PRICE_BINDINGS[number];

type BindingConfig = Readonly<{
  definition: BindingDefinition;
  priceId: string;
}>;

function fail(
  code: StripePlanPriceBindingErrorCode,
  bindingKey: StripePlanPriceBindingKey | null = null,
): never {
  throw new StripePlanPriceBindingError(code, bindingKey);
}

function expectedLivemode(env: StripePlanPriceEnvironment): boolean {
  const value = env[EXPECTED_MODE_ENV_KEY];
  if (value === '1') return true;
  if (value === '0') return false;
  return fail('configuration_invalid');
}

function credentialLivemodeFromSecret(secretKey: string | undefined): boolean {
  if (typeof secretKey !== 'string') return fail('credential_mode_invalid');
  const match = STRIPE_SECRET_KEY_PATTERN.exec(secretKey);
  if (!match) return fail('credential_mode_invalid');
  return match[1] === 'live';
}

function readBindingConfig(env: StripePlanPriceEnvironment): readonly BindingConfig[] {
  const seen = new Set<string>();
  return Object.freeze(STRIPE_PLAN_PRICE_BINDINGS.map((definition) => {
    const value = env[definition.envKey];
    if (typeof value !== 'string' || !PRICE_ID_PATTERN.test(value)) {
      return fail('configuration_invalid', definition.key);
    }
    if (seen.has(value)) return fail('configuration_invalid', definition.key);
    seen.add(value);
    return Object.freeze({ definition, priceId: value });
  }));
}

function defaultDependencies(env: StripePlanPriceEnvironment): StripePlanPriceDependencies {
  // A caller-supplied env object is a test seam only; pairing it with the
  // process-global cached Stripe client could verify one key's mode while
  // retrieving with another key.
  if (env !== process.env) return fail('configuration_invalid');
  const credentialLivemode = credentialLivemodeFromSecret(env.STRIPE_SECRET_KEY);
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return fail('credential_mode_invalid');
  }
  return Object.freeze({
    credentialLivemode,
    retrievePrice: (priceId: string) => stripe.prices.retrieve(priceId, {
      expand: ['currency_options'],
    }),
  });
}

function expectedMetadata(definition: BindingDefinition): StripePlanPriceContractMetadata {
  return Object.freeze({
    lgq_price_purpose: PRICE_PURPOSE,
    lgq_plan_code: definition.planCode,
    lgq_billing_interval: definition.billingInterval,
    lgq_catalog_version: PRICING_CATALOG_VERSION,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function metadataMatches(value: unknown, expected: StripePlanPriceContractMetadata): boolean {
  const metadata = record(value);
  if (!metadata) return false;
  return Object.entries(expected).every(([key, expectedValue]) => metadata[key] === expectedValue);
}

function hasNoAlternateCurrencyOptions(price: Record<string, unknown>): boolean {
  // Stripe omits currency_options unless explicitly expanded, so an absent
  // dictionary is still unproven. Once expanded, Stripe always echoes the
  // price's own currency, so the contract is "no currency other than the base",
  // not "empty" — requiring empty is unsatisfiable and fails every real Price.
  // The base entry must also restate the exact verified amount and tax
  // behavior, so Checkout cannot localize this binding to an unverified amount.
  if (!Object.prototype.hasOwnProperty.call(price, 'currency_options')) return false;
  const currencyOptions = record(price.currency_options);
  if (currencyOptions === null) return false;
  const baseCurrency = typeof price.currency === 'string' ? price.currency : null;
  if (!baseCurrency) return false;

  return Object.entries(currencyOptions).every(([code, rawOption]) => {
    if (code !== baseCurrency) return false;
    const option = record(rawOption);
    if (!option) return false;
    return option.unit_amount === price.unit_amount
      && option.tax_behavior === price.tax_behavior
      && option.custom_unit_amount == null
      && option.tiers == null;
  });
}

function validatePrice(
  rawPrice: unknown,
  config: BindingConfig,
  livemode: boolean,
): StripePlanPriceSnapshot {
  const price = record(rawPrice);
  const { definition, priceId } = config;
  const expectedInterval = definition.billingInterval === 'monthly' ? 'month' : 'year';
  const expectedAmount = basePriceCents(
    BILLING_PLANS[definition.planCode],
    definition.billingInterval,
  );
  const metadata = expectedMetadata(definition);
  const recurring = record(price?.recurring);
  const productId = typeof price?.product === 'string' ? price.product : null;

  if (!productId || !PRODUCT_ID_PATTERN.test(productId)) {
    return fail('price_contract_mismatch', definition.key);
  }

  if (
    !price
    || price.object !== 'price'
    || price.id !== priceId
    || price.active !== true
    || price.livemode !== livemode
    || price.currency !== 'usd'
    || !hasNoAlternateCurrencyOptions(price)
    || price.type !== 'recurring'
    || price.billing_scheme !== 'per_unit'
    || price.unit_amount !== expectedAmount
    || price.tax_behavior !== 'exclusive'
    || price.custom_unit_amount != null
    || price.tiers_mode != null
    || price.transform_quantity != null
    || !recurring
    || recurring.interval !== expectedInterval
    || recurring.interval_count !== 1
    || recurring.usage_type !== 'licensed'
    || recurring.meter != null
    || recurring.trial_period_days != null
    || !metadataMatches(price.metadata, metadata)
  ) {
    return fail('price_contract_mismatch', definition.key);
  }

  return Object.freeze({
    bindingKey: definition.key,
    priceId,
    productId,
    planCode: definition.planCode,
    billingInterval: definition.billingInterval,
    catalogVersion: PRICING_CATALOG_VERSION,
    livemode,
    currency: 'usd',
    unitAmountCents: expectedAmount,
    recurringInterval: expectedInterval,
    recurringIntervalCount: 1,
    metadata,
  });
}

/**
 * Retrieves and verifies all six paid-plan Prices as one fail-closed unit.
 * No partial result is returned if any binding is missing or mismatched.
 */
export async function loadVerifiedStripePlanPrices(
  options: LoadVerifiedStripePlanPricesOptions = {},
): Promise<VerifiedStripePlanPrices> {
  const env = options.env ?? process.env;
  const livemode = expectedLivemode(env);
  const configs = readBindingConfig(env);
  const dependencies = options.dependencies ?? defaultDependencies(env);
  if (
    typeof dependencies.credentialLivemode !== 'boolean'
    || typeof dependencies.retrievePrice !== 'function'
  ) {
    return fail('credential_mode_invalid');
  }
  if (dependencies.credentialLivemode !== livemode) {
    return fail('credential_mode_mismatch');
  }

  const snapshots = await Promise.all(configs.map(async (config) => {
    let price: unknown;
    try {
      price = await dependencies.retrievePrice(config.priceId);
    } catch {
      return fail('price_retrieve_failed', config.definition.key);
    }
    return validatePrice(price, config, livemode);
  }));

  return Object.freeze(Object.fromEntries(
    snapshots.map((snapshot) => [snapshot.bindingKey, snapshot]),
  )) as VerifiedStripePlanPrices;
}
