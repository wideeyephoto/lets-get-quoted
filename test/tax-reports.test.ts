import { describe, it, expect } from 'vitest';
import {
  computeProfitAndLoss,
  buildScheduleCWorksheet,
  aggregateSubcontractorPayouts,
  buildProfitAndLossCsv,
  buildScheduleCCsv,
  build1099Csv,
  irs1099NecThresholdForYear,
  IRS_1099_NEC_THRESHOLD,
  type PaidPaymentRow,
  type CostRow,
} from '@/lib/tax-reports';

// A representative 2026 year: three payments across Jan/Jul/Dec and one cost per
// category. Chosen so the annual totals, the Schedule C lines, and the 12-month
// breakdown must all reconcile.
const PAYMENTS: PaidPaymentRow[] = [
  { amount: 1000, platform_fee: 12.5, paid_at: '2026-01-15T12:00:00Z' },
  // First hours of July in UTC — on a US-local server getMonth() would call this
  // June. getUTCMonth() must keep it in July so the chart matches the year total.
  { amount: 500, platform_fee: 5, paid_at: '2026-07-01T02:00:00Z' },
  { amount: 250.25, platform_fee: 2.5, paid_at: '2026-12-31T20:00:00Z' },
];

const COSTS: CostRow[] = [
  { type: 'material', amount: 100, created_at: '2026-01-10T00:00:00Z' },
  { type: 'labor', amount: 200, created_at: '2026-02-10T00:00:00Z' },
  { type: 'sub', amount: 700, created_at: '2026-03-10T00:00:00Z' },
  { type: 'receipt', amount: 50, created_at: '2026-03-15T00:00:00Z' },
  { type: 'consulting', amount: 25, created_at: '2026-04-10T00:00:00Z' }, // unknown -> other
  { type: null, amount: 10, created_at: '2026-04-11T00:00:00Z' }, // null -> other
];

describe('computeProfitAndLoss', () => {
  const pl = computeProfitAndLoss(2026, PAYMENTS, COSTS);

  it('counts revenue from paid payments only', () => {
    expect(pl.revenue).toBe(1750.25);
  });

  it('maps each cost type to the right Schedule C category', () => {
    expect(pl.expensesByCategory).toEqual({
      materials: 100,
      labor: 200,
      subcontractors: 700,
      receipts: 50,
      other: 35, // 25 (unknown) + 10 (null)
      platformFees: 20, // 12.5 + 5 + 2.5
    });
  });

  it('totals expenses (all categories incl. platform fees) and net profit', () => {
    expect(pl.totalExpenses).toBe(1105);
    expect(pl.netProfit).toBe(645.25); // 1750.25 - 1105
  });

  it('buckets a first-of-month UTC payment into the correct month (not the prior one)', () => {
    expect(pl.monthly[6].revenue).toBe(500); // July
    expect(pl.monthly[5].revenue).toBe(0); // June stays empty
  });

  it('reconciles: the 12 monthly rows sum back to the annual totals', () => {
    const monthlyRevenue = pl.monthly.reduce((s, m) => s + m.revenue, 0);
    const monthlyExpenses = pl.monthly.reduce((s, m) => s + m.expenses, 0);
    expect(Math.round(monthlyRevenue * 100) / 100).toBe(pl.revenue);
    expect(Math.round(monthlyExpenses * 100) / 100).toBe(pl.totalExpenses);
  });

  it('labels months Jan..Dec regardless of server timezone', () => {
    expect(pl.monthly.map((m) => m.label)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]);
  });

  it('rounds float summation artifacts to whole cents', () => {
    const pennies = computeProfitAndLoss(
      2026,
      [
        { amount: 0.1, platform_fee: 0, paid_at: '2026-01-01T00:00:00Z' },
        { amount: 0.2, platform_fee: 0, paid_at: '2026-01-02T00:00:00Z' },
      ],
      []
    );
    expect(pennies.revenue).toBe(0.3); // not 0.30000000000000004
  });

  it('returns an all-zero report for a year with no activity', () => {
    const empty = computeProfitAndLoss(2026, [], []);
    expect(empty.revenue).toBe(0);
    expect(empty.totalExpenses).toBe(0);
    expect(empty.netProfit).toBe(0);
    expect(empty.monthly).toHaveLength(12);
    expect(empty.monthly.every((m) => m.revenue === 0 && m.expenses === 0 && m.net === 0)).toBe(true);
  });
});

