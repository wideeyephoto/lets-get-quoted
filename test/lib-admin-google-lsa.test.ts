import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAdminGoogleLsaOverview, loadAccountGoogleLsa } from '@/lib/admin-google-lsa';

describe('Admin Google LSA Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    let fromCall = 0;
    adminMock = {
      from: vi.fn().mockImplementation((table) => {
        return adminMock;
      }),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
    };
  });

  describe('loadAdminGoogleLsaOverview', () => {
    it('returns empty if no data', async () => {
      adminMock.limit.mockResolvedValue({ data: null });
      adminMock.not.mockResolvedValue({ data: null });
      adminMock.select.mockImplementation((sel: any) => {
        if (sel === 'id, business_name') {
          return Promise.resolve({ data: null });
        }
        return adminMock;
      });
      const res = await loadAdminGoogleLsaOverview(adminMock);
      expect(res.connections.length).toBe(0);
      expect(res.recentSpend.length).toBe(0);
    });

    it('loads data and aggregates correctly', async () => {
      adminMock.limit = vi.fn().mockImplementation(async function(this: any) {
        // use call count? Actually this is difficult since it's a chain.
        // Let's rely on from() argument via a custom mock
      });
      
      const tableData: any = {
        'google_lsa_connections': [{ account_id: '1', customer_id: 'C1' }],
        'google_lsa_spend': [{ account_id: '1', cost_dollars: 100 }, { account_id: '1', cost_dollars: 50 }],
        'google_lsa_leads': [{ account_id: '1', google_lead_id: 'L1' }],
        'sites': [{ account_id: '1', content: { adCampaign: { fundingModel: 'auto_refill_wallet', walletBalanceCents: 500 } } }],
        'accounts': [{ id: '1', business_name: 'Test Biz' }]
      };

      adminMock.from = vi.fn().mockImplementation((table) => {
        const mockChain = {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: tableData[table] }),
          not: vi.fn().mockResolvedValue({ data: tableData[table] }),
        };
        // for accounts
        if (table === 'accounts') {
           mockChain.select = vi.fn().mockResolvedValue({ data: tableData[table] });
        }
        return mockChain;
      });

      const res = await loadAdminGoogleLsaOverview(adminMock);
      expect(res.totalSpendDollars).toBe(150);
      expect(res.totalLeadsCount).toBe(1);
      expect(res.activeConnectionsCount).toBe(1);
      expect(res.activeWalletsCount).toBe(1);
      expect(res.totalWalletBalanceDollars).toBe(5);
      expect(res.connections[0].businessName).toBe('Test Biz');
    });
  });

  describe('loadAccountGoogleLsa', () => {
    it('returns empty if no data', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null })
      };
      // For leads count
      mockChain.eq = vi.fn().mockImplementation(function(this: any) {
        return Promise.resolve({ data: null, count: 0 }); // simulate both count and empty array depending on what is called
      });

      adminMock.from = vi.fn().mockImplementation((table) => {
        const m = { ...mockChain };
        if (table === 'google_lsa_spend') {
          m.eq = vi.fn().mockResolvedValue({ data: null });
        }
        if (table === 'google_lsa_connections' || table === 'sites') {
          m.eq = vi.fn().mockReturnThis();
          m.maybeSingle = vi.fn().mockResolvedValue({ data: null });
        }
        if (table === 'google_lsa_leads') {
          m.eq = vi.fn().mockResolvedValue({ count: 0 });
        }
        return m;
      });

      const res = await loadAccountGoogleLsa(adminMock, '1');
      expect(res.connection).toBeNull();
      expect(res.totalSpendDollars).toBe(0);
      expect(res.wallet).toBeNull();
      expect(res.leadsCount).toBe(0);
    });

    it('loads data', async () => {
      adminMock.from = vi.fn().mockImplementation((table) => {
        const m = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockReturnThis(),
        };
        if (table === 'google_lsa_connections') {
          m.maybeSingle = vi.fn().mockResolvedValue({ data: { customer_id: 'C1' } });
        }
        if (table === 'google_lsa_spend') {
          m.eq = vi.fn().mockResolvedValue({ data: [{ cost_dollars: 10 }] });
        }
        if (table === 'google_lsa_leads') {
          m.eq = vi.fn().mockResolvedValue({ count: 5 });
        }
        if (table === 'sites') {
          m.maybeSingle = vi.fn().mockResolvedValue({ data: { content: { adCampaign: { fundingModel: 'auto_refill_wallet', walletBalanceCents: 1000 } } } });
        }
        return m;
      });

      const res = await loadAccountGoogleLsa(adminMock, '1');
      expect(res.connection?.customerId).toBe('C1');
      expect(res.totalSpendDollars).toBe(10);
      expect(res.leadsCount).toBe(5);
      expect(res.wallet?.balanceDollars).toBe(10);
    });
  });
});
