import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests must inject the direct refund store');
  },
}));

import {
  DirectRefundOperationIndeterminateError,
  DirectRefundOperationPersistenceError,
  DirectRefundOperationUnavailableError,
  orchestrateDirectChargeRefund,
  type DirectRefundClaim,
  type DirectRefundOperationDependencies,
  type DirectRefundOperationInput,
  type DirectRefundOperationStore,
  type DirectRefundPlan,
  type ProviderResultSnapshot,
} from '@/lib/billing/direct-refund-operation';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const PAYMENT_ID = '20000000-0000-4000-8000-000000000002';
const AUTHORIZATION_ID = '30000000-0000-4000-8000-000000000003';
const OPERATION_PK = '40000000-0000-4000-8000-000000000004';
const CLAIM_TOKEN = '50000000-0000-4000-8000-000000000005';
const FEE_CLAIM_TOKEN = '60000000-0000-4000-8000-000000000006';
const MERCHANT_ACCOUNT_ID = 'acct_merchant123';
const PAYMENT_INTENT_ID = 'pi_direct_payment123';
const CHARGE_ID = 'ch_direct_charge123';
const APPLICATION_FEE_ID = 'fee_direct_application123';

function operationInput(): DirectRefundOperationInput {
  return {
    accountId: ACCOUNT_ID,
    paymentId: PAYMENT_ID,
    merchantAccountId: MERCHANT_ACCOUNT_ID,
    livemode: false,
    authorizationId: AUTHORIZATION_ID,
    operationId: `payment:${PAYMENT_ID}:refund:1`,
  };
}

function fullPlan(overrides: Partial<DirectRefundPlan> = {}): DirectRefundPlan {
  return {
    authorizationId: AUTHORIZATION_ID,
    allocationPolicy: 'invoice_line_refund',
    allocationVersion: '2026-08-16.v1',
    allocationFingerprint: 'a'.repeat(64),
    paymentIntentId: PAYMENT_INTENT_ID,
    chargeId: CHARGE_ID,
    applicationFeeId: APPLICATION_FEE_ID,
    reason: 'requested_by_customer',
    refundMode: 'full_combined',
    grossRefundCents: 25_000,
    eligibleServiceRefundCents: 20_000,
    cumulativeGrossBeforeCents: 0,
    cumulativeGrossAfterCents: 25_000,
    cumulativeEligibleBeforeCents: 0,
    cumulativeEligibleAfterCents: 20_000,
    applicationFeeTotalCents: 50,
    applicationFeeRefundBeforeCents: 0,
    applicationFeeRefundAfterCents: 50,
    applicationFeeRefundCents: 50,
    ...overrides,
  };
}

function refundSnapshot(amount: number): ProviderResultSnapshot {
  return {
    id: 're_direct_refund123',
    object: 'refund',
    amount,
    currency: 'usd',
    charge: CHARGE_ID,
    payment_intent: PAYMENT_INTENT_ID,
    status: 'succeeded',
  };
}

function feeRefundSnapshot(amount: number): ProviderResultSnapshot {
  return {
    id: 'fr_direct_fee_refund123',
    object: 'fee_refund',
    amount,
    currency: 'usd',
    fee: APPLICATION_FEE_ID,
  };
}

function stripeRefund(amount: number): Stripe.Refund {
  return refundSnapshot(amount) as unknown as Stripe.Refund;
}

function stripeFeeRefund(amount: number): Stripe.FeeRefund {
  return feeRefundSnapshot(amount) as unknown as Stripe.FeeRefund;
}

function claim(plan: DirectRefundPlan, overrides: Partial<DirectRefundClaim> = {}): DirectRefundClaim {
  return {
    status: 'claimed',
    operationPk: OPERATION_PK,
    claimToken: CLAIM_TOKEN,
    operationState: 'claimed',
    phase: 'charge_ready',
    plan,
    refundId: null,
    refundResult: null,
    applicationFeeRefundId: null,
    applicationFeeRefundResult: null,
    ...overrides,
  };
}

