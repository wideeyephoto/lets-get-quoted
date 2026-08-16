import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests must inject the operation store');
  },
}));

import {
  DirectCheckoutOperationIndeterminateError,
  DirectCheckoutOperationPersistenceError,
  DirectCheckoutSessionVerificationError,
  DirectCheckoutOperationUnavailableError,
  SupabaseDirectCheckoutOperationStore,
  orchestrateOneOffDirectCheckout,
  type DirectCheckoutClaim,
  type DirectCheckoutClaimInput,
  type DirectCheckoutOperationDependencies,
  type DirectCheckoutOperationStore,
  type OneOffDirectCheckoutOperationInput,
} from '@/lib/billing/direct-checkout-operation';
import { createPaymentFeeSnapshot } from '@/lib/billing/payment-fee';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const PAYMENT_ID = '20000000-0000-4000-8000-000000000002';
const OPERATION_PK = '30000000-0000-4000-8000-000000000003';
const CLAIM_TOKEN = '40000000-0000-4000-8000-000000000004';
const MERCHANT_ACCOUNT_ID = 'acct_merchant123';
const NOW_EPOCH_SECONDS = 1_800_000_000;

function session(
  id = 'cs_test_direct123',
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    currency: 'usd',
    amount_subtotal: 25_000,
    amount_total: 25_000,
    metadata: {
      source: 'invoice',
      lgq_charge_model: 'merchant_direct_v1',
      lgq_merchant_account_id: MERCHANT_ACCOUNT_ID,
      lgq_operation_id: `payment:${PAYMENT_ID}:checkout`,
      lgq_payment_id: PAYMENT_ID,
      lgq_workspace_id: ACCOUNT_ID,
    },
    payment_method_types: ['card'],
    recovered_from: null,
    status: 'open',
    payment_status: 'unpaid',
    url: 'https://checkout.stripe.com/c/pay/cs_test_direct123',
    expires_at: NOW_EPOCH_SECONDS + 3_600,
    ...overrides,
  } as Stripe.Checkout.Session;
}

function claimed(overrides: Partial<DirectCheckoutClaim> = {}): DirectCheckoutClaim {
  return {
    status: 'claimed',
    operationPk: OPERATION_PK,
    claimToken: CLAIM_TOKEN,
    operationState: 'claimed',
    providerObjectId: null,
    ...overrides,
  };
}

function operationInput(): OneOffDirectCheckoutOperationInput {
  return {
    accountId: ACCOUNT_ID,
    paymentId: PAYMENT_ID,
    merchantAccountId: MERCHANT_ACCOUNT_ID,
    livemode: false,
    operationId: `payment:${PAYMENT_ID}:checkout`,
    feeSnapshot: createPaymentFeeSnapshot({
      plan: 'growth',
      grossAmountCents: 25_000,
      eligibleServiceSubtotalCents: 20_000,
    }),
    checkout: {
      lineItemName: 'Contractor invoice',
      successUrl: 'http://localhost:3010/payment/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:3010/payment/cancel',
      customerEmail: 'homeowner@example.com',
      metadata: { source: 'invoice' },
    },
  };
}

function mocks(claimResult: DirectCheckoutClaim = claimed()) {
  const store = {
    findSucceededReplay: vi.fn<DirectCheckoutOperationStore['findSucceededReplay']>().mockResolvedValue(null),
    claim: vi.fn<DirectCheckoutOperationStore['claim']>().mockResolvedValue(claimResult),
    beginSubmission: vi.fn<DirectCheckoutOperationStore['beginSubmission']>().mockResolvedValue(undefined),
    complete: vi.fn<DirectCheckoutOperationStore['complete']>().mockResolvedValue(undefined),
    markIndeterminate: vi.fn<DirectCheckoutOperationStore['markIndeterminate']>().mockResolvedValue(undefined),
  } satisfies DirectCheckoutOperationStore;
  const createSession = vi.fn<DirectCheckoutOperationDependencies['createSession']>()
    .mockResolvedValue(session());
  const retrieveSession = vi.fn<DirectCheckoutOperationDependencies['retrieveSession']>()
    .mockResolvedValue(session());
  const nowEpochSeconds = vi.fn<DirectCheckoutOperationDependencies['nowEpochSeconds']>()
    .mockReturnValue(NOW_EPOCH_SECONDS);
  return {
    store,
    createSession,
    retrieveSession,
    nowEpochSeconds,
    dependencies: {
      store,
      createSession,
      retrieveSession,
      nowEpochSeconds,
    } satisfies DirectCheckoutOperationDependencies,
  };
}

