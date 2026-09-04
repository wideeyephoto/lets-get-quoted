import { describe, expect, it } from 'vitest';

import { isWithinBusinessHours, localClock } from '@/lib/voice/business-hours';

const WEEKDAYS = {
  1: ['08:00', '17:00'], 2: ['08:00', '17:00'], 3: ['08:00', '17:00'],
  4: ['08:00', '17:00'], 5: ['08:00', '17:00'],
} as const;

const open = (iso: string, tz = 'America/Detroit') =>
  isWithinBusinessHours(WEEKDAYS, tz, new Date(iso));

describe('the clock the contractor is actually on', () => {
  it('reads the hour in their timezone, not the server\'s', () => {
    // The exact failure schema.sql records for booking: server-local math
    // "offered the WRONG day after ~7pm on a UTC host". A voice route runs on
    // UTC by default, and this is the one that decides whether a human or an AI
    // picks up — so it is wrong only in the evenings, which is when after-hours
    // answering is supposed to switch on.
    const evening = new Date('2026-08-19T01:30:00Z'); // 21:30 EDT the day BEFORE
    expect(localClock(evening, 'America/Detroit')).toEqual({ weekday: 2, minutes: 21 * 60 + 30 });
    expect(localClock(evening, 'UTC')).toEqual({ weekday: 3, minutes: 90 });
  });

  it('follows daylight saving without a table anyone maintains', () => {
    // Same wall-clock hour in Detroit, five months apart: EST then EDT.
    const january = new Date('2026-01-20T15:00:00Z'); // 10:00 EST
    const july = new Date('2026-07-21T14:00:00Z'); // 10:00 EDT
    expect(localClock(january, 'America/Detroit').minutes).toBe(600);
    expect(localClock(july, 'America/Detroit').minutes).toBe(600);
  });

  it('reads midnight as zero, not twenty-four', () => {
    // hour12:false renders midnight as 24 in some ICU builds, which would put
    // 00:30 after every closing time instead of before every opening one.
    expect(localClock(new Date('2026-08-19T04:30:00Z'), 'America/Detroit').minutes).toBe(30);
  });

  it('falls back to UTC rather than throwing on a bad timezone', () => {
    // A malformed timezone must not take the phone down. Wrong is survivable;
    // an exception in this path is a caller hearing nothing.
    expect(() => localClock(new Date(), 'Mars/Olympus_Mons')).not.toThrow();
    expect(localClock(new Date('2026-08-19T01:30:00Z'), 'Mars/Olympus_Mons').minutes).toBe(90);
  });
});

describe('open and shut', () => {
  it('is open in the middle of a working Tuesday', () => {
    expect(open('2026-08-18T14:00:00Z')).toBe(true); // 10:00 EDT
  });

  it('is shut in the evening and overnight', () => {
    expect(open('2026-08-18T23:00:00Z')).toBe(false); // 19:00 EDT
    expect(open('2026-08-19T06:00:00Z')).toBe(false); // 02:00 EDT
  });

  it('is shut at exactly the closing time, not a minute after', () => {
    // A business closing at 17:00 is shut at 17:00. The half-open window is why
    // a call at 17:00:30 reaches the AI rather than ringing an empty office.
    expect(open('2026-08-18T20:59:00Z')).toBe(true); // 16:59 EDT
    expect(open('2026-08-18T21:00:00Z')).toBe(false); // 17:00 EDT
  });

  it('is open from exactly the opening time', () => {
    expect(open('2026-08-18T12:00:00Z')).toBe(true); // 08:00 EDT
    expect(open('2026-08-18T11:59:00Z')).toBe(false);
  });

  it('is shut on a day with no hours at all', () => {
    expect(open('2026-08-16T16:00:00Z')).toBe(false); // Sunday noon EDT
  });

  it('treats no hours whatsoever as always shut', () => {
    // Which, under after-hours answering, means the AI takes every call — the
    // right reading of a contractor who switched it on and set no hours.
    expect(isWithinBusinessHours({}, 'America/Detroit', new Date('2026-08-18T14:00:00Z'))).toBe(false);
  });

  it('treats a malformed or backwards window as shut, never as overnight', () => {
    // Guessing that 22:00–06:00 means overnight would keep a business "open"
    // until the following afternoon. Overnight hours are real and unsupported;
    // silently inventing them is worse than not having them.
    const at = new Date('2026-08-18T14:00:00Z');
    for (const window of [
      ['22:00', '06:00'], ['09:00', '09:00'], ['not-a-time', '17:00'],
      ['25:00', '26:00'], ['08:60', '17:00'],
    ]) {
      expect(isWithinBusinessHours({ 2: window as [string, string] }, 'America/Detroit', at),
        window.join('-')).toBe(false);
    }
  });

  it('survives a window that is not a pair', () => {
    const at = new Date('2026-08-18T14:00:00Z');
    for (const window of [[], ['08:00'], ['08:00', '12:00', '17:00'], null, 'open']) {
      expect(isWithinBusinessHours(
        { 2: window as unknown as [string, string] }, 'America/Detroit', at,
      ), JSON.stringify(window)).toBe(false);
    }
  });

  it('accurately identifies open and closed times for overnight windows spanning midnight', () => {
    const overnightHours = { 2: ['22:00', '06:00'] as const };
    // 23:00 EDT (open)
    expect(isWithinBusinessHours(overnightHours, 'America/Detroit', new Date('2026-08-18T23:00:00-04:00'))).toBe(true);
    // 03:00 EDT (open)
    expect(isWithinBusinessHours(overnightHours, 'America/Detroit', new Date('2026-08-18T03:00:00-04:00'))).toBe(true);
    // 06:00 EDT (closed at close time)
    expect(isWithinBusinessHours(overnightHours, 'America/Detroit', new Date('2026-08-18T06:00:00-04:00'))).toBe(false);
    // 14:00 EDT (closed during afternoon)
    expect(isWithinBusinessHours(overnightHours, 'America/Detroit', new Date('2026-08-18T14:00:00-04:00'))).toBe(false);
  });

  it('treats major US federal holidays as closed so after-hours answering takes calls', () => {
    // Christmas Day 2026 (Friday) at 10:00 AM EST (within normal weekday hours)
    expect(isWithinBusinessHours(WEEKDAYS, 'America/New_York', new Date('2026-12-25T15:00:00Z'))).toBe(false);

    // Thanksgiving 2026 (Thursday Nov 26) at 11:00 AM EST
    expect(isWithinBusinessHours(WEEKDAYS, 'America/New_York', new Date('2026-11-26T16:00:00Z'))).toBe(false);

    // New Year's Day 2026 (Thursday Jan 1) at 10:00 AM EST
    expect(isWithinBusinessHours(WEEKDAYS, 'America/New_York', new Date('2026-01-01T15:00:00Z'))).toBe(false);

    // Can be overridden with checkHolidays: false
    expect(isWithinBusinessHours(WEEKDAYS, 'America/New_York', new Date('2026-12-25T15:00:00Z'), { checkHolidays: false })).toBe(true);
  });

  it('supports explicit US business fallback timezone on unknown timezones', () => {
    const evening = new Date('2026-08-19T01:30:00Z'); // 21:30 EDT
    const clock = localClock(evening, 'Invalid/Unknown_Zone', { fallbackTimeZone: 'America/New_York' });
    expect(clock.minutes).toBe(21 * 60 + 30);
  });
});
