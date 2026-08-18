import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: stripeMocks.create, retrieve: stripeMocks.retrieve } },
    prices: { search: stripeMocks.search },
  }),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests must inject the top-up purchase operation store');
  },
}));

import { PRICING_CATALOG_VERSION, TOP_UPS } from '@/lib/billing/catalog';
import {
  SupabaseTopUpPurchaseOperationStore,
  TOP_UP_PURCHASE_ERROR_CODES,
  TOP_UP_PURCHASE_PURPOSE,
  TopUpPurchaseCheckoutIndeterminateError,
  TopUpPurchaseCheckoutPersistenceError,
  TopUpPurchaseCheckoutUnavailableError,
  assertTopUpCheckoutSession,
  buildTopUpPurchaseCheckoutCall,
  buildTopUpPurchaseCheckoutIdempotencyKey,
  createPlatformTopUpCheckoutSession,
  orchestrateTopUpPurchaseCheckout,
  resolveDefaultTopUpPrice,
  retrievePlatformTopUpCheckoutSession,
  type TopUpPurchaseCheckoutCall,
  type TopUpPurchaseCheckoutDependencies,
  type TopUpPurchaseClaim,
  type TopUpPurchaseOperationState,
  type TopUpPurchaseOperationStore,
} from '@/lib/billing/top-up-purchase-checkout';
import type { ResolvedTopUpPrice } from '@/lib/billing/top-up-purchase';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const OPERATION_ID = 'top-up-purchase:40000000-0000-4000-8000-000000000004';
const OPERATION_PK = '20000000-0000-4000-8000-000000000002';
const CLAIM_TOKEN = '30000000-0000-4000-8000-000000000003';
const SUCCESS_URL = 'https://app.letsgetquoted.com/dashboard/settings?top_up_checkout=success#buy-credits';
const CANCEL_URL = 'https://app.letsgetquoted.com/dashboard/settings?top_up_checkout=canceled#buy-credits';

/** The five sellable SKUs, with the Price identity each resolves to. */
const SKU_CASES = [
  ['flex_text_250', 'price_flexText250x', 'prod_flexTextPack', 1_200, 'text_segments', 250],
  ['text_1000', 'price_text1000pack', 'prod_textPack0001', 4_200, 'text_segments', 1_000],
  ['marketing_email_5000', 'price_marketing5k0', 'prod_marketingPk1', 1_700, 'marketing_email_sends', 5_000],
  ['ai_intake_100', 'price_aiIntake100x', 'prod_aiIntakePack', 1_500, 'ai_intake_threads', 100],
  ['ai_writing_250', 'price_aiWriting250', 'prod_aiWritingPak', 1_900, 'ai_writing_drafts', 250],
] as const;

function skuFor(topUpId: (typeof SKU_CASES)[number][0]) {
  return TOP_UPS[topUpId];
}

function priceFor(
  topUpId: (typeof SKU_CASES)[number][0] = 'text_1000',
  overrides: Partial<ResolvedTopUpPrice> = {},
): ResolvedTopUpPrice {
  const found = SKU_CASES.find(([id]) => id === topUpId);
  if (!found) throw new Error('missing test Price case');
  const [, priceId, productId, unitAmountCents] = found;
  return { priceId, productId, unitAmountCents, recurring: false, ...overrides };
}

function callFor(
  topUpId: (typeof SKU_CASES)[number][0] = 'text_1000',
  overrides: Partial<Parameters<typeof buildTopUpPurchaseCheckoutCall>[0]> = {},
): TopUpPurchaseCheckoutCall {
  return buildTopUpPurchaseCheckoutCall({
    workspaceId: WORKSPACE_ID,
    operationId: OPERATION_ID,
    sku: skuFor(topUpId),
    price: priceFor(topUpId),
    livemode: false,
    successUrl: SUCCESS_URL,
    cancelUrl: CANCEL_URL,
    ...overrides,
  });
}

