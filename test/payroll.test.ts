import { describe, it, expect } from 'vitest';
import { resolvePayrollRange, summarizePayrollCosts, type PayrollCostRow } from '@/lib/payroll';

const DAY_MS = 24 * 60 * 60 * 1000;
const durationDays = (startIso: string, endIso: string) =>
  Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS);

// A fixed "now" so the period boundaries are deterministic. Local time is used by
// the function (weeks/months anchor to the server's local calendar), so assertions
// avoid hard-coded ISO strings and check structural relationships instead.
const NOW = new Date(2026, 6, 15, 10, 30, 0); // local: Wed Jul 15 2026, 10:30

describe('resolvePayrollRange', () => {
  it('this-week spans Sunday 00:00 to the next Sunday (7 days) and contains now', () => {
    const { startIso, endIso, label } = resolvePayrollRange('this-week', NOW);
    expect(label).toBe('This week');
    expect(new Date(startIso).getDay()).toBe(0); // starts on a Sunday
    expect(durationDays(startIso, endIso)).toBe(7);
    expect(new Date(startIso).getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime()).toBeLessThan(new Date(endIso).getTime());
  });

  it('last-week is the 7 days immediately before this-week (ranges abut, no gap/overlap)', () => {
    const thisWeek = resolvePayrollRange('this-week', NOW);
    const lastWeek = resolvePayrollRange('last-week', NOW);
    expect(lastWeek.label).toBe('Last week');
    expect(durationDays(lastWeek.startIso, lastWeek.endIso)).toBe(7);
    expect(lastWeek.endIso).toBe(thisWeek.startIso); // last week ends where this week begins
  });

  it('this-month runs from the 1st to the 1st of next month and contains now', () => {
    const { startIso, endIso, label } = resolvePayrollRange('this-month', NOW);
    expect(label).toBe('This month');
    expect(new Date(startIso).getDate()).toBe(1);
    expect(new Date(endIso).getDate()).toBe(1);
    expect(new Date(startIso).getMonth()).toBe(6); // July
    expect(new Date(endIso).getMonth()).toBe(7); // August
    expect(new Date(startIso).getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime()).toBeLessThan(new Date(endIso).getTime());
  });

  it('last-month abuts this-month and handles a year boundary (January -> prior December)', () => {
    const thisMonth = resolvePayrollRange('this-month', NOW);
    const lastMonth = resolvePayrollRange('last-month', NOW);
    expect(lastMonth.endIso).toBe(thisMonth.startIso);
    expect(new Date(lastMonth.startIso).getMonth()).toBe(5); // June

    const jan = new Date(2026, 0, 10, 12, 0, 0);
    const lastMonthInJan = resolvePayrollRange('last-month', jan);
    expect(new Date(lastMonthInJan.startIso).getFullYear()).toBe(2025);
    expect(new Date(lastMonthInJan.startIso).getMonth()).toBe(11); // December
  });
});

describe('summarizePayrollCosts', () => {
  const costs: PayrollCostRow[] = [
    { crew_id: 'a', crew_name: 'Alice', crew_role_label: 'Lead', hours: 4, amount: 120, job_id: 'j1' },
    { crew_id: 'a', crew_name: 'Alice', crew_role_label: 'Lead', hours: 3.5, amount: 105, job_id: 'j2' },
    { crew_id: 'b', crew_name: 'Bob', crew_role_label: null, hours: 8, amount: '200', job_id: 'j1' }, // string amount from driver
    { crew_id: null, crew_name: null, crew_role_label: null, hours: 2, amount: 0, job_id: null }, // unassigned, unpaid hours
  ];
  const { rows, totalHours, totalPay } = summarizePayrollCosts(costs);
  const row = (name: string) => rows.find((r) => r.name === name);

  it('sums hours and pay per crew member and counts distinct jobs', () => {
    expect(row('Alice')).toEqual({ crewId: 'a', name: 'Alice', roleLabel: 'Lead', hours: 7.5, pay: 225, jobCount: 2 });
  });

  it('coerces a string amount and keeps a job with no amount', () => {
    expect(row('Bob')).toEqual({ crewId: 'b', name: 'Bob', roleLabel: null, hours: 8, pay: 200, jobCount: 1 });
  });

  it('folds null-crew rows into one "Unassigned labor" bucket with no job count', () => {
    expect(row('Unassigned labor')).toEqual({ crewId: null, name: 'Unassigned labor', roleLabel: null, hours: 2, pay: 0, jobCount: 0 });
  });

  it('sorts rows by pay, descending', () => {
    expect(rows.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Unassigned labor']);
  });

  it('totals hours and pay across all rows', () => {
    expect(totalHours).toBe(17.5); // 7.5 + 8 + 2
    expect(totalPay).toBe(425); // 225 + 200 + 0
  });

  it('names an identified crew member with no name snapshot "Crew member"', () => {
    const [only] = summarizePayrollCosts([
      { crew_id: 'x', crew_name: null, crew_role_label: null, hours: 1, amount: 40, job_id: 'j1' },
    ]).rows;
    expect(only.name).toBe('Crew member');
  });

  it('keeps the last non-empty name/role snapshot (never blanks it back out)', () => {
    const { rows: r } = summarizePayrollCosts([
      { crew_id: 'd', crew_name: 'Dan', crew_role_label: 'Helper', hours: 1, amount: 30, job_id: 'j1' },
      { crew_id: 'd', crew_name: '', crew_role_label: '', hours: 1, amount: 30, job_id: 'j1' },
      { crew_id: 'd', crew_name: 'Daniel', crew_role_label: 'Foreman', hours: 1, amount: 30, job_id: 'j1' },
    ]);
    expect(r[0].name).toBe('Daniel');
    expect(r[0].roleLabel).toBe('Foreman');
  });

  it('rounds float summation to whole cents/hundredths', () => {
    const { rows: r, totalHours: h, totalPay: p } = summarizePayrollCosts([
      { crew_id: 'a', crew_name: 'A', crew_role_label: null, hours: 0.1, amount: 0.1, job_id: 'j1' },
      { crew_id: 'a', crew_name: 'A', crew_role_label: null, hours: 0.2, amount: 0.2, job_id: 'j1' },
    ]);
    expect(r[0].hours).toBe(0.3); // not 0.30000000000000004
    expect(r[0].pay).toBe(0.3);
    expect(h).toBe(0.3);
    expect(p).toBe(0.3);
  });

  it('returns empty totals for no costs', () => {
    expect(summarizePayrollCosts([])).toEqual({ rows: [], totalHours: 0, totalPay: 0 });
  });
});
