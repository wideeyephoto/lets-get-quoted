import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: stripeMocks.create, retrieve: stripeMocks.retrieve } },
  }),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests must inject the subscription operation store');
  },
}));

import { APP_ORIGIN } from '@/lib/app-origin';
import {
  BILLING_PLANS,
  PRICING_CATALOG_VERSION,
  basePriceCents,
  type BillingCycle,
} from '@/lib/billing/catalog';
import {
  BASE_PLAN_SUBSCRIPTION_PURPOSE,
  SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS,
  SUBSCRIPTION_CHECKOUT_METADATA_KEYS,
  SUBSCRIPTION_CHECKOUT_TTL_SECONDS,
  assertSubscriptionCheckoutSession,
  buildBasePlanSubscriptionCheckoutCall,
  createPlatformSubscriptionCheckoutSession,
  retrievePlatformSubscriptionCheckoutSession,
  type PaidBillingPlanId,
  type PlatformSubscriptionCheckoutCall,
  type SubscriptionCheckoutBuildInput,
  type VerifiedSubscriptionPrice,
} from '@/lib/billing/stripe-billing-subscription-checkout';
import {
  SubscriptionCheckoutIndeterminateError,
  SubscriptionCheckoutPersistenceError,
  SubscriptionCheckoutUnavailableError,
  orchestrateBasePlanSubscriptionCheckout,
  type BasePlanSubscriptionCheckoutInput,
  type SubscriptionCheckoutClaim,
  type SubscriptionCheckoutDependencies,
  type SubscriptionCheckoutOperationStore,
} from '@/lib/billing/subscription-checkout-operation';
import { TERMS_VERSION } from '@/lib/terms';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const OPERATION_PK = '20000000-0000-4000-8000-000000000002';
const CLAIM_TOKEN = '30000000-0000-4000-8000-000000000003';
const NOW_EPOCH_SECONDS = 1_800_000_000;
const CHECKOUT_EXPIRES_AT = NOW_EPOCH_SECONDS
  + SUBSCRIPTION_CHECKOUT_TTL_SECONDS
  + SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS;
const RECURRING_CONSENT_VERSION = 'base-plan-recurring-v1-test';

const PLAN_CASES = [
  ['solo', 'monthly', 'price_soloMonthly123', 'prod_soloPlan123', 3_900, 'month'],
  ['solo', 'annual', 'price_soloAnnual123', 'prod_soloPlan123', 42_000, 'year'],
  ['growth', 'monthly', 'price_growthMonthly123', 'prod_growthPlan123', 12_900, 'month'],
  ['growth', 'annual', 'price_growthAnnual123', 'prod_growthPlan123', 118_800, 'year'],
  ['scale', 'monthly', 'price_scaleMonthly123', 'prod_scalePlan123', 32_900, 'month'],
  ['scale', 'annual', 'price_scaleAnnual123', 'prod_scalePlan123', 358_800, 'year'],
] as const;

function operationInput(
  planCode: PaidBillingPlanId = 'solo',
  billingInterval: BillingCycle = 'monthly',
): BasePlanSubscriptionCheckoutInput {
  return {
    workspaceId: WORKSPACE_ID,
    operationId: `workspace:${WORKSPACE_ID}:${planCode}:${billingInterval}:first`,
    planCode,
    billingInterval,
    livemode: false,
    successUrl: `${APP_ORIGIN}/dashboard/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${APP_ORIGIN}/pricing?billing=cancelled`,
  };
}

function verifiedPrice(
  planCode: PaidBillingPlanId = 'solo',
  billingInterval: BillingCycle = 'monthly',
  overrides: Partial<VerifiedSubscriptionPrice> = {},
): VerifiedSubscriptionPrice {
  const planCase = PLAN_CASES.find(([plan, interval]) => (
    plan === planCode && interval === billingInterval
  ));
  if (!planCase) throw new Error('missing test Price case');
  const [, , priceId, productId, unitAmountCents, recurringInterval] = planCase;
  return {
    bindingKey: `${planCode}_${billingInterval}`,
    priceId,
    productId,
    planCode,
    billingInterval,
    catalogVersion: PRICING_CATALOG_VERSION,
    livemode: false,
    currency: 'usd',
    unitAmountCents,
    recurringInterval,
    recurringIntervalCount: 1,
    ...overrides,
  } as VerifiedSubscriptionPrice;
}

