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
  DirectCheckoutOperationUnavailableError,
  orchestrateOneOffDirectCheckout,
  type DirectCheckoutClaim,
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

function session(id = 'cs_test_direct123'): Stripe.Checkout.Session {
  return { id, object: 'checkout.session', url: 'https://checkout.stripe.test/session' } as Stripe.Checkout.Session;
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
    claim: vi.fn<DirectCheckoutOperationStore['claim']>().mockResolvedValue(claimResult),
    beginSubmission: vi.fn<DirectCheckoutOperationStore['beginSubmission']>().mockResolvedValue(undefined),
    complete: vi.fn<DirectCheckoutOperationStore['complete']>().mockResolvedValue(undefined),
    markIndeterminate: vi.fn<DirectCheckoutOperationStore['markIndeterminate']>().mockResolvedValue(undefined),
  } satisfies DirectCheckoutOperationStore;
  const createSession = vi.fn<DirectCheckoutOperationDependencies['createSession']>()
    .mockResolvedValue(session());
  const retrieveSession = vi.fn<DirectCheckoutOperationDependencies['retrieveSession']>()
    .mockResolvedValue(session());
  return {
    store,
    createSession,
    retrieveSession,
    dependencies: { store, createSession, retrieveSession } satisfies DirectCheckoutOperationDependencies,
  };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('durable one-off direct Checkout orchestration', () => {
  it('claims exact immutable cents, submits once, and atomically records the provider ID', async () => {
    const input = operationInput();
    const { dependencies, store, createSession, retrieveSession } = mocks();

    const result = await orchestrateOneOffDirectCheckout(input, dependencies);

    expect(result).toMatchObject({ outcome: 'created', operationPk: OPERATION_PK });
    expect(Object.isFrozen(result)).toBe(true);
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

  it('replays a succeeded claim by connected-account retrieval without creating again', async () => {
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
    expect(retrieveSession).toHaveBeenCalledWith({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      checkoutSessionId: 'cs_test_recorded123',
    });
    expect(store.beginSubmission).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
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
      error: expect.stringMatching(/invalid Checkout Session ID/),
    }));
    expect(store.complete).not.toHaveBeenCalled();
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