function resolvedSelectQuery(data: unknown[]) {
  const filter = {
    eq: vi.fn(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
  };
  filter.eq.mockReturnValue(filter);
  return {
    select: vi.fn().mockReturnValue(filter),
    filter,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('durable one-off direct Checkout orchestration', () => {
  it('loads an exact succeeded replay without consulting mutable Merchant readiness', async () => {
    const feeSnapshot = operationInput().feeSnapshot;
    const claimInput: DirectCheckoutClaimInput = {
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      livemode: false,
      operationId: `payment:${PAYMENT_ID}:checkout`,
      stripeIdempotencyKey: `lgq:direct:v1:checkout_session.create:${'a'.repeat(64)}`,
      requestFingerprint: 'b'.repeat(64),
      feeSnapshot,
    };
    const operationQuery = resolvedSelectQuery([{
      id: OPERATION_PK,
      account_id: ACCOUNT_ID,
      payment_id: PAYMENT_ID,
      operation_type: 'checkout_session.create',
      operation_id: claimInput.operationId,
      charge_model: 'direct',
      stripe_account_id: MERCHANT_ACCOUNT_ID,
      livemode: false,
      stripe_idempotency_key: claimInput.stripeIdempotencyKey,
      request_fingerprint: claimInput.requestFingerprint,
      state: 'succeeded',
      provider_object_id: 'cs_test_recorded123',
      metadata: {
        schema: 'one_off_direct_checkout_v1',
        fee_snapshot: {
          plan_code: feeSnapshot.planCode,
          catalog_version: feeSnapshot.catalogVersion,
          fee_rate_bps: feeSnapshot.feeRateBps,
          fee_rate: feeSnapshot.feeRate,
          gross_amount_cents: feeSnapshot.grossAmountCents,
          eligible_service_subtotal_cents: feeSnapshot.eligibleServiceSubtotalCents,
          application_fee_cents: feeSnapshot.applicationFeeCents,
        },
      },
    }]);
    const paymentQuery = resolvedSelectQuery([{
      id: PAYMENT_ID,
      account_id: ACCOUNT_ID,
      amount: feeSnapshot.grossAmountCents / 100,
      fee_basis_amount: feeSnapshot.eligibleServiceSubtotalCents / 100,
      platform_fee: feeSnapshot.applicationFeeCents / 100,
      fee_plan_code: feeSnapshot.planCode,
      fee_catalog_version: feeSnapshot.catalogVersion,
      fee_rate_bps: feeSnapshot.feeRateBps,
      fee_rate: feeSnapshot.feeRate,
      charge_model: 'direct',
      stripe_account_id: MERCHANT_ACCOUNT_ID,
      stripe_livemode: false,
      stripe_checkout_session: 'cs_test_recorded123',
    }]);
    const admin = {
      from: vi.fn((table: string) => table === 'billing_payment_operations'
        ? operationQuery
        : paymentQuery),
    };
    const store = new SupabaseDirectCheckoutOperationStore(admin as never);

    const replay = await store.findSucceededReplay(claimInput);

    expect(replay).toEqual({
      status: 'replay',
      operationPk: OPERATION_PK,
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    expect(admin.from.mock.calls.map(([table]) => table)).toEqual([
      'billing_payment_operations',
      'payments',
    ]);
  });

  it.each([
    ['gross amount', { amount: 249.99 }],
    ['fee basis', { fee_basis_amount: 199.99 }],
    ['application fee', { platform_fee: 0.49 }],
    ['plan', { fee_plan_code: 'solo' }],
    ['catalog', { fee_catalog_version: 'stale-catalog' }],
    ['basis points', { fee_rate_bps: 24 }],
    ['decimal fee rate', { fee_rate: 0.0024 }],
  ])('rejects a succeeded replay whose persisted payment %s changed', async (_label, paymentOverride) => {
    const feeSnapshot = operationInput().feeSnapshot;
    const claimInput: DirectCheckoutClaimInput = {
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      livemode: false,
      operationId: `payment:${PAYMENT_ID}:checkout`,
      stripeIdempotencyKey: `lgq:direct:v1:checkout_session.create:${'a'.repeat(64)}`,
      requestFingerprint: 'b'.repeat(64),
      feeSnapshot,
    };
    const operationQuery = resolvedSelectQuery([{
      id: OPERATION_PK,
      account_id: ACCOUNT_ID,
      payment_id: PAYMENT_ID,
      operation_type: 'checkout_session.create',
      operation_id: claimInput.operationId,
      charge_model: 'direct',
      stripe_account_id: MERCHANT_ACCOUNT_ID,
      livemode: false,
      stripe_idempotency_key: claimInput.stripeIdempotencyKey,
      request_fingerprint: claimInput.requestFingerprint,
      state: 'succeeded',
      provider_object_id: 'cs_test_recorded123',
      metadata: {
        schema: 'one_off_direct_checkout_v1',
        fee_snapshot: {
          plan_code: feeSnapshot.planCode,
          catalog_version: feeSnapshot.catalogVersion,
          fee_rate_bps: feeSnapshot.feeRateBps,
          fee_rate: feeSnapshot.feeRate,
          gross_amount_cents: feeSnapshot.grossAmountCents,
          eligible_service_subtotal_cents: feeSnapshot.eligibleServiceSubtotalCents,
          application_fee_cents: feeSnapshot.applicationFeeCents,
        },
      },
    }]);
    const paymentQuery = resolvedSelectQuery([{
      id: PAYMENT_ID,
      account_id: ACCOUNT_ID,
      amount: feeSnapshot.grossAmountCents / 100,
      fee_basis_amount: feeSnapshot.eligibleServiceSubtotalCents / 100,
      platform_fee: feeSnapshot.applicationFeeCents / 100,
      fee_plan_code: feeSnapshot.planCode,
      fee_catalog_version: feeSnapshot.catalogVersion,
      fee_rate_bps: feeSnapshot.feeRateBps,
      fee_rate: feeSnapshot.feeRate,
      charge_model: 'direct',
      stripe_account_id: MERCHANT_ACCOUNT_ID,
      stripe_livemode: false,
      stripe_checkout_session: 'cs_test_recorded123',
      ...paymentOverride,
    }]);
    const admin = {
      from: vi.fn((table: string) => table === 'billing_payment_operations'
        ? operationQuery
        : paymentQuery),
    };
    const store = new SupabaseDirectCheckoutOperationStore(admin as never);

    await expect(store.findSucceededReplay(claimInput))
      .rejects.toThrow(/not reconciled to its exact payment/i);
  });

  it('claims exact immutable cents, submits once, and atomically records the provider ID', async () => {
    const input = operationInput();
    const { dependencies, store, createSession, retrieveSession } = mocks();

    const result = await orchestrateOneOffDirectCheckout(input, dependencies);

    expect(result).toEqual({
      outcome: 'created',
      operationPk: OPERATION_PK,
      sessionId: 'cs_test_direct123',
      presentation: {
        state: 'reusable_open',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_direct123',
        providerStatus: 'open',
        providerPaymentStatus: 'unpaid',
        expiresAt: NOW_EPOCH_SECONDS + 3_600,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.presentation)).toBe(true);
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      livemode: false,
      operationId: input.operationId,
      feeSnapshot: expect.objectContaining({
        grossAmountCents: 25_000,
        eligibleServiceSubtotalCents: 20_000,
        applicationFeeCents: 50,
        feeRateBps: 25,
      }),
      stripeIdempotencyKey: expect.stringMatching(/^lgq:direct:v1:checkout_session\.create:[0-9a-f]{64}$/),
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(store.beginSubmission).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
    });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: input.operationId,
      amountCents: 25_000,
      applicationFeeAmountCents: 50,
      metadata: {
        source: 'invoice',
        lgq_workspace_id: ACCOUNT_ID,
        lgq_payment_id: PAYMENT_ID,
      },
    }));
    expect(store.complete).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: 'cs_test_direct123',
    });
    expect(store.markIndeterminate).not.toHaveBeenCalled();
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('replays a succeeded claim as a reusable open URL without creating again', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, store, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(session('cs_test_recorded123'));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result.outcome).toBe('replayed');
    expect(result.presentation).toMatchObject({
      state: 'reusable_open',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_direct123',
    });
    expect(retrieveSession).toHaveBeenCalledWith({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      checkoutSessionId: 'cs_test_recorded123',
    });
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('reuses the same still-open Session after a Checkout cancel return', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(session('cs_test_recorded123'));

    const firstReturn = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);
    const secondReturn = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(firstReturn.presentation).toMatchObject({ state: 'reusable_open' });
    expect(secondReturn.presentation).toMatchObject({ state: 'reusable_open' });
    expect(retrieveSession).toHaveBeenCalledTimes(2);
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    ['provider-expired', { status: 'expired', payment_status: 'unpaid' }],
    ['locally-expired', { status: 'open', payment_status: 'unpaid', expires_at: NOW_EPOCH_SECONDS }],
  ] as const)('returns expired-unpaid without exposing a Checkout URL for %s Sessions', async (_label, override) => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(session('cs_test_recorded123', override));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result.presentation).toMatchObject({ state: 'expired_unpaid' });
    expect(result.presentation).not.toHaveProperty('checkoutUrl');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('returns complete/paid Sessions as payment-confirming without exposing their URL', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(session('cs_test_recorded123', {
      status: 'complete',
      payment_status: 'paid',
    }));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result.presentation).toEqual({
      state: 'payment_confirming',
      providerStatus: 'complete',
      providerPaymentStatus: 'paid',
      expiresAt: NOW_EPOCH_SECONDS + 3_600,
    });
    expect(result.presentation).not.toHaveProperty('checkoutUrl');
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    ['open', 'paid', 'open_session_reports_payment'],
    ['complete', 'unpaid', 'complete_session_reports_unpaid'],
    ['expired', 'paid', 'expired_session_reports_payment'],
    ['complete', 'no_payment_required', 'positive_payment_reports_no_payment_required'],
  ] as const)(
    'marks the contradictory %s/%s lifecycle for manual reconciliation',
    async (status, paymentStatus, reason) => {
      const replay = claimed({
        status: 'replay',
        claimToken: null,
        operationState: 'succeeded',
        providerObjectId: 'cs_test_recorded123',
      });
      const { dependencies, createSession, retrieveSession } = mocks(replay);
      retrieveSession.mockResolvedValue(session('cs_test_recorded123', {
        status,
        payment_status: paymentStatus,
      }));

      const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

      expect(result.presentation).toMatchObject({
        state: 'manual_reconciliation',
        reason,
      });
      expect(result.presentation).not.toHaveProperty('checkoutUrl');
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it('does not recheck submission readiness for an exact succeeded replay', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, store, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(session('cs_test_recorded123'));
    store.findSucceededReplay.mockResolvedValue(replay);
    store.claim.mockRejectedValue(new Error('merchant readiness is stale'));
    store.beginSubmission.mockRejectedValue(new Error('merchant readiness is stale'));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result.presentation).toMatchObject({ state: 'reusable_open' });
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('recovers an exact replay that wins the race after the initial lookup', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, store, createSession, retrieveSession } = mocks();
    store.findSucceededReplay.mockResolvedValueOnce(null).mockResolvedValueOnce(replay);
    store.claim.mockRejectedValue(new Error('merchant readiness changed'));
    retrieveSession.mockResolvedValue(session('cs_test_recorded123'));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result.outcome).toBe('replayed');
    expect(store.findSucceededReplay).toHaveBeenCalledTimes(2);
    expect(retrieveSession).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('creates at most once and then retrieves the frozen Session on a later return', async () => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_direct123',
    });
    const { dependencies, store, createSession, retrieveSession } = mocks();
    store.claim.mockResolvedValueOnce(claimed()).mockResolvedValueOnce(replay);

    const first = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);
    const second = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('replayed');
    expect(first.sessionId).toBe(second.sessionId);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(retrieveSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['wrong Session ID', session('cs_test_wrong123')],
    ['wrong livemode', session('cs_test_recorded123', { livemode: true })],
    ['wrong mode', session('cs_test_recorded123', { mode: 'subscription' })],
    ['wrong currency', session('cs_test_recorded123', { currency: 'cad' })],
    ['wrong subtotal', session('cs_test_recorded123', { amount_subtotal: 24_999 })],
    ['wrong gross amount', session('cs_test_recorded123', { amount_total: 24_999 })],
    ['wrong payment methods', session('cs_test_recorded123', { payment_method_types: ['card', 'cashapp'] })],
    ['recovered Session', session('cs_test_recorded123', { recovered_from: 'cs_test_abandoned123' })],
    ['wrong merchant account', session('cs_test_recorded123', {
      metadata: {
        ...session().metadata,
        lgq_merchant_account_id: 'acct_wrongmerchant123',
      },
    })],
    ['wrong charge model', session('cs_test_recorded123', {
      metadata: {
        ...session().metadata,
        lgq_charge_model: 'destination',
      },
    })],
    ['wrong operation', session('cs_test_recorded123', {
      metadata: {
        ...session().metadata,
        lgq_operation_id: 'payment:other:checkout',
      },
    })],
    ['wrong payment', session('cs_test_recorded123', {
      metadata: {
        ...session().metadata,
        lgq_payment_id: '20000000-0000-4000-8000-000000000099',
      },
    })],
    ['wrong workspace', session('cs_test_recorded123', {
      metadata: {
        ...session().metadata,
        lgq_workspace_id: '10000000-0000-4000-8000-000000000099',
      },
    })],
  ])('fails closed when a replay returns %s', async (_label, providerSession) => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, store, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(providerSession);

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutSessionVerificationError);
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    null,
    'http://checkout.stripe.com/c/pay/cs_test_recorded123',
    'https://evil.example/c/pay/cs_test_recorded123',
    'https://user:password@checkout.stripe.com/c/pay/cs_test_recorded123',
  ])('fails closed when an open Session has an untrusted hosted URL: %s', async (url) => {
    const replay = claimed({
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      providerObjectId: 'cs_test_recorded123',
    });
    const { dependencies, createSession, retrieveSession } = mocks(replay);
    retrieveSession.mockResolvedValue(session('cs_test_recorded123', { url }));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutSessionVerificationError);
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each([
    ['in_progress', 'claimed'],
    ['submitted', 'submitted'],
    ['indeterminate', 'indeterminate'],
    ['failed', 'failed'],
  ] as const)('fails closed for a %s claim and never contacts Stripe', async (status, operationState) => {
    const { dependencies, store, createSession, retrieveSession } = mocks(claimed({
      status,
      claimToken: null,
      operationState,
    }));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toEqual(expect.objectContaining({
        name: DirectCheckoutOperationUnavailableError.name,
        operationState,
      }));
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(retrieveSession).not.toHaveBeenCalled();
  });

  it('marks every post-submission Stripe error indeterminate and never completes or retries', async () => {
    const { dependencies, store, createSession } = mocks();
    const providerError = new Error('socket closed after request write');
    createSession.mockRejectedValue(providerError);

    const thrown = await orchestrateOneOffDirectCheckout(operationInput(), dependencies).catch((error) => error);

    expect(thrown).toBeInstanceOf(DirectCheckoutOperationIndeterminateError);
    expect(thrown.providerError).toBe(providerError);
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      error: 'Error: socket closed after request write',
    });
    expect(store.complete).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('preserves both provider and database errors if indeterminate persistence also fails', async () => {
    const { dependencies, store, createSession } = mocks();
    const providerError = new Error('provider timeout');
    const persistenceError = new Error('database unavailable');
    createSession.mockRejectedValue(providerError);
    store.markIndeterminate.mockRejectedValue(persistenceError);

    const thrown = await orchestrateOneOffDirectCheckout(operationInput(), dependencies).catch((error) => error);

    expect(thrown).toBeInstanceOf(DirectCheckoutOperationIndeterminateError);
    expect(thrown.providerError).toBe(providerError);
    expect(thrown.persistenceError).toBe(persistenceError);
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('does not downgrade or retry when Stripe succeeds but durable completion is unconfirmed', async () => {
    const { dependencies, store, createSession } = mocks();
    const persistenceError = new Error('completion response lost');
    store.complete.mockRejectedValue(persistenceError);

    const thrown = await orchestrateOneOffDirectCheckout(operationInput(), dependencies).catch((error) => error);

    expect(thrown).toBeInstanceOf(DirectCheckoutOperationPersistenceError);
    expect(thrown.persistenceError).toBe(persistenceError);
    expect(store.markIndeterminate).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('treats a malformed provider object ID as indeterminate', async () => {
    const { dependencies, store, createSession } = mocks();
    createSession.mockResolvedValue(session('not_a_checkout_session'));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutOperationIndeterminateError);
    expect(store.markIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringMatching(/does not exactly match the claimed direct-payment contract/),
    }));
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('validates the create response contract before durably completing the operation', async () => {
    const { dependencies, store, createSession } = mocks();
    createSession.mockResolvedValue(session('cs_test_direct123', { amount_total: 24_999 }));

    const thrown = await orchestrateOneOffDirectCheckout(operationInput(), dependencies)
      .catch((error) => error);

    expect(thrown).toBeInstanceOf(DirectCheckoutOperationIndeterminateError);
    expect(thrown.providerError).toBeInstanceOf(DirectCheckoutSessionVerificationError);
    expect(store.markIndeterminate).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it('copies caller-owned fee and metadata objects before the first await', async () => {
    const input = operationInput();
    const mutableFee = { ...input.feeSnapshot };
    const mutableMetadata = { source: 'invoice' };
    const mutableInput = {
      ...input,
      feeSnapshot: mutableFee,
      checkout: { ...input.checkout, metadata: mutableMetadata },
    };
    const { dependencies, store, createSession } = mocks();
    store.claim.mockImplementation(async (claimInput) => {
      mutableFee.grossAmountCents = 99_999;
      mutableFee.applicationFeeCents = 99_999;
      mutableMetadata.source = 'changed';
      expect(claimInput.feeSnapshot.grossAmountCents).toBe(25_000);
      expect(Object.isFrozen(claimInput.feeSnapshot)).toBe(true);
      return claimed();
    });

    await orchestrateOneOffDirectCheckout(mutableInput, dependencies);

    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      amountCents: 25_000,
      applicationFeeAmountCents: 50,
      metadata: {
        source: 'invoice',
        lgq_workspace_id: ACCOUNT_ID,
        lgq_payment_id: PAYMENT_ID,
      },
    }));
  });

  it('never contacts Stripe if the database refuses the submitted transition', async () => {
    const { dependencies, store, createSession } = mocks();
    store.beginSubmission.mockRejectedValue(new Error('merchant readiness became stale'));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toThrow(/readiness became stale/);
    expect(createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.markIndeterminate).not.toHaveBeenCalled();
  });

  it('rejects a process-key/payment livemode mismatch before taking a database claim', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_not-a-real-key');
    const { dependencies, store, createSession } = mocks();

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toThrow(/livemode does not match/i);
    expect(store.claim).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
