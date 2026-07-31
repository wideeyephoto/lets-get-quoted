import { describe, it, expect } from 'vitest';
import { addZonedDays, resolvePayPeriod, startOfDay, startOfWeek, zonedDateKey } from '@/lib/labor';

// Pay periods used to be cut on the SERVER's clock, and the server is UTC. For
// an Eastern shop that put every Saturday evening into the following week's
// payroll — 8pm Saturday ET is 00:00 Sunday UTC — which nobody would ever spot
// except as a week that ran light and a next week that ran heavy, every week.
//
// Everything here is asserted against instants, not against formatted strings,
// so the tests mean the same thing wherever they are run.

const ET = 'America/New_York';

describe('startOfWeek in a zone', () => {
  it('puts Saturday evening in the week that is ending, not the next one', () => {
    // 8pm Saturday 1 Aug 2026 Eastern = 00:00 Sunday 2 Aug UTC.
    const saturdayNight = new Date('2026-08-02T00:00:00Z');
    const week = startOfWeek(saturdayNight, ET);
    // The week containing it began on Sunday 26 July, Eastern.
    expect(zonedDateKey(week, ET)).toBe('2026-07-26');
  });

  it('starts a new week at midnight Sunday in the zone, not at midnight UTC', () => {
    // 00:30 Sunday 2 Aug Eastern is 04:30 UTC.
    const sundayMorning = new Date('2026-08-02T04:30:00Z');
    expect(zonedDateKey(startOfWeek(sundayMorning, ET), ET)).toBe('2026-08-02');
  });

  it('lands on real local midnight, not on an approximation of it', () => {
    const week = startOfWeek(new Date('2026-08-05T12:00:00Z'), ET);
    // Eastern is UTC-4 in August, so local midnight is 04:00 UTC.
    expect(week.toISOString()).toBe('2026-08-02T04:00:00.000Z');
  });
});

describe('startOfDay in a zone', () => {
  it('is the local midnight of the local date', () => {
    // 11pm Eastern on 31 July is 03:00 UTC on 1 August. The DAY is the 31st.
    const lateEvening = new Date('2026-08-01T03:00:00Z');
    expect(zonedDateKey(lateEvening, ET)).toBe('2026-07-31');
    expect(startOfDay(lateEvening, ET).toISOString()).toBe('2026-07-31T04:00:00.000Z');
  });
});

describe('addZonedDays across a clock change', () => {
  it('stays on midnight when the clocks go back', () => {
    // US DST ends Sunday 1 Nov 2026. Stepping by a flat 24 hours from the 31st
    // would land at 11pm on the 1st rather than at midnight on it.
    const oct31 = startOfDay(new Date('2026-10-31T16:00:00Z'), ET);
    const nov1 = addZonedDays(oct31, 1, ET);
    expect(zonedDateKey(nov1, ET)).toBe('2026-11-01');
    expect(nov1.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('stays on midnight when the clocks go forward', () => {
    // DST starts Sunday 8 March 2026.
    const mar7 = startOfDay(new Date('2026-03-07T17:00:00Z'), ET);
    const mar8 = addZonedDays(mar7, 1, ET);
    expect(zonedDateKey(mar8, ET)).toBe('2026-03-08');
    expect(mar8.toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });
});

describe('resolvePayPeriod in a zone', () => {
  const now = new Date('2026-07-30T18:00:00Z'); // Thursday afternoon ET

  it('runs a week from local Sunday to local Sunday', () => {
    const period = resolvePayPeriod('weekly', 0, { now, timeZone: ET });
    expect(period.startIso).toBe('2026-07-26T04:00:00.000Z');
    expect(period.endIso).toBe('2026-08-02T04:00:00.000Z');
  });

  it('captures Saturday-evening work in the week it was worked', () => {
    const period = resolvePayPeriod('weekly', 0, { now, timeZone: ET });
    // 8pm Saturday 1 Aug ET.
    const saturdayShift = new Date('2026-08-02T00:00:00Z').toISOString();
    expect(saturdayShift >= period.startIso && saturdayShift < period.endIso).toBe(true);
  });

  it('is seven local days long even when one of them has 25 hours in it', () => {
    // US DST ends at 2am on Sunday 1 Nov 2026, so the week that CONTAINS the
    // changeover really is 169 hours. Cutting in UTC would make it 168 and quietly
    // drop an hour of anyone working that night.
    const dstWeek = resolvePayPeriod('weekly', 0, { now: new Date('2026-11-04T16:00:00Z'), timeZone: ET });
    expect(zonedDateKey(new Date(dstWeek.startIso), ET)).toBe('2026-11-01');
    expect(zonedDateKey(new Date(dstWeek.endIso), ET)).toBe('2026-11-08');
    const hours = (new Date(dstWeek.endIso).getTime() - new Date(dstWeek.startIso).getTime()) / 3600000;
    expect(hours).toBe(169);
  });

  it('and seven flat days on a week that has no clock change in it', () => {
    const week = resolvePayPeriod('weekly', 0, { now: new Date('2026-10-29T16:00:00Z'), timeZone: ET });
    expect(zonedDateKey(new Date(week.startIso), ET)).toBe('2026-10-25');
    expect(zonedDateKey(new Date(week.endIso), ET)).toBe('2026-11-01');
    expect((new Date(week.endIso).getTime() - new Date(week.startIso).getTime()) / 3600000).toBe(168);
  });

  it('cuts a month at local midnight on the first', () => {
    const period = resolvePayPeriod('monthly', 0, { now, timeZone: ET });
    expect(period.startIso).toBe('2026-07-01T04:00:00.000Z');
    expect(period.endIso).toBe('2026-08-01T04:00:00.000Z');
  });

  it('keeps a fortnight anchored to the same fortnight every time', () => {
    const a = resolvePayPeriod('biweekly', 0, { now, timeZone: ET });
    const b = resolvePayPeriod('biweekly', 0, { now: new Date('2026-07-27T09:00:00Z'), timeZone: ET });
    expect(a.startIso).toBe(b.startIso);
    const days = (new Date(a.endIso).getTime() - new Date(a.startIso).getTime()) / 86400000;
    expect(days).toBe(14);
  });

  it('reads a typed custom range as the contractor’s days', () => {
    const period = resolvePayPeriod('custom', 0, { now, from: '2026-07-26', to: '2026-08-01', timeZone: ET });
    expect(period.startIso).toBe('2026-07-26T04:00:00.000Z');
    // Inclusive end: everything logged ON the 1st has to count.
    expect(period.endIso).toBe('2026-08-02T04:00:00.000Z');
  });

  it('behaves exactly as before when no zone is given', () => {
    const withZone = resolvePayPeriod('weekly', 0, { now, timeZone: ET });
    const without = resolvePayPeriod('weekly', 0, { now });
    // Only asserting it still produces a seven-day period — the actual boundary
    // depends on where the test runs, which is the whole reason zones were added.
    const days = (new Date(without.endIso).getTime() - new Date(without.startIso).getTime()) / 86400000;
    expect(Math.round(days)).toBe(7);
    expect(withZone.mode).toBe(without.mode);
  });
});
