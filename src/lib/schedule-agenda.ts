/**
 * The mobile Schedule agenda — the arithmetic half.
 *
 * Kept pure and free of imports so the client component can use it and so every
 * rule here is unit-testable: what five days sit around the one you are looking
 * at, what "Saturday, August 8" is, and whether a day is full.
 *
 * DATE KEYS ARE LOCAL, NOT UTC. `new Date('2026-08-08')` is parsed as midnight
 * UTC and lands on the 7th everywhere west of Greenwich, which would put a
 * contractor in Michigan on the wrong day for eight months of the year. Every
 * function here goes through parseDateKey, which builds a local date.
 */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftDateKey(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** '2026-08-08' -> '2026-08'. What the ?month= param wants. */
export function monthKeyOf(key: string): string {
  return key.slice(0, 7);
}

/** The heading: "Saturday, August 8". Spelled out, because a phone has the
    width for it and "8/8" does not tell you it is a Saturday. */
export function longDateLabel(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** The same thing shortened for a button's accessible name. */
export function shortDateLabel(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekdayShort(key: string): string {
  return WEEKDAY_SHORT[parseDateKey(key).getDay()];
}

export function dayOfMonth(key: string): number {
  return parseDateKey(key).getDate();
}

/**
 * "Today" / "Tomorrow" / "Yesterday", or null when it is far enough away that
 * the date itself is the clearer label. Never a bare number of days — "in 9
 * days" is arithmetic the heading has already done.
 */
export function relativeDayLabel(key: string, todayKey: string): string | null {
  if (key === todayKey) return 'Today';
  if (key === shiftDateKey(todayKey, 1)) return 'Tomorrow';
  if (key === shiftDateKey(todayKey, -1)) return 'Yesterday';
  return null;
}

/**
 * The five-day strip, centerd on the day you are looking at.
 *
 * Centerd rather than starting at the selection so the strip is a way to move
 * BACKWARDS as well as forwards — a forward-only strip is a preview, not a
 * control, and the day you are on would sit permanently against its left edge.
 */
export function dayStrip(selectedKey: string, count = 5): string[] {
  const before = Math.floor((count - 1) / 2);
  return Array.from({ length: count }, (_, index) => shiftDateKey(selectedKey, index - before));
}

export type AgendaCapacityState = 'empty' | 'open' | 'nearly' | 'full' | 'over';

export type AgendaCapacity = {
  booked: number;
  capacity: number;
  /** Clamped to 100 for the bar. `state` is what says you are past it. */
  pct: number;
  state: AgendaCapacityState;
  /** "Nearly full" — the status in words, so it is never color alone. */
  word: string;
  /** "6.5h of 8h booked" */
  detail: string;
  label: string;
};

function hoursText(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`;
}

const CAPACITY_WORD: Record<AgendaCapacityState, string> = {
  empty: 'Nothing booked',
  open: 'Room to spare',
  nearly: 'Nearly full',
  full: 'Full',
  over: 'Over capacity',
};

export function capacityStatus(bookedHours: number, capacityHours: number): AgendaCapacity {
  const capacity = capacityHours > 0 ? capacityHours : 8;
  const booked = Math.max(0, Math.round(bookedHours * 10) / 10);
  const state: AgendaCapacityState =
    booked <= 0 ? 'empty'
      : booked > capacity ? 'over'
        : booked >= capacity ? 'full'
          : booked / capacity >= 0.75 ? 'nearly'
            : 'open';
  const word = CAPACITY_WORD[state];
  const detail = `${hoursText(booked)} of ${hoursText(capacity)} booked`;
  return { booked, capacity, pct: Math.min(100, Math.round((booked / capacity) * 100)), state, word, detail, label: `${word} — ${detail}` };
}

/** "3 jobs" / "1 job" / "Nothing scheduled". */
export function jobCountLabel(count: number): string {
  if (count <= 0) return 'Nothing scheduled';
  return `${count} job${count === 1 ? '' : 's'}`;
}

/**
 * "Marco Rivera" -> "Marco R." A card has room for who is on the job; it does
 * not have room for three full names, and initials alone ("MR TB") are a
 * puzzle rather than an answer.
 */
export function shortCrewName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function crewLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, 2).map(shortCrewName).join(', ');
  return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
}