function checkoutBuildInput(
  input = operationInput(),
  overrides: Partial<SubscriptionCheckoutBuildInput> = {},
): SubscriptionCheckoutBuildInput {
  return {
    ...input,
    verifiedPrice: verifiedPrice(input.planCode, input.billingInterval),
    providerCustomerId: null,
    checkoutExpiresAt: CHECKOUT_EXPIRES_AT,
    recurringConsentVersion: RECURRING_CONSENT_VERSION,
    ...overrides,
  };
}

function callFor(
  input = operationInput(),
  overrides: Partial<SubscriptionCheckoutBuildInput> = {},
): PlatformSubscriptionCheckoutCall {
  return buildBasePlanSubscriptionCheckoutCall(checkoutBuildInput(input, overrides));
}

function sessionFor(
  call: PlatformSubscriptionCheckoutCall,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: call.contract.livemode ? 'cs_live_subscription123' : 'cs_test_subscription123',
    object: 'checkout.session',
    livemode: call.contract.livemode,
    mode: 'subscription',
    currency: 'usd',
    client_reference_id: call.contract.workspaceId,
    amount_subtotal: call.contract.unitAmountCents,
    amount_total: call.contract.unitAmountCents,
    expires_at: call.contract.checkoutExpiresAt,
    automatic_tax: { enabled: false },
    customer: call.contract.providerCustomerId,
    metadata: call.params.metadata as Stripe.Metadata,
    url: 'https://checkout.stripe.test/session',
    ...overrides,
  } as Stripe.Checkout.Session;
}

function claimed(overrides: Partial<SubscriptionCheckoutClaim> = {}): SubscriptionCheckoutClaim {
  return {
    status: 'claimed',
    operationPk: OPERATION_PK,
    claimToken: CLAIM_TOKEN,
    operationState: 'claimed',
    providerObjectId: null,
    providerCustomerId: null,
    checkoutExpiresAt: null,
    ...overrides,
  };
}

function mocks(claimResult: SubscriptionCheckoutClaim = claimed()) {
  const store = {
    claim: vi.fn<SubscriptionCheckoutOperationStore['claim']>().mockResolvedValue(claimResult),
    beginSubmission: vi.fn<SubscriptionCheckoutOperationStore['beginSubmission']>()
      .mockResolvedValue(undefined),
    complete: vi.fn<SubscriptionCheckoutOperationStore['complete']>().mockResolvedValue(undefined),
    markIndeterminate: vi.fn<SubscriptionCheckoutOperationStore['markIndeterminate']>()
      .mockResolvedValue(undefined),
  } satisfies SubscriptionCheckoutOperationStore;
  const resolveVerifiedPrice = vi.fn<SubscriptionCheckoutDependencies['resolveVerifiedPrice']>()
    .mockImplementation(async ({ planCode, billingInterval }) => verifiedPrice(planCode, billingInterval));
  const createSession = vi.fn<SubscriptionCheckoutDependencies['createSession']>()
    .mockImplementation(async (call) => sessionFor(call));
  const retrieveSession = vi.fn<SubscriptionCheckoutDependencies['retrieveSession']>();
  const nowEpochSeconds = vi.fn<SubscriptionCheckoutDependencies['nowEpochSeconds']>()
    .mockReturnValue(NOW_EPOCH_SECONDS);
  return {
    store,
    resolveVerifiedPrice,
    createSession,
    retrieveSession,
    nowEpochSeconds,
    dependencies: {
      store,
      resolveVerifiedPrice,
      createSession,
      retrieveSession,
      nowEpochSeconds,
    } satisfies SubscriptionCheckoutDependencies,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not-a-real-key');
  vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '0');
  vi.stubEnv('LGQ_BASE_PLAN_RECURRING_CONSENT_VERSION', RECURRING_CONSENT_VERSION);
});

