import { describe, it, expect } from 'vitest';
import { extraStopDayOptions, isAllowedExtraStopDay, zonedNowParts } from '@/lib/extra-stop';

// Sat 1 Aug 2026, 14:00 in New York (18:00 UTC).
const SAT_2PM = new Date('2026-08-01T18:00:00.000Z');
const ZONE = 'America/New_York';

const settings = (over: Partial<{ weekdays: number[]; daysAhead: number; latestEnd: string }> = {}) => ({
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  daysAhead: 1,
  latestEnd: '20:00',
  ...over,
});

const days = (over = {}, now = SAT_2PM) => extraStopDayOptions(settings(over), { now, timeZone: ZONE });

describe('zonedNowParts', () => {
  it('reads the wall clock in the contractor zone, not the server one', () => {
    // 18:00 UTC is 14:00 in New York, and still the 1st.
    expect(zonedNowParts(SAT_2PM, ZONE)).toEqual({ dateKey: '2026-08-01', time: '14:00' });
  });

  it('rolls the date back for a zone that is behind UTC midnight', () => {
    // 02:00 UTC on the 2nd is still 22:00 on the 1st in New York.
    expect(zonedNowParts(new Date('2026-08-02T02:00:00.000Z'), ZONE)).toEqual({ dateKey: '2026-08-01', time: '22:00' });
  });
});

describe('extraStopDayOptions', () => {
  it('offers today and tomorrow by default', () => {
    expect(days().map((d) => [d.dateKey, d.label])).toEqual([
      ['2026-08-01', 'Today'],
      ['2026-08-02', 'Tomorrow'],
    ]);
  });

  it('daysAhead 0 is same-day only — the behaviour this started as', () => {
    expect(days({ daysAhead: 0 }).map((d) => d.label)).toEqual(['Today']);
  });

  it('names days beyond tomorrow rather than counting them', () => {
    expect(days({ daysAhead: 3 }).map((d) => d.label)).toEqual(['Today', 'Tomorrow', 'Mon, Aug 3', 'Tue, Aug 4']);
  });

  it('skips weekdays the contractor does not work', () => {
    // Mon–Fri only, asked on a Saturday: today and tomorrow are both out.
    expect(days({ weekdays: [1, 2, 3, 4, 5], daysAhead: 2 }).map((d) => d.dateKey)).toEqual(['2026-08-03']);
  });

  it('drops TODAY once the last arrival time has passed', () => {
    // 21:00 in New York, latest arrival 20:00 — today is not a thing you can be
    // squeezed into any more, and offering it produces a request nobody can fill.
    const late = new Date('2026-08-02T01:00:00.000Z');
    expect(extraStopDayOptions(settings(), { now: late, timeZone: ZONE }).map((d) => d.label)).toEqual(['Tomorrow']);
  });

  it('keeps today right up to the cutoff', () => {
    const justBefore = new Date('2026-08-01T23:59:00.000Z'); // 19:59 New York
    expect(extraStopDayOptions(settings(), { now: justBefore, timeZone: ZONE })[0].label).toBe('Today');
  });

  it('can return nothing at all, and says so by being empty', () => {
    // Sunday-only contractor, asked on a Saturday, same-day only.
    expect(days({ weekdays: [0], daysAhead: 0 })).toEqual([]);
  });

  it('clamps a nonsense horizon rather than walking off', () => {
    expect(days({ daysAhead: 99 })).toHaveLength(8); // today + 7
    expect(days({ daysAhead: -3 }).map((d) => d.label)).toEqual(['Today']);
  });
});

describe('isAllowedExtraStopDay — the server-side re-check', () => {
  it('accepts a day that was on offer', () => {
    expect(isAllowedExtraStopDay('2026-08-02', settings(), { now: SAT_2PM, timeZone: ZONE })).toBe(true);
  });

  it('refuses a day past the horizon', () => {
    expect(isAllowedExtraStopDay('2026-08-05', settings(), { now: SAT_2PM, timeZone: ZONE })).toBe(false);
  });

  it('refuses a day the contractor does not work, however it was submitted', () => {
    expect(
      isAllowedExtraStopDay('2026-08-02', settings({ weekdays: [1, 2, 3, 4, 5] }), { now: SAT_2PM, timeZone: ZONE }),
    ).toBe(false);
  });

  it('refuses yesterday', () => {
    expect(isAllowedExtraStopDay('2026-07-31', settings(), { now: SAT_2PM, timeZone: ZONE })).toBe(false);
  });
});
