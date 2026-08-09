/**
 * How much of each day a multi-day job actually takes.
 *
 * THE CASE THIS EXISTS FOR. A contractor is doing three hours a day at one
 * site for a fortnight — a maintenance visit, a site nobody can be on all day,
 * a crew splitting between two jobs. The app has always been able to express
 * that, and has never once said so: you get it by entering total hours and a
 * date range and knowing that the booking engine divides one by the other. The
 * only hint on the hours field said the opposite ("not for how many days this
 * blocks"), and the card where you pick a date offered no end date at all.
 *
 * So nothing here is new arithmetic. `computeHoursByDate` in lib/booking has
 * divided hours by days for as long as the end date has existed, and this is
 * that rule, named, so the two surfaces that were getting it wrong — the
 * day/week blocks, and the owner reading the form — can get it right from the
 * same place. If one of them changes, they both change.
 *
 * Pure and DOM-free: the caller formats.
 */

/** Below this a "day" is a rounding artefact, not a plan. */
const MIN_HOURS = 0.01;

export type DayLoad =
  /** One day (or no range). There is nothing to spread. */
  | { kind: 'single' }
  /** A range, but no hours to divide across it. */
  | { kind: 'unknown'; days: number }
  /** The ordinary case: hours ÷ days, and what that leaves free. */
  | { kind: 'spread'; days: number; perDay: number; free: number }
  /**
   * More hours per day than the working day holds.
   *
   * Worth its own case rather than a clamp. `computeHoursByDate` caps the
   * per-day figure at capacity, which is right for the booking engine — it
   * cannot offer more than a day — but it means 60 hours entered across 3 days
   * silently books as 8/day and the schedule under-reports by a day and a
   * half. The owner should be told the range is too short for the hours, not
   * quietly given a different plan.
   */
  | { kind: 'over'; days: number; perDay: number; capacity: number };

/** Whole days from one date key to another, inclusive. Null if not a real range. */
export function spanDays(startDate: string | null | undefined, endDate: string | null | undefined): number | null {
  if (!startDate || !endDate) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  // Rounded, not floored: a DST boundary inside the range makes one of these
  // days 23 or 25 hours long and flooring would drop it.
  return Math.round((end - start) / 86_400_000) + 1;
}

export function dayLoad({
  totalHours,
  days,
  capacityHours,
}: {
  totalHours: number | null | undefined;
  /** How many days the work occupies. 1, 0 or null all mean "not spread". */
  days: number | null | undefined;
  /** The account's working day — schedule_day_hours. */
  capacityHours: number;
}): DayLoad {
  const dayCount = Number(days);
  if (!Number.isFinite(dayCount) || dayCount <= 1) return { kind: 'single' };

  const total = Number(totalHours);
  if (!Number.isFinite(total) || total <= MIN_HOURS) return { kind: 'unknown', days: dayCount };

  const capacity = Number.isFinite(capacityHours) && capacityHours > 0 ? capacityHours : 8;
  const perDay = total / dayCount;
  if (perDay > capacity + MIN_HOURS) return { kind: 'over', days: dayCount, perDay, capacity };
  return { kind: 'spread', days: dayCount, perDay, free: Math.max(0, capacity - perDay) };
}

/** "3", "2.8", "0.5" — one decimal, and no trailing ".0" on a whole number. */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The sentence under the date fields.
 *
 * Says the arithmetic out loud, because the whole failure this fixes is an
 * owner who cannot tell whether the app understood "three hours a day". The
 * free-hours half is the part that makes it actionable: it is the difference
 * between a day that is spoken for and a day with room for another call.
 */
export function dayLoadSummary(load: DayLoad): string | null {
  switch (load.kind) {
    case 'single':
      return null;
    case 'unknown':
      return `${load.days} days. Add estimated hours and this will say how much of each day that is.`;
    case 'spread': {
      const free = load.free >= 0.1 ? ` Leaves about ${formatHours(load.free)} hrs a day free to book alongside.` : '';
      return `${load.days} days · about ${formatHours(load.perDay)} hrs a day.${free}`;
    }
    case 'over':
      return `${load.days} days · ${formatHours(load.perDay)} hrs a day, which is more than your ${formatHours(load.capacity)}-hour day. The calendar will only count ${formatHours(load.capacity)}, so either lengthen the range or lower the hours.`;
  }
}
