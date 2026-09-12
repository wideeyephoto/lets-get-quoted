import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAdminAccountUsageAndOverage, loadPlatformOverageOverview } from '@/lib/admin-overage';

vi.mock('@/lib/billing/overage-summary', () => ({
  loadOverageSummary: vi.fn().mockResolvedValue({}),
  describeOverageResource: vi.fn(),
  formatOverageTotal: vi.fn(),
  formatOverageRate: vi.fn(),
  remainingCapMillicents: vi.fn(),
}));

vi.mock('@/lib/billing/credit-lots', () => ({
  loadWorkspaceCreditLots: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/billing/storage-usage', () => ({
  loadWorkspaceStorageState: vi.fn().mockResolvedValue({}),
  formatStorageBytes: vi.fn(),
}));

vi.mock('@/lib/billing/purchased-seats', () => ({
  loadActivePurchasedCapacitySubscriptions: vi.fn().mockResolvedValue([]),
  loadPurchasedSeats: vi.fn().mockResolvedValue({ crewUsers: 0, officeUsers: 0 }),
}));

describe('Admin Overage Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    };
  });

  describe('loadAdminAccountUsageAndOverage', () => {
    it('handles database errors gracefully and aggregates data', async () => {
      adminMock.limit.mockResolvedValue({ data: null, error: new Error('fail') });
      const res = await loadAdminAccountUsageAndOverage(adminMock, 'acct_1');
      expect(res.settlements).toEqual([]);
      expect(res.pendingAccruals).toEqual([]);
      expect(res.authorizations).toEqual([]);
    });

    it('loads and maps data', async () => {
      let callCount = 0;
      adminMock.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: [{ id: '1', period_start: '2023' }] }); // settlements
        if (callCount === 2) return Promise.resolve({ data: [{ period_start: '2023' }] }); // accruals
        if (callCount === 3) return Promise.resolve({ data: [{ id: '1', action: 'enabled' }] }); // auth
      });
      const res = await loadAdminAccountUsageAndOverage(adminMock, 'acct_1');
      expect(res.settlements.length).toBe(1);
      expect(res.pendingAccruals.length).toBe(1);
      expect(res.authorizations.length).toBe(1);
    });
  });

  describe('loadPlatformOverageOverview', () => {
    it('aggregates platform data', async () => {
      let selectCallCount = 0;
      adminMock.select.mockImplementation((sel: string) => {
        if (sel.includes('millicents')) { // accruals
          return Promise.resolve({ data: [{ account_id: '1', millicents: 20000 }, { account_id: '2', millicents: 5000 }] });
        }
        if (sel.includes('cap_cents')) { // settings
          return {
            eq: vi.fn().mockResolvedValue({ data: [{ account_id: '1', cap_cents: 10 }, { account_id: '2', cap_cents: 100 }] })
          };
        }
        if (sel.includes('chargeable_cents')) { // settlements
          return {
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'S1', account_id: '1', state: 'failed' }] })
            })
          };
        }
        return adminMock;
      });

      const res = await loadPlatformOverageOverview(adminMock);
      expect(res.totalPendingAccrualMillicents).toBe(25000);
      expect(res.pendingAccrualAccountsCount).toBe(2);
      expect(res.exhaustedCapsCount).toBe(1);
      expect(res.exhaustedAccountIds).toEqual(['1']);
      expect(res.failedSettlementsCount).toBe(1);
      expect(res.recentSettlements.length).toBe(1);
    });
  });
});
