import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadReceivablesData } from '@/lib/receivables-data';
import * as paginationModule from '@/lib/pagination';

vi.mock('@/lib/pagination', () => ({
  fetchAllPages: vi.fn(),
}));

describe('Receivables Data Lib', () => {
  let supabaseMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 2023-06-01
    vi.setSystemTime(new Date('2023-06-01T12:00:00Z'));

    supabaseMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles errors gracefully', async () => {
    (paginationModule.fetchAllPages as any).mockRejectedValue(new Error('db error'));

    const res = await loadReceivablesData(supabaseMock, 'acct1');
    expect(res.available).toBe(false);
    expect(res.receivables).toEqual([]);
    expect(res.summary.totalOutstanding).toBe(0);
  });

  it('loads and buckets receivables correctly', async () => {
    // 14 days overdue + 14 days grace = 28 days ago (2023-05-04)
    // 35 days overdue + 14 days grace = 49 days ago (2023-04-13)
    // 70 days overdue + 14 days grace = 84 days ago (2023-03-09)
    // current (not overdue) = 5 days ago (2023-05-27)
    
    (paginationModule.fetchAllPages as any).mockImplementation(async (queryFn: any) => {
      const q = queryFn(0, 1000);
      const isJobs = typeof q.order !== 'function'; // jobs query has no order
      if (isJobs) {
        return [
          { id: 'job1', ref: 'J-1', client_name: 'Alice' },
          { id: 'job2', ref: 'J-2', client_name: 'Bob' },
        ];
      }
      
      const isPayments = q.order.mock.calls.some((c: any) => c[0] === 'requested_at');
      if (isPayments) {
        return [
          {
            id: 'pay1',
            job_id: 'job2',
            invoice_id: null,
            kind: 'downpayment',
            amount: 50,
            status: 'requested',
            requested_at: '2023-05-27T12:00:00Z', // 5 days ago, grace 7 days = current
            due_date: null,
          }
        ];
      }

      // Invoices
      return [
        {
          id: 'inv1',
          ref: 'INV-1',
          job_id: 'job1',
          status: 'sent',
          total: 100,
          created_at: '2023-05-27T12:00:00Z' // 5 days ago, grace 14 days = current
        },
        {
          id: 'inv2',
          ref: 'INV-2',
          job_id: 'job1',
          status: 'sent',
          total: 200,
          created_at: '2023-05-04T12:00:00Z' // 28 days ago, 14 days overdue = 1_15
        },
        {
          id: 'inv3',
          ref: 'INV-3',
          job_id: 'job2',
          status: 'sent',
          total: 400,
          created_at: '2023-04-13T12:00:00Z' // 49 days ago, 35 days overdue = 31_60
        },
        {
          id: 'inv4',
          ref: 'INV-4',
          job_id: 'job2',
          status: 'sent',
          total: 800,
          created_at: '2023-03-09T12:00:00Z' // 84 days ago, 70 days overdue = 60_plus
        }
      ];
    });

    const res = await loadReceivablesData(supabaseMock, 'acct1');
    expect(res.available).toBe(true);
    expect(res.receivables).toHaveLength(5);
    
    expect(res.summary.currentBucketTotal).toBe(150); // 100 inv1 + 50 pay1
    expect(res.summary.overdue1_15Total).toBe(200); // inv2
    expect(res.summary.overdue16_30Total).toBe(0);
    expect(res.summary.overdue31_60Total).toBe(400); // inv3
    expect(res.summary.overdue60PlusTotal).toBe(800); // inv4
    expect(res.summary.totalOverdue).toBe(1400);
    expect(res.summary.totalOutstanding).toBe(1550);
    expect(res.summary.overdueCount).toBe(3);

    const inv2 = res.receivables.find(r => r.id === 'inv2');
    expect(inv2?.agingBucket).toBe('1_15');
    expect(inv2?.status).toBe('overdue');
    expect(inv2?.reliabilityTier).toBe('B');

    const inv4 = res.receivables.find(r => r.id === 'inv4');
    expect(inv4?.agingBucket).toBe('60_plus');
    expect(inv4?.reliabilityTier).toBe('C');
  });
});
