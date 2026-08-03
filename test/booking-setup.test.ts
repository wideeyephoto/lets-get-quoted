import { describe, it, expect } from 'vitest';
import {
  isWindowTime,
  labelForWindowTime,
  formatWindowClock,
  normalizeBookingWindowTimes,
  windowsForTimes,
  MAX_BOOKING_WINDOWS,
} from '@/lib/booking-availability';
import { expandRepeatDates } from '@/lib/availability-blocks';

describe('custom arrival windows', () => {
  it('accepts any valid clock time, not just the presets', () => {
    expect(isWindowTime('07:00')).toBe(true);
    expect(isWindowTime('23:59')).toBe(true);
    expect(isWindowTime('24:00')).toBe(false);
    expect(isWindowTime('7:00')).toBe(false);
    expect(isWindowTime('08:60')).toBe(false);
    expect(isWindowTime('')).toBe(false);
  });

  it('keeps a custom time through normalization', () => {
    // The old normalizer filtered to the five presets, so a custom window was
    // silently dropped on the next read.
    expect(normalizeBookingWindowTimes(['06:30', '13:00'])).toEqual(['06:30', '13:00']);
  });

  it('sorts chronologically whatever order they arrive in', () => {
    expect(normalizeBookingWindowTimes(['17:00', '06:30', '13:00'])).toEqual(['06:30', '13:00', '17:00']);
  });

  it('drops junk and falls back to the defaults when nothing survives', () => {
    expect(normalizeBookingWindowTimes(['nope', '99:99'])).toEqual(['08:00', '13:00']);
  });

  it('caps how many windows can be stored', () => {
    const many = Array.from({ length: 20 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    expect(normalizeBookingWindowTimes(many)).toHaveLength(MAX_BOOKING_WINDOWS);
  });

  // A label is a SPAN now, not a clock time — see test/booking-windows.test.ts.
  // The part-of-day naming these cases were written for is unchanged.
  it('labels a custom time by where it falls in the day', () => {
    expect(labelForWindowTime('08:00', 240)).toBe('Morning · 8:00 AM – 12:00 PM');
    expect(labelForWindowTime('06:30', 120)).toBe('Morning · 6:30 AM – 8:30 AM');
    expect(labelForWindowTime('12:30', 120)).toBe('Midday · 12:30 PM – 2:30 PM');
    expect(labelForWindowTime('14:45', 120)).toBe('Afternoon · 2:45 PM – 4:45 PM');
    expect(labelForWindowTime('19:00', 120)).toBe('Evening · 7:00 PM – 9:00 PM');
  });

  it('formats midnight and noon the way a person reads a clock', () => {
    expect(formatWindowClock('00:00')).toBe('12:00 AM');
    expect(formatWindowClock('12:00')).toBe('12:00 PM');
  });

  it('resolves custom times for the public page instead of dropping them', () => {
    expect(windowsForTimes(['06:30', '13:00'], 240)).toEqual([
      { time: '06:30', endTime: '10:30', label: 'Morning · 6:30 AM – 10:30 AM' },
      { time: '13:00', endTime: '17:00', label: 'Afternoon · 1:00 PM – 5:00 PM' },
    ]);
  });
});

describe('recurring time off', () => {
  it('includes the start date and repeats weekly', () => {
    expect(expandRepeatDates('2026-08-03', 'weekly', 3)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);
  });

  it('repeats fortnightly', () => {
    expect(expandRepeatDates('2026-08-03', 'biweekly', 3)).toEqual(['2026-08-03', '2026-08-17', '2026-08-31']);
  });

  it('keeps the same day of the month', () => {
    expect(expandRepeatDates('2026-01-15', 'monthly', 3)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('clamps a monthly repeat to the last day of a short month', () => {
    // Jan 31 + 1 month has to be Feb 28, not a roll-forward into March.
    expect(expandRepeatDates('2026-01-31', 'monthly', 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('rejects a junk start date rather than generating nonsense', () => {
    expect(expandRepeatDates('not-a-date', 'weekly', 4)).toEqual([]);
    expect(expandRepeatDates('', 'weekly', 4)).toEqual([]);
  });

  it('always lays down at least one date and never more than the cap', () => {
    expect(expandRepeatDates('2026-08-03', 'weekly', 0)).toHaveLength(1);
    expect(expandRepeatDates('2026-08-03', 'weekly', 500)).toHaveLength(52);
  });
});