function sessionFor(
  call: TopUpPurchaseCheckoutCall,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: call.contract.livemode ? 'cs_live_topUp123' : 'cs_test_topUp123',
    object: 'checkout.session',
    livemode: call.contract.livemode,
    mode: call.contract.mode,
    currency: 'usd',
    amount_subtotal: call.contract.unitAmountCents,
    amount_total: call.contract.unitAmountCents,
    metadata: call.params.metadata as Stripe.Metadata,
    url: 'https://checkout.stripe.com/c/pay/cs_test_topUp123',
    ...overrides,
  } as Stripe.Checkout.Session;
}

function claimed(overrides: Partial<TopUpPurchaseClaim> = {}): TopUpPurchaseClaim {
  return {
    status: 'claimed',
    operationPk: OPERATION_PK,
    claimToken: CLAIM_TOKEN,
    operationState: 'claimed',
    providerObjectId: null,
    ...overrides,
  };
}

function replayed(
  operationState: TopUpPurchaseOperationState,
  providerObjectId: string | null = null,
): TopUpPurchaseClaim {
  return {
    status: 'replayed',
    operationPk: OPERATION_PK,
    // A replay of an unfinished attempt still hands back the original token.
    claimToken: ['claimed', 'submitted', 'indeterminate'].includes(operationState) ? CLAIM_TOKEN : null,
    operationState,
    providerObjectId,
  };
}

function mocks(claimResult: TopUpPurchaseClaim = claimed()) {
  const store = {
    claim: vi.fn<TopUpPurchaseOperationStore['claim']>().mockResolvedValue(claimResult),
    beginSubmission: vi.fn<TopUpPurchaseOperationStore['beginSubmission']>().mockResolvedValue(undefined),
    complete: vi.fn<TopUpPurchaseOperationStore['complete']>().mockResolvedValue(undefined),
    markIndeterminate: vi.fn<TopUpPurchaseOperationStore['markIndeterminate']>().mockResolvedValue(undefined),
    fail: vi.fn<TopUpPurchaseOperationStore['fail']>().mockResolvedValue(undefined),
  } satisfies TopUpPurchaseOperationStore;
  const resolvePrice = vi.fn<TopUpPurchaseCheckoutDependencies['resolvePrice']>()
    .mockImplementation(async ({ sku }) => priceFor(sku.id as (typeof SKU_CASES)[number][0]));
  const createSession = vi.fn<TopUpPurchaseCheckoutDependencies['createSession']>()
    .mockImplementation(async (call) => sessionFor(call));
  const retrieveSession = vi.fn<TopUpPurchaseCheckoutDependencies['retrieveSession']>();
  return {
    store,
    resolvePrice,
    createSession,
    retrieveSession,
    dependencies: {
      store,
      resolvePrice,
      createSession,
      retrieveSession,
    } satisfies TopUpPurchaseCheckoutDependencies,
  };
}

function orchestrationInput(topUpId: (typeof SKU_CASES)[number][0] = 'text_1000') {
  return {
    workspaceId: WORKSPACE_ID,
    operationId: OPERATION_ID,
    sku: skuFor(topUpId),
    livemode: false,
    successUrl: SUCCESS_URL,
    cancelUrl: CANCEL_URL,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not-a-real-key');
  vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '0');
});

afterEach(() => vi.unstubAllEnvs());

