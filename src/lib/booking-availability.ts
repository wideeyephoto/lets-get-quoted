// Single source of truth for the owner-configurable online-booking availability
// (the public /book page). Mirrors src/lib/estimate-posture.ts: pure data plus
// normalize guards, shared by the settings UI, the update action, and the slot
// engine (src/lib/booking.ts). Defaults reproduce the previously-hardcoded
// behavior (Mon–Fri, 08:00/13:00, 4 jobs/day, from tomorrow).

export type BookingWindow = { time: string; endTime: string; label: string };

/**
 * How long an arrival window runs. A booking page that says "8:00 AM" is making
 * a promise no trade can keep — the job before yours runs long, and now you're
 * late on a commitment you never meant to make. A window says what's actually
 * true: someone will be there between these two times.
 *
 * Four hours is the span utilities and cable companies use, and it's wide enough
 * that a contractor arrives inside it on an ordinary bad day.
 */
export const DEFAULT_WINDOW_MINUTES = 240;
export const MIN_WINDOW_MINUTES = 30;
export const MAX_WINDOW_MINUTES = 600;

// The window start times an owner can offer. Coarse on purpose — a contractor
// commits to a part of the day, not a to-the-minute slot. Ordered earliest-first;
// offered windows always render in this order.
const WINDOW_PART_NAMES: { time: string; part: string }[] = [
  { time: '08:00', part: 'Morning' },
  { time: '10:00', part: 'Late morning' },
  { time: '13:00', part: 'Afternoon' },
  { time: '15:00', part: 'Late afternoon' },
  { time: '17:00', part: 'Evening' },
];
const PART_BY_TIME = new Map(WINDOW_PART_NAMES.map((w) => [w.time, w.part]));

