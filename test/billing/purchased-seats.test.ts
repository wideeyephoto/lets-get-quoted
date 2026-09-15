import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  loadPurchasedSeats, 
  loadActivePurchasedCapacitySubscriptions
} from '@/lib/billing/purchased-seats';

describe('purchased-seats', () => {
  let mockAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadPurchasedSeats', () => {
    it('returns zeroes when rpc calls fail', async () => {
      mockAdmin = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('RPC Error') }),
      };

      const result = await loadPurchasedSeats(mockAdmin, 'acc_1');
      expect(result).toEqual({ crewUsers: 0, officeUsers: 0 });
    });

    it('returns parsed integers from string values', async () => {
      mockAdmin = {
        rpc: vi.fn((name, args) => {
          if (args.p_resource_code === 'crew_users') return Promise.resolve({ data: '2', error: null });
          if (args.p_resource_code === 'office_users') return Promise.resolve({ data: '5', error: null });
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await loadPurchasedSeats(mockAdmin, 'acc_1');
      expect(result).toEqual({ crewUsers: 2, officeUsers: 5 });
    });

    it('returns integers directly when passed as numbers', async () => {
      mockAdmin = {
        rpc: vi.fn((name, args) => {
          if (args.p_resource_code === 'crew_users') return Promise.resolve({ data: 3, error: null });
          if (args.p_resource_code === 'office_users') return Promise.resolve({ data: 0, error: null });
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await loadPurchasedSeats(mockAdmin, 'acc_1');
      expect(result).toEqual({ crewUsers: 3, officeUsers: 0 });
    });

    it('handles negative or invalid numbers by defaulting to 0', async () => {
      mockAdmin = {
        rpc: vi.fn((name, args) => {
          if (args.p_resource_code === 'crew_users') return Promise.resolve({ data: -2, error: null });
          if (args.p_resource_code === 'office_users') return Promise.resolve({ data: 'abc', error: null });
          return Promise.resolve({ data: null, error: null });
        }),
      };

      const result = await loadPurchasedSeats(mockAdmin, 'acc_1');
      expect(result).toEqual({ crewUsers: 0, officeUsers: 0 });
    });
  });

  describe('loadActivePurchasedCapacitySubscriptions', () => {
    let mockSelect: any;
    let mockEq: any;
    let mockIn: any;
    let mockOrder: any;

    beforeEach(() => {
      mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });
      mockIn = vi.fn(() => ({ order: mockOrder }));
      mockEq = vi.fn(() => ({ in: mockIn }));
      mockSelect = vi.fn(() => ({ eq: mockEq }));

      mockAdmin = {
        from: vi.fn(() => ({ select: mockSelect })),
      };
    });

    it('returns empty array on error', async () => {
      mockOrder.mockResolvedValue({ data: null, error: new Error('DB Error') });

      const result = await loadActivePurchasedCapacitySubscriptions(mockAdmin, 'acc_1');
      expect(result).toEqual([]);
    });

    it('maps db rows to typed objects correctly', async () => {
      mockOrder.mockResolvedValue({
        data: [{
          id: 'sub_1',
          top_up_id: 'tu_1',
          resource_code: 'crew_users',
          units: 2,
          unit_amount_cents: 500,
          stripe_subscription_id: 'stripe_1',
          status: 'active',
          current_period_end: '2026-10-01T00:00:00Z',
          canceled_at: null,
        }],
        error: null,
      });

      const result = await loadActivePurchasedCapacitySubscriptions(mockAdmin, 'acc_1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'sub_1',
        topUpId: 'tu_1',
        resourceCode: 'crew_users',
        units: 2,
        unitAmountCents: 500,
        stripeSubscriptionId: 'stripe_1',
        status: 'active',
        currentPeriodEnd: '2026-10-01T00:00:00Z',
        canceledAt: null,
      });
    });

    it('handles nullable date fields', async () => {
      mockOrder.mockResolvedValue({
        data: [{
          id: 'sub_2',
          top_up_id: 'tu_2',
          resource_code: 'office_users',
          units: '1',
          unit_amount_cents: '1000',
          stripe_subscription_id: 'stripe_2',
          status: 'past_due',
          current_period_end: null,
          canceled_at: '2026-09-01T00:00:00Z',
        }],
        error: null,
      });

      const result = await loadActivePurchasedCapacitySubscriptions(mockAdmin, 'acc_1');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({
        currentPeriodEnd: null,
        canceledAt: '2026-09-01T00:00:00Z',
        units: 1, // verifies Number() conversion
        unitAmountCents: 1000,
      }));
    });
  });
});
