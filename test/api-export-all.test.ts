import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/export/all/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/data-export', () => ({
  buildClientsCsv: vi.fn(),
  buildInvoicesCsv: vi.fn(),
  buildJobsCsv: vi.fn(),
  buildServicesCsv: vi.fn(),
}));

vi.mock('@/lib/data-export-sets', () => ({
  EXPORT_SETS: [
    { id: 'clients', filename: 'customers.csv' },
    { id: 'services', filename: 'price-book.csv' },
    { id: 'jobs', filename: 'jobs.csv' },
    { id: 'invoices', filename: 'invoices.csv' },
  ],
  exportArchiveName: vi.fn((date) => `export-${date}.zip`),
  parseExportSets: vi.fn(),
}));

vi.mock('@/lib/zip', () => ({
  zipText: vi.fn(),
}));

describe('Export All API Route', () => {
  let requireOwnerContextMock: any;
  let buildClientsCsvMock: any;
  let buildInvoicesCsvMock: any;
  let parseExportSetsMock: any;
  let zipTextMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    
    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ supabase: {}, accountId: 'acct_123' });

    buildClientsCsvMock = (await import('@/lib/data-export')).buildClientsCsv;
    buildClientsCsvMock.mockResolvedValue('client1,client2\n');

    buildInvoicesCsvMock = (await import('@/lib/data-export')).buildInvoicesCsv;
    buildInvoicesCsvMock.mockResolvedValue('inv1,inv2\n');

    parseExportSetsMock = (await import('@/lib/data-export-sets')).parseExportSets;
    parseExportSetsMock.mockReturnValue(['clients', 'invoices']);

    zipTextMock = (await import('@/lib/zip')).zipText;
    zipTextMock.mockReturnValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createRequest = (url: string) => {
    return new NextRequest(url);
  };

  it('builds a zip with requested sets', async () => {
    const req = createRequest('http://localhost/api/export/all?sets=clients,invoices');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="export-2026-09-12.zip"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-length')).toBe('3');
    
    expect(parseExportSetsMock).toHaveBeenCalledWith('clients,invoices');
    expect(buildClientsCsvMock).toHaveBeenCalledWith(expect.any(Object), 'acct_123');
    expect(buildInvoicesCsvMock).toHaveBeenCalledWith(expect.any(Object), 'acct_123');
    
    expect(zipTextMock).toHaveBeenCalledWith(
      [
        { name: 'customers.csv', text: 'client1,client2\n' },
        { name: 'invoices.csv', text: 'inv1,inv2\n' }
      ],
      new Date('2026-09-12T12:00:00.000Z')
    );
  });

  it('ignores invalid sets returned by parseExportSets', async () => {
    parseExportSetsMock.mockReturnValue(['clients', 'invalid']);
    
    const req = createRequest('http://localhost/api/export/all');
    await GET(req);
    
    expect(zipTextMock).toHaveBeenCalledWith(
      [{ name: 'customers.csv', text: 'client1,client2\n' }],
      expect.any(Date)
    );
  });
});