describe('top-up purchase Checkout call construction', () => {
  it.each(SKU_CASES)(
    'binds %s to its catalog contract, one-time mode, and the metadata fulfillment reads',
    (topUpId, priceId, productId, amountCents, resourceCode, units) => {
      const call = callFor(topUpId);

      expect(call.contract).toEqual({
        workspaceId: WORKSPACE_ID,
        operationId: OPERATION_ID,
        purpose: TOP_UP_PURCHASE_PURPOSE,
        topUpId,
        resourceCode,
        units,
        catalogVersion: PRICING_CATALOG_VERSION,
        livemode: false,
        priceId,
        productId,
        currency: 'usd',
        unitAmountCents: amountCents,
        mode: 'payment',
      });
      expect(call.contract.unitAmountCents).toBe(TOP_UPS[topUpId].priceCents);
      // Every currently sellable SKU is one-time. A subscription here would bill
      // a credit pack every month forever.
      expect(call.params.mode).toBe('payment');
      expect(call.params.subscription_data).toBeUndefined();
      expect(call.params.line_items).toEqual([{ price: priceId, quantity: 1 }]);
      // The six keys the live projector already knows how to read back.
      expect(call.params.metadata).toEqual({
        lgq_purpose: 'top_up',
        lgq_top_up_id: topUpId,
        lgq_account_id: WORKSPACE_ID,
        lgq_resource_code: resourceCode,
        lgq_units: String(units),
        lgq_catalog_version: PRICING_CATALOG_VERSION,
      });
      expect(call.params.payment_intent_data?.metadata).toEqual(call.params.metadata);
      expect(call.params.success_url).toBe(SUCCESS_URL);
      expect(call.params.cancel_url).toBe(CANCEL_URL);
      expect(call.options).toEqual({ idempotencyKey: expect.any(String) });
      expect(call.options).not.toHaveProperty('stripeAccount');
      expect(call.requestFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.isFrozen(call)).toBe(true);
      expect(Object.isFrozen(call.params)).toBe(true);
      expect(Object.isFrozen(call.contract)).toBe(true);
    },
  );

  it('produces an idempotency key the ledger CHECK constraint accepts', () => {
    // billing_top_up_purchase_operations.stripe_idempotency_key carries
    // ^lgq:billing:v1:top_up_purchase[.]create:[0-9a-f]{64}$ -- a wrong purpose
    // segment fails every claim against its own constraint, before Stripe.
    const key = buildTopUpPurchaseCheckoutIdempotencyKey({
      workspaceId: WORKSPACE_ID,
      operationId: OPERATION_ID,
      livemode: false,
    });
    expect(key).toMatch(/^lgq:billing:v1:top_up_purchase\.create:[0-9a-f]{64}$/);
    expect(key.length).toBeLessThanOrEqual(255);
    expect(callFor().options.idempotencyKey).toBe(key);
    // Not the subscription ledger's segment.
    expect(key).not.toContain('subscription_checkout');
  });

  it('keys idempotency on the intent alone, and fingerprints everything else', () => {
    const first = callFor();
    const same = callFor();
    const otherOperation = callFor('text_1000', { operationId: 'top-up-purchase:other' });
    const otherWorkspace = callFor('text_1000', { workspaceId: '90000000-0000-4000-8000-000000000009' });
    const otherMode = callFor('text_1000', { livemode: true });
    const otherReturn = callFor('text_1000', { cancelUrl: `${CANCEL_URL}-again` });
    const otherSku = callFor('ai_intake_100');

    expect(same.options.idempotencyKey).toBe(first.options.idempotencyKey);
    expect(same.requestFingerprint).toBe(first.requestFingerprint);
    expect(otherOperation.options.idempotencyKey).not.toBe(first.options.idempotencyKey);
    expect(otherWorkspace.options.idempotencyKey).not.toBe(first.options.idempotencyKey);
    expect(otherMode.options.idempotencyKey).not.toBe(first.options.idempotencyKey);
    // Return URLs do not change the intent, but they do change the request.
    expect(otherReturn.options.idempotencyKey).toBe(first.options.idempotencyKey);
    expect(otherReturn.requestFingerprint).not.toBe(first.requestFingerprint);
    expect(otherSku.requestFingerprint).not.toBe(first.requestFingerprint);
  });

  it.each([
    ['drifted amount', { unitAmountCents: 9_900 }],
    ['drifted recurrence', { recurring: true }],
    ['malformed Price ID', { priceId: 'not-a-price' }],
    ['malformed Product ID', { productId: 'not-a-product' }],
  ])('refuses a resolved Price with %s before any claim', (_label, override) => {
    expect(() => callFor('text_1000', { price: priceFor('text_1000', override) }))
      .toThrow(/does not match the catalog SKU/i);
  });

  it.each([
    ['a non-UUID workspace', { workspaceId: 'workspace-1' }],
    ['an untrimmed operation ID', { operationId: ` ${OPERATION_ID}` }],
    ['an over-long operation ID', { operationId: `top-up-purchase:${'a'.repeat(200)}` }],
    ['a control character in the operation ID', { operationId: 'top-up-purchase:a b' }],
    ['an empty operation ID', { operationId: '' }],
  ])('refuses %s the ledger would reject anyway', (_label, override) => {
    expect(() => callFor('text_1000', override)).toThrow();
  });

  it('refuses to build in a mode the deployment credential does not declare', () => {
    // The claim, the credential and the switch must agree before anything is
    // recorded; a live Session created against a test key is unrecoverable.
    expect(() => callFor('text_1000', { livemode: true })).not.toThrow();
    const { dependencies } = mocks();
    return expect(orchestrateTopUpPurchaseCheckout(
      { ...orchestrationInput(), livemode: true },
      dependencies,
    )).rejects.toThrow(/mode/i);
  });
});

