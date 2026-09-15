import type { QuickStopSettings } from '@/lib/quick-stop';
import { quickStopZonedInstant } from '@/lib/quick-stop-time';

/** A contractor can negotiate beyond the customer request horizon, but cannot
 * offer a malformed, nonexistent local time or an already elapsed window. */
export function validateQuickStopOfferWindow(
  date: string,
  start: string,
  end: string,
  timeZone: string | null,
  settings: Pick<QuickStopSettings, 'weekdays' | 'earliestTime' | 'latestEnd'>,
  now = Date.now(),
): void {
  const startAt = quickStopZonedInstant(date, start, timeZone);
  const endAt = quickStopZonedInstant(date, end, timeZone);
  if (!startAt || !endAt) throw new Error('Set a valid arrival date and window in your account timezone.');
  if (startAt.getTime() >= endAt.getTime()) throw new Error('The window end must be after its start.');
  if (endAt.getTime() <= now) throw new Error('Choose an arrival window that has not ended in your timezone.');
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (settings.weekdays.length && !settings.weekdays.includes(dow)) throw new Error('That day isn’t in your Quick Stop schedule.');
  const seconds = (value: string) => { const [h, m, s = '0'] = value.split(':'); return Number(h) * 3600 + Number(m) * 60 + Number(s); };
  if (seconds(start) < seconds(settings.earliestTime)) throw new Error(`Arrival can’t start before ${settings.earliestTime}.`);
  if (seconds(end) > seconds(settings.latestEnd)) throw new Error(`The window can’t end after ${settings.latestEnd}.`);
}
