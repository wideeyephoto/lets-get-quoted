import { describe, it, expect } from 'vitest';
import {
  LONG_SHIFT_HOURS,
  MAX_SHIFT_HOURS,
  formatElapsed,
  formatShiftRange,
  hoursBetween,
  normalizeTimeClockMode,
  openShiftFlag,
  shiftHours,
  validateManualEnd,
} from '@/lib/time-clock';
import { roundHours } from '@/lib/labor-settings';

const AT = (h: number, m = 0) => new Date(2026, 6, 29, h, m).toISOString();

describe('time clock mode', () => {
  it('only accepts the three real modes, and defaults to off', () => {
    expect(normalizeTimeClockMode('optional')).toBe('optional');
    expect(normalizeTimeClockMode('required')).toBe('required');
    expect(normalizeTimeClockMode('off')).toBe('off');
    // A missing column reads as undefined; a hand-edited value reads as junk.
    // Both have to mean "off", or a failed migration would force clocking on.
    expect(normalizeTimeClockMode(undefined)).toBe('off');
    expect(normalizeTimeClockMode('mandatory')).toBe('off');
    expect(normalizeTimeClockMode(null)).toBe('off');
  });
});

describe('shift duration', () => {
  it('measures a normal day', () => {
    expect(hoursBetween(AT(7, 30), AT(15, 45))).toBeCloseTo(8.25, 5);
    expect(shiftHours(AT(7, 30), AT(15, 45))).toBe(8.25);
  });

  it('never returns negative hours from a bad end time', () => {
    expect(shiftHours(AT(15), AT(7))).toBe(0);
    expect(shiftHours(AT(9), AT(9))).toBe(0);
  });

  it('applies the account rounding rule', () => {
    // 7:00 to 15:07 is 8.117 hours — nearest quarter is 8.00 (it's 7 minutes
    // past the hour, not past the quarter), nearest tenth is 8.1.
    expect(shiftHours(AT(7), AT(15, 7), (h) => roundHours(h, 'quarter'))).toBe(8);
    expect(shiftHours(AT(7), AT(15, 7), (h) => roundHours(h, 'tenth'))).toBe(8.1);
    expect(shiftHours(AT(7), AT(15, 7))).toBe(8.12);
    // 8 minutes past IS over the halfway mark to the next quarter.
    expect(shiftHours(AT(7), AT(15, 8), (h) => roundHours(h, 'quarter'))).toBe(8.25);
  });
});

describe('forgotten clock-out detection', () => {
  const started = AT(7);

  it('says nothing about a normal working day', () => {
    expect(openShiftFlag(started, new Date(2026, 6, 29, 15))).toBeNull();
  });

  it('warns once a shift has run longer than a long day', () => {
    expect(openShiftFlag(started, new Date(2026, 6, 29, 7 + LONG_SHIFT_HOURS))).toBe('running-long');
  });

  it('escalates past the point it could be real work', () => {
    expect(openShiftFlag(started, new Date(2026, 6, 29, 7 + MAX_SHIFT_HOURS))).toBe('implausible');
    // Left open overnight — the case this exists for.
    expect(openShiftFlag(started, new Date(2026, 6, 30, 9))).toBe('implausible');
  });
});

describe('elapsed and range formatting', () => {
  it('drops the hour component under an hour', () => {
    expect(formatElapsed(AT(9), new Date(2026, 6, 29, 9, 40))).toBe('40m');
    expect(formatElapsed(AT(9), new Date(2026, 6, 29, 12, 5))).toBe('3h 05m');
  });

  it('never shows negative elapsed time from a clock skew', () => {
    expect(formatElapsed(AT(12), new Date(2026, 6, 29, 11))).toBe('0m');
  });

  it('names the second day when a shift crosses midnight', () => {
    // Otherwise "11:40 PM – 2:10 AM" reads as a shift that ran backwards.
    const range = formatShiftRange(new Date(2026, 6, 29, 23, 40).toISOString(), new Date(2026, 6, 30, 2, 10).toISOString());
    expect(range).toMatch(/Jul 29/);
    expect(range).toMatch(/Jul 30/);
  });

  it('marks a still-running shift', () => {
    expect(formatShiftRange(AT(7), null)).toMatch(/running/);
  });
});

describe('owner-supplied end times', () => {
  const started = AT(7);
  const now = new Date(2026, 6, 29, 18);

  it('accepts a sensible correction', () => {
    expect(validateManualEnd(started, AT(15, 30), now)).toBeNull();
  });

  it('rejects an end before the start', () => {
    expect(validateManualEnd(started, AT(6), now)).toMatch(/after the start/);
  });

  it('rejects the future, with a minute of slack for clock skew', () => {
    expect(validateManualEnd(started, new Date(2026, 6, 29, 20).toISOString(), now)).toMatch(/future/);
    // "Now", give or take the seconds between the form and the server.
    expect(validateManualEnd(started, new Date(now.getTime() + 30_000).toISOString(), now)).toBeNull();
  });

  it('rejects a shift longer than a day', () => {
    expect(validateManualEnd(started, new Date(2026, 6, 30, 12).toISOString(), new Date(2026, 6, 31))).toMatch(/24 hours/);
  });

  it('rejects a value that is not a time at all', () => {
    expect(validateManualEnd(started, 'tomorrow-ish', now)).toMatch(/real time/);
  });
});