export function normalizeWindowMinutes(value: unknown): number {
  // null/undefined/'' mean "not configured" and must reach the default. Going
  // straight to Number() turns all three into 0, which then clamps to the 30-min
  // FLOOR — so an un-migrated account would silently start offering half-hour
  // arrival windows it could never hit. Same trap as the weekday parser below.
  if (value === null || value === undefined || value === '') return DEFAULT_WINDOW_MINUTES;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_MINUTES;
  return Math.min(MAX_WINDOW_MINUTES, Math.max(MIN_WINDOW_MINUTES, n));
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

/**
 * Where a window closes. Clamped to 23:59 rather than rolling past midnight: a
 * 5 PM start with a long window should read "5:00 PM – 11:59 PM", not spill onto
 * a date the customer never picked.
 */
export function windowEndTime(startTime: string, minutes: number): string {
  return minutesToTime(timeToMinutes(startTime) + normalizeWindowMinutes(minutes));
}

/** "8:00 AM – 12:00 PM". An en dash, because this is a span and not a subtraction. */
export function formatWindowRange(startTime: string, minutes: number): string {
  return `${formatWindowClock(startTime)} – ${formatWindowClock(windowEndTime(startTime, minutes))}`;
}

// An owner can also add their own arrival time. The presets cover the common
// shape of a day, but "we start at 7" and "evenings from 6" are real and were
// impossible to express before.
export const MAX_BOOKING_WINDOWS = 8;

export function isWindowTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function formatWindowClock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Morning", "Late afternoon" — the part of the day a start time falls in. */
export function windowPartName(time: string): string {
  const preset = PART_BY_TIME.get(time);
  if (preset) return preset;
  const hour = Number(time.slice(0, 2));
  return hour < 11 ? 'Morning'
    : hour < 13 ? 'Midday'
    : hour < 16 ? 'Afternoon'
    : hour < 18 ? 'Late afternoon'
    : 'Evening';
}

// "Morning · 8:00 AM – 12:00 PM". The part name is kept ahead of a " · " because
// it's how a customer thinks about the day, and callers that only want the part
// split on that separator.
export function labelForWindowTime(time: string, minutes: number = DEFAULT_WINDOW_MINUTES): string {
  return `${windowPartName(time)} · ${formatWindowRange(time, minutes)}`;
}

export function windowsForTimes(times: string[], minutes: number = DEFAULT_WINDOW_MINUTES): BookingWindow[] {
  return times.map((time) => ({ time, endTime: windowEndTime(time, minutes), label: labelForWindowTime(time, minutes) }));
}

/** The start times an owner can pick from, as windows of their configured length. */
export const BOOKING_WINDOW_PRESET_TIMES = WINDOW_PART_NAMES.map((w) => w.time);
export function bookingWindowPresets(minutes: number = DEFAULT_WINDOW_MINUTES): BookingWindow[] {
  return windowsForTimes(BOOKING_WINDOW_PRESET_TIMES, minutes);
}

/**
 * Start times whose windows run into the next one. Not an error — an owner may
 * genuinely want overlapping offers — but a public page showing "8:00 AM – 12:00
 * PM" next to "10:00 AM – 2:00 PM" reads as a mistake, so the settings screen
 * says so rather than letting them find out from a confused customer.
 */
/**
 * Windows that would run past the end of the working day.
 *
 * THE FAILURE THIS EXISTS FOR. Working hours ended at 6:00 PM and the live
 * booking page offered "3:00 – 7:00 PM". The offer filter checked that a window
 * STARTED inside the working day and never that it finished inside one, so a
 * four-hour window beginning at three o'clock passed — and a homeowner was
 * promised an arrival window an hour after the contractor stops work.
 *
 * The end is compared with `>` and not `>=`: a window finishing exactly at 6:00
 * PM finishes within a day that ends at 6:00 PM. That is the whole day used,
 * which is the point of setting it.
 *
 * Shared by the two places that must agree — the public offer filter drops
 * these, and Booking setup names them, so a window that stops being offered
 * says why instead of vanishing.
 */
export function overrunningWindowTimes(times: string[], minutes: number, workdayEnd: string): string[] {
  /* The shape is checked rather than the result. timeToMinutes coerces an
     unparseable value to 0 instead of NaN, so a Number.isFinite guard here is
     always true and an unreadable end would report EVERY window as overrunning
     — turning a bad setting into "none of your windows work". Reporting none is
     the safe direction: normalizeWorkdayTime already guarantees a valid HH:MM
     on the stored value, so this only ever catches a caller passing something
     it should not. */
  if (!/^\d{2}:\d{2}$/.test(workdayEnd)) return [];
  const end = timeToMinutes(workdayEnd);
  return times.filter((time) => timeToMinutes(windowEndTime(time, minutes)) > end);
}

export function overlappingWindowTimes(times: string[], minutes: number): string[] {
  const sorted = [...times].sort();
  const clashing: string[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (timeToMinutes(windowEndTime(sorted[i], minutes)) > timeToMinutes(sorted[i + 1])) {
      clashing.push(sorted[i]);
    }
  }
  return clashing;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Common US IANA timezones for the settings dropdown. Kept short and labeled in
// plain language; the value is the IANA id used for day-key math.
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain — no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
];
const TIMEZONE_VALUES = new Set(TIMEZONE_OPTIONS.map((t) => t.value));

export const DEFAULT_TIMEZONE = 'America/New_York';
export const DEFAULT_BOOKING_WEEKDAYS = [1, 2, 3, 4, 5];
export const DEFAULT_BOOKING_WINDOW_TIMES = ['08:00', '13:00'];
export const DEFAULT_BOOKING_MAX_PER_DAY = 4;
export const DEFAULT_BOOKING_LEAD_DAYS = 1;
export const DEFAULT_WORKDAY_START = '08:00';
export const DEFAULT_WORKDAY_END = '17:00';
export const DEFAULT_CAPACITY_HOURS = 8;

export type BookingAvailability = {
  // Master switch for self-serve booking. Off closes the public calendar while
  // leaving the weekday/window/capacity setup below untouched, so turning it back
  // on restores exactly what was configured.
  enabled: boolean;
  timezone: string;
  weekdays: number[]; // 0 (Sun) … 6 (Sat)
  windowTimes: string[]; // subset of preset times, always in preset order
  windowMinutes: number; // how long each arrival window runs
  maxPerDay: number;
  leadDays: number;
  // Availability engine additions:
  workdayStart: string; // HH:MM — offered windows must start within [start,end)
  workdayEnd: string; // HH:MM
  capacityHours: number; // hours/day cap (schedule_day_hours); day fills at this
  bufferMinutes: number; // travel/lunch buffer added to each job's daily footprint
};

// HH:MM (24h) or fallback. Accepts 'H:MM'/'HH:MM(:SS)'.
export function normalizeWorkdayTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function normalizeCapacityHours(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(24, Math.max(1, n)) : DEFAULT_CAPACITY_HOURS;
}

export function normalizeBufferMinutes(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(240, Math.max(0, n)) : 0;
}

// A window's start time (minutes since midnight) must fall within the workday.
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function normalizeTimezone(value: unknown): string {
  return typeof value === 'string' && TIMEZONE_VALUES.has(value) ? value : DEFAULT_TIMEZONE;
}

// Accepts a CSV string ('1,2,3'), an array of numbers, or nullish. Returns the
// unique in-range weekdays ascending. May be empty = booking effectively closed.
export function normalizeBookingWeekdays(value: unknown): number[] {
  let raw: unknown[];
  if (typeof value === 'string') raw = value.split(',');
  else if (Array.isArray(value)) raw = value;
  else return [...DEFAULT_BOOKING_WEEKDAYS];
  const days = raw
    .map((d) => String(d).trim())
    .filter((s) => s !== '') // '' → Number('') is 0; an empty field means "no days", not Sunday
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

// Accepts a JSON array (or a JSON string, or CSV) of window start-times; keeps
// only known presets, deduped and in preset order. Falls back to the default
// windows when nothing valid is present (an owner can't accidentally offer zero
// windows and silently close booking through this field).
export function normalizeBookingWindowTimes(value: unknown): string[] {
  let raw: unknown[];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      raw = Array.isArray(parsed) ? parsed : value.split(',');
    } catch {
      raw = value.split(',');
    }
  } else return [...DEFAULT_BOOKING_WINDOW_TIMES];
  // Any valid HH:MM, not just the presets — custom windows are stored the same
  // way. Sorted chronologically so the public page always reads down the day,
  // whatever order they were added in.
  const picked = new Set(raw.map((t) => String(t).trim()).filter(isWindowTime));
  const ordered = [...picked].sort().slice(0, MAX_BOOKING_WINDOWS);
  return ordered.length ? ordered : [...DEFAULT_BOOKING_WINDOW_TIMES];
}

