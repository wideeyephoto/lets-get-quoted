import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests must inject the operation store');
  },
}));

import {
  DirectCheckoutGenerationLimitError,
  DirectCheckoutOperationIndeterminateError,
  DirectCheckoutOperationPersistenceError,
  DirectCheckoutOperationUnavailableError,
  DirectCheckoutSessionVerificationError,
  SupabaseDirectCheckoutOperationStore,
  orchestrateOneOffDirectCheckout,
  type DirectCheckoutClaim,
  type DirectCheckoutCurrentAttempt,
  type DirectCheckoutOperationDependencies,
  type DirectCheckoutOperationStore,
  type OneOffDirectCheckoutOperationInput,
} from '@/lib/billing/direct-checkout-operation';
import { createPaymentFeeSnapshot } from '@/lib/billing/payment-fee';
import { buildDirectCheckoutSessionCall } from '@/lib/billing/stripe-direct';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const PAYMENT_ID = '20000000-0000-4000-8000-000000000002';
const OPERATION_PK_1 = '30000000-0000-4000-8000-000000000003';
const OPERATION_PK_2 = '30000000-0000-4000-8000-000000000004';
const CLAIM_TOKEN = '40000000-0000-4000-8000-000000000004';
const MERCHANT_ACCOUNT_ID = 'acct_merchant123';
const NOW_EPOCH_SECONDS = 1_800_000_000;
const EXPIRES_AT = NOW_EPOCH_SECONDS + 3_600;

function operationInput(): OneOffDirectCheckoutOperationInput {
  return {
    accountId: ACCOUNT_ID,
    paymentId: PAYMENT_ID,
    merchantAccountId: MERCHANT_ACCOUNT_ID,
    livemode: false,
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

function operationId(generation: number) {
  return `payment:${PAYMENT_ID}:checkout:${generation}`;
}

function operationCall(generation: number, predecessorSessionId: string | null = null) {
  const input = operationInput();
  return buildDirectCheckoutSessionCall({
    ...input.checkout,
    merchantAccountId: MERCHANT_ACCOUNT_ID,
    operationId: operationId(generation),
    amountCents: input.feeSnapshot.grossAmountCents,
    applicationFeeAmountCents: input.feeSnapshot.applicationFeeCents,
    metadata: {
      source: 'invoice',
      lgq_workspace_id: ACCOUNT_ID,
      lgq_payment_id: PAYMENT_ID,
      lgq_checkout_generation: String(generation),
      ...(predecessorSessionId
        ? { lgq_checkout_predecessor_session_id: predecessorSessionId }
        : {}),
    },
  });
}

function session(
  id = 'cs_test_generation1',
  generation = 1,
  predecessorSessionId: string | null = null,
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
      lgq_workspace_id: ACCOUNT_ID,
      lgq_payment_id: PAYMENT_ID,
      lgq_checkout_generation: String(generation),
      ...(predecessorSessionId
        ? { lgq_checkout_predecessor_session_id: predecessorSessionId }
        : {}),
      lgq_charge_model: 'merchant_direct_v1',
      lgq_merchant_account_id: MERCHANT_ACCOUNT_ID,
      lgq_operation_id: operationId(generation),
    },
    payment_method_types: ['card'],
    recovered_from: null,
    after_expiration: null,
    status: 'open',
    payment_status: 'unpaid',
    url: `https://checkout.stripe.com/c/pay/${id}`,
    expires_at: EXPIRES_AT,
    ...overrides,
  } as Stripe.Checkout.Session;
}

function claimed(
  generation = 1,
  overrides: Partial<DirectCheckoutClaim> = {},
): DirectCheckoutClaim {
  return {
    status: 'claimed',
    operationPk: generation === 1 ? OPERATION_PK_1 : OPERATION_PK_2,
    claimToken: CLAIM_TOKEN,
    operationState: 'claimed',
    providerObjectId: null,
    checkoutGeneration: generation,
    checkoutLifecycle: null,
    checkoutSessionExpiresAt: null,
    predecessorOperationPk: generation === 1 ? null : OPERATION_PK_1,
    ...overrides,
  };
}

