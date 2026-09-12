import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadAccountApiSurface, loadOutboundWebhookFailures } from '@/lib/admin-public-api';

describe('Admin Public API Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    };
  });

  describe('loadAccountApiSurface', () => {
    it('handles empty data', async () => {
      adminMock.limit.mockResolvedValue({ data: null });
      const res = await loadAccountApiSurface(adminMock, 'acct_1');
      expect(res.credentials).toEqual([]);
      expect(res.recentRequests).toEqual([]);
      expect(res.subscriptions).toEqual([]);
      expect(res.recentDeliveries).toEqual([]);
    });

    it('loads and maps data', async () => {
      let callCount = 0;
      adminMock.limit.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ data: [{ id: '1', scopes: ['read'] }] }); // creds
        if (callCount === 2) return Promise.resolve({ data: [{ id: '1', status_code: 200 }] }); // reqs
        if (callCount === 3) return Promise.resolve({ data: [{ id: '1', subscribed_events: ['lead.created'] }] }); // subs
        if (callCount === 4) return Promise.resolve({ data: [{ id: '1', status: 'failed' }] }); // dels
      });

      const res = await loadAccountApiSurface(adminMock, 'acct_1');
      expect(res.credentials.length).toBe(1);
      expect(res.recentRequests.length).toBe(1);
      expect(res.subscriptions.length).toBe(1);
      expect(res.recentDeliveries.length).toBe(1);
    });
  });

  describe('loadOutboundWebhookFailures', () => {
    it('returns empty on error', async () => {
      adminMock.limit.mockResolvedValue({ data: null, error: new Error('fail') });
      const res = await loadOutboundWebhookFailures(adminMock);
      expect(res).toEqual([]);
    });

    it('loads data with business names', async () => {
      adminMock.limit.mockResolvedValue({ data: [{ id: '1', account_id: 'acct_1' }] });
      adminMock.in.mockResolvedValue({ data: [{ id: 'acct_1', business_name: 'Test Biz' }] }); // for accounts

      // We need to differentiate the .limit() from the second .in() call for accounts
      // Actually, .in is called on both chains.
      adminMock.from = vi.fn().mockImplementation((table) => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
        };
        
        if (table === 'webhook_deliveries') {
          chain.limit = vi.fn().mockResolvedValue({ data: [{ id: '1', account_id: 'acct_1' }] });
        }
        if (table === 'accounts') {
          chain.in = vi.fn().mockResolvedValue({ data: [{ id: 'acct_1', business_name: 'Test Biz' }] });
        }
        return chain;
      });

      const res = await loadOutboundWebhookFailures(adminMock);
      expect(res.length).toBe(1);
      expect(res[0].businessName).toBe('Test Biz');
    });
  });
});
