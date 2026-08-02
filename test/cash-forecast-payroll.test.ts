import { describe, it, expect } from 'vitest';
import {
  averageRecentPayroll,
  buildPayrollEvents,
  periodPayroll,
  type LaborRow,
  type PayEntry,
  type PayrollPeriod,
} from '@/lib/cash-forecast-payroll';
import { medianLagDays } from '@/lib/cash-forecast-data';

const TODAY = '2026-08-01';

const period = (over: Partial<PayrollPeriod> & { key: string }): PayrollPeriod => ({
  period: {
    startIso: '2026-07-26T04:00:00.000Z',
    endIso: '2026-08-02T04:00:00.000Z',
    rangeLabel: 'Jul 26 – Aug 1',
    open: false,
  },
  startKey: '2026-07-26',
  endKey: '2026-08-01',
  payDayKey: '2026-08-06',
  ...over,
});

const labor = (crewId: string | null, amount: number, at = '2026-07-28T15:00:00.000Z'): LaborRow => ({
  crew_id: crewId,
  amount,
  created_at: at,
});

const entries = (map: Record<string, PayEntry>) => new Map(Object.entries(map));

describe('periodPayroll — the three tiers', () => {
  it('prices unapproved work from the hours logged against it', () => {
    const result = periodPayroll(period({ key: 'w1' }), [labor('a', 400), labor('b', 250)], undefined);
    expect(result.amount).toBe(650);
    expect(result.confirmed).toBe(false);
    expect(result.crewCount).toBe(2);
    expect(result.approvedCount).toBe(0);
  });

  it('prefers an approved figure over the hours underneath it', () => {
    // The approved amount is what somebody agreed to pay. It can differ from the
    // logged cost — overtime rules, rounding, a salaried person — and the agreed
    // number is the one that leaves the bank.
    const result = periodPayroll(period({ key: 'w1' }), [labor('a', 400)], entries({ a: { status: 'approved', approved: 512.5 } }));
    expect(result.amount).toBe(512.5);
    expect(result.confirmed).toBe(true);
  });

  it('counts a sent-to-payroll entry the same as an approved one', () => {
    const result = periodPayroll(period({ key: 'w1' }), [labor('a', 400)], entries({ a: { status: 'sent', approved: 500 } }));
    expect(result.amount).toBe(500);
    expect(result.confirmed).toBe(true);
  });

  it('falls back to logged hours when an entry exists with no frozen figure', () => {
    const result = periodPayroll(period({ key: 'w1' }), [labor('a', 400)], entries({ a: { status: 'approved', approved: 0 } }));
    expect(result.amount).toBe(400);
  });

  it('leaves out money that has already gone', () => {
    const result = periodPayroll(
      period({ key: 'w1' }),
      [labor('a', 400), labor('b', 250)],
      entries({ a: { status: 'paid', approved: 400 } }),
    );
    expect(result.amount).toBe(250);
  });

  it('still owes a salaried person who logged no hours at all', () => {
    // Their approved entry is the only record that they are owed anything.
    const result = periodPayroll(period({ key: 'w1' }), [], entries({ salaried: { status: 'approved', approved: 1384.62 } }));
    expect(result.amount).toBe(1384.62);
    expect(result.confirmed).toBe(true);
  });

  it('is only confirmed when EVERY unpaid person has an agreed figure', () => {
    const result = periodPayroll(
      period({ key: 'w1' }),
      [labor('a', 400), labor('b', 250)],
      entries({ a: { status: 'approved', approved: 400 } }),
    );
    expect(result.amount).toBe(650);
    expect(result.confirmed).toBe(false);
    expect(result.approvedCount).toBe(1);
    expect(result.crewCount).toBe(2);
  });

  it('treats an entry still in review as unapproved', () => {
    const result = periodPayroll(period({ key: 'w1' }), [labor('a', 400)], entries({ a: { status: 'needs_review', approved: 999 } }));
    expect(result.amount).toBe(400);
    expect(result.confirmed).toBe(false);
  });

  it('ignores labor outside the period, and labor with nobody to pay', () => {
    const result = periodPayroll(
      period({ key: 'w1' }),
      [
        labor('a', 400, '2026-07-28T15:00:00.000Z'), // inside
        labor('a', 999, '2026-07-01T15:00:00.000Z'), // before
        labor('a', 888, '2026-08-05T15:00:00.000Z'), // after
        labor(null, 777), // unattached: nobody to pay
      ],
      undefined,
    );
    expect(result.amount).toBe(400);
  });

  it('treats the period end as exclusive, like resolvePayPeriod does', () => {
    const result = periodPayroll(period({ key: 'w1' }), [labor('a', 400, '2026-08-02T04:00:00.000Z')], undefined);
    expect(result.amount).toBe(0);
  });

  it('is zero, not confirmed, when there is nothing there', () => {
    const result = periodPayroll(period({ key: 'w1' }), [], undefined);
    expect(result).toEqual({ amount: 0, confirmed: false, approvedCount: 0, crewCount: 0 });
  });
});

