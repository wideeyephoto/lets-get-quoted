import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('top-up projector tests inject database dependencies');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('top-up projector tests inject provider dependencies');
  },
}));

import { PRICING_CATALOG_VERSION, TOP_UPS } from '@/lib/billing/catalog';
import {
  PLATFORM_TOP_UP_PROJECTION_SCHEMA,
  TopUpProjectionProviderError,
  createTopUpProjectionResolver,
  decideTopUpProjection,
  projectPlatformTopUpEvent,
  type TopUpProjection,
  type TopUpProjectionStore,
  type TopUpProjectorClaim,
} from '@/lib/billing/top-up-event-projector';

const EVENT_ROW_ID = '10000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = '20000000-0000-4000-8000-000000000002';
const WORKSPACE_ID = '30000000-0000-4000-8000-000000000003';
const EVENT_ID = 'evt_topup123456789';
const SESSION_ID = 'cs_test_topup123';

function metadata(overrides: Record<string, string | undefined> = {}) {
  return {
    lgq_purpose: 'top_up',
    lgq_top_up_id: 'text_1000',
    lgq_account_id: WORKSPACE_ID,
    lgq_resource_code: 'text_segments',
    lgq_units: '1000',
    lgq_catalog_version: PRICING_CATALOG_VERSION,
    ...overrides,
  };
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    livemode: false,
    payment_status: 'paid',
    metadata: metadata(),
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

function claim(overrides: Partial<TopUpProjectorClaim> = {}): TopUpProjectorClaim {
  return Object.freeze({
    status: 'claimed',
    billingEventId: EVENT_ROW_ID,
    claimToken: CLAIM_TOKEN,
    attemptCount: 1,
    providerEventId: EVENT_ID,
    eventType: 'checkout.session.completed',
    checkoutSessionId: SESSION_ID,
    workspaceId: null,
    livemode: false,
    providerCreatedAt: '2026-08-18T00:00:00.000Z',
    ...overrides,
  }) as TopUpProjectorClaim;
}

describe('deciding what one top-up event means', () => {
  it('grants a paid card purchase, with units from the catalog', () => {
    const projection = decideTopUpProjection(claim(), session());
    expect(projection.outcome).toBe('grant');
    expect(projection.account_id).toBe(WORKSPACE_ID);
    expect(projection.resource_code).toBe('text_segments');
    expect(projection.units).toBe(TOP_UPS.text_1000.units);
    expect(projection.idempotency_key).toBe(`top_up:${SESSION_ID}`);
  });

  it('takes the quantity from the catalog even when Stripe metadata disagrees', () => {
    // Metadata proves WHICH SKU was bought. How much it grants is the catalog's
    // answer, and it is the only place a customer-visible quantity may come from.
    const projection = decideTopUpProjection(
      claim(),
      session({ metadata: metadata({ lgq_units: '999999' }) as Stripe.Metadata }),
    );
    expect(projection.outcome).toBe('grant');
    expect(projection.units).toBe(1_000);
  });

  it('waits for the money on a delayed rail rather than granting on the event name', () => {
    const projection = decideTopUpProjection(claim(), session({ payment_status: 'unpaid' }));
    expect(projection.outcome).toBe('awaiting_async_payment');
    expect(projection.units).toBeUndefined();
  });

  it('grants when the delayed payment finally succeeds', () => {
    const projection = decideTopUpProjection(
      claim({ eventType: 'checkout.session.async_payment_succeeded' }),
      session({ payment_status: 'paid' }),
    );
    expect(projection.outcome).toBe('grant');
  });

  it('records a failed delayed payment and an expiry without granting', () => {
    expect(decideTopUpProjection(
      claim({ eventType: 'checkout.session.async_payment_failed' }),
      session({ payment_status: 'unpaid' }),
    ).outcome).toBe('payment_failed');

    expect(decideTopUpProjection(
      claim({ eventType: 'checkout.session.expired' }),
      session({ payment_status: 'unpaid' }),
    ).outcome).toBe('checkout_expired');
  });

  it('refuses to guess a workspace for a Session that is not a top-up', () => {
    const projection = decideTopUpProjection(
      claim(),
      session({ metadata: { lgq_purpose: 'something_else' } as Stripe.Metadata }),
    );
    expect(projection.outcome).toBe('not_a_purchase');
    expect(projection.account_id).toBeNull();
  });

  it('defers a paid recurring-capacity SKU instead of granting it as credit', () => {
    // storage_100gb is sellable, and its fulfillment is capacity rather than a
    // consumable balance. Granting it as a credit lot would be the wrong wallet.
    expect(TOP_UPS.storage_100gb.fulfillment).toBe('recurring_capacity');
    const projection = decideTopUpProjection(
      claim(),
      session({ metadata: metadata({ lgq_top_up_id: 'storage_100gb', lgq_resource_code: 'storage_gb' }) as Stripe.Metadata }),
    );
    expect(projection.outcome).toBe('capacity_fulfillment_deferred');
    expect(projection.account_id).toBe(WORKSPACE_ID);
  });

  it('withholds a paid SKU the catalog says must not be sold', () => {
    const projection = decideTopUpProjection(
      claim(),
      session({ metadata: metadata({ lgq_top_up_id: 'crew_user', lgq_resource_code: 'crew_users' }) as Stripe.Metadata }),
    );
    expect(projection.outcome).toBe('fulfillment_withheld');
    // The workspace is still named: someone has to answer for money taken.
    expect(projection.account_id).toBe(WORKSPACE_ID);
  });

  it('keys idempotency on the Session, so two events for one purchase agree', () => {
    const first = decideTopUpProjection(claim(), session());
    const second = decideTopUpProjection(
      claim({ eventType: 'checkout.session.async_payment_succeeded' }),
      session(),
    );
    expect(first.idempotency_key).toBe(second.idempotency_key);
  });
});

function store(overrides: Partial<TopUpProjectionStore> = {}) {
  return {
    claim: vi.fn().mockResolvedValue(claim()),
    project: vi.fn().mockResolvedValue({
      projectionStatus: 'processed',
      projectionResult: 'top_up_credits_granted',
      creditLotId: '60000000-0000-4000-8000-000000000006',
      applied: true,
    }),
    fail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies TopUpProjectionStore;
}

function dependencies(overrides: {
  store?: TopUpProjectionStore;
  loadSession?: () => Promise<Stripe.Checkout.Session>;
} = {}) {
  return Object.freeze({
    store: overrides.store ?? store(),
    resolver: {
      loadSession: overrides.loadSession ?? (async () => session()),
    },
    now: () => new Date('2026-08-18T00:00:00.000Z'),
  });
}

describe('projecting one top-up event', () => {
  it('claims, resolves the Session, and records the projection', async () => {
    const deps = dependencies();
    const result = await projectPlatformTopUpEvent(EVENT_ROW_ID, deps);

    expect(result.status).toBe('projected');
    expect(deps.store.project).toHaveBeenCalledTimes(1);
    const projection = (deps.store.project as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .projection as TopUpProjection;
    expect(projection.outcome).toBe('grant');
    expect(deps.store.fail).not.toHaveBeenCalled();
  });

  it.each([
    ['processed', 'replay_processed'],
    ['ignored', 'replay_ignored'],
    ['in_progress', 'in_progress'],
    ['failed_terminal', 'failed_terminal'],
  ] as const)('reports a %s claim without projecting again', async (status, expected) => {
    const deps = dependencies({
      store: store({ claim: vi.fn().mockResolvedValue(claim({ status, claimToken: null })) }),
    });
    const result = await projectPlatformTopUpEvent(EVENT_ROW_ID, deps);

    expect(result.status).toBe(expected);
    expect(deps.store.project).not.toHaveBeenCalled();
    expect(deps.store.fail).not.toHaveBeenCalled();
  });

  it('releases the claim with a backoff when Stripe cannot be read', async () => {
    const deps = dependencies({
      loadSession: async () => {
        throw new TopUpProjectionProviderError('provider_object_retrieve_failed', true);
      },
    });
    const result = await projectPlatformTopUpEvent(EVENT_ROW_ID, deps);

    expect(result).toMatchObject({ status: 'failed_retryable', errorCode: 'provider_object_retrieve_failed' });
    expect(deps.store.fail).toHaveBeenCalledTimes(1);
    const failure = (deps.store.fail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(failure.retryable).toBe(true);
    expect(failure.nextAttemptAt).toBe('2026-08-18T00:05:00.000Z');
  });

  it('parks the event terminally when the failure cannot be retried', async () => {
    const deps = dependencies({
      loadSession: async () => {
        throw new TopUpProjectionProviderError('provider_mode_mismatch', false);
      },
    });
    const result = await projectPlatformTopUpEvent(EVENT_ROW_ID, deps);

    expect(result).toMatchObject({ status: 'failed_terminal', errorCode: 'provider_mode_mismatch' });
    const failure = (deps.store.fail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(failure.retryable).toBe(false);
    expect(failure.nextAttemptAt).toBeNull();
  });

  it('never lets an unexpected error look like a terminal decision', async () => {
    const deps = dependencies({
      loadSession: async () => {
        throw new Error('boom');
      },
    });
    const result = await projectPlatformTopUpEvent(EVENT_ROW_ID, deps);
    expect(result).toMatchObject({ status: 'failed_retryable', errorCode: 'projection_internal_error' });
  });
});

describe('the provider resolver', () => {
  it('reads the Session from the platform account, with no connected-account header', async () => {
    const retrieveCheckoutSession = vi.fn().mockResolvedValue(session());
    const resolver = createTopUpProjectionResolver({
      assertMode: () => undefined,
      retrieveCheckoutSession,
    });

    await resolver.loadSession(claim());
    expect(retrieveCheckoutSession).toHaveBeenCalledWith(SESSION_ID);
    expect(retrieveCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('refuses a Session whose livemode disagrees with the receipt', async () => {
    const resolver = createTopUpProjectionResolver({
      assertMode: () => undefined,
      retrieveCheckoutSession: async () => session({ livemode: true }),
    });

    await expect(resolver.loadSession(claim({ livemode: false })))
      .rejects.toBeInstanceOf(TopUpProjectionProviderError);
  });

  it('refuses to project a live event with a test key', async () => {
    const resolver = createTopUpProjectionResolver({
      retrieveCheckoutSession: async () => session({ livemode: true }),
    });
    const previous = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = 'sk_test_abc';
    try {
      await expect(resolver.loadSession(claim({ livemode: true })))
        .rejects.toMatchObject({ code: 'provider_mode_mismatch', retryable: false });
    } finally {
      if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previous;
    }
  });
});

describe('the projection schema', () => {
  it('names the version the migration admits', () => {
    expect(PLATFORM_TOP_UP_PROJECTION_SCHEMA).toBe('stripe_platform_top_up_projection_v1');
  });
});
