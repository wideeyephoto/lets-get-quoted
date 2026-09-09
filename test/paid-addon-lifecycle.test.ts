import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { PRICING_CATALOG_VERSION, TOP_UPS, type TopUpId } from '@/lib/billing/catalog';
import { decideTopUpProjection, projectPlatformTopUpEvent, type TopUpProjectorClaim, type TopUpProjectionStore } from '@/lib/billing/top-up-event-projector';

vi.mock('@/lib/auth', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: vi.fn() }));

const skus: TopUpId[] = ['voice_minutes_100', 'ai_voice_flex', 'ai_voice_solo', 'ai_voice_growth', 'storage_100gb', 'office_user'];
const workspace = '30000000-0000-4000-8000-000000000003';
function fixture(skuId: TopUpId) {
  const sku = TOP_UPS[skuId];
  const claim: TopUpProjectorClaim = {
    status: 'claimed', billingEventId: '10000000-0000-4000-8000-000000000001',
    claimToken: '20000000-0000-4000-8000-000000000002', attemptCount: 1,
    providerEventId: 'evt_lifecycle', eventType: 'checkout.session.completed',
    checkoutSessionId: 'cs_test_lifecycle', workspaceId: workspace, livemode: false,
    providerCreatedAt: '2026-09-09T00:00:00Z',
  };
  const session = {
    id: claim.checkoutSessionId, object: 'checkout.session', livemode: false,
    status: 'complete', payment_status: 'paid', mode: sku.recurring ? 'subscription' : 'payment',
    subscription: sku.recurring ? 'sub_Lifecycle12345678' : null,
    metadata: { lgq_purpose: 'top_up', lgq_top_up_id: sku.id, lgq_account_id: workspace,
      lgq_resource_code: sku.resourceCode, lgq_units: String(sku.units), lgq_catalog_version: PRICING_CATALOG_VERSION },
  } as unknown as Stripe.Checkout.Session;
  return { sku, claim, session };
}

describe.each(skus)('%s paid lifecycle', (skuId) => {
  it('grants no benefit for an initial unpaid checkout or failed/expired receipt', () => {
    const { claim, session } = fixture(skuId);
    session.payment_status = 'unpaid';
    for (const [eventType, outcome] of [
      ['checkout.session.completed', 'awaiting_async_payment'],
      ['checkout.session.async_payment_failed', 'payment_failed'],
      ['checkout.session.expired', 'checkout_expired'],
    ] as const) {
      const result = decideTopUpProjection({ ...claim, eventType }, session);
      expect(result.outcome).toBe(outcome);
      expect(result.units).toBeUndefined();
      expect(result.stripe_subscription_id).toBeUndefined();
    }
  });

  it('does not treat a no-payment-required checkout as a paid add-on', () => {
    const { claim, session } = fixture(skuId);
    expect(decideTopUpProjection(claim, { ...session, payment_status: 'no_payment_required' }).units).toBeUndefined();
  });

  it('retries a success receipt while the current provider state remains unpaid', async () => {
    const { claim: initialClaim, session } = fixture(skuId);
    const claim = { ...initialClaim, eventType: 'checkout.session.async_payment_succeeded' as const };
    const store: TopUpProjectionStore = {
      claim: vi.fn().mockResolvedValue(claim), project: vi.fn(), fail: vi.fn().mockResolvedValue(undefined),
    };
    const result = await projectPlatformTopUpEvent(claim.billingEventId, {
      store, resolver: { loadSession: async () => ({ ...session, payment_status: 'unpaid' }) },
      now: () => new Date('2026-09-09T00:00:00Z'),
    });
    expect(result).toMatchObject({ status: 'failed_retryable', errorCode: 'provider_payment_not_paid' });
    expect(store.project).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(expect.objectContaining({ retryable: true, nextAttemptAt: '2026-09-09T00:05:00.000Z' }));
  });

  it('uses the same grant key for completion and later paid recovery; stale failures grant nothing', () => {
    const { sku, claim, session } = fixture(skuId);
    const first = decideTopUpProjection(claim, session);
    const recovered = decideTopUpProjection({ ...claim, eventType: 'checkout.session.async_payment_succeeded' }, session);
    expect(first.outcome).toBe(sku.recurring ? 'capacity_granted' : 'grant');
    expect(recovered.units).toBe(sku.units);
    expect(recovered.idempotency_key).toBe(first.idempotency_key);
    const stale = decideTopUpProjection({ ...claim, eventType: 'checkout.session.async_payment_failed' }, session);
    expect(stale).toMatchObject({ outcome: 'payment_failed' });
    expect(stale.units).toBeUndefined();
  });
});
