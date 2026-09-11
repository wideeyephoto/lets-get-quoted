import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPaymentsLedgerData } from '@/lib/payments-ledger-data';

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...actual,
    toCents: vi.fn((d: number) => Math.round(d * 100)),
    fromCents: vi.fn((c: number) => c / 100),
  };
});

const mockDb = () => {
  const db: any = {};
  db.from = vi.fn(() => db);
  db.select = vi.fn(() => db);
  db.eq = vi.fn(() => db);
  db.order = vi.fn(() => db);
  db.gte = vi.fn(() => db);
  db.in = vi.fn(() => db);
  db.range = vi.fn(() => Promise.resolve({ data: [] }));
  return db;
};

// We mock fetchAllPages internally if needed or let it use the real one and mock db.range
vi.mock('@/lib/supabase-pagination', () => ({
  fetchAllPages: vi.fn(async (queryFn) => {
    const query = queryFn(0, 999);
    const { data } = await query;
    return data ?? [];
  }),
}));

describe('payments-ledger-data', () => {
  let db: any;

  beforeEach(() => {
    vi.clearAllMocks();
    db = mockDb();
  });

  describe('loadPaymentsLedgerData', () => {
    it('returns empty results if no payments', async () => {
      db.range.mockResolvedValueOnce({ data: [] });
      const res = await loadPaymentsLedgerData(db, 'acc_1');
      expect(res.rows).toEqual([]);
      expect(res.summary.paidCount).toBe(0);
      expect(res.available).toBe(true);
    });

    it('calculates totals for paid payments correctly', async () => {
      db.range.mockResolvedValueOnce({
        data: [
          {
            id: 'pay_1',
            account_id: 'acc_1',
            job_id: 'job_1',
            amount: 100.50, // 10050 cents
            platform_fee: 5.00, // 500 cents
            refunded_amount: 0,
            status: 'paid',
            kind: 'project',
            charge_model: 'card',
          },
          {
            id: 'pay_2',
            account_id: 'acc_1',
            amount: 50.00, // 5000 cents
            platform_fee: 2.00, // 200 cents
            status: 'paid',
            kind: 'deposit',
            charge_model: 'card',
          }
        ]
      });
      // Jobs and Invoices mock
      db.in.mockResolvedValueOnce({ data: [{ id: 'job_1', ref: 'J-123', client_name: 'Bob' }] }); // Jobs
      db.in.mockResolvedValueOnce({ data: [] }); // Invoices

      const res = await loadPaymentsLedgerData(db, 'acc_1');
      expect(res.rows.length).toBe(2);
      expect(res.summary.paidCount).toBe(2);
      expect(res.summary.grossRevenue).toBe(150.5); // 100.5 + 50
      expect(res.summary.totalFees).toBe(7); // 5 + 2
      expect(res.summary.netRevenue).toBe(143.5); // 150.5 - 7
    });

    it('handles failures gracefully and returns available=false', async () => {
      db.range.mockRejectedValueOnce(new Error('DB Error'));
      const res = await loadPaymentsLedgerData(db, 'acc_1');
      expect(res.available).toBe(false);
      expect(res.rows).toEqual([]);
    });
  });
});