function mocks(plan: DirectRefundPlan = fullPlan(), claimResult: DirectRefundClaim = claim(plan)) {
  const store = {
    loadPlan: vi.fn<DirectRefundOperationStore['loadPlan']>().mockResolvedValue(plan),
    claim: vi.fn<DirectRefundOperationStore['claim']>().mockResolvedValue(claimResult),
    beginChargeSubmission: vi.fn<DirectRefundOperationStore['beginChargeSubmission']>().mockResolvedValue(undefined),
    recordChargeResult: vi.fn<DirectRefundOperationStore['recordChargeResult']>()
      .mockResolvedValue({ nextAction: 'complete', claimToken: null }),
    beginApplicationFeeSubmission: vi.fn<DirectRefundOperationStore['beginApplicationFeeSubmission']>()
      .mockResolvedValue(undefined),
    completeApplicationFeeRefund: vi.fn<DirectRefundOperationStore['completeApplicationFeeRefund']>()
      .mockResolvedValue(undefined),
    markIndeterminate: vi.fn<DirectRefundOperationStore['markIndeterminate']>().mockResolvedValue(undefined),
  } satisfies DirectRefundOperationStore;
  const createRefund = vi.fn<DirectRefundOperationDependencies['createRefund']>()
    .mockResolvedValue(stripeRefund(plan.grossRefundCents));
  const createApplicationFeeRefund = vi.fn<DirectRefundOperationDependencies['createApplicationFeeRefund']>()
    .mockResolvedValue(stripeFeeRefund(plan.applicationFeeRefundCents));
  return {
    store,
    createRefund,
    createApplicationFeeRefund,
    dependencies: { store, createRefund, createApplicationFeeRefund } satisfies DirectRefundOperationDependencies,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not-a-real-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('DARK direct-charge refund orchestration', () => {
  it('takes no cents from its caller and combines a full charge/Application Fee refund', async () => {
    type AcceptsGrossCents = 'grossRefundCents' extends keyof DirectRefundOperationInput ? true : false;
    type AcceptsEligibleCents = 'eligibleServiceRefundCents' extends keyof DirectRefundOperationInput ? true : false;
    const acceptsGrossCents: AcceptsGrossCents = false;
    const acceptsEligibleCents: AcceptsEligibleCents = false;
    expect([acceptsGrossCents, acceptsEligibleCents]).toEqual([false, false]);

    const plan = fullPlan();
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks(plan);
    const result = await orchestrateDirectChargeRefund(operationInput(), dependencies);

    expect(result).toMatchObject({ outcome: 'created', refundId: 're_direct_refund123' });
    expect(store.loadPlan).toHaveBeenCalledWith(operationInput());
    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({
      chargeId: CHARGE_ID,
      refundApplicationFee: true,
      reason: 'requested_by_customer',
    }));
    expect(createRefund.mock.calls[0]?.[0]).not.toHaveProperty('amountCents');
    expect(createRefund.mock.calls[0]?.[0]).not.toHaveProperty('paymentIntentId');
    expect(createApplicationFeeRefund).not.toHaveBeenCalled();
    expect(store.recordChargeResult).toHaveBeenCalledWith(expect.objectContaining({
      refundId: 're_direct_refund123',
      result: expect.objectContaining({ amount: 25_000, charge: CHARGE_ID }),
    }));
  });

  it('uses false on a partial/mixed charge refund then returns the exact cumulative fee delta', async () => {
    const plan = fullPlan({
      refundMode: 'split',
      grossRefundCents: 5_000,
      eligibleServiceRefundCents: 4_000,
      cumulativeGrossAfterCents: 5_000,
      cumulativeEligibleAfterCents: 4_000,
      applicationFeeRefundAfterCents: 10,
      applicationFeeRefundCents: 10,
    });
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks(plan);
    store.recordChargeResult.mockResolvedValue({ nextAction: 'fee_ready', claimToken: FEE_CLAIM_TOKEN });

    const result = await orchestrateDirectChargeRefund(operationInput(), dependencies);

    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({
      chargeId: CHARGE_ID,
      amountCents: 5_000,
      refundApplicationFee: false,
    }));
    expect(createApplicationFeeRefund).toHaveBeenCalledWith(expect.objectContaining({
      applicationFeeId: APPLICATION_FEE_ID,
      amountCents: 10,
    }));
    expect(store.beginApplicationFeeSubmission).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: FEE_CLAIM_TOKEN,
    });
    expect(store.completeApplicationFeeRefund).toHaveBeenCalledWith(expect.objectContaining({
      feeRefundId: 'fr_direct_fee_refund123',
      result: expect.objectContaining({ amount: 10, fee: APPLICATION_FEE_ID }),
    }));
    expect(result.applicationFeeRefundId).toBe('fr_direct_fee_refund123');
    expect(createRefund.mock.invocationCallOrder[0]).toBeLessThan(createApplicationFeeRefund.mock.invocationCallOrder[0]!);
  });

  it('supports a tax-only partial refund with a zero fee reversal and one Stripe mutation', async () => {
    const plan = fullPlan({
      refundMode: 'split',
      grossRefundCents: 1_000,
      eligibleServiceRefundCents: 0,
      cumulativeGrossAfterCents: 1_000,
      cumulativeEligibleAfterCents: 0,
      applicationFeeRefundAfterCents: 0,
      applicationFeeRefundCents: 0,
    });
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks(plan);

    await orchestrateDirectChargeRefund(operationInput(), dependencies);

    expect(createRefund).toHaveBeenCalledWith(expect.objectContaining({
      amountCents: 1_000,
      refundApplicationFee: false,
    }));
    expect(createApplicationFeeRefund).not.toHaveBeenCalled();
    expect(store.beginApplicationFeeSubmission).not.toHaveBeenCalled();
  });

  it('recovers a crash between mutations by submitting only the recorded fee step', async () => {
    const plan = fullPlan({
      refundMode: 'split',
      grossRefundCents: 5_000,
      eligibleServiceRefundCents: 4_000,
      cumulativeGrossAfterCents: 5_000,
      cumulativeEligibleAfterCents: 4_000,
      applicationFeeRefundAfterCents: 10,
      applicationFeeRefundCents: 10,
    });
    const persistedRefund = refundSnapshot(5_000);
    const resumedClaim = claim(plan, {
      status: 'fee_ready',
      claimToken: FEE_CLAIM_TOKEN,
      operationState: 'submitted',
      phase: 'fee_ready',
      refundId: 're_direct_refund123',
      refundResult: persistedRefund,
    });
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks(plan, resumedClaim);

    const result = await orchestrateDirectChargeRefund(operationInput(), dependencies);

    expect(result.outcome).toBe('fee_resumed');
    expect(createRefund).not.toHaveBeenCalled();
    expect(store.beginChargeSubmission).not.toHaveBeenCalled();
    expect(createApplicationFeeRefund).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['in_progress', 'claimed', 'charge_ready'],
    ['submitted', 'submitted', 'charge_submitted'],
    ['indeterminate', 'indeterminate', 'indeterminate'],
    ['failed', 'failed', 'failed'],
  ] as const)('never contacts Stripe for a %s operation', async (status, operationState, phase) => {
    const plan = fullPlan();
    const blocked = claim(plan, {
      status,
      claimToken: null,
      operationState,
      phase,
    });
    const { dependencies, createRefund, createApplicationFeeRefund } = mocks(plan, blocked);

    await expect(orchestrateDirectChargeRefund(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectRefundOperationUnavailableError);
    expect(createRefund).not.toHaveBeenCalled();
    expect(createApplicationFeeRefund).not.toHaveBeenCalled();
  });

  it('marks an ambiguous connected-account charge call indeterminate and never starts the fee call', async () => {
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks();
    const providerError = new Error('socket closed after request write');
    createRefund.mockRejectedValue(providerError);

    const thrown = await orchestrateDirectChargeRefund(operationInput(), dependencies).catch((error) => error);

    expect(thrown).toBeInstanceOf(DirectRefundOperationIndeterminateError);
    expect(thrown.providerError).toBe(providerError);
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK,
      claimToken: CLAIM_TOKEN,
      error: 'Error: socket closed after request write',
    });
    expect(createApplicationFeeRefund).not.toHaveBeenCalled();
  });

  it('marks an ambiguous platform fee call indeterminate without repeating the charge', async () => {
    const plan = fullPlan({
      refundMode: 'split',
      grossRefundCents: 5_000,
      eligibleServiceRefundCents: 4_000,
      cumulativeGrossAfterCents: 5_000,
      cumulativeEligibleAfterCents: 4_000,
      applicationFeeRefundAfterCents: 10,
      applicationFeeRefundCents: 10,
    });
    const persistedRefund = refundSnapshot(5_000);
    const resumedClaim = claim(plan, {
      status: 'fee_ready',
      claimToken: FEE_CLAIM_TOKEN,
      operationState: 'submitted',
      phase: 'fee_ready',
      refundId: 're_direct_refund123',
      refundResult: persistedRefund,
    });
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks(plan, resumedClaim);
    createApplicationFeeRefund.mockRejectedValue(new Error('fee response lost'));

    await expect(orchestrateDirectChargeRefund(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectRefundOperationIndeterminateError);
    expect(createRefund).not.toHaveBeenCalled();
    expect(store.markIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      claimToken: FEE_CLAIM_TOKEN,
      error: 'Error: fee response lost',
    }));
  });

  it('does not submit the fee when charge-result persistence is unconfirmed', async () => {
    const plan = fullPlan({
      refundMode: 'split',
      grossRefundCents: 5_000,
      eligibleServiceRefundCents: 4_000,
      cumulativeGrossAfterCents: 5_000,
      cumulativeEligibleAfterCents: 4_000,
      applicationFeeRefundAfterCents: 10,
      applicationFeeRefundCents: 10,
    });
    const { dependencies, store, createRefund, createApplicationFeeRefund } = mocks(plan);
    store.recordChargeResult.mockRejectedValue(new Error('database response lost'));

    await expect(orchestrateDirectChargeRefund(operationInput(), dependencies))
      .rejects.toBeInstanceOf(DirectRefundOperationPersistenceError);
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createApplicationFeeRefund).not.toHaveBeenCalled();
    expect(store.markIndeterminate).not.toHaveBeenCalled();
  });

  it('replays only the durable provider snapshots after success', async () => {
    const plan = fullPlan();
    const replay = claim(plan, {
      status: 'replay',
      claimToken: null,
      operationState: 'succeeded',
      phase: 'succeeded',
      refundId: 're_direct_refund123',
      refundResult: refundSnapshot(25_000),
    });
    const { dependencies, createRefund, createApplicationFeeRefund } = mocks(plan, replay);

    const result = await orchestrateDirectChargeRefund(operationInput(), dependencies);

    expect(result.outcome).toBe('replayed');
    expect(createRefund).not.toHaveBeenCalled();
    expect(createApplicationFeeRefund).not.toHaveBeenCalled();
  });
});
