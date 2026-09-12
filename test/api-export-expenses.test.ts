import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/export/expenses/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
}));

vi.mock('@/lib/expense-ledger', () => ({
  listAllAccountExpenses: vi.fn(),
  generateExpensesCsv: vi.fn(),
}));

describe('Export Expenses API Route', () => {
  let requireOfficeContextMock: any;
  let listAllAccountExpensesMock: any;
  let generateExpensesCsvMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    
    requireOfficeContextMock = (await import('@/lib/auth')).requireOfficeContext;
    requireOfficeContextMock.mockResolvedValue({
      supabase: {},
      accountId: 'acct_123',
      accountTimeZone: 'America/New_York'
    });

    listAllAccountExpensesMock = (await import('@/lib/expense-ledger')).listAllAccountExpenses;
    listAllAccountExpensesMock.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] });

    generateExpensesCsvMock = (await import('@/lib/expense-ledger')).generateExpensesCsv;
    generateExpensesCsvMock.mockReturnValue('expense1\nexpense2\n');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createRequest = (url: string) => {
    return new NextRequest(url);
  };

  it('exports expenses with all default filters', async () => {
    const req = createRequest('http://localhost/api/export/expenses');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="letsgetquoted-expenses-ledger-2026-09-12.csv"');
    
    const text = await res.text();
    expect(text).toBe('expense1\nexpense2\n');
    
    expect(requireOfficeContextMock).toHaveBeenCalledWith('reports.read');
    
    expect(listAllAccountExpensesMock).toHaveBeenCalledWith(
      expect.any(Object),
      'acct_123',
      {
        type: 'all',
        source: 'all',
        jobId: undefined,
        supplier: undefined,
        query: undefined,
        dateFrom: undefined,
        dateTo: undefined,
      }
    );
    
    expect(generateExpensesCsvMock).toHaveBeenCalledWith(
      [{ id: 1 }, { id: 2 }],
      'America/New_York'
    );
  });

  it('exports expenses with custom filters parsed from URL', async () => {
    const req = createRequest('http://localhost/api/export/expenses?type=material&source=manual&jobId=job_1&supplier=Home+Depot&query=paint&dateFrom=2026-09-01&dateTo=2026-09-30');
    await GET(req);
    
    expect(listAllAccountExpensesMock).toHaveBeenCalledWith(
      expect.any(Object),
      'acct_123',
      {
        type: 'material',
        source: 'manual',
        jobId: 'job_1',
        supplier: 'Home Depot',
        query: 'paint',
        dateFrom: '2026-09-01',
        dateTo: '2026-09-30',
      }
    );
  });

  it('treats supplier=all as undefined', async () => {
    const req = createRequest('http://localhost/api/export/expenses?supplier=all');
    await GET(req);
    
    expect(listAllAccountExpensesMock).toHaveBeenCalledWith(
      expect.any(Object),
      'acct_123',
      expect.objectContaining({ supplier: undefined })
    );
  });
});
