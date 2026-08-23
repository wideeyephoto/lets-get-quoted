import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('subscription projector tests must inject the store');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('subscription projector tests must inject provider retrieval');
  },
}));

import { PRICING_CATALOG_VERSION } from '@/lib/billing/catalog';
import {
  BASE_PLAN_SUBSCRIPTION_PURPOSE,
  type BasePlanSubscriptionMetadata,
} from '@/lib/billing/stripe-billing-subscription-checkout';
import {
  createStripeBillingSubscriptionProjectionResolver,
  StripeSubscriptionProjectionProviderError,
} from '@/lib/billing/stripe-billing-subscription-events';
import type { VerifiedStripePlanPrices } from '@/lib/billing/stripe-plan-prices';
import {
  BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
  BASE_PLAN_RECURRING_CONSENT_VERSION,
} from '@/lib/billing/subscription-consent';
import {
  projectStripeBillingSubscriptionEvent,
  SupabaseStripeBillingSubscriptionProjectionStore,
  type StripeBillingSubscriptionProjectionStore,
  type StripeSubscriptionProjectionBinding,
  type StripeSubscriptionProjectorClaim,
} from '@/lib/billing/subscription-event-projector';
import { TERMS_VERSION } from '@/lib/terms';

const EVENT_ROW_ID = '10000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = '20000000-0000-4000-8000-000000000002';
const WORKSPACE_ID = '30000000-0000-4000-8000-000000000003';
const OPERATION_PK = '40000000-0000-4000-8000-000000000004';
const ACCEPTANCE_ID = '50000000-0000-4000-8000-000000000005';
const OPERATION_ID = `workspace:${WORKSPACE_ID}:solo:annual:first`;
const SUBSCRIPTION_ID = 'sub_subscription123';
const CUSTOMER_ID = 'cus_customer123';
const ITEM_ID = 'si_subscriptionitem123';
const PRICE_ID = 'price_soloAnnual123';
const PRODUCT_ID = 'prod_soloPlan123';
const SESSION_ID = 'cs_test_subscription123';
const PERIOD_START = 1_786_147_200; // 2026-08-08T00:00:00Z
const PERIOD_END = 1_817_683_200; // one annual Stripe billing period
const SESSION_EXPIRES = 1_786_149_000;

function metadata(overrides: Record<string, string> = {}): BasePlanSubscriptionMetadata {
  return {
    lgq_billing_purpose: BASE_PLAN_SUBSCRIPTION_PURPOSE,
    lgq_workspace_id: WORKSPACE_ID,
    lgq_plan_code: 'solo',
    lgq_billing_interval: 'annual',
    lgq_catalog_version: PRICING_CATALOG_VERSION,
    lgq_operation_id: OPERATION_ID,
    lgq_terms_version: TERMS_VERSION,
    lgq_recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
    lgq_recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    lgq_recurring_consent_acceptance_id: ACCEPTANCE_ID,
    ...overrides,
  } as BasePlanSubscriptionMetadata;
}

function claim(
  overrides: Partial<StripeSubscriptionProjectorClaim> = {},
): StripeSubscriptionProjectorClaim {
  return {
    status: 'claimed',
    billingEventId: EVENT_ROW_ID,
    claimToken: CLAIM_TOKEN,
    attemptCount: 1,
    providerEventId: 'evt_subscription123',
    eventType: 'customer.subscription.created',
    providerObjectId: SUBSCRIPTION_ID,
    providerObjectType: 'subscription',
    livemode: false,
    providerCreatedAt: new Date((PERIOD_START + 5) * 1_000).toISOString(),
    ...overrides,
  };
}

