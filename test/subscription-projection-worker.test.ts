import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('subscription projection worker tests inject database dependencies');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('subscription projection worker tests inject provider dependencies');
  },
}));

import {
  processClaimedStripeBillingSubscriptionProjection,
  runStripeBillingSubscriptionProjectionBatch,
  SupabaseStripeBillingSubscriptionProjectionWorkerQueue,
  type StripeSubscriptionProjectionWorkerDependencies,
} from '@/lib/billing/subscription-projection-worker';
import type {
  StripeBillingSubscriptionProjectionResolver,
  StripeBillingSubscriptionProjectionStore,
  StripeSubscriptionProjection,
  StripeSubscriptionProjectionBinding,
  StripeSubscriptionProviderContext,
  StripeSubscriptionProjectorClaim,
} from '@/lib/billing/subscription-event-projector';

const EVENT_ONE = '10000000-0000-4000-8000-000000000001';
const EVENT_TWO = '20000000-0000-4000-8000-000000000002';
const TOKEN_ONE = '30000000-0000-4000-8000-000000000003';
const TOKEN_TWO = '40000000-0000-4000-8000-000000000004';
const WORKSPACE_ID = '50000000-0000-4000-8000-000000000005';
const OPERATION_PK = '60000000-0000-4000-8000-000000000006';
const ACCEPTANCE_ID = '70000000-0000-4000-8000-000000000007';
const SUBSCRIPTION_ID = 'sub_subscription123';
const PROVIDER_EVENT_ID = 'evt_subscription123';

function claim(
  billingEventId = EVENT_ONE,
  claimToken = TOKEN_ONE,
  attemptCount = 1,
): StripeSubscriptionProjectorClaim {
  return Object.freeze({
    status: 'claimed',
    billingEventId,
    claimToken,
    attemptCount,
    providerEventId: PROVIDER_EVENT_ID,
    eventType: 'customer.subscription.updated',
    providerObjectId: SUBSCRIPTION_ID,
    providerObjectType: 'subscription',
    livemode: false,
    providerCreatedAt: '2026-08-16T01:00:00.000Z',
  });
}

const CONTEXT: StripeSubscriptionProviderContext = Object.freeze({
  providerEventId: PROVIDER_EVENT_ID,
  eventType: 'customer.subscription.updated',
  providerObjectId: SUBSCRIPTION_ID,
  providerObjectType: 'subscription',
  livemode: false,
  providerCreatedAt: '2026-08-16T01:00:00.000Z',
  workspaceId: WORKSPACE_ID,
  operationId: `workspace:${WORKSPACE_ID}:solo:monthly:first`,
  purpose: 'base_plan_subscription',
  planCode: 'solo',
  billingInterval: 'monthly',
  catalogVersion: '2026-08-15-preview',
  termsVersion: '2026-08-15',
  recurringConsentVersion: 'base-plan-recurring-2026-08-16',
  recurringConsentTextSha256: 'a'.repeat(64),
  recurringConsentAcceptanceId: ACCEPTANCE_ID,
  customerId: 'cus_customer123',
  subscriptionId: SUBSCRIPTION_ID,
  subscriptionItemId: 'si_subscriptionitem123',
  priceId: 'price_solo123',
  productId: 'prod_solo123',
  subscriptionStatus: 'active',
  currency: 'usd',
  periodStart: '2026-08-16T00:00:00.000Z',
  periodEnd: '2026-09-16T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  cancelAt: null,
  canceledAt: null,
  endedAt: null,
  invoiceId: 'in_invoice123',
  invoiceStatus: 'paid',
});

const BINDING: StripeSubscriptionProjectionBinding = Object.freeze({
  operationPk: OPERATION_PK,
  operationState: 'checkout_created',
  workspaceId: WORKSPACE_ID,
  operationId: CONTEXT.operationId,
  checkoutSessionId: 'cs_test_checkout123',
  planCode: 'solo',
  billingInterval: 'monthly',
  catalogVersion: CONTEXT.catalogVersion,
  livemode: false,
  priceId: CONTEXT.priceId,
  productId: CONTEXT.productId,
  currency: 'usd',
  unitAmountCents: 3_900,
  termsVersion: CONTEXT.termsVersion,
  recurringConsentVersion: CONTEXT.recurringConsentVersion,
  recurringConsentTextSha256: CONTEXT.recurringConsentTextSha256,
  recurringConsentAcceptanceId: ACCEPTANCE_ID,
  checkoutExpiresAt: '2026-08-16T02:00:00.000Z',
});

