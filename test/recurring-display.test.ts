import { describe, it, expect } from 'vitest';
import { planMonthlyValue, shortDate, upcomingVisits, visitCountdown } from '@/lib/recurring-display';

describe('next-visit countdown', () => {
  const today = '2026-08-04';

  it('names the days an owner cares about', () => {
    expect(visitCountdown('2026-08-04', today).label).toBe('Today');
    expect(visitCountdown('2026-08-05', today).label).toBe('Tomorrow');
    expect(visitCountdown('2026-08-07', today).label).toBe('In 3 days');
  });

  it('escalates its tone as the visit closes in', () => {
    expect(visitCountdown('2026-09-30', today).tone).toBe('later');
    expect(visitCountdown('2026-08-07', today).tone).toBe('soon');
    expect(visitCountdown('2026-08-05', today).tone).toBe('imminent');
    expect(visitCountdown('2026-08-01', today).tone).toBe('overdue');
  });

  // A plan whose cron run failed is the one thing on this page that needs a human,
  // and "Next Sat, Aug 1, 2026" printed in the past said nothing at all.
  it('says a missed visit is late rather than counting forwards', () => {
    expect(visitCountdown('2026-08-03', today).label).toBe('1 day late');
    expect(visitCountdown('2026-07-28', today).label).toBe('7 days late');
  });

  it('rounds longer waits to the unit a person would use', () => {
    expect(visitCountdown('2026-08-12', today).label).toBe('Next week');
    expect(visitCountdown('2026-08-25', today).label).toBe('In 3 weeks');
    expect(visitCountdown('2026-11-02', today).label).toBe('In 3 months');
  });

  it('reports the raw day count for callers that need to filter', () => {
    expect(visitCountdown('2026-08-11', today).days).toBe(7);
    expect(visitCountdown('2026-08-03', today).days).toBe(-1);
  });

  it('survives a DST boundary', () => {
    // Nov 1 2026 is the US fall-back; truncating instead of rounding drops a day.
    expect(visitCountdown('2026-11-03', '2026-10-30').days).toBe(4);
    expect(visitCountdown('2026-03-10', '2026-03-06').days).toBe(4);
  });
});

describe('upcoming visits rail', () => {
  it('walks the cadence forward', () => {
    expect(upcomingVisits('2026-08-04', 'weekly', 3)).toEqual(['2026-08-04', '2026-08-11', '2026-08-18']);
    expect(upcomingVisits('2026-08-04', 'biweekly', 3)).toEqual(['2026-08-04', '2026-08-18', '2026-09-01']);
    expect(upcomingVisits('2026-08-04', 'monthly', 3)).toEqual(['2026-08-04', '2026-09-04', '2026-10-04']);
  });

  it('clamps a month-end date instead of rolling into the next month', () => {
    expect(upcomingVisits('2026-01-31', 'monthly', 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-28']);
  });

  it('crosses a year boundary', () => {
    expect(upcomingVisits('2026-12-28', 'weekly', 2)).toEqual(['2026-12-28', '2027-01-04']);
  });

  it('returns nothing when asked for nothing', () => {
    expect(upcomingVisits('2026-08-04', 'weekly', 0)).toEqual([]);
  });
});

describe('a plan normalized to a month', () => {
  // Weekly and monthly plans sit in the same column, so they have to be comparable.
  it('scales by cadence', () => {
    expect(planMonthlyValue(60, 'weekly')).toBeCloseTo(260, 5);
    expect(planMonthlyValue(60, 'biweekly')).toBeCloseTo(130, 5);
    expect(planMonthlyValue(60, 'monthly')).toBe(60);
  });

  it('treats a missing amount as nothing, not NaN', () => {
    expect(planMonthlyValue(null as unknown as number, 'weekly')).toBe(0);
  });
});

describe('date labels', () => {
  it('reads the key as a plain calendar date, not a local timestamp', () => {
    // Parsed as UTC — otherwise a west-coast owner sees the day before.
    expect(shortDate('2026-08-04')).toBe('Aug 4');
    expect(shortDate('2026-01-01')).toBe('Jan 1');
  });
});
