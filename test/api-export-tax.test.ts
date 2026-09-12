import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/export/tax/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/tax-reports', () => ({
  buildProfitAndLoss: vi.fn(),
  buildProfitAndLossCsv: vi.fn(),
  buildScheduleCWorksheet: vi.fn(),
  buildScheduleCCsv: vi.fn(),
  build1099PrepList: vi.fn(),
  build1099Csv: vi.fn(),
}));

describe('Export Tax API Route', () => {
  let requireOwnerContextMock: any;
  let buildProfitAndLossMock: any;
  let buildProfitAndLossCsvMock: any;
  let buildScheduleCWorksheetMock: any;
  let buildScheduleCCsvMock: any;
  let build1099PrepListMock: any;
  let build1099CsvMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ supabase: {}, accountId: 'acct_123' });

    buildProfitAndLossMock = (await import('@/lib/tax-reports')).buildProfitAndLoss;
    buildProfitAndLossMock.mockResolvedValue({ data: 'pl_data' });

    buildProfitAndLossCsvMock = (await import('@/lib/tax-reports')).buildProfitAndLossCsv;
    buildProfitAndLossCsvMock.mockReturnValue('pl_csv\n');

    buildScheduleCWorksheetMock = (await import('@/lib/tax-reports')).buildScheduleCWorksheet;
    buildScheduleCWorksheetMock.mockReturnValue({ data: 'sched_c' });

    buildScheduleCCsvMock = (await import('@/lib/tax-reports')).buildScheduleCCsv;
    buildScheduleCCsvMock.mockReturnValue('sched_c_csv\n');

    build1099PrepListMock = (await import('@/lib/tax-reports')).build1099PrepList;
    build1099PrepListMock.mockResolvedValue({ data: '1099_data' });

    build1099CsvMock = (await import('@/lib/tax-reports')).build1099Csv;
    build1099CsvMock.mockReturnValue('1099_csv\n');
  });

  const createRequest = (url: string) => {
    return new NextRequest(url);
  };

  it('exports Profit and Loss by default', async () => {
    const req = createRequest('http://localhost/api/export/tax');
    const res = await GET(req);
    
    const currentYear = new Date().getFullYear();
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="letsgetquoted-profit-and-loss-${currentYear}.csv"`);
    
    const text = await res.text();
    expect(text).toBe('pl_csv\n');
    
    expect(buildProfitAndLossMock).toHaveBeenCalledWith(expect.any(Object), 'acct_123', currentYear);
    expect(buildProfitAndLossCsvMock).toHaveBeenCalledWith({ data: 'pl_data' });
  });

  it('exports Schedule C worksheet for specified year', async () => {
    const req = createRequest('http://localhost/api/export/tax?type=schedule-c&year=2024');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="letsgetquoted-schedule-c-worksheet-2024.csv"');
    
    const text = await res.text();
    expect(text).toBe('sched_c_csv\n');
    
    expect(buildProfitAndLossMock).toHaveBeenCalledWith(expect.any(Object), 'acct_123', 2024);
    expect(buildScheduleCWorksheetMock).toHaveBeenCalledWith({ data: 'pl_data' });
    expect(buildScheduleCCsvMock).toHaveBeenCalledWith({ data: 'sched_c' });
  });

  it('exports 1099 prep list for specified year', async () => {
    const req = createRequest('http://localhost/api/export/tax?type=1099&year=2023');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="letsgetquoted-1099-prep-2023.csv"');
    
    const text = await res.text();
    expect(text).toBe('1099_csv\n');
    
    expect(build1099PrepListMock).toHaveBeenCalledWith(expect.any(Object), 'acct_123', 2023);
    expect(build1099CsvMock).toHaveBeenCalledWith({ data: '1099_data' }, 2023);
  });
});
