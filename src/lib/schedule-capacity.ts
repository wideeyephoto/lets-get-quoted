/**
 * How full a day is, as one word.
 *
 * The month grid drew every cell in the same orange, whatever was in it: a day
 * with one job of eight hours and a day with four jobs of thirty-two both got
 * an orange bar, and the only thing separating them was a "Full" or "Over" chip
 * in 9px type at the far corner. So the one question the month view exists to
 * answer — where is there room this month — was answered by reading thirty-one
 * cells one at a time.
 *
 * Five bands, and the ramp is the answer: green is room, red is trouble, and
 * the eye can read a month of it without reading a word.
 *
 *   open   nothing booked                      green
 *   light  booked up to half the day           lime
 *   busy   past half, not yet full             yellow
 *   full   at capacity                         orange
 *   over   promised more hours than exist      red
 *
 * Pure and here rather than in the component, because the boundaries are the
 * kind of thing that is easy to get a pixel wrong in and impossible to see: a
 * day at exactly 4.0 of 8 hours has to land on one side of "half" and stay
 * there.
 */

export type CapacityLevel = 'open' | 'light' | 'busy' | 'full' | 'over' | 'unknown';

/**
 * In the order the ramp runs, for a legend that cannot fall out of step.
 *
 * `unknown` is deliberately NOT in here. It is not a step on the ramp — it is
 * the admission that this day cannot be placed on the ramp at all — so it has
 * no position between two other bands and anything iterating the ramp (the
 * legend, the marketing page's count) would be wrong to include it.
 */
export const CAPACITY_LEVELS: CapacityLevel[] = ['open', 'light', 'busy', 'full', 'over'];

export const CAPACITY_LABEL: Record<CapacityLevel, string> = {
  open: 'Open',
  light: 'Up to half full',
  busy: 'Half to full',
  full: 'Full',
  over: 'Overbooked',
  unknown: 'Duration needed',
};

/**
 * Floating point is why this is a constant rather than `> capacity`.
 *
 * Booked hours are summed from per-job estimates, so a day of 2.4 + 2.4 + 3.2
 * lands on 8.000000000000002 against a capacity of 8 — and a calendar that
 * calls that day overbooked is crying wolf on arithmetic noise. The same
 * tolerance the cell's own `over` flag has always used.
 */
const EPSILON = 0.01;

export function capacityLevel({
  bookedHours,
  capacityHours,
  jobCount,
  markedFull = false,
  unknownJobs = 0,
}: {
  bookedHours: number;
  /** The day's available hours. 0 or missing means capacity is unconfigured. */
  capacityHours: number;
  /** Jobs on the day, however long they are. */
  jobCount: number;
  /**
   * The day hit the account's max-jobs-per-day cap.
   *
   * A separate axis from hours, and it wins: a business capped at two visits a
   * day is full at two visits whether they are eight hours or twenty minutes,
   * and colouring that day green would offer room that the booking rules will
   * refuse.
   */
  markedFull?: boolean;
  /**
   * Jobs on the day with no estimated duration.
   *
   * These contribute ZERO to bookedHours — computeHoursByDate skips a job whose
   * hours come to nothing, and it has to, because it is the same function that
   * decides which slots the public booking page offers and a made-up eight
   * hours there would close days that are genuinely open.
   *
   * The consequence on a calendar is a lie of a different kind: a Tuesday with
   * three jobs of unspecified length rendered "0 of 8 hrs" behind a lime "up to
   * half full" band, which is a day that looks emptier than an actually empty
   * one. It is not a small workload — it is an unmeasured one, and the two are
   * not the same fact. Hence a band OFF the ramp rather than a step on it.
   */
  unknownJobs?: number;
}): CapacityLevel {
  const booked = Number.isFinite(bookedHours) ? Math.max(0, bookedHours) : 0;
  const capacity = Number.isFinite(capacityHours) ? Math.max(0, capacityHours) : 0;
  const jobs = Number.isFinite(jobCount) ? Math.max(0, jobCount) : 0;
  const unknown = Number.isFinite(unknownJobs) ? Math.max(0, unknownJobs) : 0;

  // The two certainties outrank the doubt. Hours already past capacity is
  // trouble whether or not something else on the day is unmeasured, and a day
  // at the max-jobs cap is closed by a rule that never consulted hours at all.
  if (capacity > 0 && booked > capacity + EPSILON) return 'over';
  if (markedFull) return 'full';

  // Nothing on the day at all. Checked on the JOB COUNT, not on the hours: a
  // job with no estimated duration books zero hours, and drawing that day as
  // open is how somebody gets sent to a day that already has work on it.
  if (jobs === 0 && booked <= 0) return 'open';

  // Past those, any unmeasured work makes the ratio unquotable. Reporting the
  // known half as though it were the whole is what made this view unreliable.
  if (unknown > 0) return 'unknown';

  // Capacity unconfigured, but there IS work. No ratio can be computed, so say
  // the least: something is booked. Never 'full', which would be a claim.
  if (capacity <= 0) return 'light';

  if (booked >= capacity - EPSILON) return 'full';
  // "Up to half" includes half exactly — 4 of 8 hours is a half-empty day, and
  // calling it busy would put a yellow cell where there is a clear afternoon.
  if (booked <= capacity / 2) return 'light';
  return 'busy';
}

/**
 * How many jobs on each day nobody has estimated.
 *
 * Counted from the already-expanded occurrences — one row per day — so a job
 * running Monday to Wednesday is counted on all three, the same days its bar
 * covers. Days with none are absent rather than zero, so `?? 0` at the reading
 * end is the whole of the handling.
 *
 * Kept beside capacityLevel rather than folded into computeHoursByDate on
 * purpose: that function feeds the public booking engine, and the only safe
 * thing for it to do with an unknown duration is nothing. This is the calendar
 * saying out loud what that silence cost.
 */
export function countUnknownDurationByDate(
  occurrences: Array<{ scheduled_for: string | null; estimated_hours?: number | string | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const occurrence of occurrences) {
    const dateKey = occurrence.scheduled_for;
    if (!dateKey) continue;
    const hours = Number(occurrence.estimated_hours);
    // Zero and null are the same thing here: nobody has said how long it takes.
    // A negative or NaN estimate is not a duration either.
    if (Number.isFinite(hours) && hours > 0) continue;
    counts[dateKey] = (counts[dateKey] ?? 0) + 1;
  }
  return counts;
}
