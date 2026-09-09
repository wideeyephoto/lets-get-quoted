import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capacitySubscriptionPeriodEnd } from '@/lib/billing/capacity-lifecycle';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), retrieve: vi.fn() }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve } }) }));
vi.mock('@/lib/billing/stripe-billing-subscription-checkout', () => ({ assertConfiguredStripeBillingMode: vi.fn() }));
import { runPurchasedCapacityLifecycleSweep } from '@/lib/billing/capacity-lifecycle-worker';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('LGQ_STRIPE_BILLING_LIVEMODE', '0');
  mocks.rpc.mockResolvedValueOnce({ data: [{ stripe_subscription_id: 'sub_fixture123456', account_id: 'fixture', status: 'active' }], error: null })
    .mockResolvedValueOnce({ data: 'unchanged', error: null });
});

describe('add-on renewal dates from modern Stripe responses', () => {
  it('persists the item period even when the top-level period is absent', async () => {
    mocks.retrieve.mockResolvedValue({ id: 'sub_fixture123456', livemode: false, status: 'active', items: { has_more: false, data: [{ current_period_end: 1791480206 }] } });
    expect(await runPurchasedCapacityLifecycleSweep()).toMatchObject({ status: 'completed', examined: 1, providerErrors: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith('apply_purchased_capacity_provider_state', {
      p_livemode: false, p_stripe_subscription_id: 'sub_fixture123456', p_status: 'active', p_current_period_end: new Date(1791480206000).toISOString(),
    });
  });

  it('does not invent one renewal date for multiple or incomplete items', () => {
    const item = { current_period_end: 1791480206 };
    expect(capacitySubscriptionPeriodEnd({ items: { data: [item, { current_period_end: 1792000000 }] } })).toBeNull();
    expect(capacitySubscriptionPeriodEnd({ items: { data: [item], has_more: true } })).toBeNull();
    expect(capacitySubscriptionPeriodEnd({ current_period_end: 1791480206 })).toBeNull();
  });

  it('preserves an unknown period rather than writing an invalid instant', () => {
    for (const end of [null, undefined, 0, -1, '1791480206', 1.5, Infinity, 9e15]) {
      expect(capacitySubscriptionPeriodEnd({ items: { data: [{ current_period_end: end }] } })).toBeNull();
    }
  });
});
