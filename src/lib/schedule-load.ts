import { addDaysToDateKey, weekdayOfDateKey } from '@/lib/jobs';
import { haversineMiles, type LatLng } from '@/lib/distance';

/**
 * What the next thirty days actually look like to somebody running the work.
 *
 * THE HEADER USED TO ANSWER A DIFFERENT QUESTION FROM THE PAGE.
 * The calendar's three stats were jobs, revenue and profit — the same three an
 * accounts screen would carry. On a page whose whole job is deciding when work
 * happens, the questions are: am I full, is anyone assigned, and is tomorrow's
 * route going to cost me the afternoon. Revenue is a real number and it is not
 * one of them; it lives on Insights, which is built to explain it.
 *
 * PURE, AND HERE RATHER THAN IN THE PAGE, because the interesting parts are the
 * edges — a week where every day is blocked, a business that works Sundays, a
 * month where nobody has estimated anything — and those are worth stating in a
 * test rather than clicking through.
 */

export type LoadWindow = {
  /** Hours of work booked in the window. Buffer included; see computeHoursByDate. */
  bookedHours: number;
  /** Hours the window can hold: working, unblocked days times the daily figure. */
  capacityHours: number;
  /** How many of those days there are. Zero means nothing can be booked at all. */
  workingDays: number;
  /** 0–999, or null when there is no capacity to be a fraction of. */
  percent: number | null;
  /**
   * Jobs in the window that contributed NOTHING to bookedHours because nobody
   * has said how long they take.
   *
   * Carried beside the ratio rather than folded into it. A job with no estimate
   * is not zero hours of work, but inventing a number here would put a guess
   * into the one figure on the page that is supposed to be countable — so the
   * ratio stays honest and says how much it could not see.
   */
  unknownJobs: number;
};

export function loadOverWindow(input: {
  /** First day counted, inclusive. */
  fromKey: string;
  /** How many days the window runs, including fromKey. */
  days: number;
  /** Booked hours per date — computeHoursByDate's output. */
  hoursByDate: Record<string, number>;
  /** Jobs per date with no usable duration — countUnknownDurationByDate's. */
  unknownByDate?: Record<string, number>;
  capacityPerDay: number;
  /** Weekday numbers worked (0=Sun … 6=Sat). Empty/undefined means all seven. */
  workingWeekdays?: number[];
  /** Days taken off entirely. Only availability blocks belong here — a day that
      is merely FULL still has capacity, it is just spent. */
  blockedDays?: Record<string, unknown>;
}): LoadWindow {
  const working = input.workingWeekdays?.length ? new Set(input.workingWeekdays) : null;
  let bookedHours = 0;
  let workingDays = 0;
  let unknownJobs = 0;

  for (let offset = 0; offset < input.days; offset += 1) {
    const dateKey = addDaysToDateKey(input.fromKey, offset);
    // Work booked on a day that is now blocked, or on a Sunday the business
    // does not work, is still booked. It counts against the total even though
    // the day contributes no capacity — that is exactly the state worth seeing.
    bookedHours += Math.max(0, input.hoursByDate[dateKey] ?? 0);
    unknownJobs += input.unknownByDate?.[dateKey] ?? 0;
    if (working && !working.has(weekdayOfDateKey(dateKey))) continue;
    if (input.blockedDays?.[dateKey]) continue;
    workingDays += 1;
  }

  const capacityHours = workingDays * Math.max(0, input.capacityPerDay);
  return {
    bookedHours: Math.round(bookedHours * 10) / 10,
    capacityHours: Math.round(capacityHours * 10) / 10,
    workingDays,
    percent: capacityHours > 0 ? Math.round((bookedHours / capacityHours) * 100) : null,
    unknownJobs,
  };
}

/** The two stops furthest apart on one day, in straight-line miles. */
export function spreadMiles(places: LatLng[]): number {
  let worst = 0;
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const miles = haversineMiles(places[i], places[j]);
      if (miles > worst) worst = miles;
    }
  }
  return worst;
}

export type SpreadDays = {
  /** Days in the window whose stops are further apart than the threshold. */
  days: number;
  /** The worst of them, so the card can name a day rather than a count alone. */
  worstKey: string | null;
  worstMiles: number;
};

/**
 * Days where the work is scattered.
 *
 * STRAIGHT-LINE, AND IT SAYS SO EVERYWHERE IT IS SHOWN. This is haversine over
 * the coordinates the jobs already carry — no API call, no drive time. Two
 * stops 20 miles apart across a river might be an hour each way, and this
 * cannot know that. It is a flag for "look at this day", not an estimate of
 * anything, and the route planner is where the real answer lives.
 */
export function daysWithScatter(input: {
  fromKey: string;
  days: number;
  placesByDate: Record<string, LatLng[]>;
  thresholdMiles: number;
}): SpreadDays {
  let days = 0;
  let worstKey: string | null = null;
  let worstMiles = 0;

  for (let offset = 0; offset < input.days; offset += 1) {
    const dateKey = addDaysToDateKey(input.fromKey, offset);
    const places = input.placesByDate[dateKey];
    if (!places || places.length < 2) continue;
    const miles = spreadMiles(places);
    if (miles < input.thresholdMiles) continue;
    days += 1;
    if (miles > worstMiles) {
      worstMiles = miles;
      worstKey = dateKey;
    }
  }

  return { days, worstKey, worstMiles: Math.round(worstMiles) };
}