function binding(
  overrides: Partial<StripeSubscriptionProjectionBinding> = {},
): StripeSubscriptionProjectionBinding {
  return {
    operationPk: OPERATION_PK,
    operationState: 'checkout_created',
    operationPurpose: 'base_plan_subscription',
    workspaceId: WORKSPACE_ID,
    operationId: OPERATION_ID,
    checkoutSessionId: SESSION_ID,
    planCode: 'solo',
    billingInterval: 'annual',
    catalogVersion: PRICING_CATALOG_VERSION,
    livemode: false,
    priceId: PRICE_ID,
    productId: PRODUCT_ID,
    currency: 'usd',
    unitAmountCents: 42_000,
    termsVersion: TERMS_VERSION,
    recurringConsentVersion: BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurringConsentTextSha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    recurringConsentAcceptanceId: ACCEPTANCE_ID,
    checkoutExpiresAt: new Date(SESSION_EXPIRES * 1_000).toISOString(),
    ...overrides,
  };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    object: 'subscription',
    livemode: false,
    customer: CUSTOMER_ID,
    status: 'active',
    currency: 'usd',
    collection_method: 'charge_automatically',
    application: null,
    application_fee_percent: null,
    on_behalf_of: null,
    transfer_data: null,
    automatic_tax: { enabled: false },
    cancel_at_period_end: false,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    metadata: metadata(),
    items: {
      object: 'list',
      has_more: false,
      data: [{
        id: ITEM_ID,
        object: 'subscription_item',
        quantity: 1,
        current_period_start: PERIOD_START,
        current_period_end: PERIOD_END,
        price: { id: PRICE_ID, object: 'price', product: PRODUCT_ID },
      }],
    },
    ...overrides,
  };
}

function checkout(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    livemode: false,
    mode: 'subscription',
    status: 'complete',
    payment_status: 'paid',
    currency: 'usd',
    client_reference_id: WORKSPACE_ID,
    amount_subtotal: 42_000,
    amount_total: 42_000,
    expires_at: SESSION_EXPIRES,
    automatic_tax: { enabled: false },
    customer: CUSTOMER_ID,
    subscription: SUBSCRIPTION_ID,
    metadata: metadata(),
    ...overrides,
  };
}

function verifiedPrices(): VerifiedStripePlanPrices {
  return {
    solo_annual: {
      bindingKey: 'solo_annual',
      priceId: PRICE_ID,
      productId: PRODUCT_ID,
      planCode: 'solo',
      billingInterval: 'annual',
      catalogVersion: PRICING_CATALOG_VERSION,
      livemode: false,
      currency: 'usd',
      unitAmountCents: 42_000,
      recurringInterval: 'year',
      recurringIntervalCount: 1,
      metadata: {
        lgq_price_purpose: 'base_plan',
        lgq_plan_code: 'solo',
        lgq_billing_interval: 'annual',
        lgq_catalog_version: PRICING_CATALOG_VERSION,
      },
    },
  } as unknown as VerifiedStripePlanPrices;
}

function resolver(overrides: {
  subscription?: unknown;
  checkout?: unknown;
  listedSessions?: unknown;
  invoice?: unknown;
} = {}) {
  const retrieveSubscription = vi.fn().mockResolvedValue(
    overrides.subscription ?? subscription(),
  );
  const retrieveInvoice = vi.fn().mockResolvedValue(overrides.invoice);
  const retrieveCheckoutSession = vi.fn().mockResolvedValue(
    overrides.checkout ?? checkout(),
  );
  const listCheckoutSessions = vi.fn().mockResolvedValue(
    overrides.listedSessions ?? { object: 'list', has_more: false, data: [checkout()] },
  );
  const value = createStripeBillingSubscriptionProjectionResolver({
    assertMode: (livemode) => {
      if (livemode) throw new Error('wrong test mode');
    },
    dependencies: {
      retrieveSubscription,
      retrieveInvoice,
      retrieveCheckoutSession,
      listCheckoutSessions,
      loadVerifiedPrices: vi.fn().mockResolvedValue(verifiedPrices()),
    },
  });
  return {
    value,
    retrieveSubscription,
    retrieveInvoice,
    retrieveCheckoutSession,
    listCheckoutSessions,
  };
}

