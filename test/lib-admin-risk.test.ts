import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRiskQueue, RISK_WINDOW_DAYS } from '@/lib/admin-risk';

vi.mock('@/lib/admin-accounts', () => ({
  accountDisplayName: vi.fn().mockReturnValue('Test Account'),
}));

vi.mock('@/lib/risk-score', () => ({
  assessRisk: vi.fn().mockReturnValue({ score: 50 }),
  isWorthReviewing: vi.fn(),
}));

describe('Admin Risk Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
    };
  });

  describe('buildRiskQueue', () => {
    it('handles database errors', async () => {
      adminMock.limit.mockResolvedValue({ data: null, error: new Error('fail'), count: 0 });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await buildRiskQueue(adminMock);
      expect(res.rows).toEqual([]);
      expect(res.available).toBe(false);
      expect(res.unavailableSources.length).toBe(3);
      expect(consoleSpy).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    it('loads and aggregates risk signals', async () => {
      const isWorthMock = (await import('@/lib/risk-score')).isWorthReviewing;
      (isWorthMock as any).mockReturnValue(true);

      let callCount = 0;
      adminMock.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: [{ id: '1', created_at: '2023-01-01', suspended_at: null }] }); // accounts
        if (callCount === 2) return Promise.resolve({ data: [{ account_id: '1', amount: 100, paid_at: '2023-01-02', disputed_at: '2023-01-03', dispute_status: 'lost', refunded_amount: 10 }] }); // payments
        if (callCount === 3) return Promise.resolve({ data: [{ account_id: '1' }] }); // extra_stop_requests
      });

      const res = await buildRiskQueue(adminMock);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].accountId).toBe('1');
      expect(res.rows[0].signals.paidCount).toBe(1);
      expect(res.rows[0].signals.disputedCount).toBe(1);
      expect(res.rows[0].signals.chargebacksLost).toBe(1);
      expect(res.rows[0].signals.refundCount).toBe(1);
      expect(res.rows[0].signals.noShowsConfirmed).toBe(1);
    });

    it('filters un-reviewable accounts', async () => {
      const isWorthMock = (await import('@/lib/risk-score')).isWorthReviewing;
      (isWorthMock as any).mockReturnValue(false);

      adminMock.limit.mockResolvedValue({ data: [{ id: '1', created_at: '2023-01-01' }], count: 1 }); // applies to all

      const res = await buildRiskQueue(adminMock);
      expect(res.rows.length).toBe(0);
      expect(res.accountsScanned).toBe(1);
    });
  });
});