describe('provider response contract', () => {
  it.each([
    ['a live Session ID in test mode', { id: 'cs_live_topUp123' }],
    ['a mismatched livemode flag', { livemode: true }],
    ['a subscription instead of a payment', { mode: 'subscription' }],
    ['a different currency', { currency: 'eur' }],
    ['a different amount', { amount_total: 1 }],
    ['no metadata at all', { metadata: null }],
    ['extra metadata', { metadata: { lgq_purpose: 'top_up', unexpected: 'value' } }],
    ['a malformed Session ID', { id: 'cs_test_' }],
  ])('rejects %s', (_label, override) => {
    const call = callFor();
    expect(() => assertTopUpCheckoutSession(
      sessionFor(call, override as Partial<Stripe.Checkout.Session>),
      call,
    )).toThrow(/outside the claimed top-up contract/i);
  });

  it('accepts the exact Session that was claimed', () => {
    const call = callFor();
    expect(() => assertTopUpCheckoutSession(sessionFor(call), call)).not.toThrow();
  });

  it('calls Stripe on the platform with only idempotency, and retrieves with no account context', async () => {
    // A top-up is LGQ's own product. A Stripe-Account header here would put the
    // charge on a contractor's connected account.
    const call = callFor();
    const session = sessionFor(call);
    stripeMocks.create.mockResolvedValue(session);
    stripeMocks.retrieve.mockResolvedValue(session);

    await expect(createPlatformTopUpCheckoutSession(call)).resolves.toBe(session);
    expect(stripeMocks.create).toHaveBeenCalledWith(call.params, call.options);
    expect(stripeMocks.create.mock.calls[0]).toHaveLength(2);
    expect(stripeMocks.create.mock.calls[0]?.[1]).toEqual({
      idempotencyKey: call.options.idempotencyKey,
    });

    await expect(retrievePlatformTopUpCheckoutSession(session.id)).resolves.toBe(session);
    expect(stripeMocks.retrieve).toHaveBeenCalledWith(session.id);
    expect(stripeMocks.retrieve.mock.calls[0]).toHaveLength(1);

    await expect(retrievePlatformTopUpCheckoutSession('cs_test')).rejects.toThrow(/invalid/i);
  });

  it('resolves a Price by metadata search rather than an environment binding', async () => {
    stripeMocks.search.mockResolvedValue({
      data: [{
        id: 'price_text1000pack',
        object: 'price',
        active: true,
        currency: 'usd',
        unit_amount: TOP_UPS.text_1000.priceCents,
        tax_behavior: 'exclusive',
        recurring: null,
        product: 'prod_textPack0001',
        metadata: {
          lgq_price_purpose: 'top_up',
          lgq_top_up_id: 'text_1000',
          lgq_resource_code: 'text_segments',
          lgq_units: '1000',
          lgq_catalog_version: PRICING_CATALOG_VERSION,
        },
      }],
    });

    await expect(resolveDefaultTopUpPrice({ sku: TOP_UPS.text_1000, livemode: false }))
      .resolves.toMatchObject({ priceId: 'price_text1000pack', productId: 'prod_textPack0001' });
    const query = stripeMocks.search.mock.calls[0]?.[0]?.query as string;
    expect(query).toContain("metadata['lgq_top_up_id']:'text_1000'");
    expect(query).toContain(`metadata['lgq_catalog_version']:'${PRICING_CATALOG_VERSION}'`);
  });
});

