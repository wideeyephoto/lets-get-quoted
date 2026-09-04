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

/** Weekday 0-6 and minutes-since-midnight, as they read in `timeZone`. */
export function localClock(at: Date, timeZone: string): { weekday: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(at);
  } catch {
    // An unknown or malformed timezone must not take the phone down. UTC is
    // wrong for the contractor but it is deterministic, and the caller still
    // gets answered by whichever rule the hours then select.
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(at);
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
 * True when `at` falls inside the configured hours for that weekday.
 *
 * A day with no entry is CLOSED. That makes an empty object mean "closed
 * always", which under after-hours answering means the AI takes every call —
 * the correct reading of a contractor who never set hours but did switch the
 * receptionist on.
 *
 * When close is before open (e.g. 22:00–06:00), it represents an overnight
 * shift spanning midnight: the business is open if the time is at/after open
 * or before close. If open === close, the duration is zero and the business is closed.
 */
export function isWithinBusinessHours(
  hours: BusinessHours,
  timeZone: string,
  at: Date = new Date(),
): boolean {
  const { weekday, minutes } = localClock(at, timeZone);
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
