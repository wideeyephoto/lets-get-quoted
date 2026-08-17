import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  priceRetrieve: vi.fn(),
}));

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return { ...actual, getStripeClient: stripeMocks.getStripeClient };
});

import {
  STRIPE_PLAN_PRICE_BINDINGS,
  STRIPE_PLAN_PRICE_METADATA_KEYS,
  StripePlanPriceBindingError,
  loadVerifiedStripePlanPrices,
  type StripePlanPriceBindingKey,
  type StripePlanPriceDependencies,
  type StripePlanPriceEnvironment,
} from '@/lib/billing/stripe-plan-prices';
import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  basePriceCents,
} from '@/lib/billing/catalog';

const PRICE_IDS: Readonly<Record<StripePlanPriceBindingKey, string>> = Object.freeze({
  solo_monthly: 'price_soloMonthly123',
  solo_annual: 'price_soloAnnual1234',
  growth_monthly: 'price_growthMonthly1',
  growth_annual: 'price_growthAnnual12',
  scale_monthly: 'price_scaleMonthly12',
  scale_annual: 'price_scaleAnnual123',
});

function environment(livemode = false): StripePlanPriceEnvironment {
  return {
    LGQ_STRIPE_BILLING_LIVEMODE: livemode ? '1' : '0',
    STRIPE_PRICE_SOLO_MONTHLY: PRICE_IDS.solo_monthly,
    STRIPE_PRICE_SOLO_ANNUAL: PRICE_IDS.solo_annual,
    STRIPE_PRICE_GROWTH_MONTHLY: PRICE_IDS.growth_monthly,
    STRIPE_PRICE_GROWTH_ANNUAL: PRICE_IDS.growth_annual,
    STRIPE_PRICE_SCALE_MONTHLY: PRICE_IDS.scale_monthly,
    STRIPE_PRICE_SCALE_ANNUAL: PRICE_IDS.scale_annual,
  };
}

function testSecretKey(mode: 'test' | 'live'): string {
  // Assemble synthetic credentials at runtime so secret scanners do not
  // mistake test fixtures for deployable Stripe keys.
  return ['sk', mode, 'price-binding-test-fixture'].join('_');
}

function bindingForPriceId(priceId: string) {
  const binding = STRIPE_PLAN_PRICE_BINDINGS.find((candidate) => PRICE_IDS[candidate.key] === priceId);
  if (!binding) throw new Error('unknown test Price ID');
  return binding;
}

function stripePrice(
  key: StripePlanPriceBindingKey,
  overrides: Record<string, unknown> = {},
): Stripe.Price {
  const binding = STRIPE_PLAN_PRICE_BINDINGS.find((candidate) => candidate.key === key);
  if (!binding) throw new Error('unknown test binding');
  const amount = basePriceCents(BILLING_PLANS[binding.planCode], binding.billingInterval);
  const recurring = {
    interval: binding.billingInterval === 'monthly' ? 'month' : 'year',
    interval_count: 1,
    meter: null,
    trial_period_days: null,
    usage_type: 'licensed',
  };
  return {
    id: PRICE_IDS[key],
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: 1_775_000_000,
    currency: 'usd',
    // Stripe always echoes the price's own currency once currency_options is
    // expanded. A real retrieve never returns an empty dictionary here.
    currency_options: {
      usd: {
        custom_unit_amount: null,
        tax_behavior: 'exclusive',
        tiers: null,
        unit_amount: amount,
        unit_amount_decimal: String(amount),
      },
    },
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {
      [STRIPE_PLAN_PRICE_METADATA_KEYS.purpose]: 'base_plan',
      [STRIPE_PLAN_PRICE_METADATA_KEYS.planCode]: binding.planCode,
      [STRIPE_PLAN_PRICE_METADATA_KEYS.billingInterval]: binding.billingInterval,
      [STRIPE_PLAN_PRICE_METADATA_KEYS.catalogVersion]: PRICING_CATALOG_VERSION,
      private_internal_note: 'must not enter the snapshot',
    },
    nickname: 'private internal nickname',
    product: 'prod_lgqBasePlans123',
    recurring,
    tax_behavior: 'exclusive',
    tiers_mode: null,
    transform_quantity: null,
    type: 'recurring',
    unit_amount: amount,
    unit_amount_decimal: String(amount),
    ...overrides,
  } as unknown as Stripe.Price;
}

