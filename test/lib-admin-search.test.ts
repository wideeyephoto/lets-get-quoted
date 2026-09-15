import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchEverything } from '@/lib/admin-search';

vi.mock('@/lib/admin-accounts', () => ({
  listAccountsForAdmin: vi.fn().mockResolvedValue([]),
  ownerEmailsForAccounts: vi.fn().mockResolvedValue(new Map()),
  accountDisplayName: vi.fn().mockReturnValue('Test Account'),
  accountIdsByPhone: vi.fn().mockResolvedValue({ accountIds: [], phoneMatchMap: new Map() }),
}));

describe('Admin Search Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    adminMock = {
      from: vi.fn().mockImplementation(() => adminMock),
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
    };
  });

  describe('searchEverything', () => {
    it('returns empty for empty term', async () => {
      const res = await searchEverything(adminMock, '   ');
      expect(res.accounts).toEqual([]);
      expect(res.clients).toEqual([]);
      expect(res.quickStops).toEqual([]);
      expect(res.payments).toEqual([]);
    });

    it('handles errors in all branches', async () => {
      adminMock.limit.mockResolvedValue({ data: null, error: new Error('fail') });
      const listAccMock = (await import('@/lib/admin-accounts')).listAccountsForAdmin;
      (listAccMock as any).mockRejectedValue(new Error('fail'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await searchEverything(adminMock, 'test');
      
      expect(res.unavailable).toContain('accounts');
      expect(res.unavailable).toContain('clients');
      expect(res.unavailable).toContain('quickStops');
      expect(res.unavailable).toContain('payments');
      consoleSpy.mockRestore();
    });

    it('searches successfully', async () => {
      const listAccMock = (await import('@/lib/admin-accounts')).listAccountsForAdmin;
      (listAccMock as any).mockResolvedValue([{ id: '1', account_number: 123 }]);

      adminMock.limit.mockImplementation(async function(this: any) {
        // Just return some mock data, the dedupe will handle it
        return { data: [{ id: '1', name: 'Client', client_name: 'QS', amount: 100 }] };
      });

      const res = await searchEverything(adminMock, '1234567890'); // phone length triggers phone branch
      
      expect(res.accounts.length).toBe(1);
      expect(res.accounts[0].id).toBe('1');
      expect(res.accounts[0].title).toBe('Test Account');
      
      expect(res.clients.length).toBe(1);
      expect(res.clients[0].id).toBe('1');
      expect(res.clients[0].title).toBe('Client');

      expect(res.quickStops.length).toBe(1);
      expect(res.quickStops[0].id).toBe('1');
      expect(res.quickStops[0].title).toBe('QS');

      expect(res.payments.length).toBe(1);
      expect(res.payments[0].id).toBe('1');
    });

    it('handles uuid in quickstops and payments', async () => {
      adminMock.limit.mockResolvedValue({ data: [{ id: '123e4567-e89b-12d3-a456-426614174000', label: 'pay', client_name: 'qs' }] });
      const res = await searchEverything(adminMock, '123e4567-e89b-12d3-a456-426614174000');
      
      expect(res.quickStops.length).toBe(1);
      expect(res.payments.length).toBe(1);
    });
  });
});
