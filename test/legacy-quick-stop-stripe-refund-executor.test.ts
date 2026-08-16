import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('Quick Stop executor tests inject database dependencies');
  },
}));

import {
  buildLegacyQuickStopStripeRefundCall,
  LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS,
  LEGACY_QUICK_STOP_LATE_REFUND_OPERATION,
  StripeLegacyQuickStopLateRefundExecutor,
  type LegacyQuickStopPlatformStripeClient,
} from '@/lib/billing/legacy-quick-stop-stripe-refund-executor';
import {
  runLegacyQuickStopLateRefundBatch,
} from '@/lib/billing/legacy-quick-stop-late-refund-worker';
import type {
  LegacyQuickStopLateRefundClaim,
  LegacyQuickStopPaymentStore,
} from '@/lib/billing/legacy-quick-stop-payment-store';

const CLAIM: LegacyQuickStopLateRefundClaim = Object.freeze({
  claimToken: '10000000-0000-4000-8000-000000000001',
  taskId: '20000000-0000-4000-8000-000000000002',
  accountId: '30000000-0000-4000-8000-000000000003',
  requestId: '40000000-0000-4000-8000-000000000004',
  paymentId: '50000000-0000-4000-8000-000000000005',
  jobId: '60000000-0000-4000-8000-000000000006',
  stripePaymentIntent: 'pi_quick_stop_123',
  grossAmountCents: 25_000,
  refundedAmountCents: 5_000,
  refundAmountCents: 20_000,
  currency: 'usd',
  reverseTransfer: true,
  refundApplicationFee: true,
  stripeIdempotencyKey:
    'quick_stop_late_refund_v1_50000000_0000_4000_8000_000000000005_5000_20000',
  requestFingerprint: 'a'.repeat(64),
  reasonCode: 'late_payment_after_expiry',
  attemptNumber: 1,
  leaseExpiresAt: '2026-08-16T09:35:00.000Z',
});

function response(
  claim: LegacyQuickStopLateRefundClaim = CLAIM,
  overrides: Record<string, unknown> = {},
): Stripe.Refund {
  const call = buildLegacyQuickStopStripeRefundCall(claim);
  return {
    id: 're_quick_stop_123',
    object: 'refund',
    amount: claim.refundAmountCents,
    currency: claim.currency,
    payment_intent: claim.stripePaymentIntent,
    status: 'succeeded',
    metadata: call.params.metadata,
    ...overrides,
  } as unknown as Stripe.Refund;
}

function client(result: Stripe.Refund = response()) {
  const create = vi.fn<LegacyQuickStopPlatformStripeClient['refunds']['create']>()
    .mockResolvedValue(result);
  return {
    create,
    stripe: { refunds: { create } } as LegacyQuickStopPlatformStripeClient,
  };
}

