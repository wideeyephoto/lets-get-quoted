import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMessagingOperationsHealth } from '@/lib/admin-messaging';

vi.mock('@/lib/sms-provider', () => ({
  smsProviderSummary: vi.fn(() => ({ type: 'mock' })),
  outboundSmsSuppression: vi.fn(() => null),
}));

describe('admin-messaging', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => {
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn(() => chain),
          in: vi.fn(() => chain),
          is: vi.fn(() => chain),
          gte: vi.fn(() => chain),
          order: vi.fn(() => chain),
          limit: vi.fn(() => chain),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          then: vi.fn((resolve) => resolve({ data: [], error: null, count: 0 })),
        };
        return chain;
      }),
    };
  });

  describe('loadMessagingOperationsHealth', () => {
    it('returns structured health info given normal query results', async () => {
      // Just test that it can successfully run without errors
      // The mock is very simple but satisfies Promise.all calls.
      const result = await loadMessagingOperationsHealth(mockSupabase as any);
      
      expect(result).toBeDefined();
      expect(result.unavailable).toEqual([]);
      expect(result.taskCounts['queued']).toBe(0);
      expect(result.openReviews).toEqual([]);
      expect(result.deliveryExceptions).toEqual([]);
      expect(typeof result.workerEnabled).toBe('boolean');
      expect(result.purposeGates).toBeDefined();
      expect(result.canaryAccounts).toBeDefined();
      expect(result.senders).toBeDefined();
    });

    it('collects unavailable sections when queries error', async () => {
      mockSupabase = {
        from: vi.fn(() => {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            is: vi.fn(() => chain),
            gte: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: new Error('DB Error') })),
            then: vi.fn((resolve) => resolve({ data: null, error: new Error('DB Error'), count: null })),
          };
          return chain;
        }),
      };

      const result = await loadMessagingOperationsHealth(mockSupabase as any);
      
      expect(result.unavailable).toContain('sender inventory');
      expect(result.unavailable).toContain('delivery queue');
      expect(result.unavailable).toContain('outbound lifecycle');
      expect(result.unavailable).toContain('inbound lifecycle');
      expect(result.unavailable).toContain('operator review');
      expect(result.unavailable).toContain('delivery exception details');
      expect(result.unavailable).toContain('delivery lifecycle counts');
    });
  });
});