afterEach(() => vi.unstubAllEnvs());

describe('platform Stripe Billing subscription Checkout adapter', () => {
  it.each(PLAN_CASES)(
    'binds %s %s to its canonical Price, USD, consent, card, and tax-exclusive contract',
    (planCode, billingInterval, priceId, productId, amountCents, recurringInterval) => {
      const input = operationInput(planCode, billingInterval);
      const call = callFor(input);
      const expectedMetadata = {
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.purpose]: BASE_PLAN_SUBSCRIPTION_PURPOSE,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.workspaceId]: WORKSPACE_ID,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.planCode]: planCode,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.billingInterval]: billingInterval,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.catalogVersion]: PRICING_CATALOG_VERSION,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.operationId]: input.operationId,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.termsVersion]: TERMS_VERSION,
        [SUBSCRIPTION_CHECKOUT_METADATA_KEYS.recurringConsentVersion]: RECURRING_CONSENT_VERSION,
      };

      expect(call.contract).toEqual({
        workspaceId: WORKSPACE_ID,
        operationId: input.operationId,
        purpose: BASE_PLAN_SUBSCRIPTION_PURPOSE,
        planCode,
        billingInterval,
        catalogVersion: PRICING_CATALOG_VERSION,
        livemode: false,
        priceId,
        productId,
        currency: 'usd',
        unitAmountCents: amountCents,
        providerCustomerId: null,
        checkoutExpiresAt: CHECKOUT_EXPIRES_AT,
        termsVersion: TERMS_VERSION,
        recurringConsentVersion: RECURRING_CONSENT_VERSION,
      });
      expect(call.contract.unitAmountCents).toBe(
        basePriceCents(BILLING_PLANS[planCode], billingInterval),
      );
      expect(call.params).toMatchObject({
        mode: 'subscription',
        ui_mode: 'hosted_page',
        submit_type: 'subscribe',
        currency: 'usd',
        adaptive_pricing: { enabled: false },
        automatic_tax: { enabled: false },
        payment_method_types: ['card'],
        expires_at: CHECKOUT_EXPIRES_AT,
        line_items: [{ price: priceId, quantity: 1 }],
        client_reference_id: WORKSPACE_ID,
        metadata: expectedMetadata,
        subscription_data: { metadata: expectedMetadata },
      });
      expect(call.params).not.toHaveProperty('customer');
      expect(call.params.subscription_data?.metadata).toBe(call.params.metadata);
      expect(call.params).not.toHaveProperty('payment_intent_data');
      expect(call.params.subscription_data).not.toHaveProperty('application_fee_percent');
      expect(call.params.subscription_data).not.toHaveProperty('on_behalf_of');
      expect(call.params.subscription_data).not.toHaveProperty('transfer_data');
      expect(call.options).toEqual({
        idempotencyKey: expect.stringMatching(
          /^lgq:billing:v1:subscription_checkout\.create:[0-9a-f]{64}$/,
        ),
      });
      expect(call.options).not.toHaveProperty('stripeAccount');
      expect(call.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(recurringInterval).toBe(verifiedPrice(planCode, billingInterval).recurringInterval);
      expect(Object.isFrozen(call)).toBe(true);
      expect(Object.isFrozen(call.params)).toBe(true);
      expect(Object.isFrozen(call.params.line_items)).toBe(true);
      expect(Object.isFrozen(call.params.payment_method_types)).toBe(true);
      expect(Object.isFrozen(call.params.metadata)).toBe(true);
    },
  );

  it('uses stable operation idempotency while fingerprinting every immutable request field', () => {
    const first = callFor();
    const same = callFor();
    const changedOperation = callFor({ ...operationInput(), operationId: 'a-different-operation' });
    const changedReturn = callFor({
      ...operationInput(),
      cancelUrl: `${APP_ORIGIN}/pricing?billing=cancelled-again`,
    });
    const changedExpiry = callFor(operationInput(), { checkoutExpiresAt: CHECKOUT_EXPIRES_AT + 1 });

    expect(first.options.idempotencyKey).toBe(same.options.idempotencyKey);
    expect(first.requestFingerprint).toBe(same.requestFingerprint);
    expect(changedOperation.options.idempotencyKey).not.toBe(first.options.idempotencyKey);
    expect(changedReturn.options.idempotencyKey).toBe(first.options.idempotencyKey);
    expect(changedReturn.requestFingerprint).not.toBe(first.requestFingerprint);
    expect(changedExpiry.requestFingerprint).not.toBe(first.requestFingerprint);
  });

  it.each([
    ['wrong plan', { planCode: 'growth' }],
    ['wrong interval', { billingInterval: 'annual' }],
    ['wrong amount', { unitAmountCents: 1 }],
    ['wrong catalog', { catalogVersion: 'legacy' }],
    ['wrong currency', { currency: 'eur' }],
    ['wrong mode', { livemode: true }],
    ['wrong recurring interval', { recurringInterval: 'year' }],
    ['malformed Price ID', { priceId: 'not-a-price' }],
  ])('rejects a resolver seam with %s before an operation claim', (_label, override) => {
    expect(() => callFor(operationInput(), {
      verifiedPrice: verifiedPrice(
        'solo',
        'monthly',
        override as Partial<VerifiedSubscriptionPrice>,
      ),
    })).toThrow(/verified stripe price/i);
  });

  it('rejects Flex, cross-origin return URLs, and malformed database Customers', () => {
    expect(() => buildBasePlanSubscriptionCheckoutCall({
      ...checkoutBuildInput(),
      planCode: 'flex' as PaidBillingPlanId,
    })).toThrow(/only supports Solo, Growth, or Scale/i);

    expect(() => callFor({
      ...operationInput(),
      cancelUrl: 'https://attacker.example/cancel',
    })).toThrow(/configured-origin URL/i);

    expect(() => callFor(operationInput(), { providerCustomerId: 'cus_bad' }))
      .toThrow(/Customer ID is invalid/i);
  });

  it('calls Stripe on the platform with only idempotency and retrieves without account context', async () => {
    const call = callFor();
    const session = sessionFor(call);
    stripeMocks.create.mockResolvedValue(session);
    stripeMocks.retrieve.mockResolvedValue(session);

    await expect(createPlatformSubscriptionCheckoutSession(call)).resolves.toBe(session);
    await expect(retrievePlatformSubscriptionCheckoutSession(session.id)).resolves.toBe(session);

    expect(stripeMocks.create).toHaveBeenCalledWith(call.params, call.options);
    expect(stripeMocks.create.mock.calls[0]).toHaveLength(2);
    expect(stripeMocks.create.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: call.options.idempotencyKey,
    });
    expect(stripeMocks.retrieve).toHaveBeenCalledWith(session.id);
    expect(stripeMocks.retrieve.mock.calls[0]).toHaveLength(1);
  });

  it('rejects provider responses that drift from any claimed binding', () => {
    const call = callFor(operationInput(), { providerCustomerId: 'cus_platform123' });
    for (const override of [
      { id: 'cs_live_subscription123' },
      { livemode: true },
      { amount_total: 1 },
      { currency: 'eur' },
      { client_reference_id: 'another-workspace' },
      { expires_at: CHECKOUT_EXPIRES_AT + 1 },
      {
        automatic_tax: { enabled: true } as unknown as Stripe.Checkout.Session['automatic_tax'],
      },
      { customer: 'cus_another123' },
      { metadata: { ...call.params.metadata, unexpected: 'value' } },
    ]) {
      expect(() => assertSubscriptionCheckoutSession(sessionFor(call, override), call))
        .toThrow(/outside the claimed subscription contract/i);
    }
  });
});

