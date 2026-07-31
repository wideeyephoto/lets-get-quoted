import { describe, it, expect } from 'vitest';
import { advanceDate, projectPlanVisits } from '@/lib/recurring';

describe('advanceDate — weekly', () => {
  it('adds 7 days', () => {
    expect(advanceDate('2026-07-25', 'weekly')).toBe('2026-08-01');
  });
  it('crosses a month boundary', () => {
    expect(advanceDate('2026-01-28', 'weekly')).toBe('2026-02-04');
  });
  it('crosses a year boundary', () => {
    expect(advanceDate('2026-12-28', 'weekly')).toBe('2027-01-04');
  });
});

describe('advanceDate — biweekly', () => {
  it('adds 14 days', () => {
    expect(advanceDate('2026-07-25', 'biweekly')).toBe('2026-08-08');
  });
  it('crosses a year boundary', () => {
    expect(advanceDate('2026-12-25', 'biweekly')).toBe('2027-01-08');
  });
});

describe('advanceDate — monthly', () => {
  it('adds one calendar month', () => {
    expect(advanceDate('2026-01-15', 'monthly')).toBe('2026-02-15');
  });
  it('rolls over the year', () => {
    expect(advanceDate('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    expect(advanceDate('2028-01-31', 'monthly')).toBe('2028-02-29');
  });
  it('clamps the 31st to a 30-day month', () => {
    expect(advanceDate('2026-03-31', 'monthly')).toBe('2026-04-30');
  });
  it('clamps Dec 31 correctly into January (still 31 days)', () => {
    expect(advanceDate('2026-12-31', 'monthly')).toBe('2027-01-31');
  });
  it('does not roll a clamped date into the following month', () => {
    // The bug this guards: naive +1 month on Jan 30 could land in March.
    expect(advanceDate('2026-01-30', 'monthly')).toBe('2026-02-28');
  });
});

describe('projectPlanVisits — what a plan puts on the calendar before it exists', () => {
  const base = {
    id: 'p1',
    title: 'Weekly mow',
    client_name: 'Jordan Reyes',
    amount: 120,
    frequency: 'weekly' as const,
    next_run_date: '2026-08-05',
    active: true,
    remaining_cycles: null as number | null,
  };

  it('walks the cadence across the window', () => {
    const visits = projectPlanVisits([base], { fromKey: '2026-08-01', toKey: '2026-08-31' });
    expect(visits.map((v) => v.dateKey)).toEqual(['2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26']);
    expect(visits[0].cycle).toBe(1);
  });

  it('starts at the next run date, not at the window', () => {
    const visits = projectPlanVisits([base], { fromKey: '2026-07-01', toKey: '2026-07-31' });
    expect(visits).toEqual([]);
  });

  it('keeps counting cadence through a window it has not reached yet', () => {
    // September is three weeks past the plan's next run — the dates have to line
    // up with the series, not restart at the top of the month.
    const visits = projectPlanVisits([base], { fromKey: '2026-09-01', toKey: '2026-09-30' });
    expect(visits[0].dateKey).toBe('2026-09-02');
    expect(visits[0].cycle).toBe(5);
  });

  it('draws nothing for a paused plan', () => {
    const visits = projectPlanVisits([{ ...base, active: false }], { fromKey: '2026-08-01', toKey: '2026-08-31' });
    expect(visits).toEqual([]);
  });

  it('stops at the end of a fixed term', () => {
    const visits = projectPlanVisits([{ ...base, remaining_cycles: 2 }], { fromKey: '2026-08-01', toKey: '2026-12-31' });
    expect(visits.map((v) => v.dateKey)).toEqual(['2026-08-05', '2026-08-12']);
    expect(visits[1].remainingAfter).toBe(0);
  });

  it('follows the same monthly clamping the cron will follow', () => {
    const visits = projectPlanVisits(
      [{ ...base, frequency: 'monthly' as const, next_run_date: '2026-01-31' }],
      { fromKey: '2026-01-01', toKey: '2026-04-30' },
    );
    expect(visits.map((v) => v.dateKey)).toEqual(['2026-01-31', '2026-02-28', '2026-03-28', '2026-04-28']);
  });

  it('sorts several plans into one chronological list', () => {
    const other = { ...base, id: 'p2', title: 'Biweekly cleanup', client_name: 'Alex Chen', frequency: 'biweekly' as const, next_run_date: '2026-08-07' };
    const visits = projectPlanVisits([base, other], { fromKey: '2026-08-01', toKey: '2026-08-20' });
    expect(visits.map((v) => `${v.dateKey} ${v.clientName}`)).toEqual([
      '2026-08-05 Jordan Reyes',
      '2026-08-07 Alex Chen',
      '2026-08-12 Jordan Reyes',
      '2026-08-19 Jordan Reyes',
    ]);
  });

  it('cannot run away on a wide window', () => {
    const visits = projectPlanVisits([base], { fromKey: '2026-08-01', toKey: '2099-12-31' }, 10);
    expect(visits).toHaveLength(10);
  });
});