const PROJECTION: StripeSubscriptionProjection = Object.freeze({
  schema: 'stripe_subscription_projection_v1',
  provider_event_id: PROVIDER_EVENT_ID,
  event_type: 'customer.subscription.updated',
  event_created_at: CONTEXT.providerCreatedAt,
  event_object_id: SUBSCRIPTION_ID,
  workspace_id: WORKSPACE_ID,
  operation_id: CONTEXT.operationId,
  checkout_session_id: 'cs_test_checkout123',
  customer_id: CONTEXT.customerId,
  subscription_id: SUBSCRIPTION_ID,
  subscription_item_id: CONTEXT.subscriptionItemId,
  price_id: CONTEXT.priceId,
  product_id: CONTEXT.productId,
  plan_code: 'solo',
  billing_interval: 'monthly',
  catalog_version: CONTEXT.catalogVersion,
  currency: 'usd',
  unit_amount_cents: 3_900,
  platform_fee_bps: 50,
  subscription_status: 'active',
  period_start: CONTEXT.periodStart,
  period_end: CONTEXT.periodEnd,
  cancel_at_period_end: false,
  cancel_at: null,
  canceled_at: null,
  ended_at: null,
  invoice_id: CONTEXT.invoiceId,
  invoice_status: 'paid',
  payment_evidence_kind: 'invoice_paid',
  allowance_start: CONTEXT.periodStart,
  allowance_end: CONTEXT.periodEnd,
  feature_limits: Object.freeze({ office_users: 1 }),
  feature_flags: Object.freeze({ quickbooks: true }),
  terms_version: CONTEXT.termsVersion,
  recurring_consent_version: CONTEXT.recurringConsentVersion,
  recurring_consent_text_sha256: CONTEXT.recurringConsentTextSha256,
  recurring_consent_acceptance_id: ACCEPTANCE_ID,
});

