/**
 * Is the business open right now, in its own timezone?
 *
 * WHY Intl AND NOT DATE ARITHMETIC. This repo has already paid for that once:
 * schema.sql records that server-local booking math "offered the WRONG day after
 * ~7pm on a UTC host", which is why `accounts.timezone` exists at all. A voice
 * route runs on a UTC serverless host by default, so `date.getHours()` here
 * would answer for the datacentre and not for the contractor — and the error
 * would be invisible except in the evening, which is precisely when after-hours
 * answering is supposed to switch on.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is the only thing in the
 * platform that knows a contractor in Detroit is on EST in January and EDT in
 * July without a table somebody has to maintain.
 */

/** `{"1": ["08:00", "17:00"], ...}`, keyed 0=Sunday..6=Saturday. */
export type BusinessHours = Readonly<Record<string, readonly [string, string]>>;

function minutesOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export const DEFAULT_BUSINESS_TIMEZONE = 'America/New_York';

/** Weekday 0-6 and minutes-since-midnight, as they read in `timeZone`. */
export function localClock(
  at: Date,
  timeZone: string,
  options?: { fallbackTimeZone?: string },
): { weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(at);
  } catch {
    // An unknown or malformed timezone must not take the phone down.
    // Use the explicit fallback if provided, or UTC for deterministic fallback.
    const fallbackTz = options?.fallbackTimeZone || 'UTC';
    try {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: fallbackTz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(at);
    } catch {
      parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(at);
    }
  }

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));
  // `hour12: false` renders midnight as 24 in some ICU versions, which would
  // otherwise put 00:30 on the wrong side of every opening time.
  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));

  return {
    weekday: weekday >= 0 ? weekday : 0,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

/**
 * Determines if a given date in a specific timezone falls on a major US Federal Holiday:
 * - New Year's Day (Jan 1)
 * - Memorial Day (last Monday of May)
 * - Independence Day (July 4)
 * - Labor Day (first Monday of September)
 * - Thanksgiving Day (fourth Thursday of November)
 * - Christmas Day (Dec 25)
 */
export function isUsFederalHoliday(at: Date, timeZone: string): boolean {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    }).formatToParts(at);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
    }).formatToParts(at);
  }

  const val = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const month = Number(val('month')); // 1-12
  const day = Number(val('day')); // 1-31
  const weekday = val('weekday'); // Sun, Mon, Tue, Wed, Thu, Fri, Sat

  // Fixed-date federal holidays
  if (month === 1 && day === 1) return true; // New Year's Day
  if (month === 7 && day === 4) return true; // Independence Day
  if (month === 12 && day === 25) return true; // Christmas Day

  // Floating federal holidays
  // Memorial Day: Last Monday in May (between May 25 and May 31)
  if (month === 5 && weekday === 'Mon' && day >= 25 && day <= 31) return true;

  // Labor Day: First Monday in September (between Sep 1 and Sep 7)
  if (month === 9 && weekday === 'Mon' && day >= 1 && day <= 7) return true;

  // Thanksgiving: Fourth Thursday in November (between Nov 22 and Nov 28)
  if (month === 11 && weekday === 'Thu' && day >= 22 && day <= 28) return true;

  return false;
}

/**
 * True when `at` falls inside the configured hours for that weekday.
 *
 * A day with no entry is CLOSED. That makes an empty object mean "closed
 * always", which under after-hours answering means the AI takes every call —
 * the correct reading of a contractor who never set hours but did switch the
 * receptionist on.
 *
 * Closed on recognized US federal holidays by default unless checkHolidays is false.
 *
 * When close is before open (e.g. 22:00–06:00), it represents an overnight
 * shift spanning midnight: the business is open if the time is at/after open
 * or before close. If open === close, the duration is zero and the business is closed.
 */
export function isWithinBusinessHours(
  hours: BusinessHours,
  timeZone: string,
  at: Date = new Date(),
  options?: { checkHolidays?: boolean; fallbackTimeZone?: string },
): boolean {
  const checkHolidays = options?.checkHolidays !== false;
  if (checkHolidays && isUsFederalHoliday(at, timeZone)) {
    return false;
  }

  const { weekday, minutes } = localClock(at, timeZone, { fallbackTimeZone: options?.fallbackTimeZone });
  const window = hours?.[String(weekday)];
  if (!Array.isArray(window) || window.length !== 2) return false;

  const open = minutesOfDay(String(window[0]));
  const close = minutesOfDay(String(window[1]));
  if (open === null || close === null || open === close) return false;

  // Overnight window crossing midnight (e.g. 22:00 to 06:00)
  if (close < open) {
    return minutes >= open || minutes < close;
  }

  // Standard daytime window: half-open (closing at 17:00 is shut at 17:00)
  return minutes >= open && minutes < close;
}
