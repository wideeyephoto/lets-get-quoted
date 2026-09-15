import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRiskDisposition, latestRiskReviews } from '@/lib/risk-reviews';

describe('Risk Reviews Lib', () => {
  describe('isRiskDisposition', () => {
    it('validates dispositions', () => {
      expect(isRiskDisposition('open')).toBe(true);
      expect(isRiskDisposition('monitor')).toBe(true);
      expect(isRiskDisposition('cleared')).toBe(true);
      expect(isRiskDisposition('escalated')).toBe(true);
      expect(isRiskDisposition('unknown')).toBe(false);
      expect(isRiskDisposition(null)).toBe(false);
    });
  });

  describe('latestRiskReviews', () => {
    let adminMock: any;
    let queryMock: any;

    beforeEach(() => {
      queryMock = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn()
      };
      adminMock = {
        from: vi.fn(() => queryMock)
      };
    });

    it('returns empty immediately if no accountIds', async () => {
      const res = await latestRiskReviews(adminMock, []);
      expect(res.available).toBe(true);
      expect(res.reviews.size).toBe(0);
      expect(adminMock.from).not.toHaveBeenCalled();
    });

    it('returns error state if query fails', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: new Error('db error') }));
      const res = await latestRiskReviews(adminMock, ['acct1']);
      expect(res.available).toBe(false);
      expect(res.reviews.size).toBe(0);
    });

    it('returns latest review per account', async () => {
      queryMock.then = vi.fn((resolve) => resolve({
        data: [
          { id: 'rev1', account_id: 'acct1', disposition: 'open' },
          { id: 'rev2', account_id: 'acct1', disposition: 'cleared' }, // Older
          { id: 'rev3', account_id: 'acct2', disposition: 'monitor' }
        ],
        error: null
      }));
      
      const res = await latestRiskReviews(adminMock, ['acct1', 'acct2']);
      expect(res.available).toBe(true);
      expect(res.reviews.size).toBe(2);
      expect(res.reviews.get('acct1')?.id).toBe('rev1'); // Takes first encountered due to order by created_at desc
      expect(res.reviews.get('acct2')?.id).toBe('rev3');
    });
  });
});
