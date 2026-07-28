// Single source of truth for the owner-configurable online-booking availability
// (the public /book page). Mirrors src/lib/estimate-posture.ts: pure data plus
// normalize guards, shared by the settings UI, the update action, and the slot
// engine (src/lib/booking.ts). Defaults reproduce the previously-hardcoded
// behavior (Mon–Fri, 08:00/13:00, 4 jobs/day, from tomorrow).

export type BookingWindow = { time: string; label: string };

// The arrival windows an owner can offer. Coarse on purpose — a contractor
// commits to a part of the day, not a to-the-minute slot. Ordered earliest-first;
// offered windows always render in this order.
export const BOOKING_WINDOW_PRESETS: BookingWindow[] = [
  { time: '08:00', label: 'Morning · 8:00 AM' },
  { time: '10:00', label: 'Late morning · 10:00 AM' },
  { time: '13:00', label: 'Afternoon · 1:00 PM' },
  { time: '15:00', label: 'Late afternoon · 3:00 PM' },
  { time: '17:00', label: 'Evening · 5:00 PM' },
];
const WINDOW_BY_TIME = new Map(BOOKING_WINDOW_PRESETS.map((w) => [w.time, w]));

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

export type BookingAvailability = {
  timezone: string;
  weekdays: number[]; // 0 (Sun) … 6 (Sat)
  windowTimes: string[]; // subset of preset times, always in preset order
  maxPerDay: number;
  leadDays: number;
};

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
  const picked = new Set(raw.map((t) => String(t).trim()).filter((t) => WINDOW_BY_TIME.has(t)));
  const ordered = BOOKING_WINDOW_PRESETS.filter((w) => picked.has(w.time)).map((w) => w.time);
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

// Resolve offered window times to their full {time,label} presets, in order.
export function windowsForTimes(times: string[]): BookingWindow[] {
  return times
    .map((t) => WINDOW_BY_TIME.get(t))
    .filter((w): w is BookingWindow => Boolean(w));
}

type AccountAvailabilityRow = {
  timezone?: unknown;
  booking_weekdays?: unknown;
  booking_windows?: unknown;
  booking_max_per_day?: unknown;
  booking_lead_days?: unknown;
} | null | undefined;

// Defensive: builds a normalized BookingAvailability from raw account columns,
// degrading to the old-behavior defaults for any missing/invalid field (so a
// pre-migration row still works).
export function bookingAvailabilityFromAccount(row: AccountAvailabilityRow): BookingAvailability {
  return {
    timezone: normalizeTimezone(row?.timezone),
    weekdays: normalizeBookingWeekdays(row?.booking_weekdays),
    windowTimes: normalizeBookingWindowTimes(row?.booking_windows),
    maxPerDay: normalizeMaxPerDay(row?.booking_max_per_day),
    leadDays: normalizeLeadDays(row?.booking_lead_days),
  };
}
