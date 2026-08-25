// Clock in / clock out.
//
// Optional per account, because most one-truck contractors don't want it and
// the crew typing "6.5" at the end of the day is genuinely faster. Three modes:
//
//   off       — what the product always did. Type your hours, no clock anywhere.
//   optional  — crew can clock in and out, or still just type hours.
//   required  — the clock is the only way to log time; the hours box is gone.
//
// THE REAL PROBLEM this has to solve isn't clocking in, it's forgetting to
// clock OUT. A shift left open overnight becomes a 14-hour day nobody worked,
// and if it's never noticed it lands in a pay total. So an open shift is
// visible to the owner from the moment it runs long, carries a warning at the
// point it stops being plausible, and can be closed by the owner at a time they
// choose — marked as owner-closed, because a guessed end time is not a clocked
// one.
//
// Client-safe: pure functions, no server imports.

export type TimeClockMode = 'off' | 'optional' | 'required';

export const TIME_CLOCK_MODES: { id: TimeClockMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Crew type their hours when the work is done.' },
  { id: 'optional', label: 'Optional', hint: 'Crew can clock in and out, or just type their hours.' },
  { id: 'required', label: 'Required', hint: 'Clocking in and out is the only way crew log time.' },
];

export function normalizeTimeClockMode(value: unknown): TimeClockMode {
  return value === 'optional' || value === 'required' ? value : 'off';
}

/** A shift this long is almost certainly a forgotten clock-out, not a day's work. */
export const LONG_SHIFT_HOURS = 12;
/** Past this, we stop treating the end time as real at all. */
export const MAX_SHIFT_HOURS = 16;

import type { GeofenceStatus } from '@/lib/crew-geofence';

export type OpenShift = {
  id: string;
  crewId: string;
  crewName: string;
  jobId: string;
  jobLabel: string;
  startedAt: string;
  rate: number;
  geofenceStatus?: GeofenceStatus | null;
  clockInDistanceFt?: number | null;
  clockOutDistanceFt?: number | null;
};

export function hoursBetween(startedAt: string, endedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 3_600_000;
}

/** Hours for a shift, rounded by the account's rule, never negative. */
export function shiftHours(startedAt: string, endedAt: string, round?: (hours: number) => number): number {
  const raw = hoursBetween(startedAt, endedAt);
  const hours = round ? round(raw) : raw;
  return Math.max(0, Math.round(hours * 100) / 100);
}

export type ShiftFlag = 'running-long' | 'implausible' | null;

/**
 * How worried to be about an open shift. Split into two levels rather than one:
 * a 13-hour day happens on a bad job, a 30-hour one never does, and treating
 * them the same either cries wolf or says nothing.
 */
export function openShiftFlag(startedAt: string, now: Date = new Date()): ShiftFlag {
  const elapsed = hoursBetween(startedAt, now.toISOString());
  if (elapsed >= MAX_SHIFT_HOURS) return 'implausible';
  if (elapsed >= LONG_SHIFT_HOURS) return 'running-long';
  return null;
}

export const SHIFT_FLAG_LABEL: Record<NonNullable<ShiftFlag>, string> = {
  'running-long': 'Running long',
  implausible: 'Probably forgotten',
};

export const SHIFT_FLAG_HELP: Record<NonNullable<ShiftFlag>, string> = {
  'running-long': `This shift has been open more than ${LONG_SHIFT_HOURS} hours. If they've finished, close it at the time they actually stopped.`,
  implausible: `Open more than ${MAX_SHIFT_HOURS} hours — almost certainly a missed clock-out. Close it at the real end time rather than letting it bank the hours.`,
};

/** "6h 45m", or "45m" under an hour. What a running shift shows. */
export function formatElapsed(startedAt: string, now: Date = new Date()): string {
  const totalMinutes = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

/** "7:42 AM" — the clock face, which is what a timesheet is read in. */
export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "Jul 29, 7:42 AM – 3:15 PM" for a closed shift. */
export function formatShiftRange(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return '';
  const day = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!endedAt) return `${day}, ${formatClock(startedAt)} – running`;
  const end = new Date(endedAt);
  const sameDay = start.toDateString() === end.toDateString();
  // A shift crossing midnight has to say so, or "11:40 PM – 2:10 AM" reads as
  // a shift that went backwards.
  return sameDay
    ? `${day}, ${formatClock(startedAt)} – ${formatClock(endedAt)}`
    : `${day}, ${formatClock(startedAt)} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${formatClock(endedAt)}`;
}

/**
 * Validate an owner-supplied end time when they close someone's forgotten
 * shift. Returns an error string, or null when it's usable.
 */
export function validateManualEnd(startedAt: string, endedAt: string, now: Date = new Date()): string | null {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(end)) return 'That end time isn\'t a real time.';
  if (end <= start) return 'The end time has to be after the start time.';
  // A minute of slack: the form's clock and the server's can disagree by
  // seconds, and rejecting "now" as being in the future would be maddening.
  if (end > now.getTime() + 60_000) return 'The end time can\'t be in the future.';
  if (hoursBetween(startedAt, endedAt) > 24) return 'That shift would be over 24 hours. Check the end time.';
  return null;
}
