import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listQuickStopRequestsForAdmin, getQuickStopAdminDetail } from '@/lib/admin-quick-stops';

vi.mock('@/lib/quick-stop-requests', () => ({
  getQuickStopRequestById: vi.fn(),
}));

describe('Admin Quick Stops Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: vi.fn() // allow await
    };
    
    // Default resolve
    adminMock.then.mockImplementation((resolve) => resolve({ data: [], count: 0 }));
  });

  describe('listQuickStopRequestsForAdmin', () => {
    it('returns empty on error', async () => {
      adminMock.then.mockImplementation((resolve) => resolve({ data: null, error: new Error('fail') }));
      const res = await listQuickStopRequestsForAdmin(adminMock, { statuses: ['pending'], accountId: '1' });
      expect(res.rows).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('loads and maps data', async () => {
      adminMock.then.mockImplementation((resolve) => resolve({ data: [{ id: '1', account_id: 'acct_1' }], count: 1 }));
      
      adminMock.from = vi.fn().mockImplementation((table) => {
        const chain = { ...adminMock };
        if (table === 'accounts') {
          chain.in = vi.fn().mockResolvedValue({ data: [{ id: 'acct_1', business_name: 'Test Biz', account_number: 123 }] });
        }
        if (table === 'sites') {
          chain.in = vi.fn().mockResolvedValue({ data: [{ account_id: 'acct_1', company_name: 'Company' }] });
        }
        return chain;
      });

      const res = await listQuickStopRequestsForAdmin(adminMock);
      expect(res.rows.length).toBe(1);
      expect(res.total).toBe(1);
      expect(res.rows[0].business_name).toBe('Test Biz');
      expect(res.rows[0].company_name).toBe('Company');
      expect(res.rows[0].account_number).toBe(123);
    });
  });

  describe('getQuickStopAdminDetail', () => {
    it('returns null if not found', async () => {
      const getReqMock = (await import('@/lib/quick-stop-requests')).getQuickStopRequestById;
      (getReqMock as any).mockResolvedValue(null);
      const res = await getQuickStopAdminDetail(adminMock, '1');
      expect(res).toBeNull();
    });

    it('loads data with payment', async () => {
      const getReqMock = (await import('@/lib/quick-stop-requests')).getQuickStopRequestById;
      (getReqMock as any).mockResolvedValue({ id: '1', account_id: 'acct_1', payment_id: 'pay_1' });
      
      adminMock.from = vi.fn().mockImplementation((table) => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockReturnThis(),
        };
        if (table === 'accounts') chain.maybeSingle = vi.fn().mockResolvedValue({ data: { business_name: 'Biz', account_number: 1 } });
        if (table === 'sites') chain.maybeSingle = vi.fn().mockResolvedValue({ data: { company_name: 'Comp' } });
        if (table === 'extra_stop_events') chain.order = vi.fn().mockResolvedValue({ data: [{ id: 'ev_1' }] });
        if (table === 'payments') chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'pay_1', amount: 100 } });
        return chain;
      });

      const res = await getQuickStopAdminDetail(adminMock, '1');
      expect(res?.request.id).toBe('1');
      expect(res?.business_name).toBe('Biz');
      expect(res?.company_name).toBe('Comp');
      expect(res?.account_number).toBe(1);
      expect(res?.events.length).toBe(1);
      expect(res?.payment?.id).toBe('pay_1');
    });

    it('loads data without payment', async () => {
      const getReqMock = (await import('@/lib/quick-stop-requests')).getQuickStopRequestById;
      (getReqMock as any).mockResolvedValue({ id: '1', account_id: 'acct_1', payment_id: null });
      
      adminMock.from = vi.fn().mockImplementation((table) => {
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockReturnThis(),
        };
        if (table === 'accounts') chain.maybeSingle = vi.fn().mockResolvedValue({ data: null });
        if (table === 'sites') chain.maybeSingle = vi.fn().mockResolvedValue({ data: null });
        if (table === 'extra_stop_events') chain.order = vi.fn().mockResolvedValue({ data: [] });
        return chain;
      });

      const res = await getQuickStopAdminDetail(adminMock, '1');
      expect(res?.request.id).toBe('1');
      expect(res?.payment).toBeNull();
    });
  });
});