function dependencies(options: {
  livemode?: boolean;
  overrideKey?: StripePlanPriceBindingKey;
  override?: Record<string, unknown>;
  retrieveError?: unknown;
} = {}) {
  const retrievePrice = vi.fn<StripePlanPriceDependencies['retrievePrice']>(async (priceId) => {
    if (options.retrieveError) throw options.retrieveError;
    const binding = bindingForPriceId(priceId);
    const base = stripePrice(binding.key, { livemode: options.livemode ?? false });
    return binding.key === options.overrideKey
      ? { ...base, ...options.override }
      : base;
  });
  const value: StripePlanPriceDependencies = {
    credentialLivemode: options.livemode ?? false,
    retrievePrice,
  };
  return { value, retrievePrice };
}

async function captured(promise: Promise<unknown>): Promise<StripePlanPriceBindingError> {
  const error = await promise.catch((caught) => caught);
  expect(error).toBeInstanceOf(StripePlanPriceBindingError);
  return error as StripePlanPriceBindingError;
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.getStripeClient.mockReturnValue({
    prices: { retrieve: stripeMocks.priceRetrieve },
  });
  stripeMocks.priceRetrieve.mockImplementation(async (priceId: string) => {
    const binding = bindingForPriceId(priceId);
    return stripePrice(binding.key);
  });
});