describe('buildScheduleCWorksheet', () => {
  const pl = computeProfitAndLoss(2026, PAYMENTS, COSTS);
  const lines = buildScheduleCWorksheet(pl);
  const amountFor = (line: string) => lines.find((l) => l.line === line)?.amount;

  it('maps categories to the expected Schedule C lines', () => {
    expect(amountFor('Line 1')).toBe(1750.25); // gross receipts
    expect(amountFor('Line 10')).toBe(20); // commissions & fees (platform fees)
    expect(amountFor('Line 11')).toBe(700); // contract labor (subs)
    expect(amountFor('Line 22')).toBe(150); // supplies+materials = materials(100)+receipts(50)
    expect(amountFor('Line 26')).toBe(200); // wages (labor)
    expect(amountFor('Line 27a')).toBe(35); // other
  });

  it('accounts for every expense dollar exactly once (lines sum to total expenses)', () => {
    const expenseLines = lines.filter((l) => ['Line 10', 'Line 11', 'Line 22', 'Line 26', 'Line 27a'].includes(l.line));
    const sum = expenseLines.reduce((s, l) => s + l.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(pl.totalExpenses);
  });
});

describe('irs1099NecThresholdForYear', () => {
  it('returns $600 for tax years <= 2025', () => {
    expect(irs1099NecThresholdForYear(2020)).toBe(600);
    expect(irs1099NecThresholdForYear(2024)).toBe(600);
    expect(irs1099NecThresholdForYear(2025)).toBe(600);
  });

  it('returns $2,000 for tax year 2026', () => {
    expect(irs1099NecThresholdForYear(2026)).toBe(2000);
  });

  it('returns $2,000 base for future years subject to inflation index adjustments', () => {
    expect(irs1099NecThresholdForYear(2027)).toBe(2000);
    expect(irs1099NecThresholdForYear(2030)).toBe(2000);
  });

  it('handles invalid year safely with fallback to $600', () => {
    expect(irs1099NecThresholdForYear(NaN)).toBe(600);
  });
});

describe('aggregateSubcontractorPayouts', () => {
  const rows = [
    { supplier: 'Ace Electric', amount: 300 },
    { supplier: 'Ace Electric', amount: 300 }, // aggregates to 600 across two costs
    { supplier: 'Bob Plumbing', amount: 599.99 }, // just under 600
    { supplier: '  Cid Concrete  ', amount: 600 }, // trimmed, exactly 600
    { supplier: 'Delta Framing', amount: 1999.99 }, // under 2026 threshold
    { supplier: 'Echo HVAC', amount: 2000 }, // exactly at 2026 threshold
    { supplier: null, amount: 50 },
    { supplier: '', amount: 25 }, // null + '' both fold into "Unnamed subcontractor"
  ];

  it('flags subcontractors using default or 2025 $600 threshold (>=, not >)', () => {
    const result2025 = aggregateSubcontractorPayouts(rows, irs1099NecThresholdForYear(2025));
    const find = (name: string) => result2025.find((r) => r.supplier === name);

    expect(find('Ace Electric')).toEqual({ supplier: 'Ace Electric', crewId: null, total: 600, needs1099: true });
    expect(find('Cid Concrete')).toEqual({ supplier: 'Cid Concrete', crewId: null, total: 600, needs1099: true });
    expect(find('Bob Plumbing')).toEqual({ supplier: 'Bob Plumbing', crewId: null, total: 599.99, needs1099: false });
    expect(find('Delta Framing')).toEqual({ supplier: 'Delta Framing', crewId: null, total: 1999.99, needs1099: true });
    expect(find('Echo HVAC')).toEqual({ supplier: 'Echo HVAC', crewId: null, total: 2000, needs1099: true });
  });

  it('flags subcontractors accurately under 2026 $2,000 threshold', () => {
    const result2026 = aggregateSubcontractorPayouts(rows, irs1099NecThresholdForYear(2026));
    const find = (name: string) => result2026.find((r) => r.supplier === name);

    expect(find('Ace Electric')).toEqual({ supplier: 'Ace Electric', crewId: null, total: 600, needs1099: false });
    expect(find('Cid Concrete')).toEqual({ supplier: 'Cid Concrete', crewId: null, total: 600, needs1099: false });
    expect(find('Delta Framing')).toEqual({ supplier: 'Delta Framing', crewId: null, total: 1999.99, needs1099: false });
    expect(find('Echo HVAC')).toEqual({ supplier: 'Echo HVAC', crewId: null, total: 2000, needs1099: true });
  });

  it('folds null/blank supplier names into one "Unnamed subcontractor" bucket', () => {
    const result = aggregateSubcontractorPayouts(rows, 600);
    const unnamed = result.find((r) => r.supplier === 'Unnamed subcontractor');
    expect(unnamed).toEqual({ supplier: 'Unnamed subcontractor', crewId: null, total: 75, needs1099: false });
  });

  it('groups by stable crew_id even across differing supplier spellings', () => {
    const crewRows = [
      { crew_id: 'crew-1', supplier: 'Ace Electric', amount: 400 },
      { crew_id: 'crew-1', supplier: 'Ace Electrical Services', crew_name: 'Ace Electric', amount: 300 },
      { crew_id: 'crew-2', supplier: 'Bob Plumbing', amount: 200 },
    ];
    const result = aggregateSubcontractorPayouts(crewRows, 600);
    const ace = result.find((r) => r.crewId === 'crew-1');
    expect(ace).toEqual({ supplier: 'Ace Electric', crewId: 'crew-1', total: 700, needs1099: true });
  });

  it('sorts by total paid, descending', () => {
    const result = aggregateSubcontractorPayouts(rows, 600);
    const totals = result.map((r) => r.total);
    expect([...totals]).toEqual([...totals].sort((a, b) => b - a));
  });

  it('retains backward compatibility constant', () => {
    expect(IRS_1099_NEC_THRESHOLD).toBe(600);
  });
});

describe('CSV exports', () => {
  it('emits a P&L CSV with a header, 12 month rows, and a totals row', () => {
    const pl = computeProfitAndLoss(2026, PAYMENTS, COSTS);
    const rows = buildProfitAndLossCsv(pl).split('\n');
    expect(rows).toHaveLength(14); // header + 12 + total
    expect(rows[0]).toBe('Month,Revenue,Expenses,Net Profit');
    expect(rows[13]).toBe('Total,1750.25,1105.00,645.25');
  });

  it('escapes commas and quotes in supplier names and uses year-aware threshold in 1099 CSV', () => {
    const csv2026 = build1099Csv([{ supplier: 'Smith, "Bob" & Sons', total: 2200, needs1099: true }], 2026);
    const rows2026 = csv2026.split('\n');
    expect(rows2026[0]).toBe('Subcontractor,Total Estimated Cost,May Need 1099-NEC,IRS Threshold,Tax Year');
    expect(rows2026[1]).toContain('"Smith, ""Bob"" & Sons",2200.00,Yes,$2000.00,2026');

    const csv2025 = build1099Csv([{ supplier: 'Smith, "Bob" & Sons', total: 800, needs1099: true }], 2025);
    const rows2025 = csv2025.split('\n');
    expect(rows2025[1]).toContain('"Smith, ""Bob"" & Sons",800.00,Yes,$600.00,2025');
  });

  it('escapes the Schedule C category labels (they contain commas)', () => {
    const csv = buildScheduleCCsv(buildScheduleCWorksheet(computeProfitAndLoss(2026, PAYMENTS, COSTS)));
    // Line 11 label "Contract labor (subcontractors paid)" — quoted, no comma split.
    expect(csv).toContain('Line 11,"Contract labor (subcontractors paid)",700.00');
  });
});