describe('durable subscription Checkout orchestration', () => {
  it('claims server bindings, persists submitted fingerprint/expiry, then creates exactly once', async () => {
    const order: string[] = [];
    const { dependencies, store, resolveVerifiedPrice, createSession } = mocks();
    resolveVerifiedPrice.mockImplementation(async (input) => {
      order.push('resolve-price');
      return verifiedPrice(input.planCode, input.billingInterval);
    });
    store.claim.mockImplementation(async () => {
      order.push('claim');
      return claimed();
    });
    store.beginSubmission.mockImplementation(async () => {
      order.push('submitted');
    });
    createSession.mockImplementation(async (call) => {
      order.push('stripe-create');
      return sessionFor(call);
    });
    store.complete.mockImplementation(async () => {
      order.push('complete');
    });

    const result = await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies);

    expect(result).toMatchObject({ outcome: 'created', operationPk: OPERATION_PK });
    expect(order).toEqual(['resolve-price', 'claim', 'submitted', 'stripe-create', 'complete']);
    expect(store.claim).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      operationId: operationInput().operationId,
      planCode: 'solo',
      billingInterval: 'monthly',
      catalogVersion: PRICING_CATALOG_VERSION,
      livemode: false,
      priceId: 'price_soloMonthly123',
      productId: 'prod_soloPlan123',
      currency: 'usd',
      unitAmountCents: 3_900,
      termsVersion: TERMS_VERSION,
      recurringConsentVersion: RECURRING_CONSENT_VERSION,
      stripeIdempotencyKey: expect.stringMatching(/^[A-Za-z0-9:._-]+$/),
    });
    expect(store.beginSubmission).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      checkoutExpiresAt: CHECKOUT_EXPIRES_AT,
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const stripeCall = createSession.mock.calls[0]?.[0];
    expect(stripeCall?.params).toMatchObject({
      currency: 'usd',
      payment_method_types: ['card'],
      automatic_tax: { enabled: false },
      expires_at: CHECKOUT_EXPIRES_AT,
    });
    expect(store.complete).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: 'cs_test_subscription123',
    });
    expect(store.markIndeterminate).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('reuses the database-selected platform Customer for this workspace and mode', async () => {
    const { dependencies, createSession } = mocks(claimed({
      providerCustomerId: 'cus_platform123',
    }));

    await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies);

    expect(createSession.mock.calls[0]?.[0].params.customer).toBe('cus_platform123');
    expect(createSession.mock.calls[0]?.[0].options).not.toHaveProperty('stripeAccount');
  });

  it('anchors the 30-minute provider expiry only after the durable claim is owned', async () => {
    const postClaimNow = NOW_EPOCH_SECONDS + 120;
    const postClaimExpiry = postClaimNow
      + SUBSCRIPTION_CHECKOUT_TTL_SECONDS
      + SUBSCRIPTION_CHECKOUT_EXPIRY_TRANSPORT_SECONDS;
    const { dependencies, store, createSession, nowEpochSeconds } = mocks();
    nowEpochSeconds
      .mockReturnValueOnce(NOW_EPOCH_SECONDS)
      .mockReturnValueOnce(postClaimNow);

    await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies);

    expect(nowEpochSeconds).toHaveBeenCalledTimes(2);
    expect(store.beginSubmission).toHaveBeenCalledWith(expect.objectContaining({
      checkoutExpiresAt: postClaimExpiry,
    }));
    expect(createSession.mock.calls[0]?.[0].contract.checkoutExpiresAt).toBe(postClaimExpiry);
  });

  it('replays the recorded Session with its persisted expiry and no second create', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'checkout_created',
      providerObjectId: 'cs_test_subscription123',
      checkoutExpiresAt: CHECKOUT_EXPIRES_AT,
    });
    const { dependencies, store, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(sessionFor(callFor()));

    const result = await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies);

    expect(result.outcome).toBe('replayed');
    expect(retrieveSession).toHaveBeenCalledWith('cs_test_subscription123');
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['in_progress', 'claimed'],
    ['submitted', 'submitted'],
    ['indeterminate', 'indeterminate'],
    ['activated', 'activated'],
    ['expired', 'expired'],
    ['canceled', 'canceled'],
    ['pending_conflict', 'checkout_created'],
  ] as const)('fails closed for %s and never creates automatically', async (status, state) => {
    const { dependencies, store, createSession, retrieveSession } = mocks(claimed({
      status,
      operationState: state,
      claimToken: null,
    }));

    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies))
      .rejects.toEqual(expect.objectContaining({
        name: SubscriptionCheckoutUnavailableError.name,
        operationState: state,
        claimStatus: status,
      }));
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('marks every post-submission provider error indeterminate and never retries', async () => {
    const { dependencies, store, createSession } = mocks();
    const providerError = new Error('socket closed after request write');
    createSession.mockRejectedValue(providerError);

    const thrown = await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies)
      .catch((error) => error);

    expect(thrown).toBeInstanceOf(SubscriptionCheckoutIndeterminateError);
    expect(thrown.providerError).toBe(providerError);
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      error: 'Error: socket closed after request write',
    });
    expect(store.complete).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('treats a provider response contract mismatch as indeterminate', async () => {
    const { dependencies, store, createSession } = mocks();
    createSession.mockImplementation(async (call) => sessionFor(call, { amount_total: 1 }));

    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(SubscriptionCheckoutIndeterminateError);
    expect(store.markIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringMatching(/outside the claimed subscription contract/i),
    }));
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('preserves provider and database errors when the indeterminate write also fails', async () => {
    const { dependencies, store, createSession } = mocks();
    const providerError = new Error('provider timeout');
    const persistenceError = new Error('database unavailable');
    createSession.mockRejectedValue(providerError);
    store.markIndeterminate.mockRejectedValue(persistenceError);

    const thrown = await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies)
      .catch((error) => error);

    expect(thrown).toBeInstanceOf(SubscriptionCheckoutIndeterminateError);
    expect(thrown.providerError).toBe(providerError);
    expect(thrown.persistenceError).toBe(persistenceError);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('never retries when Stripe succeeds but durable completion is unconfirmed', async () => {
    const { dependencies, store, createSession } = mocks();
    const persistenceError = new Error('completion response lost');
    store.complete.mockRejectedValue(persistenceError);

    const thrown = await orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies)
      .catch((error) => error);

    expect(thrown).toBeInstanceOf(SubscriptionCheckoutPersistenceError);
    expect(thrown.persistenceError).toBe(persistenceError);
    expect(store.markIndeterminate).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('never contacts Stripe when the database refuses the submitted transition', async () => {
    const { dependencies, store, createSession } = mocks();
    store.beginSubmission.mockRejectedValue(new Error('workspace is no longer eligible'));

    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies))
      .rejects.toThrow(/no longer eligible/);
    expect(createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.markIndeterminate).not.toHaveBeenCalled();
  });

  it('fails before claim when consent, credential, deployment, request, or Price mode disagrees', async () => {
    const missingConsent = mocks();
    vi.stubEnv('LGQ_BASE_PLAN_RECURRING_CONSENT_VERSION', '');
    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), missingConsent.dependencies))
      .rejects.toThrow(/consent version is invalid/i);
    expect(missingConsent.resolveVerifiedPrice).not.toHaveBeenCalled();
    expect(missingConsent.store.claim).not.toHaveBeenCalled();

    vi.stubEnv('LGQ_BASE_PLAN_RECURRING_CONSENT_VERSION', RECURRING_CONSENT_VERSION);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_not-a-real-key');
    const modeMismatch = mocks();
    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), modeMismatch.dependencies))
      .rejects.toThrow(/mode.*must match/i);
    expect(modeMismatch.store.claim).not.toHaveBeenCalled();

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not-a-real-key');
    const priceMismatch = mocks();
    priceMismatch.resolveVerifiedPrice.mockResolvedValue(
      verifiedPrice('solo', 'monthly', { livemode: true }),
    );
    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), priceMismatch.dependencies))
      .rejects.toThrow(/verified stripe price/i);
    expect(priceMismatch.store.claim).not.toHaveBeenCalled();
  });

  it('rechecks mode before submission and leaves Stripe untouched if configuration changes', async () => {
    const { dependencies, store, createSession } = mocks();
    store.claim.mockImplementation(async () => {
      vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '1');
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_not-a-real-key');
      return claimed();
    });

    await expect(orchestrateBasePlanSubscriptionCheckout(operationInput(), dependencies))
      .rejects.toThrow(/mode.*must match/i);
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