describe('durable top-up purchase orchestration', () => {
  it('claims, persists a submitted fingerprint, then creates exactly once', async () => {
    const order: string[] = [];
    const { dependencies, store, resolvePrice, createSession } = mocks();
    resolvePrice.mockImplementation(async ({ sku }) => {
      order.push('resolve-price');
      return priceFor(sku.id as (typeof SKU_CASES)[number][0]);
    });
    store.claim.mockImplementation(async () => { order.push('claim'); return claimed(); });
    store.beginSubmission.mockImplementation(async () => { order.push('submitted'); });
    createSession.mockImplementation(async (call) => { order.push('stripe'); return sessionFor(call); });
    store.complete.mockImplementation(async () => { order.push('complete'); });

    const result = await orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies);

    expect(result.outcome).toBe('created');
    expect(result.operationPk).toBe(OPERATION_PK);
    expect(result.session.id).toBe('cs_test_topUp123');
    // The submitted transition commits BEFORE Stripe. That ordering is the only
    // reason a crash mid-call is distinguishable from never having tried.
    expect(order).toEqual(['resolve-price', 'claim', 'submitted', 'stripe', 'complete']);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.markIndeterminate).not.toHaveBeenCalled();
    expect(store.beginSubmission).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(store.complete).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: 'cs_test_topUp123',
    });
  });

  it('claims with the catalog binding the ledger CHECK will verify', async () => {
    const { dependencies, store } = mocks();
    await orchestrateTopUpPurchaseCheckout(orchestrationInput('ai_writing_250'), dependencies);

    expect(store.claim).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      operationId: OPERATION_ID,
      topUpId: 'ai_writing_250',
      resourceCode: 'ai_writing_drafts',
      units: 250,
      catalogVersion: PRICING_CATALOG_VERSION,
      livemode: false,
      priceId: 'price_aiWriting250',
      productId: 'prod_aiWritingPak',
      unitAmountCents: 1_900,
      stripeIdempotencyKey: expect.stringMatching(
        /^lgq:billing:v1:top_up_purchase\.create:[0-9a-f]{64}$/,
      ),
    });
  });

  it('hands back the SAME Session when the intent already produced one', async () => {
    const { dependencies, store, retrieveSession, createSession } = mocks(
      replayed('checkout_created', 'cs_test_topUp123'),
    );
    retrieveSession.mockImplementation(async () => sessionFor(callFor()));

    const result = await orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies);

    expect(result.outcome).toBe('replayed');
    expect(result.session.id).toBe('cs_test_topUp123');
    expect(retrieveSession).toHaveBeenCalledWith('cs_test_topUp123');
    expect(createSession).not.toHaveBeenCalled();
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.fail).not.toHaveBeenCalled();
  });

  it('refuses a replayed Session that is not the one this intent claimed', async () => {
    const { dependencies, retrieveSession } = mocks(replayed('checkout_created', 'cs_test_topUp123'));
    retrieveSession.mockImplementation(async () => sessionFor(callFor(), { amount_total: 1 }));

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toThrow(/outside the claimed top-up contract/i);
  });

  it.each([
    ['claimed', 'claimed'],
    ['submitted', 'submitted'],
    ['indeterminate', 'indeterminate'],
    ['failed', 'failed'],
  ] as const)(
    'reports a replay in state %s without sending a second Stripe request',
    async (_label, operationState) => {
      const { dependencies, store, createSession, retrieveSession } = mocks(replayed(operationState));

      const error = await orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies)
        .then(() => null, (thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(TopUpPurchaseCheckoutUnavailableError);
      expect((error as TopUpPurchaseCheckoutUnavailableError).operationState).toBe(operationState);
      expect((error as TopUpPurchaseCheckoutUnavailableError).claimStatus).toBe('replayed');
      expect(createSession).not.toHaveBeenCalled();
      expect(retrieveSession).not.toHaveBeenCalled();
      expect(store.beginSubmission).not.toHaveBeenCalled();
      // A replay owns nothing. Releasing another attempt's claim would be a
      // second process deciding an operation it does not hold.
      expect(store.fail).not.toHaveBeenCalled();
      expect(store.markIndeterminate).not.toHaveBeenCalled();
    },
  );

  it('treats a checkout_created replay with no Session ID as unusable, not as a fresh start', async () => {
    // The ledger's state shape makes this impossible, so reaching it means the
    // row disagrees with itself. Creating a second Session would be the wrong
    // way to resolve that.
    const { dependencies, store, createSession } = mocks(replayed('checkout_created', null));

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toBeInstanceOf(TopUpPurchaseCheckoutUnavailableError);
    expect(createSession).not.toHaveBeenCalled();
    expect(store.beginSubmission).not.toHaveBeenCalled();
  });

  it('releases a fresh claim that came back carrying a Session, before Stripe', async () => {
    const { dependencies, store, createSession } = mocks(
      claimed({ providerObjectId: 'cs_test_somethingElse' }),
    );

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies)).rejects.toThrow();
    expect(createSession).not.toHaveBeenCalled();
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      errorCode: TOP_UP_PURCHASE_ERROR_CODES.claimContractMismatch,
    });
  });

  it('releases the claim when the submitted transition does not commit', async () => {
    // Stripe has provably not been asked, so `failed` is the honest terminal
    // state. Leaving it `claimed` would look identical to a row an operator has
    // to reconcile.
    const { dependencies, store, createSession } = mocks();
    store.beginSubmission.mockRejectedValue(new Error('lease expired'));

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toThrow(/lease expired/);
    expect(createSession).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      errorCode: TOP_UP_PURCHASE_ERROR_CODES.submissionNotRecorded,
    });
    expect(store.markIndeterminate).not.toHaveBeenCalled();
  });

  it('still reports the original failure when the release itself fails', async () => {
    const { dependencies, store } = mocks();
    store.beginSubmission.mockRejectedValue(new Error('lease expired'));
    store.fail.mockRejectedValue(new Error('database unreachable'));

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toThrow(/lease expired/);
  });

  it('holds an unanswered Stripe request as indeterminate, never as failed', async () => {
    // From here a timeout is indistinguishable from a Session that exists.
    // `failed` would assert that none does.
    const { dependencies, store } = mocks();
    store.claim.mockResolvedValue(claimed());
    const providerError = new Error('socket hang up');
    (dependencies.createSession as ReturnType<typeof vi.fn>).mockRejectedValue(providerError);

    const error = await orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies)
      .then(() => null, (thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TopUpPurchaseCheckoutIndeterminateError);
    expect((error as TopUpPurchaseCheckoutIndeterminateError).providerError).toBe(providerError);
    expect((error as TopUpPurchaseCheckoutIndeterminateError).persistenceError).toBeUndefined();
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      errorCode: TOP_UP_PURCHASE_ERROR_CODES.providerRequestFailed,
    });
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('separates a Session that drifted from one that never arrived', async () => {
    const { dependencies, store } = mocks();
    (dependencies.createSession as ReturnType<typeof vi.fn>).mockImplementation(
      async (call: TopUpPurchaseCheckoutCall) => sessionFor(call, { amount_total: 1 }),
    );

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toBeInstanceOf(TopUpPurchaseCheckoutIndeterminateError);
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      errorCode: TOP_UP_PURCHASE_ERROR_CODES.providerContractMismatch,
    });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('carries the persistence failure when the indeterminate mark also fails', async () => {
    const { dependencies, store } = mocks();
    const providerError = new Error('socket hang up');
    (dependencies.createSession as ReturnType<typeof vi.fn>).mockRejectedValue(providerError);
    const markError = new Error('database unreachable');
    store.markIndeterminate.mockRejectedValue(markError);

    const error = await orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies)
      .then(() => null, (thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TopUpPurchaseCheckoutIndeterminateError);
    expect((error as TopUpPurchaseCheckoutIndeterminateError).providerError).toBe(providerError);
    expect((error as TopUpPurchaseCheckoutIndeterminateError).persistenceError).toBe(markError);
  });

  it('refuses to say "created" when completion was not confirmed', async () => {
    const { dependencies, store } = mocks();
    store.complete.mockRejectedValue(new Error('database unreachable'));

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toBeInstanceOf(TopUpPurchaseCheckoutPersistenceError);
    // The Session exists. Releasing or re-marking the row here would invite a
    // second create for an intent that already has one.
    expect(store.fail).not.toHaveBeenCalled();
    expect(store.markIndeterminate).not.toHaveBeenCalled();
  });

  it('refuses a claimed row with no owner token instead of proceeding unowned', async () => {
    const { dependencies, store } = mocks(claimed({ claimToken: null }));

    await expect(orchestrateTopUpPurchaseCheckout(orchestrationInput(), dependencies))
      .rejects.toThrow(/owner token/i);
    expect(store.beginSubmission).not.toHaveBeenCalled();
  });
});

