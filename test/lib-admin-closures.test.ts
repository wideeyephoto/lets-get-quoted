import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateTimeRemaining, loadPendingIrreversibleWork, loadAccountIrreversibleWork } from '@/lib/admin-closures';

describe('Admin Closures Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn()
    };
    adminMock.from.mockReturnValue(adminMock);
    adminMock.select.mockReturnValue(adminMock);
    adminMock.order.mockReturnValue(adminMock);
    adminMock.eq.mockReturnValue(adminMock);
    adminMock.is.mockReturnValue(adminMock);
  });

  describe('calculateTimeRemaining', () => {
    it('returns zero and expired if past', () => {
      const now = new Date('2023-01-02');
      const res = calculateTimeRemaining('2023-01-01', now);
      expect(res.days).toBe(0);
      expect(res.hours).toBe(0);
      expect(res.isExpired).toBe(true);
    });

    it('calculates days and hours', () => {
      const now = new Date('2023-01-01T00:00:00Z');
      const res = calculateTimeRemaining('2023-01-03T05:00:00Z', now);
      expect(res.days).toBe(2);
      expect(res.hours).toBe(5);
      expect(res.isExpired).toBe(false);
    });
  });

  describe('loadPendingIrreversibleWork', () => {
    it('returns empty if no data', async () => {
      adminMock.limit.mockResolvedValue({ data: null });
      adminMock.select.mockImplementation((sel) => {
        if (sel === 'id, business_name, account_number') {
          return Promise.resolve({ data: null });
        }
        return adminMock;
      });
      const res = await loadPendingIrreversibleWork(adminMock);
      expect(res.activeClosures.length).toBe(0);
      expect(res.completedClosures.length).toBe(0);
      expect(res.recoverableDeletions.length).toBe(0);
    });

    it('loads data', async () => {
      adminMock.limit.mockImplementation(async () => {
        // mock closures and deletions based on call order
        // 1st: closures, 2nd: deletions
        return { data: [] }; // will override below
      });

      // need to mock Promise.all manually or just return specific things
      let callCount = 0;
      adminMock.limit = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            data: [{ id: 'C1', account_id: 'A1', completed_at: null, domain_cleanup_state: 'retry' }, { id: 'C2', completed_at: '2023' }]
          });
        }
        if (callCount === 2) {
          return Promise.resolve({
            data: [{ id: 'D1', account_id: 'A1', status: 'trashed', purge_eligible_at: new Date(Date.now() + 86400000 * 5).toISOString() }]
          });
        }
      });
      adminMock.select = vi.fn().mockImplementation((sel) => {
        if (sel === 'id, business_name, account_number') {
          return Promise.resolve({ data: [{ id: 'A1', business_name: 'Biz', account_number: '123' }] });
        }
        return adminMock;
      });

      const res = await loadPendingIrreversibleWork(adminMock);
      expect(res.activeClosures.length).toBe(1);
      expect(res.completedClosures.length).toBe(1);
      expect(res.recoverableDeletions.length).toBe(1);
      expect(res.metrics.pendingClosuresCount).toBe(1);
      expect(res.metrics.failedClosuresCount).toBe(1); // retry domain_cleanup_state
      expect(res.metrics.activeTrashCount).toBe(1);
      expect(res.metrics.expiringSoonTrashCount).toBe(1); // 5 days is <= 7
    });
  });

  describe('loadAccountIrreversibleWork', () => {
    it('loads account data', async () => {
      adminMock.maybeSingle.mockResolvedValue({
        data: { id: 'C1', closure_subject_id: 'A1' }
      });
      adminMock.limit.mockResolvedValue({
        data: [{ id: 'D1', account_id: 'A1', purge_eligible_at: new Date(Date.now() - 86400000).toISOString() }] // expired
      });

      const res = await loadAccountIrreversibleWork(adminMock, 'A1');
      expect(res.activeClosure?.id).toBe('C1');
      expect(res.recoverableDeletions[0].isExpired).toBe(true);
    });

    it('handles no closure', async () => {
      adminMock.maybeSingle.mockResolvedValue({ data: null });
      adminMock.limit.mockResolvedValue({ data: null });
      const res = await loadAccountIrreversibleWork(adminMock, 'A1');
      expect(res.activeClosure).toBeNull();
      expect(res.recoverableDeletions.length).toBe(0);
    });
  });
});
