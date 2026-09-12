import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildClientsCsv, buildServicesCsv, buildJobsCsv, buildInvoicesCsv } from '@/lib/data-export';

vi.mock('@/lib/import-formats', () => ({
  gridToCsv: vi.fn((grid: any) => grid),
}));

vi.mock('@/lib/pagination', () => ({
  fetchAllPages: vi.fn(async (queryFn: any) => {
    // mock behavior depending on which table is queried, or just use a shared mock state
    return queryFn(0, 10);
  }),
}));

vi.mock('@/lib/jobs', () => ({
  listJobs: vi.fn().mockResolvedValue([
    {
      id: 'job_1',
      ref: 'JOB-1',
      client_name: 'John Doe',
      client_phone: '123',
      client_email: 'a@b.com',
      address: '123 St',
      scope: 'Fix',
      status: 'new_lead',
      scheduled_for: '2023-01-01T12:00:00Z',
      estimated_hours: 5,
      quoted_amount: 100,
    }
  ]),
}));

vi.mock('@/lib/services', () => ({
  listServices: vi.fn().mockResolvedValue([
    {
      name: 'Mow',
      unit_price: 50,
      unit: 'Hour',
      description: 'Lawn',
      active: true,
    },
    {
      name: 'Trim',
      unit_price: 25.5,
      unit: 'Item',
      description: 'Bush',
      active: false,
    }
  ]),
}));

describe('Data Export Lib', () => {
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    supabaseMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn((from, to) => {
        // mock return data based on table from
        const table = supabaseMock.from.mock.calls[0][0];
        if (table === 'clients') {
          return [
            { name: 'John Doe', phone: '123', email: 'a@b.com', address: '123 St', notes: null }
          ];
        } else if (table === 'invoices') {
          return [
            { ref: 'INV-1', job_id: 'job_1', status: 'paid', total: 100, created_at: '2023-01-01T12:00:00Z' }
          ];
        }
        return [];
      }),
    };
  });

  describe('buildClientsCsv', () => {
    it('builds grid correctly', async () => {
      const res = await buildClientsCsv(supabaseMock, 'acct_1');
      expect(res).toEqual([
        ['Name', 'Phone', 'Email', 'Address', 'Notes'],
        ['John Doe', '123', 'a@b.com', '123 St', '']
      ]);
    });
  });

  describe('buildServicesCsv', () => {
    it('builds grid correctly', async () => {
      const res = await buildServicesCsv(supabaseMock, 'acct_1');
      expect(res).toEqual([
        ['Name', 'Price', 'Unit', 'Description', 'Active'],
        ['Mow', '50', 'Hour', 'Lawn', 'true'],
        ['Trim', '25.50', 'Item', 'Bush', 'false']
      ]);
    });
  });

  describe('buildJobsCsv', () => {
    it('builds grid correctly', async () => {
      const res = await buildJobsCsv(supabaseMock, 'acct_1');
      expect(res).toEqual([
        ['Ref', 'Customer', 'Phone', 'Email', 'Address', 'Job / scope', 'Status', 'Date', 'Est. hours', 'Amount'],
        ['JOB-1', 'John Doe', '123', 'a@b.com', '123 St', 'Fix', 'New request', '2023-01-01', '5', '100']
      ]);
    });
  });

  describe('buildInvoicesCsv', () => {
    it('builds grid correctly', async () => {
      const res = await buildInvoicesCsv(supabaseMock, 'acct_1');
      expect(res).toEqual([
        ['Ref', 'Customer', 'Phone', 'Email', 'Address', 'Description', 'Date', 'Total', 'Status'],
        ['INV-1', 'John Doe', '123', 'a@b.com', '123 St', 'Fix', '2023-01-01', '100', 'paid']
      ]);
    });
  });
});