export function normalizeMaxPerDay(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : DEFAULT_BOOKING_MAX_PER_DAY;
}

export function normalizeLeadDays(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) : DEFAULT_BOOKING_LEAD_DAYS;
}

type AccountAvailabilityRow = {
  timezone?: unknown;
  booking_weekdays?: unknown;
  booking_windows?: unknown;
  booking_window_minutes?: unknown;
  booking_enabled?: unknown;
  booking_max_per_day?: unknown;
  booking_lead_days?: unknown;
  workday_start?: unknown;
  workday_end?: unknown;
  schedule_day_hours?: unknown;
  job_buffer_minutes?: unknown;
} | null | undefined;

// Defensive: builds a normalized BookingAvailability from raw account columns,
// degrading to the old-behavior defaults for any missing/invalid field (so a
// pre-migration row still works).
export function bookingAvailabilityFromAccount(row: AccountAvailabilityRow): BookingAvailability {
  return {
    // Absent (pre-migration row) counts as on, preserving prior behavior.
    enabled: row?.booking_enabled !== false,
    timezone: normalizeTimezone(row?.timezone),
    weekdays: normalizeBookingWeekdays(row?.booking_weekdays),
    windowTimes: normalizeBookingWindowTimes(row?.booking_windows),
    windowMinutes: normalizeWindowMinutes(row?.booking_window_minutes),
    maxPerDay: normalizeMaxPerDay(row?.booking_max_per_day),
    leadDays: normalizeLeadDays(row?.booking_lead_days),
    workdayStart: normalizeWorkdayTime(row?.workday_start, DEFAULT_WORKDAY_START),
    workdayEnd: normalizeWorkdayTime(row?.workday_end, DEFAULT_WORKDAY_END),
    capacityHours: normalizeCapacityHours(row?.schedule_day_hours),
    bufferMinutes: normalizeBufferMinutes(row?.job_buffer_minutes),
  };
}
