import { describe, expect, it } from 'vitest';
import {
  aggregateSubcontractorPayouts,
  buildScheduleCWorksheet,
  computeProfitAndLoss,
  IRS_1099_NEC_THRESHOLD,
  type CostRow,
  type PaidPaymentRow,
  type SubcontractorCostRow,
} from '@/lib/tax-reports';

describe('computeProfitAndLoss', () => {
  it('correctly calculates gross revenue, refunds, net revenue, platform fees, and category expenses', () => {
    const payments: PaidPaymentRow[] = [
      { amount: 5000, platform_fee: 145.3, paid_at: '2026-03-15T10:00:00.000Z', status: 'paid' },
      { amount: 2000, platform_fee: 58.0, paid_at: '2026-05-10T14:00:00.000Z', status: 'partially_refunded', refunded_amount: 500 },
      { amount: 1000, platform_fee: 29.0, paid_at: '2026-06-01T12:00:00.000Z', status: 'refunded' },
    ];

    const costs: CostRow[] = [
      { type: 'material', amount: 1200, created_at: '2026-03-20T08:00:00.000Z' },
      { type: 'receipt', amount: 350.5, created_at: '2026-03-22T09:00:00.000Z' },
      { type: 'labor', amount: 800, created_at: '2026-05-12T11:00:00.000Z' },
      { type: 'sub', amount: 1500, created_at: '2026-05-15T15:00:00.000Z' },
      { type: 'other', amount: 200, created_at: '2026-06-05T16:00:00.000Z' },
    ];

    const pl = computeProfitAndLoss(2026, payments, costs);

    // Gross: 5000 + 2000 + 1000 = 8000
    expect(pl.grossRevenue).toBe(8000);
    // Refunds: 500 + 1000 = 1500
    expect(pl.refunds).toBe(1500);
    // Net Revenue: 8000 - 1500 = 6500
    expect(pl.revenue).toBe(6500);

    // Fees: 145.3 + 58.0 + 29.0 = 232.3
    expect(pl.expensesByCategory.platformFees).toBe(232.3);
    expect(pl.expensesByCategory.materials).toBe(1200);
    expect(pl.expensesByCategory.receipts).toBe(350.5);
    expect(pl.expensesByCategory.labor).toBe(800);
    expect(pl.expensesByCategory.subcontractors).toBe(1500);
    expect(pl.expensesByCategory.other).toBe(200);

    // Total Expenses: 1200 + 350.5 + 800 + 1500 + 200 + 232.3 = 4282.8
    expect(pl.totalExpenses).toBe(4282.8);
    // Net Profit: 6500 - 4282.8 = 2217.2
    expect(pl.netProfit).toBe(2217.2);
  });
});

describe('buildScheduleCWorksheet', () => {
  it('maps profit & loss metrics to IRS Schedule C Form 1040 lines', () => {
    const pl = computeProfitAndLoss(
      2026,
      [
        { amount: 10000, platform_fee: 290, paid_at: '2026-04-10T12:00:00.000Z', status: 'partially_refunded', refunded_amount: 1000 },
      ],
      [
        { type: 'sub', amount: 2500, created_at: '2026-04-12T12:00:00.000Z' },
        { type: 'material', amount: 1500, created_at: '2026-04-15T12:00:00.000Z' },
        { type: 'receipt', amount: 200, created_at: '2026-04-16T12:00:00.000Z' },
        { type: 'labor', amount: 1000, created_at: '2026-04-20T12:00:00.000Z' },
      ],
    );

    const worksheet = buildScheduleCWorksheet(pl);

    const lineMap = new Map(worksheet.map((l) => [l.line, l.amount]));

    expect(lineMap.get('Line 1')).toBe(10000); // Gross receipts
    expect(lineMap.get('Line 2')).toBe(1000); // Returns and allowances
    expect(lineMap.get('Line 3')).toBe(9000); // Net balance
    expect(lineMap.get('Line 10')).toBe(290); // Commissions and fees
    expect(lineMap.get('Line 11')).toBe(2500); // Contract labor
    expect(lineMap.get('Line 22')).toBe(1700); // Supplies and materials (1500 + 200)
    expect(lineMap.get('Line 26')).toBe(1000); // Wages
    expect(lineMap.get('Line 28')).toBe(5490); // Total expenses (290 + 2500 + 1700 + 1000)
    expect(lineMap.get('Line 31')).toBe(3510); // Net profit (9000 - 5490)
  });
});

describe('aggregateSubcontractorPayouts (1099-NEC)', () => {
  it('flags subcontractors at or above the $600 IRS legacy threshold or custom threshold', () => {
    const rows: SubcontractorCostRow[] = [
      { supplier: 'Apex Electrical LLC', amount: 450 },
      { supplier: 'Apex Electrical LLC', amount: 200 }, // Total: 650 >= 600 => Needs 1099
      { supplier: 'Quick Drywall', amount: 599.99 }, // Total: 599.99 < 600 => No 1099
      { supplier: 'Summit Framing', amount: 1200 }, // Total: 1200 >= 600 => Needs 1099
    ];

    const result = aggregateSubcontractorPayouts(rows, 600);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ supplier: 'Summit Framing', crewId: null, total: 1200, needs1099: true });
    expect(result[1]).toEqual({ supplier: 'Apex Electrical LLC', crewId: null, total: 650, needs1099: true });
    expect(result[2]).toEqual({ supplier: 'Quick Drywall', crewId: null, total: 599.99, needs1099: false });
  });
});