describe('dark Stripe Billing subscription event projector', () => {
  it('gives an annual subscriber only the first monthly allowance window', async () => {
    const provider = resolver();
    const context = await provider.value.loadProviderContext(claim());
    const projection = await provider.value.buildProjection(context, binding());

    expect(projection.billing_interval).toBe('annual');
    expect(projection.unit_amount_cents).toBe(42_000);
    expect(projection.allowance_start).toBe(new Date(PERIOD_START * 1_000).toISOString());
    expect(projection.allowance_end).toBe('2026-09-08T00:00:00.000Z');
    expect(Date.parse(projection.allowance_end) - Date.parse(projection.allowance_start))
      .toBeLessThanOrEqual(32 * 24 * 60 * 60 * 1_000);
    expect(projection.payment_evidence_kind).toBe('checkout_session_paid');
    // Solo grants two office seats since 20260821010000; the owner holds one.
    // That the projection agrees with the catalog field by field is
    // test/subscription-entitlement-limits-catalog's job, not this one's.
    expect(projection.feature_limits).toMatchObject({ office_users: 2, crew_users: 2 });
  });

  it('binds the exact consent version, text digest, and acceptance identity', async () => {
    const wrongHash = resolver({
      subscription: subscription({
        metadata: metadata({ lgq_recurring_consent_text_sha256: '0'.repeat(64) }),
      }),
    });

    await expect(wrongHash.value.loadProviderContext(claim())).rejects.toMatchObject({
      code: 'provider_object_contract_mismatch',
      retryable: false,
    });

    const wrongAcceptance = resolver({
      subscription: subscription({
        metadata: metadata({
          lgq_recurring_consent_acceptance_id: '60000000-0000-4000-8000-000000000006',
        }),
      }),
    });
    const context = await wrongAcceptance.value.loadProviderContext(claim());
    await expect(wrongAcceptance.value.buildProjection(context, binding())).rejects.toMatchObject({
      code: 'provider_object_contract_mismatch',
    });
  });

  it('recovers an indeterminate Checkout only from one exact Session match', async () => {
    const exact = resolver();
    const context = await exact.value.loadProviderContext(claim());
    const projection = await exact.value.buildProjection(
      context,
      binding({ operationState: 'indeterminate', checkoutSessionId: null }),
    );
    expect(projection.checkout_session_id).toBe(SESSION_ID);
    expect(exact.listCheckoutSessions).toHaveBeenCalledWith(SUBSCRIPTION_ID);
    expect(exact.retrieveCheckoutSession).toHaveBeenCalledWith(SESSION_ID);

    for (const listedSessions of [
      { object: 'list', has_more: false, data: [] },
      { object: 'list', has_more: true, data: [checkout()] },
      { object: 'list', has_more: false, data: [checkout(), checkout({ id: 'cs_test_second123' })] },
      { object: 'list', has_more: false, data: [checkout({ customer: 'cus_wrongcustomer123' })] },
    ]) {
      const unsafe = resolver({ listedSessions });
      const unsafeContext = await unsafe.value.loadProviderContext(claim());
      await expect(unsafe.value.buildProjection(
        unsafeContext,
        binding({ operationState: 'indeterminate', checkoutSessionId: null }),
      )).rejects.toMatchObject({ code: 'checkout_session_ambiguous' });
    }
  });

  it('requires the stored Session to match mode, Customer, Subscription, amount, and metadata', async () => {
    for (const badSession of [
      checkout({ livemode: true }),
      checkout({ customer: 'cus_wrongcustomer123' }),
      checkout({ subscription: 'sub_wrongsubscription123' }),
      checkout({ amount_total: 41_999 }),
      checkout({ metadata: { ...metadata(), extra: 'not-allowed' } }),
      checkout({ payment_status: 'no_payment_required' }),
    ]) {
      const unsafe = resolver({ checkout: badSession });
      const context = await unsafe.value.loadProviderContext(claim());
      await expect(unsafe.value.buildProjection(context, binding())).rejects.toBeInstanceOf(
        StripeSubscriptionProjectionProviderError,
      );
    }
  });

  it('stops a durable replay before provider retrieval', async () => {
    const claimReplay = vi.fn<StripeBillingSubscriptionProjectionStore['claim']>()
      .mockResolvedValue(claim({ status: 'processed', claimToken: null }));
    const store = {
      claim: claimReplay,
      resolveBinding: vi.fn(),
      project: vi.fn(),
      fail: vi.fn(),
      ignoreForeignRail: vi.fn(),
    } satisfies StripeBillingSubscriptionProjectionStore;
    const provider = {
      loadProviderContext: vi.fn(),
      buildProjection: vi.fn(),
    };

    await expect(projectStripeBillingSubscriptionEvent(EVENT_ROW_ID, {
      store,
      resolver: provider,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
    })).resolves.toEqual({ status: 'replay_processed', billingEventId: EVENT_ROW_ID });
    expect(provider.loadProviderContext).not.toHaveBeenCalled();
    expect(store.resolveBinding).not.toHaveBeenCalled();
  });

  it('persists only fixed provider failure codes, never provider error text', async () => {
    const failStore = vi.fn<StripeBillingSubscriptionProjectionStore['fail']>()
      .mockResolvedValue(undefined);
    const store = {
      claim: vi.fn<StripeBillingSubscriptionProjectionStore['claim']>().mockResolvedValue(claim()),
      resolveBinding: vi.fn(),
      project: vi.fn(),
      fail: failStore,
      ignoreForeignRail: vi.fn(),
    } satisfies StripeBillingSubscriptionProjectionStore;
    const provider = {
      loadProviderContext: vi.fn().mockRejectedValue(
        new StripeSubscriptionProjectionProviderError('provider_object_retrieve_failed', true),
      ),
      buildProjection: vi.fn(),
    };

    await projectStripeBillingSubscriptionEvent(EVENT_ROW_ID, {
      store,
      resolver: provider,
      now: () => new Date('2026-08-16T00:00:00.000Z'),
    });

    expect(failStore).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'provider_object_retrieve_failed',
      retryable: true,
    }));
    expect(JSON.stringify(failStore.mock.calls)).not.toContain('Customer');
  });
});

