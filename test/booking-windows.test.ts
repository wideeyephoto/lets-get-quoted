import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WINDOW_MINUTES,
  bookingAvailabilityFromAccount,
  bookingWindowPresets,
  formatWindowRange,
  labelForWindowTime,
  normalizeWindowMinutes,
  overlappingWindowTimes,
  windowEndTime,
  windowPartName,
  windowsForTimes,
} from '@/lib/booking-availability';
import { overrunningWindowTimes } from '@/lib/booking-availability';
import { computeBookingDays } from '@/lib/booking';
import { readFileSync } from 'node:fs';
import { requestedWhenLabel } from '@/lib/booking-requests';

describe('windowEndTime', () => {
  it('adds the window length to the start', () => {
    expect(windowEndTime('08:00', 240)).toBe('12:00');
    expect(windowEndTime('13:00', 180)).toBe('16:00');
    expect(windowEndTime('09:30', 90)).toBe('11:00');
  });

  it('clamps at 23:59 instead of rolling onto a day the customer never picked', () => {
    expect(windowEndTime('22:00', 360)).toBe('23:59');
    expect(windowEndTime('23:30', 240)).toBe('23:59');
  });

  it('normalizes a junk length rather than producing NaN:NaN', () => {
    expect(windowEndTime('08:00', Number.NaN)).toBe('12:00');
    expect(windowEndTime('08:00', -50)).toBe('08:30'); // clamped to the 30-min floor
    expect(windowEndTime('08:00', 99999)).toBe('18:00'); // clamped to the 600-min ceiling
  });
});