function currentAttempt(input: {
  generation?: number;
  lifecycle?: DirectCheckoutCurrentAttempt['checkoutLifecycle'];
  state?: DirectCheckoutCurrentAttempt['operationState'];
  sessionId?: string | null;
} = {}): DirectCheckoutCurrentAttempt {
  const generation = input.generation ?? 1;
  const state = input.state ?? 'succeeded';
  const providerObjectId = input.sessionId === undefined
    ? state === 'succeeded' ? `cs_test_generation${generation}` : null
    : input.sessionId;
  const predecessorProviderObjectId = generation === 1 ? null : 'cs_test_generation1';
  const call = operationCall(generation, predecessorProviderObjectId);
  return {
    operationPk: generation === 1 ? OPERATION_PK_1 : OPERATION_PK_2,
    operationState: state,
    providerObjectId,
    checkoutGeneration: generation,
    checkoutLifecycle: state === 'succeeded' ? input.lifecycle ?? 'open' : null,
    checkoutSessionExpiresAt: state === 'succeeded'
      ? new Date(EXPIRES_AT * 1_000).toISOString()
      : null,
    predecessorOperationPk: generation === 1 ? null : OPERATION_PK_1,
    predecessorProviderObjectId,
    operationId: operationId(generation),
    stripeIdempotencyKey: call.options.idempotencyKey,
    requestFingerprint: call.requestFingerprint,
  };
}

function mocks(options: {
  current?: DirectCheckoutCurrentAttempt | null;
  claim?: DirectCheckoutClaim;
} = {}) {
  const store = {
    findCurrent: vi.fn<DirectCheckoutOperationStore['findCurrent']>()
      .mockResolvedValue(options.current ?? null),
    claim: vi.fn<DirectCheckoutOperationStore['claim']>()
      .mockResolvedValue(options.claim ?? claimed()),
    beginSubmission: vi.fn<DirectCheckoutOperationStore['beginSubmission']>()
      .mockResolvedValue(undefined),
    complete: vi.fn<DirectCheckoutOperationStore['complete']>()
      .mockResolvedValue(undefined),
    markIndeterminate: vi.fn<DirectCheckoutOperationStore['markIndeterminate']>()
      .mockResolvedValue(undefined),
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
    dependencies: { store, createSession, retrieveSession, nowEpochSeconds },
  };
}