/**
 * A plan change is a subscriptions.update: no Checkout Session, no Session
 * expiry, and its own state vocabulary. The distinction that matters here is
 * that a null `checkoutSessionId` ALSO describes an unrecovered `indeterminate`
 * checkout -- and those two want opposite handling, so every branch below is on
 * the purpose and none of them on the null.
 */
describe('plan-change bindings on the subscription projection rail', () => {
  const planChange = () => binding({
    operationPurpose: 'base_plan_plan_change',
    operationState: 'provider_accepted',
    checkoutSessionId: null,
    checkoutExpiresAt: null,
  });

  it('never goes looking for a Checkout Session, where an indeterminate checkout does', async () => {
    const change = resolver();
    const changeContext = await change.value.loadProviderContext(claim());
    const projection = await change.value.buildProjection(changeContext, planChange());

    expect(projection.checkout_session_id).toBeNull();
    // The whole point. loadExactSession's recovery path would list this
    // subscription's Sessions, find the ORIGINAL checkout at the OLD price,
    // match nothing and dead-letter as `checkout_session_ambiguous` -- a
    // failure describing a problem that does not exist.
    expect(change.listCheckoutSessions).not.toHaveBeenCalled();
    expect(change.retrieveCheckoutSession).not.toHaveBeenCalled();

    // Same null Session id, opposite behaviour, because the purpose differs.
    const checkoutOp = resolver();
    const checkoutContext = await checkoutOp.value.loadProviderContext(claim());
    await checkoutOp.value.buildProjection(
      checkoutContext,
      binding({ operationState: 'indeterminate', checkoutSessionId: null }),
    );
    expect(checkoutOp.listCheckoutSessions).toHaveBeenCalledWith(SUBSCRIPTION_ID);
  });

  it('cannot claim a paid Checkout Session as its payment evidence', async () => {
    const change = resolver();
    const context = await change.value.loadProviderContext(claim());
    const projection = await change.value.buildProjection(context, planChange());

    // The Session fixture this harness returns IS paid, and on the checkout rail
    // the same claim() yields `checkout_session_paid` (see the annual-allowance
    // test above). A plan change is paid for by its proration invoice, and the
    // projector refuses `checkout_session_paid` with no Session outright.
    expect(projection.payment_evidence_kind).not.toBe('checkout_session_paid');
    expect(projection.payment_evidence_kind).toBe('none');
  });
});

