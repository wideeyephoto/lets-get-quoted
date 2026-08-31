import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadRevenueAnalyticsData } from '@/lib/revenue-analytics-data';

function createMockSupabaseWithData(paymentsData: any[], jobsData: any[] = []): SupabaseClient {
  return {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        gte: () => builder,
        lt: () => builder,
        order: () => builder,
        range: (_from: number, _to: number) => {
          if (table === 'payments') {
            return Promise.resolve({ data: paymentsData, error: null });
          }
          if (table === 'jobs') {
            return Promise.resolve({ data: jobsData, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe('loadRevenueAnalyticsData', () => {
  it('correctly aggregates a normal paid payment (zero refund)', async () => {
    const payments = [
      {
        id: 'pay_1',
        job_id: 'job_1',
        kind: 'milestone',
        label: 'Milestone 1',
        amount: 1000,
        status: 'paid',
        platform_fee: 29,
        refunded_amount: null,
        charge_model: 'card',
        paid_at: '2026-06-15T12:00:00Z',
        requested_at: '2026-06-14T10:00:00Z',
      },
    ];

    const jobs = [{ id: 'job_1', client_name: 'Alice Smith' }];
    const client = createMockSupabaseWithData(payments, jobs);
    const data = await loadRevenueAnalyticsData(client, 'acc_test');

    expect(data.available).toBe(true);
    expect(data.totalGross).toBe(1000);
    expect(data.totalFees).toBe(29);
    // Net: 1000 - 29 - 0 = 971
    expect(data.totalNet).toBe(971);
    expect(data.streams).toEqual([
      { key: 'milestone', name: 'Milestone Draws', amount: 1000, percentage: 100, count: 1, color: '#10b981' },
    ]);
    expect(data.methods).toEqual([
      { method: 'card', label: 'Credit / Debit Card', amount: 1000, percentage: 100, count: 1, feePercent: 2.9 },
    ]);
    expect(data.topClients).toEqual([{ clientName: 'Alice Smith', totalPaid: 1000, jobCount: 1 }]);
  });

  it('correctly nets a partially refunded payment (status=paid with refunded_amount > 0)', async () => {
    const payments = [
      {
        id: 'pay_partial',
        job_id: 'job_2',
        kind: 'deposit',
        label: 'Deposit',
        amount: 2000,
        status: 'paid',
        platform_fee: 58,
        refunded_amount: 500,
        charge_model: 'card',
        paid_at: '2026-07-10T14:00:00Z',
        requested_at: '2026-07-09T09:00:00Z',
      },
    ];

    const jobs = [{ id: 'job_2', client_name: 'Bob Johnson' }];
    const client = createMockSupabaseWithData(payments, jobs);
    const data = await loadRevenueAnalyticsData(client, 'acc_test');

    expect(data.available).toBe(true);
    expect(data.totalGross).toBe(2000);
    expect(data.totalFees).toBe(58);
    // Net: 2000 - 58 - 500 = 1442
    expect(data.totalNet).toBe(1442);
  });

  it('correctly zeroes net revenue on a fully refunded payment (status=refunded)', async () => {
    const payments = [
      {
        id: 'pay_full_refund',
        job_id: 'job_3',
        kind: 'final',
        label: 'Final Balance',
        amount: 500,
        status: 'refunded',
        platform_fee: 15,
        refunded_amount: 500,
        charge_model: 'card',
        paid_at: '2026-08-01T10:00:00Z',
        requested_at: '2026-07-30T10:00:00Z',
      },
    ];

    const client = createMockSupabaseWithData(payments, []);
    const data = await loadRevenueAnalyticsData(client, 'acc_test');

    expect(data.available).toBe(true);
    expect(data.totalGross).toBe(500);
    expect(data.totalFees).toBe(15);
    // Net: 500 - 15 - 500 <= 0 => Math.max(0, -15) = 0
    expect(data.totalNet).toBe(0);
  });

  it('defensively zeroes net revenue on fully refunded payment with null refunded_amount', async () => {
    const payments = [
      {
        id: 'pay_legacy_full_refund',
        job_id: 'job_4',
        kind: 'deposit',
        label: 'Legacy Refund',
        amount: 300,
        status: 'refunded',
        platform_fee: 9,
        refunded_amount: null, // Legacy row missing refunded_amount
        charge_model: 'card',
        paid_at: '2026-08-05T10:00:00Z',
        requested_at: '2026-08-01T10:00:00Z',
      },
    ];

    const client = createMockSupabaseWithData(payments, []);
    const data = await loadRevenueAnalyticsData(client, 'acc_test');

    expect(data.available).toBe(true);
    expect(data.totalGross).toBe(300);
    expect(data.totalFees).toBe(9);
    // Net: 300 - 9 - 300 (fallback) = 0
    expect(data.totalNet).toBe(0);
  });

  it('calculates comprehensive totals across normal, partially refunded, and fully refunded payments', async () => {
    const payments = [
      // 1. Normal paid
      {
        id: 'p1',
        job_id: 'j1',
        kind: 'deposit',
        label: 'Deposit',
        amount: 5000,
        status: 'paid',
        platform_fee: 145,
        refunded_amount: 0,
        charge_model: 'card',
        paid_at: '2026-05-01T12:00:00Z',
        requested_at: '2026-05-01T10:00:00Z',
      },
      // 2. Partially refunded
      {
        id: 'p2',
        job_id: 'j2',
        kind: 'milestone',
        label: 'Milestone Draw',
        amount: 3000,
        status: 'paid',
        platform_fee: 87,
        refunded_amount: 1000,
        charge_model: 'ach',
        paid_at: '2026-05-15T12:00:00Z',
        requested_at: '2026-05-15T10:00:00Z',
      },
      // 3. Fully refunded
      {
        id: 'p3',
        job_id: 'j3',
        kind: 'final',
        label: 'Final Payment',
        amount: 1500,
        status: 'refunded',
        platform_fee: 45,
        refunded_amount: 1500,
        charge_model: 'card',
        paid_at: '2026-05-20T12:00:00Z',
        requested_at: '2026-05-20T10:00:00Z',
      },
    ];

    const jobs = [
      { id: 'j1', client_name: 'Acme Commercial' },
      { id: 'j2', client_name: 'Beta Residential' },
      { id: 'j3', client_name: 'Gamma Properties' },
    ];

    const client = createMockSupabaseWithData(payments, jobs);
    const data = await loadRevenueAnalyticsData(client, 'acc_test');

    // Total Gross: 5000 + 3000 + 1500 = 9500
    expect(data.totalGross).toBe(9500);

    // Total Fees: 145 + 87 + 45 = 277
    expect(data.totalFees).toBe(277);

    // Total Net:
    // p1: 5000 - 145 - 0 = 4855
    // p2: 3000 - 87 - 1000 = 1913
    // p3: max(0, 1500 - 45 - 1500) = 0
    // Total Net = 4855 + 1913 + 0 = 6768
    expect(data.totalNet).toBe(6768);

    // Check monthly trend grouping
    expect(data.trendMonthly.length).toBe(1);
    expect(data.trendMonthly[0].dateKey).toBe('2026-05');
    expect(data.trendMonthly[0].gross).toBe(9500);
    expect(data.trendMonthly[0].fees).toBe(277);
    expect(data.trendMonthly[0].net).toBe(6768);
    expect(data.trendMonthly[0].count).toBe(3);

    // ACH savings on p2: 300000 cents * 0.029 + 30 = 8730 cents card fee - 500 ACH fee = 8230 cents ($82.30)
    expect(data.achSavings).toBe(82.3);
  });

  it('gracefully handles database errors and returns empty available:false fallback', async () => {
    const errorClient = {
      from: () => {
        throw new Error('Supabase connection refused');
      },
    } as unknown as SupabaseClient;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = await loadRevenueAnalyticsData(errorClient, 'acc_test');
    consoleSpy.mockRestore();

    expect(data.available).toBe(false);
    expect(data.totalGross).toBe(0);
    expect(data.totalNet).toBe(0);
    expect(data.totalFees).toBe(0);
    expect(data.achSavings).toBe(0);
    expect(data.trendDaily).toEqual([]);
    expect(data.trendMonthly).toEqual([]);
    expect(data.streams).toEqual([]);
    expect(data.methods).toEqual([]);
    expect(data.topClients).toEqual([]);
  });
});