describe('dark Stripe Billing subscription projection worker', () => {
  it('claims and completes a bounded batch strictly one event at a time', async () => {
    const first = claim();
    const second = claim(EVENT_TWO, TOKEN_TWO);
    const order: string[] = [];
    const queue = {
      claimNext: vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
    };
    const process = vi.fn(async (owned: StripeSubscriptionProjectorClaim) => {
      order.push(`start:${owned.billingEventId}`);
      await Promise.resolve();
      order.push(`end:${owned.billingEventId}`);
      return { status: 'replay_processed' as const, billingEventId: owned.billingEventId };
    });
    const dependencies: StripeSubscriptionProjectionWorkerDependencies = { queue, process };

    await expect(runStripeBillingSubscriptionProjectionBatch(2, dependencies)).resolves.toMatchObject({
      status: 'completed',
      requestedBatchSize: 2,
      claimedCount: 2,
      errorCode: null,
    });
    expect(order).toEqual([
      `start:${EVENT_ONE}`,
      `end:${EVENT_ONE}`,
      `start:${EVENT_TWO}`,
      `end:${EVENT_TWO}`,
    ]);
    expect(queue.claimNext).toHaveBeenCalledTimes(2);
  });

  it('stops on an empty queue and enforces the hard batch bound', async () => {
    const dependencies: StripeSubscriptionProjectionWorkerDependencies = {
      queue: { claimNext: vi.fn().mockResolvedValue(null) },
      process: vi.fn(),
    };
    await expect(runStripeBillingSubscriptionProjectionBatch(25, dependencies)).resolves.toMatchObject({
      status: 'completed',
      claimedCount: 0,
      results: [],
    });
    await expect(runStripeBillingSubscriptionProjectionBatch(0, dependencies)).rejects.toThrow(
      'between 1 and 25',
    );
    await expect(runStripeBillingSubscriptionProjectionBatch(26, dependencies)).rejects.toThrow(
      'between 1 and 25',
    );
  });

  it('returns fixed worker codes without leaking exception text and continues after item failure', async () => {
    const first = claim();
    const second = claim(EVENT_TWO, TOKEN_TWO);
    const secret = 'customer@example.com has card pm_secret';
    const queue = {
      claimNext: vi.fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second),
    };
    const process = vi.fn()
      .mockRejectedValueOnce(new Error(secret))
      .mockResolvedValueOnce({ status: 'replay_processed', billingEventId: EVENT_TWO });

    const result = await runStripeBillingSubscriptionProjectionBatch(2, { queue, process });
    expect(result).toMatchObject({
      status: 'completed',
      claimedCount: 2,
      results: [
        {
          status: 'worker_error',
          billingEventId: EVENT_ONE,
          errorCode: 'projection_worker_execution_error',
        },
        { status: 'replay_processed', billingEventId: EVENT_TWO },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('stops a claim failure with one fixed PII-free batch code', async () => {
    const secret = 'cus_customer123 customer@example.com';
    const dependencies: StripeSubscriptionProjectionWorkerDependencies = {
      queue: { claimNext: vi.fn().mockRejectedValue(new Error(secret)) },
      process: vi.fn(),
    };
    const result = await runStripeBillingSubscriptionProjectionBatch(3, dependencies);
    expect(result).toEqual({
      status: 'claim_failed',
      requestedBatchSize: 3,
      claimedCount: 0,
      results: [],
      errorCode: 'projection_worker_claim_error',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('dead-letters a ninth recovery claim before any provider egress', async () => {
    const overLimit = claim(EVENT_ONE, TOKEN_ONE, 9);
    const fail = vi.fn().mockResolvedValue(undefined);
    const projectionStore = {
      claim: vi.fn(),
      resolveBinding: vi.fn(),
      project: vi.fn(),
      fail,
      ignoreForeignRail: vi.fn(),
    } satisfies StripeBillingSubscriptionProjectionStore;
    const resolver = {
      loadProviderContext: vi.fn(),
      buildProjection: vi.fn(),
    } satisfies StripeBillingSubscriptionProjectionResolver;

    await expect(processClaimedStripeBillingSubscriptionProjection(overLimit, {
      projectionStore,
      resolver,
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toEqual({
      status: 'failed_terminal',
      billingEventId: EVENT_ONE,
      errorCode: 'projection_retry_attempt_limit',
    });
    expect(fail).toHaveBeenCalledWith({
      billingEventId: EVENT_ONE,
      claimToken: TOKEN_ONE,
      errorCode: 'projection_retry_attempt_limit',
      retryable: false,
      nextAttemptAt: null,
    });
    expect(resolver.loadProviderContext).not.toHaveBeenCalled();
    expect(resolver.buildProjection).not.toHaveBeenCalled();
  });

  it('hands an owned claim through the existing resolver and projector exactly once', async () => {
    const owned = claim(EVENT_ONE, TOKEN_ONE, 8);
    const resolveBinding = vi.fn().mockResolvedValue(BINDING);
    const project = vi.fn().mockResolvedValue({
      status: 'processed',
      billingSubscriptionId: '80000000-0000-4000-8000-000000000008',
      workspaceId: WORKSPACE_ID,
      applied: true,
      allowancesGranted: false,
    });
    const projectionStore = {
      claim: vi.fn(),
      resolveBinding,
      project,
      fail: vi.fn(),
      ignoreForeignRail: vi.fn(),
    } satisfies StripeBillingSubscriptionProjectionStore;
    const resolver = {
      loadProviderContext: vi.fn().mockResolvedValue(CONTEXT),
      buildProjection: vi.fn().mockResolvedValue(PROJECTION),
    } satisfies StripeBillingSubscriptionProjectionResolver;

    await expect(processClaimedStripeBillingSubscriptionProjection(owned, {
      projectionStore,
      resolver,
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'processed',
      billingEventId: EVENT_ONE,
      workspaceId: WORKSPACE_ID,
    });
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      billingEventId: EVENT_ONE,
      claimToken: TOKEN_ONE,
      context: CONTEXT,
    }));
    expect(project).toHaveBeenCalledWith(expect.objectContaining({
      billingEventId: EVENT_ONE,
      claimToken: TOKEN_ONE,
      projection: PROJECTION,
    }));
    expect(projectionStore.claim).not.toHaveBeenCalled();
    expect(projectionStore.fail).not.toHaveBeenCalled();
  });

  it('parses only an exact owned claim from the service-only selector RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        claim_status: 'claimed',
        billing_event_id: EVENT_ONE,
        claim_token: TOKEN_ONE,
        attempt_count: 1,
        provider_event_id: PROVIDER_EVENT_ID,
        event_type: 'customer.subscription.updated',
        provider_object_id: SUBSCRIPTION_ID,
        provider_object_type: 'subscription',
        livemode: false,
        provider_created_at: '2026-08-16T01:00:00.000Z',
      }],
      error: null,
    });
    const queue = new SupabaseStripeBillingSubscriptionProjectionWorkerQueue({ rpc } as never);
    await expect(queue.claimNext()).resolves.toEqual(claim());
    expect(rpc).toHaveBeenCalledWith('claim_next_due_stripe_billing_subscription_event');
  });

});
