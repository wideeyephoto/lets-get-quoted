import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GETClients } from '@/app/api/export/clients/route';
import { GET as GETInvoices } from '@/app/api/export/invoices/route';
import { GET as GETJobs } from '@/app/api/export/jobs/route';
import { GET as GETServices } from '@/app/api/export/services/route';
import { GET as GETQuickBooks } from '@/app/api/export/quickbooks/route';

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(),
}));

vi.mock('@/lib/quickbooks', () => ({
  buildQuickBooksCsv: vi.fn(),
}));

vi.mock('@/lib/data-export', () => ({
  buildClientsCsv: vi.fn(),
  buildInvoicesCsv: vi.fn(),
  buildJobsCsv: vi.fn(),
  buildServicesCsv: vi.fn(),
}));

describe('Export CSV API Routes', () => {
  let requireOwnerContextMock: any;
  let buildersMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    requireOwnerContextMock = (await import('@/lib/auth')).requireOwnerContext;
    requireOwnerContextMock.mockResolvedValue({ supabase: {}, accountId: 'acct_123' });

    buildersMock = {
      clients: (await import('@/lib/data-export')).buildClientsCsv,
      invoices: (await import('@/lib/data-export')).buildInvoicesCsv,
      jobs: (await import('@/lib/data-export')).buildJobsCsv,
      services: (await import('@/lib/data-export')).buildServicesCsv,
      quickbooks: (await import('@/lib/quickbooks')).buildQuickBooksCsv,
    };
    
    buildersMock.clients.mockResolvedValue('client1\n');
    buildersMock.invoices.mockResolvedValue('inv1\n');
    buildersMock.jobs.mockResolvedValue('job1\n');
    buildersMock.services.mockResolvedValue('srv1\n');
    buildersMock.quickbooks.mockResolvedValue('qb1\n');
  });

  const endpoints = [
    { name: 'clients', GET: GETClients, builder: 'clients', filename: 'letsgetquoted-customers.csv', expectedCsv: 'client1\n' },
    { name: 'invoices', GET: GETInvoices, builder: 'invoices', filename: 'letsgetquoted-invoices.csv', expectedCsv: 'inv1\n' },
    { name: 'jobs', GET: GETJobs, builder: 'jobs', filename: 'letsgetquoted-jobs.csv', expectedCsv: 'job1\n' },
    { name: 'services', GET: GETServices, builder: 'services', filename: 'letsgetquoted-price-book.csv', expectedCsv: 'srv1\n' },
    { name: 'quickbooks', GET: GETQuickBooks, builder: 'quickbooks', filename: 'letsgetquoted-quickbooks-export.csv', expectedCsv: 'qb1\n' },
  ];

  endpoints.forEach(({ name, GET, builder, filename, expectedCsv }) => {
    describe(`GET /api/export/${name}`, () => {
      it(`returns a CSV file for ${name}`, async () => {
        const res = await GET();
        
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
        expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${filename}"`);
        
        const text = await res.text();
        expect(text).toBe(expectedCsv);
        
        expect(requireOwnerContextMock).toHaveBeenCalled();
        expect(buildersMock[builder]).toHaveBeenCalledWith(expect.any(Object), 'acct_123');
      });
    });
  });
});
