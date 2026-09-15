import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyDuePlanChanges } from '@/lib/billing/plan-change-worker';
import { loadVerifiedStripePlanPrices } from '@/lib/billing/stripe-plan-prices';
import { getStripeClient } from '@/lib/stripe';
import { basePlanSubscriptionPlanChangeEnabled } from '@/lib/billing/plan-change';
import { recordAccountEvent } from '@/lib/account-events';

vi.mock('@/lib/billing/stripe-plan-prices', () => ({
  loadVerifiedStripePlanPrices: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(),
}));

vi.mock('@/lib/billing/plan-change', () => ({
  basePlanSubscriptionPlanChangeEnabled: vi.fn(),
  buildPlanChangeIdempotencyKey: vi.fn((input) => `idemp_${input.workspaceId}_${input.targetPlanCode}`),
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn(),
}));

describe('applyDuePlanChanges', () => {
  let mockAdmin: any;
  let mockSelect: any;
  let mockNot: any;
  let mockLte: any;
  let mockIn: any;
  let mockOrder: any;
  let mockLimit: any;
  let mockRpc: any;
  let mockStripe: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    mockOrder = vi.fn(() => ({ limit: mockLimit }));
    mockIn = vi.fn(() => ({ order: mockOrder }));
    mockLte = vi.fn(() => ({ in: mockIn }));
    mockNot = vi.fn(() => ({ lte: mockLte }));
    mockSelect = vi.fn(() => ({ not: mockNot }));
    
    mockRpc = vi.fn().mockResolvedValue({ error: null });

    mockAdmin = {
      from: vi.fn(() => ({ select: mockSelect })),
      rpc: mockRpc,
    };

    mockStripe = {
      subscriptions: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    (getStripeClient as any).mockReturnValue(mockStripe);

    (basePlanSubscriptionPlanChangeEnabled as any).mockReturnValue(true);
  });

  it('skips when plan changes are disabled', async () => {
    (basePlanSubscriptionPlanChangeEnabled as any).mockReturnValue(false);
    mockLimit.mockResolvedValue({
      data: [{ account_id: 'a1', provider_subscription_item_id: 'i1' }],
      error: null,
    });

    const result = await applyDuePlanChanges({ admin: mockAdmin, limit: 10 });
    expect(result.selected).toBe(1);
    expect(result.skipped_disabled).toBe(1);
    expect(result.applied).toBe(0);
  });

  it('skips rows without provider_subscription_item_id', async () => {
    mockLimit.mockResolvedValue({
      data: [{ account_id: 'a1', provider_subscription_item_id: null }],
      error: null,
    });

    const result = await applyDuePlanChanges({ admin: mockAdmin, limit: 10 });
    expect(result.selected).toBe(1);
    expect(result.skipped_no_item).toBe(1);
  });

  it('skips rows with unpriceable targets', async () => {
    mockLimit.mockResolvedValue({
      data: [{ 
        account_id: 'a1', 
        provider_subscription_id: 'sub_1',
        provider_subscription_item_id: 'si_1',
        pending_plan_code: 'unknown_plan',
        pending_billing_interval: 'month'
      }],
      error: null,
    });
    
    (loadVerifiedStripePlanPrices as any).mockResolvedValue({
      'some_other_plan_month': { priceId: 'price_123', planCode: 'some_other_plan', billingInterval: 'month' }
    });

    const result = await applyDuePlanChanges({ admin: mockAdmin, limit: 10 });
    expect(result.skipped_unpriceable).toBe(1);
    expect(mockStripe.subscriptions.update).not.toHaveBeenCalled();
  });

  it('applies a due plan change successfully', async () => {
    mockLimit.mockResolvedValue({
      data: [{ 
        account_id: 'a1', 
        provider_subscription_id: 'sub_1',
        provider_subscription_item_id: 'si_1',
        plan_code: 'free',
        pending_plan_code: 'pro',
        pending_billing_interval: 'month',
        updated_at: '2026-01-01T00:00:00Z'
      }],
      error: null,
    });
    
    (loadVerifiedStripePlanPrices as any).mockResolvedValue({
      'pro_month': { priceId: 'price_pro', planCode: 'pro', billingInterval: 'month', catalogVersion: 'v1' }
    });

    const result = await applyDuePlanChanges({ admin: mockAdmin, limit: 10 });
    
    expect(result.applied).toBe(1);
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        items: [{ id: 'si_1', price: 'price_pro' }],
        proration_behavior: 'none',
      }),
      expect.objectContaining({ idempotencyKey: 'idemp_a1_pro' })
    );

    expect(mockRpc).toHaveBeenCalledWith('set_billing_subscription_pending_plan', {
      p_account_id: 'a1',
      p_provider_subscription_id: 'sub_1',
      p_pending_plan_code: null,
      p_pending_billing_interval: null,
      p_pending_effective_at: null,
    });

    expect(recordAccountEvent).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'a1',
      kind: 'plan_change_applied',
    }));
  });

  it('records failure if stripe update fails', async () => {
    mockLimit.mockResolvedValue({
      data: [{ 
        account_id: 'a1', 
        provider_subscription_id: 'sub_1',
        provider_subscription_item_id: 'si_1',
        pending_plan_code: 'pro',
        pending_billing_interval: 'month'
      }],
      error: null,
    });
    
    (loadVerifiedStripePlanPrices as any).mockResolvedValue({
      'pro_month': { priceId: 'price_pro', planCode: 'pro', billingInterval: 'month', catalogVersion: 'v1' }
    });

    mockStripe.subscriptions.update.mockRejectedValue(new Error('Stripe error'));

    const result = await applyDuePlanChanges({ admin: mockAdmin, limit: 10 });
    
    expect(result.failures).toBe(1);
    expect(mockRpc).not.toHaveBeenCalled();
  });
  
  it('records failure if pending clear fails', async () => {
    mockLimit.mockResolvedValue({
      data: [{ 
        account_id: 'a1', 
        provider_subscription_id: 'sub_1',
        provider_subscription_item_id: 'si_1',
        pending_plan_code: 'pro',
        pending_billing_interval: 'month'
      }],
      error: null,
    });
    
    (loadVerifiedStripePlanPrices as any).mockResolvedValue({
      'pro_month': { priceId: 'price_pro', planCode: 'pro', billingInterval: 'month', catalogVersion: 'v1' }
    });

    mockRpc.mockResolvedValue({ error: new Error('RPC error') });

    const result = await applyDuePlanChanges({ admin: mockAdmin, limit: 10 });
    
    expect(result.failures).toBe(1);
    expect(recordAccountEvent).not.toHaveBeenCalled();
  });
});