describe('DARK legacy Quick Stop platform refund executor', () => {
  it('submits the exact immutable destination-refund call in platform context', async () => {
    const fake = client();
    const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);

    await expect(executor.refund(CLAIM)).resolves.toEqual({
      stripeRefundId: 're_quick_stop_123',
    });

    expect(fake.create).toHaveBeenCalledOnce();
    expect(fake.create).toHaveBeenCalledWith({
      payment_intent: CLAIM.stripePaymentIntent,
      amount: CLAIM.refundAmountCents,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: {
        [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.operation]:
          LEGACY_QUICK_STOP_LATE_REFUND_OPERATION,
        [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.taskId]: CLAIM.taskId,
        [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.paymentId]: CLAIM.paymentId,
        [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.requestId]: CLAIM.requestId,
        [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.requestFingerprint]:
          CLAIM.requestFingerprint,
        [LEGACY_QUICK_STOP_LATE_REFUND_METADATA_KEYS.reasonCode]: CLAIM.reasonCode,
      },
    }, {
      idempotencyKey: CLAIM.stripeIdempotencyKey,
    });
    expect(fake.create.mock.calls[0]?.[1]).not.toHaveProperty('stripeAccount');
    expect(Object.keys(fake.create.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      'amount',
      'metadata',
      'payment_intent',
      'refund_application_fee',
      'reverse_transfer',
    ]);
  });

  it('replays a provider-success/completion-lag crash with the same Stripe request', async () => {
    const fake = client();
    const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);
    const complete = vi.fn()
      .mockRejectedValueOnce(new Error('webhook projection has not arrived'))
      .mockResolvedValueOnce({ status: 'completed', taskState: 'completed' });
    const fail = vi.fn(async () => ({
      status: 'failed_retryable' as const,
      taskState: 'retry_wait' as const,
      nextAttemptAt: '2026-08-16T09:40:00.000Z',
    }));
    const store: LegacyQuickStopPaymentStore = {
      reconcile: vi.fn(),
      claimBatch: vi.fn()
        .mockResolvedValueOnce([CLAIM])
        .mockResolvedValueOnce([{ ...CLAIM, attemptNumber: 2 }]),
      complete,
      fail,
    };

    await expect(runLegacyQuickStopLateRefundBatch(executor, 1, store))
      .resolves.toMatchObject({ outcomes: [{ status: 'failed_retryable' }] });
    await expect(runLegacyQuickStopLateRefundBatch(executor, 1, store))
      .resolves.toMatchObject({ outcomes: [{ status: 'completed' }] });

    expect(fake.create).toHaveBeenCalledTimes(2);
    expect(fake.create.mock.calls[1]).toEqual(fake.create.mock.calls[0]);
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'worker_internal_error',
      retryable: true,
    }));
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('fails closed before Stripe when the immutable refund scope is malformed', async () => {
    const fake = client();
    const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);

    await expect(executor.refund({
      ...CLAIM,
      currency: 'eur' as 'usd',
    })).rejects.toMatchObject({
      code: 'provider_scope_invalid',
      retryable: false,
      message: 'provider_scope_invalid',
    });
    await expect(executor.refund({
      ...CLAIM,
      refundAmountCents: CLAIM.refundAmountCents - 1,
    })).rejects.toMatchObject({
      code: 'provider_scope_invalid',
      retryable: false,
    });
    await expect(executor.refund({
      ...CLAIM,
      reverseTransfer: false as true,
    })).rejects.toMatchObject({
      code: 'provider_scope_invalid',
      retryable: false,
    });
    await expect(executor.refund({
      ...CLAIM,
      stripeIdempotencyKey:
        'quick_stop_late_refund_v1_50000000_0000_4000_8000_000000000099_5000_20000',
    })).rejects.toMatchObject({
      code: 'provider_scope_invalid',
      retryable: false,
    });
    expect(fake.create).not.toHaveBeenCalled();
  });

  it.each([
    ['refund id', { id: 'not-a-refund' }],
    ['PaymentIntent', { payment_intent: 'pi_someone_else' }],
    ['amount', { amount: CLAIM.refundAmountCents - 1 }],
    ['currency', { currency: 'eur' }],
    ['unknown status', { status: 'not_a_stripe_status' }],
    ['metadata', { metadata: {} }],
    ['extra protected metadata', { metadata: {
      ...buildLegacyQuickStopStripeRefundCall(CLAIM).params.metadata,
      lgq_operation_override: 'attacker-controlled',
    } }],
  ])('treats a mismatched provider %s as retry-safe invalid evidence', async (_label, patch) => {
    const fake = client(response(CLAIM, patch));
    const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);

    await expect(executor.refund(CLAIM)).rejects.toMatchObject({
      code: 'provider_response_invalid',
      retryable: true,
    });
  });

  it.each(['failed', 'canceled', 'requires_action'])(
    'classifies authoritative %s refund status as terminal',
    async (status) => {
      const fake = client(response(CLAIM, { status }));
      const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);

      await expect(executor.refund(CLAIM)).rejects.toMatchObject({
        code: 'provider_refund_not_accepted',
        retryable: false,
      });
    },
  );

  it('accepts pending provider truth but leaves local refund authority to the completion RPC', async () => {
    const fake = client(response(CLAIM, { status: 'pending' }));
    const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);

    await expect(executor.refund(CLAIM)).resolves.toEqual({
      stripeRefundId: 're_quick_stop_123',
    });
    const source = readFileSync(join(
      process.cwd(),
      'src/lib/billing/legacy-quick-stop-stripe-refund-executor.ts',
    ), 'utf8');
    expect(source).not.toContain(".from('payments')");
    expect(source).not.toContain('.update(');
    expect(source).not.toContain('markPayment');
  });

  it.each([
    [400, 'provider_request_rejected', false],
    [403, 'provider_request_rejected', false],
    [409, 'provider_unavailable', true],
    [429, 'provider_unavailable', true],
    [503, 'provider_unavailable', true],
  ])('classifies Stripe HTTP %i without retaining provider detail', async (statusCode, code, retryable) => {
    const secret = 'customer@example.com / pi_private';
    const fake = client();
    fake.create.mockRejectedValueOnce({ statusCode, message: secret });
    const executor = new StripeLegacyQuickStopLateRefundExecutor(fake.stripe);

    let thrown: unknown;
    try {
      await executor.refund(CLAIM);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code, retryable, message: code });
    expect(JSON.stringify(thrown)).not.toContain(secret);
  });

  it('does not import the direct-charge rail or expose caller-generic Stripe params', () => {
    const source = readFileSync(join(
      process.cwd(),
      'src/lib/billing/legacy-quick-stop-stripe-refund-executor.ts',
    ), 'utf8');
    expect(source.startsWith("import 'server-only';")).toBe(true);
    expect(source).not.toContain("@/lib/billing/stripe-direct");
    expect(source).not.toContain('merchantAccountId');
    expect(source).not.toContain('stripeAccount:');
    expect(source).not.toContain('reason?:');
    expect(source).not.toContain('metadata?:');
  });
});
