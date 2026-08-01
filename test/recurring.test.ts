import { describe, it, expect } from 'vitest';
import { advanceDate, anchorDayFrom, nextFutureRunDate, projectPlanVisits, requiresReconsent } from '@/lib/recurring';

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

describe('projectPlanVisits — beside visits that are already real jobs', () => {
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

  it('does not draw a ghost over a visit that has a job', () => {
    const materialized = new Set(['p1:2026-08-05', 'p1:2026-08-12']);
    const visits = projectPlanVisits([base], { fromKey: '2026-08-01', toKey: '2026-08-31' }, undefined, materialized);
    expect(visits.map((v) => v.dateKey)).toEqual(['2026-08-19', '2026-08-26']);
  });

  it('keeps the cadence counting through the ones it skipped', () => {
    const materialized = new Set(['p1:2026-08-05']);
    const visits = projectPlanVisits([base], { fromKey: '2026-08-01', toKey: '2026-08-31' }, undefined, materialized);
    // The 12th is still the second visit of the series, not the first.
    expect(visits[0].cycle).toBe(2);
  });

  it('only matches its own plan', () => {
    const materialized = new Set(['other-plan:2026-08-05']);
    const visits = projectPlanVisits([base], { fromKey: '2026-08-01', toKey: '2026-08-31' }, undefined, materialized);
    expect(visits[0].dateKey).toBe('2026-08-05');
  });
});

describe('requiresReconsent', () => {
  const base = { amount: 100, auto_charge: true } as Parameters<typeof requiresReconsent>[0];

  it('blocks a rise on a plan that charges a card on file', () => {
    // The card is permission to take an agreed figure, not whatever the plan
    // later says. A silent increase bills more under the old mandate.
    expect(requiresReconsent(base, 120)).toBe(true);
  });

  it('lets a cut through untouched', () => {
    expect(requiresReconsent(base, 80)).toBe(false);
  });

  it('ignores float noise rather than nagging about a cent', () => {
    expect(requiresReconsent(base, 100.001)).toBe(false);
    expect(requiresReconsent(base, 100)).toBe(false);
  });

  it('never asks when no card is on file — nothing charges itself', () => {
    const manual = { amount: 100, auto_charge: false } as Parameters<typeof requiresReconsent>[0];
    expect(requiresReconsent(manual, 500)).toBe(false);
  });
});

describe('advanceDate month-end behaviour', () => {
  it('clamps into short months instead of rolling over', () => {
    expect(advanceDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceDate('2026-03-31', 'monthly')).toBe('2026-04-30');
  });

  it('is still lossy WITHOUT an anchor — the old behaviour, kept for callers that have none', () => {
    // Jan 31 -> Feb 28 -> Mar 28. Each step can only see the day it just landed
    // on, so the original day is gone. Every plan-driven path now passes the
    // anchor; this pins what happens when one doesn't.
    const feb = advanceDate('2026-01-31', 'monthly');
    expect(advanceDate(feb, 'monthly')).toBe('2026-03-28');
  });

  it('with an anchor, February borrows the day and March gives it back', () => {
    // The whole point: somebody who agreed to the last day of the month should
    // not be moved to the 28th forever by one February.
    const anchor = anchorDayFrom('2026-01-31');
    expect(anchor).toBe(31);
    const feb = advanceDate('2026-01-31', 'monthly', anchor);
    expect(feb).toBe('2026-02-28');
    const mar = advanceDate(feb, 'monthly', anchor);
    expect(mar).toBe('2026-03-31');
    expect(advanceDate(mar, 'monthly', anchor)).toBe('2026-04-30');
    // …and back to the 31st in May.
    expect(advanceDate(advanceDate(mar, 'monthly', anchor), 'monthly', anchor)).toBe('2026-05-31');
  });

  it('ignores an anchor that could never be a day of the month', () => {
    expect(advanceDate('2026-01-15', 'monthly', 0)).toBe('2026-02-15');
    expect(advanceDate('2026-01-15', 'monthly', 44)).toBe('2026-02-15');
    expect(advanceDate('2026-01-15', 'monthly', null)).toBe('2026-02-15');
  });

  it('leaves weekly and biweekly alone — an anchor is a monthly idea', () => {
    expect(advanceDate('2026-01-31', 'weekly', 31)).toBe('2026-02-07');
    expect(advanceDate('2026-01-31', 'biweekly', 31)).toBe('2026-02-14');
  });

  it('crosses a year boundary', () => {
    expect(advanceDate('2026-12-15', 'monthly')).toBe('2027-01-15');
    expect(advanceDate('2026-12-30', 'weekly')).toBe('2027-01-06');
  });
});


describe('nextFutureRunDate — resuming a plan that was paused', () => {
  // The bug this exists for: next_run_date stays where it was when the plan was
  // paused. Resume it two months later and the visit generator writes visits
  // into the past — and the daily sweep, which fires on next_run_date <= today,
  // bills the customer for every visit nobody made.
  it('rolls a stale date forward to the next real occurrence', () => {
    expect(nextFutureRunDate('2026-06-03', 'weekly', '2026-08-01')).toBe('2026-08-05');
    expect(nextFutureRunDate('2026-06-03', 'biweekly', '2026-08-01')).toBe('2026-08-12');
    expect(nextFutureRunDate('2026-06-03', 'monthly', '2026-08-01', 3)).toBe('2026-08-03');
  });

  it('leaves a date that is already ahead exactly where it is', () => {
    expect(nextFutureRunDate('2026-09-10', 'weekly', '2026-08-01')).toBe('2026-09-10');
  });

  it('counts today as future — a visit due today has not been missed', () => {
    expect(nextFutureRunDate('2026-08-01', 'weekly', '2026-08-01')).toBe('2026-08-01');
  });

  it('keeps the anchor while catching up, so a month-end plan lands month-end', () => {
    expect(nextFutureRunDate('2026-01-31', 'monthly', '2026-04-15', 31)).toBe('2026-04-30');
  });

  it('never returns a past date, even for a plan dormant for years', () => {
    const result = nextFutureRunDate('2019-01-01', 'weekly', '2026-08-01', null, 5);
    expect(result >= '2026-08-01').toBe(true);
  });
});
