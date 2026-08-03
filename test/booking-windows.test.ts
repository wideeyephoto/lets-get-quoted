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