describe('the service-role operation store', () => {
  function storeWith(rpc: ReturnType<typeof vi.fn>) {
    return new SupabaseTopUpPurchaseOperationStore({ rpc } as never);
  }

  const claimInput = {
    workspaceId: WORKSPACE_ID,
    operationId: OPERATION_ID,
    topUpId: 'text_1000' as const,
    resourceCode: 'text_segments',
    units: 1_000,
    catalogVersion: PRICING_CATALOG_VERSION,
    livemode: false,
    priceId: 'price_text1000pack',
    productId: 'prod_textPack0001',
    unitAmountCents: 4_200,
    stripeIdempotencyKey: `lgq:billing:v1:top_up_purchase.create:${'a'.repeat(64)}`,
  };

  it('sends every claim parameter the RPC declares, under its exact names', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        claim_status: 'claimed',
        operation_pk: OPERATION_PK,
        claim_token: CLAIM_TOKEN,
        state: 'claimed',
        provider_object_id: null,
      }],
      error: null,
    }));

    await expect(storeWith(rpc).claim(claimInput)).resolves.toEqual({
      status: 'claimed',
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      operationState: 'claimed',
      providerObjectId: null,
    });
    expect(rpc).toHaveBeenCalledWith('claim_stripe_top_up_purchase', {
      p_account_id: WORKSPACE_ID,
      p_operation_id: OPERATION_ID,
      p_top_up_id: 'text_1000',
      p_resource_code: 'text_segments',
      p_units: 1_000,
      p_catalog_version: PRICING_CATALOG_VERSION,
      p_livemode: false,
      p_stripe_price_id: 'price_text1000pack',
      p_stripe_product_id: 'prod_textPack0001',
      p_unit_amount_cents: 4_200,
      p_stripe_idempotency_key: claimInput.stripeIdempotencyKey,
    });
  });

  it("reads the RPC's `state` column, which is not named operation_state", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        claim_status: 'replayed',
        operation_pk: OPERATION_PK,
        claim_token: null,
        state: 'checkout_created',
        provider_object_id: 'cs_test_topUp123',
      }],
      error: null,
    }));

    await expect(storeWith(rpc).claim(claimInput)).resolves.toMatchObject({
      status: 'replayed',
      operationState: 'checkout_created',
      providerObjectId: 'cs_test_topUp123',
    });
  });

  it.each([
    ['replay', 'the subscription ledger\'s word'],
    ['in_progress', 'a status this ledger never returns'],
  ])('refuses claim status %s rather than guessing what it meant', async (claimStatus) => {
    const rpc = vi.fn(async () => ({
      data: [{
        claim_status: claimStatus,
        operation_pk: OPERATION_PK,
        claim_token: CLAIM_TOKEN,
        state: 'claimed',
        provider_object_id: null,
      }],
      error: null,
    }));
    await expect(storeWith(rpc).claim(claimInput)).rejects.toThrow(/unsupported status/i);
  });

  it.each([
    ['an unsupported state', { state: 'activated' }, /unsupported operation state/i],
    ['a malformed Session ID', { provider_object_id: 'sess_123' }, /provider object ID is invalid/i],
    ['a claimed row with no token', { claim_token: null }, /owned, claimed row/i],
  ])('refuses a claim row with %s', async (_label, override, pattern) => {
    const rpc = vi.fn(async () => ({
      data: [{
        claim_status: 'claimed',
        operation_pk: OPERATION_PK,
        claim_token: CLAIM_TOKEN,
        state: 'claimed',
        provider_object_id: null,
        ...override,
      }],
      error: null,
    }));
    await expect(storeWith(rpc).claim(claimInput)).rejects.toThrow(pattern);
  });

  it('does not treat a database error or an empty result as a claim', async () => {
    await expect(storeWith(vi.fn(async () => ({ data: null, error: { message: 'permission denied' } })))
      .claim(claimInput)).rejects.toThrow(/permission denied/);
    await expect(storeWith(vi.fn(async () => ({ data: [], error: null })))
      .claim(claimInput)).rejects.toThrow(/no operation row/i);
  });

  it('requires each transition RPC to confirm, not merely to return', async () => {
    const unconfirmed = vi.fn(async () => ({ data: false, error: null }));
    const store = storeWith(unconfirmed);
    const owner = { operationPk: OPERATION_PK, claimToken: CLAIM_TOKEN };

    await expect(store.beginSubmission({ ...owner, requestFingerprint: 'a'.repeat(64) }))
      .rejects.toThrow(/did not confirm/i);
    await expect(store.complete({ ...owner, checkoutSessionId: 'cs_test_topUp123' }))
      .rejects.toThrow(/did not confirm/i);
    await expect(store.markIndeterminate({ ...owner, errorCode: 'provider_request_failed' }))
      .rejects.toThrow(/did not confirm/i);
    await expect(store.fail({ ...owner, errorCode: 'submission_not_recorded' }))
      .rejects.toThrow(/did not confirm/i);
  });

  it('refuses an error code the ledger CHECK would reject, before sending it', async () => {
    // last_error carries ^[a-z][a-z0-9_]{2,63}$. A free-text audit string like
    // the subscription ledger's raises rather than being ignored.
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const store = storeWith(rpc);
    const owner = { operationPk: OPERATION_PK, claimToken: CLAIM_TOKEN };

    for (const errorCode of ['Error: socket hang up', 'UPPER_CASE', 'no', '1_leading_digit', '']) {
      await expect(store.markIndeterminate({ ...owner, errorCode }))
        .rejects.toThrow(/ledger-legal code/i);
      await expect(store.fail({ ...owner, errorCode }))
        .rejects.toThrow(/ledger-legal code/i);
    }
    expect(rpc).not.toHaveBeenCalled();

    for (const errorCode of Object.values(TOP_UP_PURCHASE_ERROR_CODES)) {
      expect(errorCode).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      await expect(store.fail({ ...owner, errorCode })).resolves.toBeUndefined();
    }
  });

  it('names each transition RPC exactly as the migration declares it', async () => {
    // Typed params on purpose: an untyped vi.fn gives mock.calls the empty
    // tuple, so the assertions below become compile errors rather than checks.
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => (
      { data: true, error: null }
    ));
    const store = storeWith(rpc);
    const owner = { operationPk: OPERATION_PK, claimToken: CLAIM_TOKEN };

    await store.beginSubmission({ ...owner, requestFingerprint: 'b'.repeat(64) });
    await store.complete({ ...owner, checkoutSessionId: 'cs_test_topUp123' });
    await store.markIndeterminate({ ...owner, errorCode: 'provider_request_failed' });
    await store.fail({ ...owner, errorCode: 'submission_not_recorded' });

    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'begin_stripe_top_up_purchase_submission',
      'complete_stripe_top_up_purchase',
      'mark_stripe_top_up_purchase_indeterminate',
      'fail_stripe_top_up_purchase',
    ]);
    expect(rpc.mock.calls[0][1]).toEqual({
      p_operation_pk: OPERATION_PK,
      p_claim_token: CLAIM_TOKEN,
      p_request_fingerprint: 'b'.repeat(64),
    });
    expect(rpc.mock.calls[2][1]).toEqual({
      p_operation_pk: OPERATION_PK,
      p_claim_token: CLAIM_TOKEN,
      p_error_code: 'provider_request_failed',
    });
  });
});