describe('dark Stripe Billing Price binding adapter', () => {
  it('verifies exactly six paid-plan Prices against the canonical catalog', async () => {
    const deps = dependencies();

    const result = await loadVerifiedStripePlanPrices({
      env: environment(),
      dependencies: deps.value,
    });

    expect(Object.keys(result)).toEqual(STRIPE_PLAN_PRICE_BINDINGS.map((binding) => binding.key));
    expect(deps.retrievePrice).toHaveBeenCalledTimes(6);
    expect(deps.retrievePrice.mock.calls.map(([priceId]) => priceId)).toEqual(
      STRIPE_PLAN_PRICE_BINDINGS.map((binding) => PRICE_IDS[binding.key]),
    );
    for (const binding of STRIPE_PLAN_PRICE_BINDINGS) {
      const snapshot = result[binding.key];
      expect(snapshot).toMatchObject({
        bindingKey: binding.key,
        priceId: PRICE_IDS[binding.key],
        productId: 'prod_lgqBasePlans123',
        planCode: binding.planCode,
        billingInterval: binding.billingInterval,
        catalogVersion: PRICING_CATALOG_VERSION,
        livemode: false,
        currency: 'usd',
        unitAmountCents: basePriceCents(BILLING_PLANS[binding.planCode], binding.billingInterval),
        recurringInterval: binding.billingInterval === 'monthly' ? 'month' : 'year',
        recurringIntervalCount: 1,
      });
      expect(snapshot.metadata).toEqual({
        lgq_price_purpose: 'base_plan',
        lgq_plan_code: binding.planCode,
        lgq_billing_interval: binding.billingInterval,
        lgq_catalog_version: PRICING_CATALOG_VERSION,
      });
      expect(snapshot.metadata).not.toHaveProperty('private_internal_note');
      expect(JSON.stringify(snapshot)).not.toContain('private internal nickname');
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot.metadata)).toBe(true);
    }
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(STRIPE_PLAN_PRICE_BINDINGS)).toBe(true);
    expect(Object.keys(result).join(' ')).not.toMatch(/flex|enterprise/i);
  });

  it('uses the process Stripe credential and retrieves expanded Prices from the platform account', async () => {
    const prior = Object.fromEntries(Object.keys(environment()).map((key) => [key, process.env[key]]));
    const priorSecret = process.env.STRIPE_SECRET_KEY;
    try {
      Object.assign(process.env, environment());
      process.env.STRIPE_SECRET_KEY = testSecretKey('test');

      await loadVerifiedStripePlanPrices();

      expect(stripeMocks.getStripeClient).toHaveBeenCalledTimes(1);
      expect(stripeMocks.priceRetrieve).toHaveBeenCalledTimes(6);
      for (const binding of STRIPE_PLAN_PRICE_BINDINGS) {
        expect(stripeMocks.priceRetrieve).toHaveBeenCalledWith(PRICE_IDS[binding.key], {
          expand: ['currency_options'],
        });
      }
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (priorSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = priorSecret;
    }
  });

  it.each([
    ['missing mode', { ...environment(), LGQ_STRIPE_BILLING_LIVEMODE: undefined }],
    ['ambiguous mode', { ...environment(), LGQ_STRIPE_BILLING_LIVEMODE: 'false' }],
    ['missing Price', { ...environment(), STRIPE_PRICE_SCALE_ANNUAL: undefined }],
    ['malformed Price', { ...environment(), STRIPE_PRICE_SCALE_ANNUAL: ' price_bad ' }],
    ['reused Price', { ...environment(), STRIPE_PRICE_SCALE_ANNUAL: PRICE_IDS.scale_monthly }],
  ])('rejects %s configuration before making a Stripe request', async (_label, env) => {
    const deps = dependencies();

    const error = await captured(loadVerifiedStripePlanPrices({ env, dependencies: deps.value }));

    expect(error.code).toBe('configuration_invalid');
    expect(deps.retrievePrice).not.toHaveBeenCalled();
  });

  it('requires the configured mode, Stripe credential mode, and every retrieved Price mode to agree', async () => {
    const testDeps = dependencies();
    const credentialMismatch = await captured(loadVerifiedStripePlanPrices({
      env: environment(true),
      dependencies: testDeps.value,
    }));
    expect(credentialMismatch.code).toBe('credential_mode_mismatch');
    expect(testDeps.retrievePrice).not.toHaveBeenCalled();

    const livePrice = dependencies({ overrideKey: 'solo_monthly', override: { livemode: true } });
    const priceMismatch = await captured(loadVerifiedStripePlanPrices({
      env: environment(false),
      dependencies: livePrice.value,
    }));
    expect(priceMismatch.code).toBe('price_contract_mismatch');
    expect(priceMismatch.bindingKey).toBe('solo_monthly');
  });

  it.each([
    ['wrong returned ID', { id: 'price_wrongReturned123' }],
    ['inactive', { active: false }],
    ['wrong currency', { currency: 'eur' }],
    ['unexpanded currency options', { currency_options: undefined }],
    ['alternate currency amount', { currency_options: { eur: { unit_amount: 3_500 } } }],
    ['empty currency options', { currency_options: {} }],
    ['base currency alongside an alternate', {
      currency_options: {
        usd: {
          unit_amount: 3_900, tax_behavior: 'exclusive', custom_unit_amount: null, tiers: null,
        },
        eur: { unit_amount: 3_500 },
      },
    }],
    ['base currency localized to another amount', {
      currency_options: {
        usd: {
          unit_amount: 3_500, tax_behavior: 'exclusive', custom_unit_amount: null, tiers: null,
        },
      },
    }],
    ['base currency localized to another tax behavior', {
      currency_options: {
        usd: {
          unit_amount: 3_900, tax_behavior: 'inclusive', custom_unit_amount: null, tiers: null,
        },
      },
    }],
    ['base currency with tiers', {
      currency_options: {
        usd: {
          unit_amount: 3_900, tax_behavior: 'exclusive', custom_unit_amount: null, tiers: [],
        },
      },
    }],
    ['tax-inclusive amount', { tax_behavior: 'inclusive' }],
    ['one-time', { type: 'one_time', recurring: null }],
    ['tiered', { billing_scheme: 'tiered', tiers_mode: 'volume' }],
    ['custom amount', { custom_unit_amount: { minimum: 1, maximum: null, preset: null } }],
    ['transformed quantity', { transform_quantity: { divide_by: 2, round: 'up' } }],
    ['wrong amount', { unit_amount: 3_901 }],
    ['wrong interval', { recurring: { interval: 'year', interval_count: 1, meter: null, trial_period_days: null, usage_type: 'licensed' } }],
    ['wrong interval count', { recurring: { interval: 'month', interval_count: 12, meter: null, trial_period_days: null, usage_type: 'licensed' } }],
    ['metered usage', { recurring: { interval: 'month', interval_count: 1, meter: 'mtr_private123', trial_period_days: null, usage_type: 'metered' } }],
    ['embedded trial', { recurring: { interval: 'month', interval_count: 1, meter: null, trial_period_days: 30, usage_type: 'licensed' } }],
    ['expanded product', { product: { id: 'prod_lgqBasePlans123', object: 'product' } }],
    ['wrong purpose', { metadata: { lgq_price_purpose: 'top_up', lgq_plan_code: 'solo', lgq_billing_interval: 'monthly', lgq_catalog_version: PRICING_CATALOG_VERSION } }],
    ['wrong plan', { metadata: { lgq_price_purpose: 'base_plan', lgq_plan_code: 'growth', lgq_billing_interval: 'monthly', lgq_catalog_version: PRICING_CATALOG_VERSION } }],
    ['wrong interval metadata', { metadata: { lgq_price_purpose: 'base_plan', lgq_plan_code: 'solo', lgq_billing_interval: 'annual', lgq_catalog_version: PRICING_CATALOG_VERSION } }],
    ['stale catalog', { metadata: { lgq_price_purpose: 'base_plan', lgq_plan_code: 'solo', lgq_billing_interval: 'monthly', lgq_catalog_version: '2026-07-legacy' } }],
  ])('fails closed on a %s contract mismatch', async (_label, override) => {
    const deps = dependencies({ overrideKey: 'solo_monthly', override });

    const error = await captured(loadVerifiedStripePlanPrices({
      env: environment(),
      dependencies: deps.value,
    }));

    expect(error.code).toBe('price_contract_mismatch');
    expect(error.bindingKey).toBe('solo_monthly');
  });

  it('redacts Stripe retrieval errors instead of retaining provider details', async () => {
    const providerError = Object.assign(
      new Error(`No such price price_private123 for ${testSecretKey('live')} and owner@example.com`),
      { raw: { message: 'private Stripe response' }, requestId: 'req_private123' },
    );
    const deps = dependencies({ retrieveError: providerError });

    const error = await captured(loadVerifiedStripePlanPrices({
      env: environment(),
      dependencies: deps.value,
    }));

    expect(error.code).toBe('price_retrieve_failed');
    expect(error.message).toBe('Stripe Billing price binding verification failed.');
    expect(error).not.toHaveProperty('cause');
    expect(error).not.toHaveProperty('raw');
    expect(JSON.stringify(error)).not.toMatch(/private|owner@|sk_live|req_/i);
  });

  it('fails closed on unknown or mismatched process credential modes before retrieval', async () => {
    const prior = Object.fromEntries(Object.keys(environment()).map((key) => [key, process.env[key]]));
    const priorSecret = process.env.STRIPE_SECRET_KEY;
    try {
      Object.assign(process.env, environment());
      process.env.STRIPE_SECRET_KEY = 'secret_without_a_stripe_mode';
      const unknown = await captured(loadVerifiedStripePlanPrices());
      expect(unknown.code).toBe('credential_mode_invalid');
      expect(stripeMocks.priceRetrieve).not.toHaveBeenCalled();

      vi.clearAllMocks();
      stripeMocks.getStripeClient.mockReturnValue({ prices: { retrieve: stripeMocks.priceRetrieve } });
      process.env.STRIPE_SECRET_KEY = testSecretKey('live');
      const mismatch = await captured(loadVerifiedStripePlanPrices());
      expect(mismatch.code).toBe('credential_mode_mismatch');
      expect(stripeMocks.priceRetrieve).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (priorSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = priorSecret;
    }
  });

  it('remains dark and unreferenced by routes or active payment callers', () => {
    const sourceFiles: string[] = [];
    const visit = (path: string) => {
      for (const entry of readdirSync(path)) {
        const child = join(path, entry);
        if (statSync(child).isDirectory()) visit(child);
        else if (/\.(?:ts|tsx)$/.test(entry)) sourceFiles.push(child);
      }
    };
    visit(join(process.cwd(), 'src', 'app'));
    for (const caller of [
      'src/lib/payments.ts',
      'src/lib/recurring.ts',
      'src/lib/payment-plans.ts',
      'src/lib/dunning.ts',
      'src/lib/billing/stripe-direct.ts',
    ]) {
      sourceFiles.push(join(process.cwd(), caller));
    }

    for (const sourceFile of sourceFiles) {
      expect(readFileSync(sourceFile, 'utf8'), sourceFile).not.toContain('stripe-plan-prices');
    }
    const adapter = readFileSync(
      join(process.cwd(), 'src/lib/billing/stripe-plan-prices.ts'),
      'utf8',
    );
    expect(adapter).toContain("import 'server-only'");
    expect(adapter).toContain("expand: ['currency_options']");
    expect(adapter).not.toMatch(/stripe\.[a-zA-Z]+\.(?:create|update|del)\(/);
  });
});