describe('averageRecentPayroll — what a future period is priced at', () => {
  const closed = (key: string, endKey: string) => period({ key, endKey, period: { ...period({ key }).period, open: false } });

  it('averages only periods that are actually over', () => {
    const periods = [closed('a', '2026-07-11'), closed('b', '2026-07-18'), period({ key: 'now', endKey: '2026-08-08', period: { ...period({ key: 'x' }).period, open: true } })];
    const laborRows = [labor('c1', 1000, '2026-07-05T12:00:00Z'), labor('c1', 2000, '2026-07-14T12:00:00Z'), labor('c1', 30, '2026-08-01T12:00:00Z')];
    const byPeriod = new Map<string, Map<string, PayEntry>>();
    // Two closed periods, each holding one of the first two labor rows.
    const withRanges = [
      { ...periods[0], period: { ...periods[0].period, startIso: '2026-07-05T00:00:00Z', endIso: '2026-07-12T00:00:00Z' } },
      { ...periods[1], period: { ...periods[1].period, startIso: '2026-07-12T00:00:00Z', endIso: '2026-07-19T00:00:00Z' } },
      periods[2],
    ];
    // (1000 + 2000) / 2 — the open period's 30 is excluded.
    expect(averageRecentPayroll(withRanges, laborRows, byPeriod, TODAY)).toBe(1500);
  });

  it('is zero for an account that has never run payroll', () => {
    expect(averageRecentPayroll([closed('a', '2026-07-11')], [], new Map(), TODAY)).toBe(0);
  });

  it('excludes a period that has ended but only today — its hours may still be landing', () => {
    const justEnded = closed('a', TODAY);
    const rows = [labor('c1', 900, '2026-07-28T12:00:00Z')];
    expect(averageRecentPayroll([justEnded], rows, new Map(), TODAY)).toBe(0);
  });
});

describe('buildPayrollEvents — one event per period, on its pay day', () => {
  const future = period({
    key: 'next',
    startKey: '2026-08-02',
    endKey: '2026-08-08',
    payDayKey: '2026-08-13',
    period: { startIso: '2026-08-02T04:00:00Z', endIso: '2026-08-09T04:00:00Z', rangeLabel: 'Aug 2 – 8', open: true },
  });

  it('draws the payroll as a negative on its pay day, not its period end', () => {
    const events = buildPayrollEvents({
      periods: [period({ key: 'w1' })],
      relevant: [period({ key: 'w1' })],
      labor: [labor('a', 650)],
      entriesByPeriod: new Map(),
      todayKey: TODAY,
    });
    expect(events).toHaveLength(1);
    expect(events[0].dateKey).toBe('2026-08-06');
    expect(events[0].amount).toBe(-650);
    expect(events[0].kind).toBe('payroll');
    // Payroll doesn't arrive late; it bounces.
    expect(events[0].slips).toBe(false);
  });

  it('says how much of it has been agreed', () => {
    const one = buildPayrollEvents({
      periods: [period({ key: 'w1' })],
      relevant: [period({ key: 'w1' })],
      labor: [labor('a', 400), labor('b', 250)],
      entriesByPeriod: new Map([['w1', entries({ a: { status: 'approved', approved: 400 } })]]),
      todayKey: TODAY,
    });
    expect(one[0].detail).toContain('1 of 2 approved');
    expect(one[0].confirmed).toBe(false);
  });

  it('projects a payroll for a period nobody has worked yet', () => {
    const closed = {
      ...period({ key: 'past', endKey: '2026-07-25' }),
      period: { startIso: '2026-07-19T04:00:00Z', endIso: '2026-07-26T04:00:00Z', rangeLabel: 'Jul 19 – 25', open: false },
    };
    const events = buildPayrollEvents({
      periods: [closed, future],
      relevant: [future],
      labor: [labor('a', 900, '2026-07-20T12:00:00Z')],
      entriesByPeriod: new Map(),
      todayKey: TODAY,
    });
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(-900);
    expect(events[0].confirmed).toBe(false);
    expect(events[0].detail).toContain('Projected from recent');
    expect(events[0].id).toContain(':projected');
  });

  it('never projects on top of a period that is already part-worked', () => {
    // The current period has hours in it. Adding an average as well would bill
    // the same week twice.
    const current = period({ key: 'now', startKey: '2026-07-26', endKey: '2026-08-01' });
    const events = buildPayrollEvents({
      periods: [current],
      relevant: [current],
      labor: [labor('a', 120)],
      entriesByPeriod: new Map(),
      todayKey: TODAY,
    });
    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe(-120);
    expect(events[0].id).not.toContain(':projected');
  });

  it('says nothing for a future period when the account has no payroll history', () => {
    expect(
      buildPayrollEvents({ periods: [future], relevant: [future], labor: [], entriesByPeriod: new Map(), todayKey: TODAY }),
    ).toHaveLength(0);
  });

  it('returns nothing when no pay day lands in the window', () => {
    expect(
      buildPayrollEvents({ periods: [period({ key: 'w1' })], relevant: [], labor: [labor('a', 500)], entriesByPeriod: new Map(), todayKey: TODAY }),
    ).toHaveLength(0);
  });
});

describe('medianLagDays', () => {
  it('takes the middle, so one four-month straggler cannot move it', () => {
    expect(medianLagDays([1, 2, 3, 4, 120], 7)).toBe(3);
  });

  it('falls back until there is enough to measure', () => {
    expect(medianLagDays([2, 3], 7)).toBe(7);
    expect(medianLagDays([], 7)).toBe(7);
  });

  it('throws out impossible gaps rather than averaging them in', () => {
    expect(medianLagDays([-5, 2, 3, 4, 900], 7)).toBe(3);
  });

  it('never returns 0 — money does not arrive before it is asked for', () => {
    expect(medianLagDays([0, 0, 0], 7)).toBe(1);
  });

  it('caps at a month; beyond that it is not a forecast input', () => {
    expect(medianLagDays([90, 100, 110], 7)).toBe(30);
  });
});
