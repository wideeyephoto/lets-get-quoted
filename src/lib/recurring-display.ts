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
export function upcomingVisits(
  nextRunDate: string,
  frequency: RecurringFrequency,
  count: number,
  // Same anchor the plan itself advances on, so the dates shown on the card are
  // the dates that will actually be created. Without it the preview drifts off
  // a month-end plan while the plan doesn't, and the card quietly lies.
  anchorDay?: number | null,
): string[] {
  const dates: string[] = [];
  let cursor = nextRunDate;
  for (let i = 0; i < count; i++) {
    dates.push(cursor);
    cursor = advanceDate(cursor, frequency, anchorDay);
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

/**
 * How the recurring book grew, one point per month, for the sparkline.
 *
 * There is no stored history of monthly recurring value, so this is rebuilt from
 * when each plan was created: at the end of month M, a plan counts if it existed
 * by then. Two honest limits come with that, and neither is worth faking around:
 * a cancelled plan is a deleted row, so it leaves no trace and the past reads
 * slightly low; and a plan whose price changed is valued at today's price for
 * every month, because the old price is not kept either. It is the shape of the
 * book over time, which is what a sparkline is for — the tile's own figure is
 * the exact number.
 */
export type MonthPoint = { monthKey: string; value: number };

export function trailingMonthlyRecurring(
  plans: { amount: number; frequency: RecurringFrequency; created_at?: string | null }[],
  today: string,
  months = 6,
): MonthPoint[] {
  const [year, month] = today.split('-').map(Number);
  const points: MonthPoint[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const cursor = new Date(Date.UTC(year, month - 1 - back, 1));
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    // Last instant of that month, so a plan created on the 31st counts for it.
    const endKey = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const value = plans.reduce((sum, plan) => {
      const born = (plan.created_at ?? '').slice(0, 10);
      if (born && born > endKey) return sum;
      return sum + planMonthlyValue(plan.amount, plan.frequency);
    }, 0);
    points.push({ monthKey: `${y}-${String(m).padStart(2, '0')}`, value });
  }
  return points;
}

/**
 * Visits and money inside a window — "next 30 days: 12 visits · $1,240".
 *
 * This is the figure that connects a book of plans to actual workload, which is
 * the thing a page of monthly averages could never answer.
 */
export function workloadWindow(
  visits: { dateKey: string; amount: number }[],
  fromKey: string,
  toKey: string,
): { count: number; value: number } {
  let count = 0;
  let value = 0;
  for (const visit of visits) {
    if (visit.dateKey < fromKey || visit.dateKey > toKey) continue;
    count += 1;
    value += Number(visit.amount) || 0;
  }
  return { count, value };
}

/** `today` + n days, as a date key. UTC throughout, like everything else here. */
export function dateKeyPlusDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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
