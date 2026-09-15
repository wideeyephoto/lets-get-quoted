import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildQuickBooksCsv } from '@/lib/quickbooks';

describe('QuickBooks Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };
    
    supabaseMock = {
      from: vi.fn(() => queryMock),
    };
  });

  it('throws error if invoices fail', async () => {
    queryMock.then = vi.fn((resolve) => resolve({ error: new Error('invoice fetch failed') }));
    await expect(buildQuickBooksCsv(supabaseMock, 'acct1')).rejects.toThrow('invoice fetch failed');
  });

  it('throws error if costs fail', async () => {
    let callCount = 0;
    queryMock.then = vi.fn((resolve) => {
      callCount++;
      if (callCount === 1) return resolve({ data: [], error: null });
      return resolve({ error: new Error('costs fetch failed') });
    });
    await expect(buildQuickBooksCsv(supabaseMock, 'acct1')).rejects.toThrow('costs fetch failed');
  });

  it('builds CSV successfully', async () => {
    let callCount = 0;
    queryMock.then = vi.fn((resolve) => {
      callCount++;
      if (callCount === 1) {
        return resolve({
          data: [
            {
              ref: 'INV-1',
              status: 'sent',
              created_at: '2023-01-01T12:00:00Z',
              job: { client_name: 'John "The Boss" Doe' }, // inner quotes to test escaping
              invoice_items: [
                { description: 'Labor, Phase 1', amount: 500 }, // comma to test escaping
              ]
            }
          ],
          error: null
        });
      }
      return resolve({
        data: [
          {
            category: 'Materials',
            description: 'Paint',
            amount: 100,
            job: { ref: 'J-1', client_name: 'John "The Boss" Doe' }
          }
        ],
        error: null
      });
    });

    const csv = await buildQuickBooksCsv(supabaseMock, 'acct1');
    const lines = csv.split('\n');
    
    expect(lines).toHaveLength(3); // header + 1 invoice + 1 cost
    expect(lines[0]).toBe('InvoiceNo,Customer,InvoiceDate,ItemDescription,ItemAmount,JobStatus');
    // Invoice line: Date is 1/1/2023
    expect(lines[1]).toBe('INV-1,John "The Boss" Doe,1/1/2023,"Labor, Phase 1",500,Sent');
    // Cost line
    expect(lines[2]).toBe('EXP-J-1,John "The Boss" Doe,,"Materials: Paint",-100,Expense');
  });
});
