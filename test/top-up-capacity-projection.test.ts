import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

/**
 * The recurring-capacity branch of the top-up projector.
 *
 * Every capacity SKU is in TOP_UPS_WITHHELD today, and the withheld check runs
 * first, so `capacity_granted` is unreachable in the real catalog -- exactly as
 * intended while nothing can cancel a seat. That makes this branch untestable
 * without lifting the withhold, so this file mocks the catalog to un-withhold
 * `crew_user` and nothing else.
 *
 * The mock is the point, not a workaround: it is how the code will behave on the
 * day the withhold is lifted, tested before that day rather than after.
 */
vi.mock('@/lib/billing/catalog', async () => {
  const actual = await vi.importActual<typeof import('@/lib/billing/catalog')>(
    '@/lib/billing/catalog',
  );
  const withheld = { ...actual.TOP_UPS_WITHHELD };
  delete (withheld as Record<string, unknown>).crew_user;
  return { ...actual, TOP_UPS_WITHHELD: Object.freeze(withheld) };
});

import { PRICING_CATALOG_VERSION, TOP_UPS, TOP_UPS_WITHHELD } from '@/lib/billing/catalog';
import { decideTopUpProjection } from '@/lib/billing/top-up-event-projector';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = 'cs_test_capacity123';
const BILLING_EVENT_ID = '20000000-0000-4000-8000-000000000002';
const SUBSCRIPTION_ID = 'sub_CapacitySeat01';

function claim(eventType = 'checkout.session.completed') {
  return {
    eventType: eventType as never,
    checkoutSessionId: SESSION_ID,
    billingEventId: BILLING_EVENT_ID,
  };
}

function session(
  topUpId: string,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  const sku = TOP_UPS[topUpId as keyof typeof TOP_UPS];
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    payment_status: 'paid',
    subscription: SUBSCRIPTION_ID,
    metadata: {
      lgq_purpose: 'top_up',
      lgq_top_up_id: topUpId,
      lgq_account_id: WORKSPACE_ID,
      lgq_resource_code: sku.resourceCode,
      lgq_units: String(sku.units),
      lgq_catalog_version: PRICING_CATALOG_VERSION,
    },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe('the mock actually lifts the withhold', () => {
  it('leaves crew_user sellable and every other capacity SKU withheld', () => {
    // Guards the guard: if the mock stopped working, every assertion below would
    // pass for the wrong reason -- fulfillment_withheld instead of the branch.
    expect(TOP_UPS_WITHHELD.crew_user).toBeUndefined();
    expect(TOP_UPS_WITHHELD.storage_100gb).toBeTruthy();
    expect(TOP_UPS_WITHHELD.office_user).toBeTruthy();
  });
});

describe('a paid recurring-capacity purchase', () => {
  it('is granted as capacity, not as a consumable credit lot', () => {
    const decision = decideTopUpProjection(claim(), session('crew_user'));

    expect(decision.outcome).toBe('capacity_granted');
    expect(decision).toMatchObject({
      checkout_session_id: SESSION_ID,
      account_id: WORKSPACE_ID,
      resource_code: 'crew_users',
      units: 1,
      top_up_id: 'crew_user',
      stripe_subscription_id: SUBSCRIPTION_ID,
      catalog_version: PRICING_CATALOG_VERSION,
    });
    // Never 'grant': that path writes usage_credit_lots, whose reservation
    // machinery would happily spend a seat.
    expect(decision.outcome).not.toBe('grant');
  });

  it('takes the amount from the catalog, never from the Session', () => {
    const decision = decideTopUpProjection(claim(), session('crew_user', {
      amount_total: 999_999,
    } as Partial<Stripe.Checkout.Session>));
    expect(decision.unit_amount_cents).toBe(TOP_UPS.crew_user.priceCents);
    expect(decision.unit_amount_cents).toBe(500);
  });

  it('accepts an expanded subscription object as well as an id', () => {
    const decision = decideTopUpProjection(claim(), session('crew_user', {
      subscription: { id: SUBSCRIPTION_ID } as Stripe.Subscription,
    }));
    expect(decision.stripe_subscription_id).toBe(SUBSCRIPTION_ID);
  });
});

describe('capacity that nothing could ever cancel is refused', () => {
  it.each([
    ['no subscription at all', null],
    ['a malformed subscription id', 'not_a_subscription'],
    ['an empty id', ''],
  ])('defers rather than granting with %s', (_label, subscription) => {
    // The seat is owned by the subscription, not the Session. Granting without
    // that id creates capacity with no lifecycle -- a seat nobody can take back
    // when the customer stops paying.
    const decision = decideTopUpProjection(claim(), session('crew_user', {
      subscription: subscription as unknown as Stripe.Checkout.Session['subscription'],
    }));
    expect(decision.outcome).toBe('capacity_fulfillment_deferred');
    expect(decision).not.toHaveProperty('stripe_subscription_id');
    expect(decision.account_id).toBe(WORKSPACE_ID);
  });
});

describe('the withheld check still wins', () => {
  it.each(['storage_100gb', 'office_user'])('refuses %s even though it is capacity', (topUpId) => {
    // Withheld is checked before fulfillment kind, so a SKU the catalog refuses
    // to sell is not fulfilled by EITHER path.
    const decision = decideTopUpProjection(claim(), session(topUpId));
    expect(decision.outcome).toBe('fulfillment_withheld');
  });
});

describe('the money checks still come first', () => {
  it.each([
    ['checkout.session.expired', 'checkout_expired'],
    ['checkout.session.async_payment_failed', 'payment_failed'],
  ])('%s short-circuits before the capacity branch', (eventType, outcome) => {
    const decision = decideTopUpProjection(claim(eventType), session('crew_user'));
    expect(decision.outcome).toBe(outcome);
  });

  it('does not grant a seat while the money is still moving', () => {
    // A delayed rail sends checkout.session.completed with payment_status
    // 'unpaid'. Granting on the event name alone hands out a seat for a payment
    // that can still fail.
    const decision = decideTopUpProjection(
      claim(),
      session('crew_user', { payment_status: 'unpaid' }),
    );
    expect(decision.outcome).toBe('awaiting_async_payment');
  });
});
