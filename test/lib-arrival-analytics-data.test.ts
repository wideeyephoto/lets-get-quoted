import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadArrivalAnalytics } from '@/lib/arrival-analytics-data';

vi.mock('@/lib/arrival-analytics', () => ({
  summariseArrivals: vi.fn().mockReturnValue({ trips: 10 }),
  summariseByCrew: vi.fn().mockReturnValue([{ crewId: 'C1' }]),
  arrivalAdvice: vi.fn().mockReturnValue('Do better'),
}));

describe('Arrival Analytics Data Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
  });

  describe('loadArrivalAnalytics', () => {
    it('returns empty on error', async () => {
      adminMock.limit.mockResolvedValue({ data: null, error: new Error('fail') });
      const res = await loadArrivalAnalytics(adminMock, 'acct_1');
      expect(res.available).toBe(false);
      expect(res.byCrew).toEqual([]);
      expect(res.advice).toBeNull();
    });

    it('loads and processes data', async () => {
      adminMock.limit.mockResolvedValue({ data: [{ crew_id: 'C1', status: 'arrived' }] });
      const res = await loadArrivalAnalytics(adminMock, 'acct_1');
      expect(res.available).toBe(true);
      expect(res.summary.trips).toBe(10);
      expect(res.byCrew[0].crewId).toBe('C1');
      expect(res.advice).toBe('Do better');
    });
  });
});
