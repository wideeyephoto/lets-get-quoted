// When the cash forecast is worth putting in somebody's inbox.
//
// The forecast page can say "you go under your buffer on the 14th" and that is
// the single most useful sentence in this app — sitting on a page you have to
// remember to open. A warning you have to go looking for is not a warning.
//
// But the reason the daily digest is worth reading is that it stays quiet. The
// payday line in it already works this way: told two days out, silent the rest
// of the month. These are the same rules for cash, kept pure so they can be
// argued with in a test rather than in production.

import { daysBetween } from '@/lib/pay-day';
import type { Forecast } from '@/lib/cash-forecast';

/** Past this, the balance under the forecast is about a different month. */
export const STALE_BALANCE_DAYS = 14;
/** Past this, the dip is not today's news. */
export const CASH_WARN_DAYS = 7;

export type CashWarning = {
  /** "Tue, Aug 11" */
  label: string;
  daysAway: number;
  /** The projected balance at that point. */
  amount: number;
  /** Below zero, not merely below the buffer. */
  overdraft: boolean;
  buffer: number;
};

/**
 * Is it even worth loading a forecast for this account?
 *
 * Cheap gates first, because the alternative is a full forecast build per
 * account per night to discover there was nothing to say.
 */
export function shouldForecastCash(
  balance: number | null | undefined,
  balanceAt: string | null | undefined,
  now: Date,
): boolean {
  if (balance == null || !Number.isFinite(Number(balance))) return false;
  const checkedAt = typeof balanceAt === 'string' ? Date.parse(balanceAt) : NaN;
  if (!Number.isFinite(checkedAt)) return false;
  // A balance from the future is a clock problem, not a fresh number.
  const ageDays = Math.floor((now.getTime() - checkedAt) / 86_400_000);
  return ageDays >= 0 && ageDays <= STALE_BALANCE_DAYS;
}

/**
 * The warning to send, or null for silence.
 *
 * Overdrawn wins over merely-under-buffer when both are true: they are the same
 * event seen at two depths, and the louder one is the one to lead with.
 */
export function cashWarningFrom(
  forecast: Pick<Forecast, 'overdraft' | 'firstBelowBuffer'>,
  options: { todayKey: string; buffer: number },
): CashWarning | null {
  const point = forecast.overdraft ?? forecast.firstBelowBuffer;
  if (!point) return null;

  const daysAway = daysBetween(options.todayKey, point.dateKey);
  // A shortfall 26 days out is not news today, and repeating it every morning
  // until then teaches people to skip the email.
  if (daysAway < 0 || daysAway > CASH_WARN_DAYS) return null;

  const [year, month, day] = point.dateKey.split('-').map(Number);
  return {
    label: new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    daysAway,
    amount: point.balance,
    overdraft: Boolean(forecast.overdraft),
    buffer: options.buffer,
  };
}
