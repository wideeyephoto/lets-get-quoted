import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/export/insights/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/insights', () => ({
  buildInsights: vi.fn(),
  resolvePeriod: vi.fn(),
}));

vi.mock('@/lib/insights-export', () => ({
  buildInsightsCsv: vi.fn(),
  buildInsightsPdf: vi.fn(),
}));

describe('Export Insights API Route', () => {
  let requireOwnerContextMock: any;
  let buildInsightsMock: any;
  let resolvePeriodMock: any;
  let buildInsightsCsvMock: any;
  let buildInsightsPdfMock: any;
  let supabaseMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    
    supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(),
      })
    };
    
    // Setup supabase mocks
    const accountsSelect = vi.fn().mockReturnThis();
    const accountsEq = vi.fn().mockReturnThis();
    const accountsMaybeSingle = vi.fn().mockResolvedValue({ data: { arrival_updates_enabled: true, business_name: 'Base Business' } });
    
    const sitesSelect = vi.fn().mockReturnThis();
    const sitesEq = vi.fn().mockReturnThis();
    const sitesMaybeSingle = vi.fn().mockResolvedValue({ data: { company_name: 'Site Company' } });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'accounts') return { select: accountsSelect, eq: accountsEq, maybeSingle: accountsMaybeSingle };
      if (table === 'sites') return { select: sitesSelect, eq: sitesEq, maybeSingle: sitesMaybeSingle };
      return {};
    });

    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({
      supabase: supabaseMock,
      accountId: 'acct_123',
    });

    resolvePeriodMock = (await import('@/lib/insights')).resolvePeriod;
    resolvePeriodMock.mockReturnValue({ from: '2026-09-01', to: '2026-09-30', label: 'September 2026' });

    buildInsightsMock = (await import('@/lib/insights')).buildInsights;
    buildInsightsMock.mockResolvedValue({ mock: 'insights' });

    buildInsightsCsvMock = (await import('@/lib/insights-export')).buildInsightsCsv;
    buildInsightsCsvMock.mockReturnValue('csv,content\n');

    buildInsightsPdfMock = (await import('@/lib/insights-export')).buildInsightsPdf;
    buildInsightsPdfMock.mockResolvedValue(Buffer.from([4, 5, 6]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createRequest = (url: string) => {
    return new NextRequest(url);
  };

  it('exports PDF insights by default', async () => {
    const req = createRequest('http://localhost/api/export/insights?window=mtd');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="letsgetquoted-business-performance-2026-09-12.pdf"');
    
    expect(resolvePeriodMock).toHaveBeenCalledWith({
      window: 'mtd',
      from: undefined,
      to: undefined,
    });
    
    expect(buildInsightsMock).toHaveBeenCalledWith(
      supabaseMock,
      'acct_123',
      { from: '2026-09-01', to: '2026-09-30', label: 'September 2026' },
      { arrivalUpdatesOn: true, hasArrivalData: false }
    );
    
    expect(buildInsightsPdfMock).toHaveBeenCalledWith(
      { mock: 'insights' },
      {
        businessName: 'Site Company',
        generatedLabel: 'September 12, 2026'
      }
    );
  });

  it('exports CSV insights when requested', async () => {
    const req = createRequest('http://localhost/api/export/insights?format=csv&from=2026-01-01&to=2026-01-31');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="letsgetquoted-business-performance-2026-09-12.csv"');
    
    const text = await res.text();
    expect(text).toBe('csv,content\n');
    
    expect(resolvePeriodMock).toHaveBeenCalledWith({
      window: undefined,
      from: '2026-01-01',
      to: '2026-01-31',
    });
    
    expect(buildInsightsCsvMock).toHaveBeenCalledWith(
      { mock: 'insights' },
      {
        businessName: 'Site Company',
        generatedLabel: 'September 12, 2026'
      }
    );
  });

  it('falls back to account business_name if site company_name is missing', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'accounts') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { business_name: 'Base Business' } }) };
      if (table === 'sites') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
      return {};
    });

    const req = createRequest('http://localhost/api/export/insights');
    await GET(req);
    
    expect(buildInsightsPdfMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ businessName: 'Base Business' })
    );
  });

  it('falls back to Your business if both names are missing', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'accounts') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
      if (table === 'sites') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
      return {};
    });

    const req = createRequest('http://localhost/api/export/insights');
    await GET(req);
    
    expect(buildInsightsPdfMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ businessName: 'Your business' })
    );
  });
});
