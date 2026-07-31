// When a pay period is actually due to be paid.
//
// Hours & pay knew who was owed money and never when it was due, so nothing on
// the screen could be late and nothing could be coming up. Everything here
// exists to answer the second half of "who needs paying, and when".
//
// Pure and clock-free: the caller passes today. Date keys are 'YYYY-MM-DD' and
// all arithmetic goes through UTC, because parsing a bare date key as local time
// shifts it a day for anyone west of Greenwich — the same trap the pay-period
// code already documents.

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type PayDaySettings = {
  /** How many days after a period ends it gets settled. */
  delayDays: number;
  /** 0=Sun … 6=Sat. When set, the pay day lands on the first such day on or after end+delay. */
  weekday: number | null;
  /** False until the owner has actually chosen — so the UI can say it's assuming. */
  chosen: boolean;
};

export const DEFAULT_PAY_DAY: PayDaySettings = { delayDays: 5, weekday: null, chosen: false };

export const PAY_DAY_COLUMNS = 'pay_delay_days, pay_weekday, pay_day_set_at';

export function payDaySettingsFromAccount(row: {
  pay_delay_days?: unknown;
  pay_weekday?: unknown;
  pay_day_set_at?: unknown;
} | null): PayDaySettings {
  const raw = Number(row?.pay_delay_days);
  // Number(null) is 0, which is a perfectly valid weekday — so "no weekday
  // pinned" silently became "every Sunday". Nullish has to be checked BEFORE
  // the value is coerced, not after.
  const rawWeekday = row?.pay_weekday;
  const weekday = rawWeekday == null ? null : Number(rawWeekday);
  return {
    delayDays: Number.isFinite(raw) && raw >= 0 && raw <= 31 ? Math.round(raw) : DEFAULT_PAY_DAY.delayDays,
    weekday: weekday != null && Number.isFinite(weekday) && weekday >= 0 && weekday <= 6 ? Math.round(weekday) : null,
    chosen: typeof row?.pay_day_set_at === 'string' && row.pay_day_set_at.length > 0,
  };
}

function toUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function toKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(dateKey: string, days: number): string {
  const date = toUtc(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

/** Whole days from `from` to `to`. Positive means `to` is in the future. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86400000);
}

/**
 * The day a period gets paid.
 *
 * Delay first, then the weekday — not the other way round. "Five days after,
 * on a Friday" has to mean "wait five days, THEN find Friday"; snapping first
 * and adding after would land a week early on some period ends and not others.
 */
export function payDayFor(periodEndKey: string, settings: PayDaySettings): string {
  const base = addDays(periodEndKey, Math.max(0, settings.delayDays));
  if (settings.weekday == null) return base;
  const current = toUtc(base).getUTCDay();
  // On the day already counts — a Friday pay day should not skip to next Friday.
  const forward = (settings.weekday - current + 7) % 7;
  return addDays(base, forward);
}

export type PayDayState = 'no_hours' | 'settled' | 'upcoming' | 'tomorrow' | 'today' | 'overdue';

export type PayDayView = {
  state: PayDayState;
  /** The pay day itself, 'YYYY-MM-DD'. */
  dateKey: string;
  /** Days until it; negative once it has passed. */
  days: number;
  /** "Friday 7 Aug" */
  dateLabel: string;
  /** The whole sentence, ready to render. */
  label: string;
  tone: 'ok' | 'warn' | 'alert' | 'muted';
};

export function formatPayDate(dateKey: string): string {
  const date = toUtc(dateKey);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Where this period stands against its pay day.
 *
 * A period nobody has logged hours against is not "due" — it reports no_hours
 * so the screen can stay quiet rather than nagging about paying nobody. And a
 * period that is fully paid is settled whatever the date says: being past a pay
 * day you already met is not lateness.
 */
export function payDayView(input: {
  periodEndKey: string;
  todayKey: string;
  settings: PayDaySettings;
  hasHours: boolean;
  allPaid: boolean;
}): PayDayView {
  const dateKey = payDayFor(input.periodEndKey, input.settings);
  const days = daysBetween(input.todayKey, dateKey);
  const dateLabel = formatPayDate(dateKey);

  if (!input.hasHours) {
    return { state: 'no_hours', dateKey, days, dateLabel, label: `Payday ${dateLabel} — no hours logged yet`, tone: 'muted' };
  }
  if (input.allPaid) {
    return { state: 'settled', dateKey, days, dateLabel, label: `Everyone paid for this period`, tone: 'ok' };
  }
  if (days < 0) {
    const late = Math.abs(days);
    return {
      state: 'overdue',
      dateKey,
      days,
      dateLabel,
      label: `Payday was ${dateLabel} — ${late} ${late === 1 ? 'day' : 'days'} ago`,
      tone: 'alert',
    };
  }
  if (days === 0) return { state: 'today', dateKey, days, dateLabel, label: `Payday is today`, tone: 'alert' };
  if (days === 1) return { state: 'tomorrow', dateKey, days, dateLabel, label: `Payday is tomorrow, ${dateLabel}`, tone: 'warn' };
  return {
    state: 'upcoming',
    dateKey,
    days,
    dateLabel,
    // Two days out is when it stops being trivia and starts being a plan.
    label: `Payday ${dateLabel} — in ${days} days`,
    tone: days <= 2 ? 'warn' : 'ok',
  };
}

/** "5 days after each period ends, on the following Friday" — for the setting. */
export function payDaySentence(settings: PayDaySettings): string {
  const delay =
    settings.delayDays === 0
      ? 'The day each period ends'
      : `${settings.delayDays} ${settings.delayDays === 1 ? 'day' : 'days'} after each period ends`;
  return settings.weekday == null ? delay : `${delay}, on the following ${WEEKDAY_NAMES[settings.weekday]}`;
}

/**
 * How long somebody has been waiting.
 *
 * Measured from the END of the period, not from when the hours were logged: the
 * money is not owed until the period they belong to is over, so counting from a
 * Monday entry in a week that ends Saturday would call it late before it was.
 * Returns 0 while the period is still running.
 */
export function daysWaiting(periodEndKey: string, todayKey: string): number {
  return Math.max(0, daysBetween(periodEndKey, todayKey));
}

export function waitingLabel(days: number): string | null {
  if (days <= 0) return null;
  if (days === 1) return 'Unpaid 1 day';
  if (days < 14) return `Unpaid ${days} days`;
  const weeks = Math.floor(days / 7);
  return `Unpaid ${weeks} weeks`;
}