describe('normalizeWindowMinutes', () => {
  it('falls back to the default for anything unusable', () => {
    expect(normalizeWindowMinutes(undefined)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(normalizeWindowMinutes(null)).toBe(DEFAULT_WINDOW_MINUTES);
    expect(normalizeWindowMinutes('nonsense')).toBe(DEFAULT_WINDOW_MINUTES);
  });

  it('clamps to a range a contractor could actually work to', () => {
    expect(normalizeWindowMinutes(5)).toBe(30);
    expect(normalizeWindowMinutes(5000)).toBe(600);
    expect(normalizeWindowMinutes('180')).toBe(180);
  });
});

describe('labels', () => {
  it('shows a span, never a single time', () => {
    expect(formatWindowRange('08:00', 240)).toBe('8:00 AM – 12:00 PM');
    const label = labelForWindowTime('08:00', 240);
    expect(label).toBe('Morning · 8:00 AM – 12:00 PM');
    // The regression this whole change exists to prevent: a label that names one
    // clock time is a promise no trade can keep.
    expect(label).not.toBe('Morning · 8:00 AM');
  });

  it('names the part of the day for custom times too', () => {
    expect(windowPartName('07:00')).toBe('Morning');
    expect(windowPartName('12:30')).toBe('Midday');
    expect(windowPartName('18:30')).toBe('Evening');
    expect(labelForWindowTime('06:45', 120)).toBe('Morning · 6:45 AM – 8:45 AM');
  });

  it('crosses noon and midnight without breaking the clock', () => {
    expect(formatWindowRange('11:00', 120)).toBe('11:00 AM – 1:00 PM');
    expect(formatWindowRange('00:00', 60)).toBe('12:00 AM – 1:00 AM');
  });

  it('carries the end time on every offered window', () => {
    const windows = windowsForTimes(['08:00', '13:00'], 240);
    expect(windows).toEqual([
      { time: '08:00', endTime: '12:00', label: 'Morning · 8:00 AM – 12:00 PM' },
      { time: '13:00', endTime: '17:00', label: 'Afternoon · 1:00 PM – 5:00 PM' },
    ]);
  });

  it('offers the presets at whatever length the owner set', () => {
    expect(bookingWindowPresets(120).map((w) => w.label)).toEqual([
      'Morning · 8:00 AM – 10:00 AM',
      'Late morning · 10:00 AM – 12:00 PM',
      'Afternoon · 1:00 PM – 3:00 PM',
      'Late afternoon · 3:00 PM – 5:00 PM',
      'Evening · 5:00 PM – 7:00 PM',
    ]);
  });
});

describe('overlappingWindowTimes', () => {
  it('is quiet when windows sit end to end', () => {
    expect(overlappingWindowTimes(['08:00', '12:00', '16:00'], 240)).toEqual([]);
    expect(overlappingWindowTimes(['08:00', '13:00'], 240)).toEqual([]);
  });

  it('flags the window that swallows the next one', () => {
    expect(overlappingWindowTimes(['08:00', '10:00'], 240)).toEqual(['08:00']);
    // 10:00 + 4h reaches 2 PM, which runs over the 1 PM window — so both clash.
    expect(overlappingWindowTimes(['08:00', '10:00', '13:00'], 240)).toEqual(['08:00', '10:00']);
    expect(overlappingWindowTimes(['08:00', '10:00', '13:00'], 120)).toEqual([]);
  });

  it('flags each clash in a run, not just the first', () => {
    expect(overlappingWindowTimes(['08:00', '10:00', '11:00'], 240)).toEqual(['08:00', '10:00']);
  });

  it('sorts before comparing, so entry order cannot create a false alarm', () => {
    expect(overlappingWindowTimes(['13:00', '08:00'], 240)).toEqual([]);
  });

  it('says nothing about a single window', () => {
    expect(overlappingWindowTimes(['08:00'], 600)).toEqual([]);
    expect(overlappingWindowTimes([], 240)).toEqual([]);
  });
});

describe('bookingAvailabilityFromAccount', () => {
  it('reads the configured length', () => {
    expect(bookingAvailabilityFromAccount({ booking_window_minutes: 120 }).windowMinutes).toBe(120);
  });

  it('degrades to the default on a pre-migration row', () => {
    expect(bookingAvailabilityFromAccount({}).windowMinutes).toBe(DEFAULT_WINDOW_MINUTES);
    expect(bookingAvailabilityFromAccount(null).windowMinutes).toBe(DEFAULT_WINDOW_MINUTES);
  });
});

describe('requestedWhenLabel', () => {
  it('reads back the window the customer was shown', () => {
    expect(requestedWhenLabel('2026-08-06', '08:00', '12:00')).toBe('Thu, Aug 6, 8:00 AM – 12:00 PM');
  });

  it('does NOT invent an end for a request taken before windows existed', () => {
    // Those customers were told a time. Showing the contractor a window they
    // never offered would put a different promise on the screen than the one in
    // the customer's inbox.
    expect(requestedWhenLabel('2026-08-06', '09:00')).toBe('Thu, Aug 6 at 9:00 AM');
    expect(requestedWhenLabel('2026-08-06', '09:00', null)).toBe('Thu, Aug 6 at 9:00 AM');
  });

  it('degrades to the day alone when there is no time at all', () => {
    expect(requestedWhenLabel('2026-08-06', null)).toBe('Thu, Aug 6');
    expect(requestedWhenLabel('2026-08-06', null, '12:00')).toBe('Thu, Aug 6');
  });

  it('returns the raw key rather than "Invalid Date" for junk', () => {
    expect(requestedWhenLabel('not-a-date', '08:00', '12:00')).toBe('not-a-date');
  });
});

/**
 * THE WINDOW THAT FINISHED AFTER WORK DID.
 *
 * Working hours ended at 6:00 PM and the live booking page offered
 * "3:00 – 7:00 PM". computeBookingDays checked that a window STARTED inside the
 * working day and never that it finished inside one, so a four-hour window
 * beginning at three o'clock passed the filter — and a homeowner was promised
 * an arrival window an hour after the contractor stops.
 */
describe('overrunningWindowTimes', () => {
  it('catches the case that shipped', () => {
    expect(overrunningWindowTimes(['08:00', '12:00', '15:00'], 240, '18:00')).toEqual(['15:00']);
  });

  it('lets a window that ends exactly on the bell through', () => {
    // 2:00 PM + 4 hours is 6:00 PM, and a day that ends at 6:00 PM includes it.
    // Anything stricter refuses to use the last window of the owner's own day.
    expect(overrunningWindowTimes(['14:00'], 240, '18:00')).toEqual([]);
  });

  it('moves with the window length, not just the start', () => {
    // The same 3:00 PM start is fine at two hours and not at four.
    expect(overrunningWindowTimes(['15:00'], 120, '18:00')).toEqual([]);
    expect(overrunningWindowTimes(['15:00'], 240, '18:00')).toEqual(['15:00']);
  });

  it('reports every offender, in the order they were given', () => {
    expect(overrunningWindowTimes(['13:00', '16:00', '17:00'], 240, '18:00')).toEqual(['16:00', '17:00']);
  });

  it('says nothing when the working day is unreadable', () => {
    // Better to offer the owner's configured windows than to close booking on
    // a value we could not parse.
    expect(overrunningWindowTimes(['15:00'], 240, 'not-a-time')).toEqual([]);
  });
});

describe('computeBookingDays respects both ends of the working day', () => {
  const availability = (over: Partial<Parameters<typeof computeBookingDays>[0]['availability']> = {}) =>
    ({
      enabled: true,
      weekdays: [1, 2, 3, 4, 5],
      windowTimes: ['08:00', '12:00', '15:00'],
      windowMinutes: 240,
      workdayStart: '08:00',
      workdayEnd: '18:00',
      maxPerDay: 10,
      capacityHours: 100,
      leadDays: 0,
      timezone: 'America/Detroit',
      ...over,
    }) as Parameters<typeof computeBookingDays>[0]['availability'];

  const offer = (over = {}) =>
    computeBookingDays({
      availability: availability(over),
      countByDate: new Map(),
      takenByDate: new Map(),
      now: new Date('2026-08-10T15:00:00Z'), // a Monday
    });

  it('no longer offers 3:00 – 7:00 PM against a 6:00 PM finish', () => {
    const times = offer()[0]?.slots.map((s) => s.time) ?? [];
    expect(times).toContain('08:00');
    expect(times).toContain('12:00');
    expect(times).not.toContain('15:00');
  });

  it('offers it again once the day is long enough to hold it', () => {
    const times = offer({ workdayEnd: '19:00' })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).toContain('15:00');
  });

  it('and once the window is short enough to fit', () => {
    const times = offer({ windowMinutes: 120 })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).toContain('15:00');
  });

  it('still refuses a window that starts after the day ends', () => {
    // The rule this replaces was not wrong, only incomplete.
    const times = offer({ windowTimes: ['19:00'], windowMinutes: 60 })[0]?.slots.map((s) => s.time) ?? [];
    expect(times).not.toContain('19:00');
  });
});

/** The warning and the filter have to be the same rule, or a window vanishes
 *  from the public page with nothing on the setup screen explaining it. */
describe('booking setup names the windows it will not offer', () => {
  const SETUP = readFileSync('src/app/dashboard/schedule/booking/BookingSetup.tsx', 'utf8');

  it('uses the same function the offer filter does', () => {
    expect(SETUP).toContain('overrunningWindowTimes(windowTimes, windowMinutes, workdayEnd)');
  });

  it('says which window, and what to change', () => {
    expect(SETUP).toContain('after your working day ends at');
    expect(SETUP).toMatch(/Shorten the window length, move the start earlier, or extend your working hours/);
  });
});
