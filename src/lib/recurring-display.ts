import { advanceDate, type RecurringFrequency } from '@/lib/recurring';

// Presentation helpers for the recurring plans list. A plan's whole value is its
// rhythm — when the next visit lands and what it's worth per month — and none of
// that was visible in a row that just printed a date.

export type CountdownTone = 'overdue' | 'imminent' | 'soon' | 'later';
export type Countdown = { label: string; days: number; tone: CountdownTone };

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

// "Next Sun, Aug 2, 2026" tells an owner nothing they can act on without doing
// date arithmetic in their head. "In 2 days" does.
export function visitCountdown(nextRunDate: string, today: string): Countdown {
  const days = daysBetween(today, nextRunDate);
  if (days < 0) {
    const overdue = Math.abs(days);
    return { label: overdue === 1 ? '1 day late' : `${overdue} days late`, days, tone: 'overdue' };
  }
  if (days === 0) return { label: 'Today', days, tone: 'imminent' };
  if (days === 1) return { label: 'Tomorrow', days, tone: 'imminent' };
  if (days < 7) return { label: `In ${days} days`, days, tone: 'soon' };
  if (days < 14) return { label: 'Next week', days, tone: 'later' };
  const weeks = Math.round(days / 7);
  if (days < 45) return { label: `In ${weeks} weeks`, days, tone: 'later' };
  const months = Math.round(days / 30);
  return { label: `In ${months} months`, days, tone: 'later' };
}

// The next few visit dates, so a plan shows its cadence as a rhythm instead of a
// single date the owner has to extrapolate from.
export function upcomingVisits(nextRunDate: string, frequency: RecurringFrequency, count: number): string[] {
  const dates: string[] = [];
  let cursor = nextRunDate;
  for (let i = 0; i < count; i++) {
    dates.push(cursor);
    cursor = advanceDate(cursor, frequency);
  }
  return dates;
}

// A plan capped at N visits is worth less than an open-ended one; show how far
// through its term it is rather than only "3 visits left".
export function termProgressPct(remaining: number | null): number | null {
  if (remaining == null || remaining <= 0) return null;
  return Math.max(6, Math.min(100, Math.round((1 / (remaining + 1)) * 100)));
}

export const MONTHLY_MULTIPLIER: Record<RecurringFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  monthly: 1,
};

// What one plan is worth per month, normalized across cadences so weekly and
// monthly plans can sit in the same column and be compared honestly.
export function planMonthlyValue(amount: number, frequency: RecurringFrequency): number {
  return (Number(amount) || 0) * (MONTHLY_MULTIPLIER[frequency] ?? 1);
}

export function shortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function fullDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