function resolvedSelectQuery(data: unknown[]) {
  const filter = { eq: vi.fn(), limit: vi.fn().mockResolvedValue({ data, error: null }) };
  filter.eq.mockReturnValue(filter);
  return { select: vi.fn().mockReturnValue(filter), filter };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not-a-real-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('generation-aware one-off direct Checkout orchestration', () => {
  it('creates generation one with canonical immutable identity and binds its expiry', async () => {
    const input = operationInput();
    const { dependencies, store, createSession } = mocks();

    const result = await orchestrateOneOffDirectCheckout(input, dependencies);

    expect(result).toMatchObject({
      outcome: 'created',
      operationPk: OPERATION_PK_1,
      sessionId: 'cs_test_generation1',
      checkoutGeneration: 1,
      presentation: { state: 'reusable_open' },
    });
    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      checkoutGeneration: 1,
      predecessorOperationPk: null,
      operationId: operationId(1),
      stripeIdempotencyKey: expect.stringMatching(
        /^lgq:direct:v1:checkout_session\.create:[0-9a-f]{64}$/,
      ),
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      operationId: operationId(1),
      metadata: expect.objectContaining({
        lgq_checkout_generation: '1',
        lgq_payment_id: PAYMENT_ID,
        lgq_workspace_id: ACCOUNT_ID,
      }),
    }));
    expect(store.complete).toHaveBeenCalledWith({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: 'cs_test_generation1',
      checkoutSessionExpiresAt: new Date(EXPIRES_AT * 1_000).toISOString(),
    });
  });

  it('snapshots every caller-owned identity and presentation field before the first await', async () => {
    const input = operationInput();
    const { dependencies, store, createSession } = mocks();
    store.findCurrent.mockImplementation(async () => {
      Object.assign(input as unknown as Record<string, unknown>, {
        accountId: '90000000-0000-4000-8000-000000000009',
        paymentId: '90000000-0000-4000-8000-000000000010',
        merchantAccountId: 'acct_mutated123',
        livemode: true,
      });
      Object.assign(input.checkout as unknown as Record<string, unknown>, {
        successUrl: 'https://attacker.invalid/success',
        cancelUrl: 'https://attacker.invalid/cancel',
      });
      Object.assign(input.checkout.metadata as Record<string, string>, {
        source: 'mutated-after-mode-check',
      });
      return null;
    });

    await orchestrateOneOffDirectCheckout(input, dependencies);

    expect(store.claim).toHaveBeenCalledWith(expect.objectContaining({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      livemode: false,
    }));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      successUrl: 'http://localhost:3010/payment/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'http://localhost:3010/payment/cancel',
      metadata: expect.objectContaining({ source: 'invoice' }),
    }));
  });

  it('reuses the exact current open Session after a cancel return', async () => {
    const current = currentAttempt();
    const { dependencies, store, createSession, retrieveSession } = mocks({ current });
    retrieveSession.mockResolvedValue(session(current.providerObjectId!));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result).toMatchObject({
      outcome: 'replayed',
      checkoutGeneration: 1,
      sessionId: current.providerObjectId,
      presentation: { state: 'reusable_open' },
    });
    expect(store.claim).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('does not append a successor until signed expiration evidence changes the DB lifecycle', async () => {
    const current = currentAttempt({ lifecycle: 'open' });
    const { dependencies, store, createSession, retrieveSession } = mocks({ current });
    retrieveSession.mockResolvedValue(session(current.providerObjectId!, 1, null, {
      status: 'expired',
      payment_status: 'unpaid',
    }));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result.presentation.state).toBe('expired_unpaid');
    expect(store.claim).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('appends generation two only from the exact expired-unpaid predecessor', async () => {
    const current = currentAttempt({ lifecycle: 'expired_unpaid' });
    const successorClaim = claimed(2);
    const { dependencies, store, createSession, retrieveSession } = mocks({
      current,
      claim: successorClaim,
    });
    retrieveSession.mockResolvedValue(session(current.providerObjectId!, 1, null, {
      status: 'expired',
      payment_status: 'unpaid',
      url: null,
    }));
    createSession.mockResolvedValue(session(
      'cs_test_generation2',
      2,
      current.providerObjectId,
    ));

    const result = await orchestrateOneOffDirectCheckout(operationInput(), dependencies);

    expect(result).toMatchObject({
      outcome: 'created',
      checkoutGeneration: 2,
      sessionId: 'cs_test_generation2',
    });
    const successorInput = store.claim.mock.calls[0][0];
    expect(successorInput).toMatchObject({
      checkoutGeneration: 2,
      predecessorOperationPk: OPERATION_PK_1,
      operationId: operationId(2),
    });
    expect(successorInput.stripeIdempotencyKey).not.toBe(current.stripeIdempotencyKey);
    expect(successorInput.requestFingerprint).not.toBe(current.requestFingerprint);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      operationId: operationId(2),
      metadata: expect.objectContaining({
        lgq_checkout_generation: '2',
        lgq_checkout_predecessor_session_id: current.providerObjectId,
      }),
    }));
  });

  it.each(['submitted', 'indeterminate'] as const)(
    'fails closed for a current %s generation without reading or mutating Stripe',
    async (state) => {
      const { dependencies, store, createSession, retrieveSession } = mocks({
        current: currentAttempt({ state }),
      });

      await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
        .rejects.toBeInstanceOf(DirectCheckoutOperationUnavailableError);
      expect(store.claim).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
      expect(retrieveSession).not.toHaveBeenCalled();
    },
  );

  it('requires operator review after the fifth expired generation', async () => {
    const current = currentAttempt({ generation: 5, lifecycle: 'expired_unpaid' });
    const { dependencies, store, createSession, retrieveSession } = mocks({ current });
    retrieveSession.mockResolvedValue(session(
      current.providerObjectId!,
      5,
      current.predecessorProviderObjectId,
      { status: 'expired', payment_status: 'unpaid', url: null },
    ));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toEqual(expect.objectContaining({
        name: DirectCheckoutGenerationLimitError.name,
        checkoutGeneration: 5,
      }));
    expect(store.claim).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects Stripe recovery semantics on a replay', async () => {
    const current = currentAttempt();
    const { dependencies, createSession, retrieveSession } = mocks({ current });
    retrieveSession.mockResolvedValue(session(current.providerObjectId!, 1, null, {
      after_expiration: {
        recovery: {
          allow_promotion_codes: false,
          enabled: true,
          expires_at: EXPIRES_AT + 60,
          url: 'https://checkout.stripe.com/c/pay/recovery',
        },
      },
    } as Partial<Stripe.Checkout.Session>));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutSessionVerificationError);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('marks a post-submission provider failure indeterminate and never completes', async () => {
    const { dependencies, store, createSession } = mocks();
    createSession.mockRejectedValue(new Error('socket closed after request write'));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutOperationIndeterminateError);
    expect(store.markIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      error: expect.stringContaining('socket closed'),
    }));
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('treats any non-open create response as indeterminate', async () => {
    const { dependencies, store, createSession } = mocks();
    createSession.mockResolvedValue(session('cs_test_generation1', 1, null, {
      status: 'complete',
      payment_status: 'paid',
      url: null,
    }));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutOperationIndeterminateError);
    expect(store.markIndeterminate).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('does not retry when provider completion persistence is unconfirmed', async () => {
    const { dependencies, store, createSession } = mocks();
    store.complete.mockRejectedValue(new Error('completion response lost'));

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectCheckoutOperationPersistenceError);
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(store.markIndeterminate).not.toHaveBeenCalled();
  });

  it('rejects test/live key drift before any durable or provider operation', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_not-a-real-key');
    const { dependencies, store, createSession } = mocks();

    await expect(orchestrateOneOffDirectCheckout(operationInput(), dependencies))
      .rejects.toThrow(/livemode does not match/i);
    expect(store.findCurrent).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('loads exactly the payment current pointer rather than scanning all generations', async () => {
    const feeSnapshot = operationInput().feeSnapshot;
    const call = operationCall(1);
    const paymentQuery = resolvedSelectQuery([{
      id: PAYMENT_ID,
      account_id: ACCOUNT_ID,
      amount: 250,
      fee_basis_amount: 200,
      platform_fee: 0.5,
      fee_plan_code: feeSnapshot.planCode,
      fee_catalog_version: feeSnapshot.catalogVersion,
      fee_rate_bps: feeSnapshot.feeRateBps,
      fee_rate: feeSnapshot.feeRate,
      charge_model: 'direct',
      stripe_account_id: MERCHANT_ACCOUNT_ID,
      stripe_livemode: false,
      stripe_checkout_session: 'cs_test_generation1',
      current_checkout_operation_pk: OPERATION_PK_1,
    }]);
    const operationQuery = resolvedSelectQuery([{
      id: OPERATION_PK_1,
      account_id: ACCOUNT_ID,
      payment_id: PAYMENT_ID,
      operation_type: 'checkout_session.create',
      operation_id: operationId(1),
      charge_model: 'direct',
      stripe_account_id: MERCHANT_ACCOUNT_ID,
      livemode: false,
      stripe_idempotency_key: call.options.idempotencyKey,
      request_fingerprint: call.requestFingerprint,
      state: 'succeeded',
      provider_object_id: 'cs_test_generation1',
      checkout_generation: 1,
      checkout_lifecycle: 'open',
      checkout_session_expires_at: new Date(EXPIRES_AT * 1_000).toISOString(),
      predecessor_operation_pk: null,
      superseded_by_operation_pk: null,
      metadata: {
        schema: 'one_off_direct_checkout_generation_v2',
        checkout_generation: 1,
        predecessor_operation_pk: null,
        predecessor_checkout_session_id: null,
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
    const admin = {
      from: vi.fn((table: string) => table === 'payments' ? paymentQuery : operationQuery),
    };
    const store = new SupabaseDirectCheckoutOperationStore(admin as never);

    const current = await store.findCurrent({
      accountId: ACCOUNT_ID,
      paymentId: PAYMENT_ID,
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      livemode: false,
      feeSnapshot,
    });

    expect(current).toMatchObject({
      operationPk: OPERATION_PK_1,
      checkoutGeneration: 1,
      checkoutLifecycle: 'open',
      operationId: operationId(1),
    });
    expect(operationQuery.filter.eq).toHaveBeenCalledWith('id', OPERATION_PK_1);
    expect(operationQuery.filter.eq).not.toHaveBeenCalledWith('payment_id', PAYMENT_ID);
  });
});