/**
 * `parseBinding` is what stands between the RPC and every assumption above. It
 * had no row-level coverage at all before the plan-change ledger existed.
 */
describe('binding rows the projection store must refuse', () => {
  function storeWith(row: Record<string, unknown>) {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const store = new SupabaseStripeBillingSubscriptionProjectionStore({ rpc } as never);
    return store.resolveBinding({
      billingEventId: EVENT_ROW_ID,
      claimToken: CLAIM_TOKEN,
      context: { workspaceId: WORKSPACE_ID, operationId: OPERATION_ID, customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID, priceId: PRICE_ID } as never,
    });
  }
  const row = (overrides: Record<string, unknown> = {}) => ({
    operation_pk: OPERATION_PK,
    operation_state: 'checkout_created',
    operation_purpose: 'base_plan_subscription',
    workspace_id: WORKSPACE_ID,
    operation_id: OPERATION_ID,
    checkout_session_id: SESSION_ID,
    plan_code: 'solo',
    billing_interval: 'annual',
    catalog_version: PRICING_CATALOG_VERSION,
    livemode: false,
    price_id: PRICE_ID,
    product_id: PRODUCT_ID,
    currency: 'usd',
    unit_amount_cents: 42_000,
    terms_version: TERMS_VERSION,
    recurring_consent_version: BASE_PLAN_RECURRING_CONSENT_VERSION,
    recurring_consent_text_sha256: BASE_PLAN_RECURRING_CONSENT_TEXT_SHA256,
    recurring_consent_acceptance_id: '70000000-0000-4000-8000-000000000007',
    checkout_expires_at: '2026-08-16T02:00:00.000Z',
    ...overrides,
  });

  it('accepts each ledger only in its own state vocabulary', async () => {
    await expect(storeWith(row())).resolves.toMatchObject({
      operationPurpose: 'base_plan_subscription',
      operationState: 'checkout_created',
    });
    await expect(storeWith(row({
      operation_purpose: 'base_plan_plan_change',
      operation_state: 'provider_accepted',
      checkout_session_id: null,
      checkout_expires_at: null,
    }))).resolves.toMatchObject({
      operationPurpose: 'base_plan_plan_change',
      checkoutSessionId: null,
      checkoutExpiresAt: null,
    });

    // 'checkout_created' is meaningless on the plan-change ledger, and
    // 'provider_accepted' is meaningless on the checkout one. Merging the two
    // accept-lists would let either row present the other's state.
    await expect(storeWith(row({
      operation_purpose: 'base_plan_plan_change',
      checkout_session_id: null,
      checkout_expires_at: null,
    }))).rejects.toThrow(/operation state is invalid/);
    await expect(storeWith(row({ operation_state: 'provider_accepted' })))
      .rejects.toThrow(/operation state is invalid/);
    await expect(storeWith(row({ operation_purpose: 'something_else' })))
      .rejects.toThrow(/operation purpose is invalid/);
  });

  it('refuses a plan change carrying Checkout evidence, and a checkout missing it', async () => {
    for (const overrides of [
      { checkout_session_id: SESSION_ID, checkout_expires_at: null },
      { checkout_session_id: null, checkout_expires_at: '2026-08-16T02:00:00.000Z' },
    ]) {
      await expect(storeWith(row({
        operation_purpose: 'base_plan_plan_change',
        operation_state: 'provider_accepted',
        ...overrides,
      }))).rejects.toThrow(/cannot carry a Checkout Session/);
    }

    // The mirror image: the checkout rail's Session match compares against this
    // expiry, so a null one cannot be verified against anything.
    await expect(storeWith(row({ checkout_expires_at: null })))
      .rejects.toThrow(/missing its Checkout expiry/);
  });
});
