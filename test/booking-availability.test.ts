import { describe, it, expect } from 'vitest';
import {
  normalizeTimezone,
  normalizeBookingWeekdays,
  normalizeBookingWindowTimes,
  normalizeMaxPerDay,
  normalizeLeadDays,
  bookingAvailabilityFromAccount,
  type BookingAvailability,
} from '@/lib/booking-availability';
import { computeBookingDays } from '@/lib/booking';

describe('booking-availability normalizers', () => {
  it('normalizeTimezone accepts known IANA ids, else defaults', () => {
    expect(normalizeTimezone('America/Chicago')).toBe('America/Chicago');
    expect(normalizeTimezone('Mars/Olympus')).toBe('America/New_York');
    expect(normalizeTimezone(undefined)).toBe('America/New_York');
  });

  it('normalizeBookingWeekdays parses CSV + arrays, dedups, filters range', () => {
    expect(normalizeBookingWeekdays('1,2,3,4,5')).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeBookingWeekdays([5, 1, 1, 9, -2, 3])).toEqual([1, 3, 5]);
    expect(normalizeBookingWeekdays('')).toEqual([]); // explicitly closed
    expect(normalizeBookingWeekdays(undefined)).toEqual([1, 2, 3, 4, 5]); // default
  });

  it('normalizeBookingWindowTimes keeps known presets in preset order, else defaults', () => {
    expect(normalizeBookingWindowTimes(['13:00', '08:00'])).toEqual(['08:00', '13:00']); // reordered
    expect(normalizeBookingWindowTimes(['08:00', '99:99', '17:00'])).toEqual(['08:00', '17:00']);
    expect(normalizeBookingWindowTimes('["10:00","15:00"]')).toEqual(['10:00', '15:00']); // JSON string
    expect(normalizeBookingWindowTimes([])).toEqual(['08:00', '13:00']); // never silently zero
  });

  it('reads the booking master switch, defaulting on for a pre-migration row', () => {
    expect(bookingAvailabilityFromAccount({ booking_enabled: false }).enabled).toBe(false);
    expect(bookingAvailabilityFromAccount({ booking_enabled: true }).enabled).toBe(true);
    // Only an explicit false closes booking — absent/null/undefined stay on.
    expect(bookingAvailabilityFromAccount({}).enabled).toBe(true);
    expect(bookingAvailabilityFromAccount({ booking_enabled: null }).enabled).toBe(true);
  });

  it('clamps max-per-day and lead-days', () => {
    expect(normalizeMaxPerDay('0')).toBe(1);
    expect(normalizeMaxPerDay(999)).toBe(50);
    expect(normalizeMaxPerDay('x')).toBe(4);
    expect(normalizeLeadDays(-3)).toBe(0);
    expect(normalizeLeadDays(999)).toBe(30);
    expect(normalizeLeadDays(undefined)).toBe(1);
  });

  it('bookingAvailabilityFromAccount degrades a null row to old-behavior defaults', () => {
    expect(bookingAvailabilityFromAccount(null)).toEqual({
      enabled: true, // absent column ⇒ on, preserving pre-migration behavior
      timezone: 'America/New_York',
      weekdays: [1, 2, 3, 4, 5],
      windowTimes: ['08:00', '13:00'],
      maxPerDay: 4,
      leadDays: 1,
      workdayStart: '08:00',
      workdayEnd: '17:00',
      capacityHours: 8,
      bufferMinutes: 0,
    });
  });
});

const BASE: BookingAvailability = {
  enabled: true,
  timezone: 'America/New_York',
  weekdays: [1, 2, 3, 4, 5],
  windowTimes: ['08:00', '13:00'],
  maxPerDay: 4,
  leadDays: 1,
  workdayStart: '08:00',
  workdayEnd: '17:00',
};
const empty = () => ({ countByDate: new Map<string, number>(), takenByDate: new Map<string, Set<string>>() });

describe('computeBookingDays', () => {
  it('offers weekdays from tomorrow with both windows (default behavior)', () => {
    // Mon Aug 3 2026, 12:00Z = 8am ET Monday.
    const days = computeBookingDays({ availability: BASE, ...empty(), now: new Date('2026-08-03T12:00:00Z') });
    expect(days[0].dateKey).toBe('2026-08-04'); // Tuesday
    expect(days[0].dayLabel).toContain('Tuesday');
    expect(days[0].slots.map((s) => s.time)).toEqual(['08:00', '13:00']);
    expect(days.some((d) => /-08-(08|09)$/.test(d.dateKey))).toBe(false); // no Sat/Sun
  });

  it('anchors the day to the OWNER timezone, not the server clock (the wrong-day fix)', () => {
    // 02:00Z Tue Aug 4 is still 10pm ET *Monday* Aug 3, so tomorrow = Tue Aug 4.
    // Server-local (UTC) math would wrongly treat "today" as Aug 4 and offer Aug 5.
    const days = computeBookingDays({ availability: BASE, ...empty(), now: new Date('2026-08-04T02:00:00Z') });
    expect(days[0].dateKey).toBe('2026-08-04');
  });

  it('skips a day at capacity and drops taken windows', () => {
    const countByDate = new Map([['2026-08-04', 4]]); // Tue full
    const takenByDate = new Map([['2026-08-05', new Set(['08:00'])]]); // Wed morning taken
    const days = computeBookingDays({ availability: BASE, countByDate, takenByDate, now: new Date('2026-08-03T12:00:00Z') });
    expect(days.find((d) => d.dateKey === '2026-08-04')).toBeUndefined();
    expect(days.find((d) => d.dateKey === '2026-08-05')!.slots.map((s) => s.time)).toEqual(['13:00']);
  });

  it('honors a restricted weekday set and lead time', () => {
    const tueOnly = computeBookingDays({ availability: { ...BASE, weekdays: [2] }, ...empty(), now: new Date('2026-08-03T12:00:00Z') });
    expect(tueOnly.every((d) => d.dayLabel.startsWith('Tuesday'))).toBe(true);

    const sameDay = computeBookingDays({ availability: { ...BASE, leadDays: 0 }, ...empty(), now: new Date('2026-08-03T12:00:00Z') });
    expect(sameDay[0].dateKey).toBe('2026-08-03'); // Monday, today
  });

  it('returns nothing when the master switch is off, whatever the weekday setup says', () => {
    const off = computeBookingDays({ availability: { ...BASE, enabled: false }, ...empty(), now: new Date('2026-08-03T12:00:00Z') });
    expect(off).toEqual([]);
    // ...and the setup underneath is untouched, so flipping back on restores it.
    const backOn = computeBookingDays({ availability: { ...BASE, enabled: true }, ...empty(), now: new Date('2026-08-03T12:00:00Z') });
    expect(backOn.length).toBeGreaterThan(0);
  });

  it('returns nothing when booking is closed (no weekdays)', () => {
    expect(computeBookingDays({ availability: { ...BASE, weekdays: [] }, ...empty(), now: new Date('2026-08-03T12:00:00Z') })).toEqual([]);
  });
});
