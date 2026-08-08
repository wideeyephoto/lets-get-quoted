/**
 * Geometry for the time-based schedule views.
 *
 * Pure functions, no React and no DOM, because this is the part that is easy to
 * get subtly wrong and impossible to eyeball: two jobs that overlap by four
 * minutes have to end up side by side, and a job with no end time still has to
 * occupy a believable amount of the day. Every rule here is covered by
 * test/schedule-timeline.test.ts.
 *
 * Minutes-from-midnight is the unit throughout. Not Date objects: the calendar
 * renders a wall clock in the contractor's own day, and going through Date
 * would drag the browser's timezone into arithmetic that has no business
 * knowing about it — a job at 08:00 is at 08:00 whoever is looking.
 */

/** "08:30" or "08:30:00" -> 510. Anything unparseable -> null. */
export function parseClockMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hourPart, minutePart] = String(time).split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/** 510 -> "8:30 AM". 0 -> "12:00 AM". */
export function formatClockMinutes(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** 480 -> "8 AM". The axis gutter has room for the hour and nothing else. */
export function formatAxisHour(minutes: number): string {
  const hour = Math.floor((((minutes % 1440) + 1440) % 1440) / 60);
  return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export type TimelineEntry = {
  key: string;
  /** Minutes from midnight, or null for a job with no time set. */
  startMinutes: number | null;
  /** Always > 0 for a timed entry. Untimed entries are ignored by the layout. */
  durationMinutes: number;
};

/**
 * A DEFAULT LENGTH, BECAUSE A ZERO-LENGTH JOB IS INVISIBLE.
 *
 * estimated_hours is optional on a job and plenty of real ones have never had
 * it filled in. On a month grid that cost nothing — the chip was the same size
 * either way. On a time axis a job with no duration is a block of zero height,
 * which is to say a job that has silently vanished from the calendar.
 *
 * An hour is the honest guess: it is the shortest thing anyone books, so the
 * block is never claiming more of the day than the job might really take.
 */
export const DEFAULT_JOB_MINUTES = 60;

/** The shortest block the layout will produce, so a 15-minute call is legible. */
export const MIN_BLOCK_MINUTES = 30;

/**
 * How long one day's slice of a job runs.
 *
 * A multi-day job arrives here already expanded to one occurrence per day, all
 * of them carrying the same scheduled_time and the same total estimated_hours.
 * Rendering each of those as the full estimate would draw a 20-hour block on
 * three consecutive days — three times the work, none of it true. So the total
 * is spent across the days it runs: full working days until the last one, which
 * gets the remainder.
 */
export function occurrenceMinutes({
  totalHours,
  dayIndex,
  dayCount,
  workdayHours,
}: {
  totalHours: number | null | undefined;
  dayIndex: number;
  dayCount: number;
  workdayHours: number;
}): number {
  const capacity = Math.max(1, workdayHours) * 60;
  const total = Number(totalHours);
  if (!Number.isFinite(total) || total <= 0) return DEFAULT_JOB_MINUTES;
  if (dayCount <= 1) return Math.max(MIN_BLOCK_MINUTES, Math.min(total * 60, capacity));

  const spent = Math.min(dayIndex, dayCount - 1) * capacity;
  const remaining = total * 60 - spent;
  if (remaining <= 0) return MIN_BLOCK_MINUTES;
  return Math.max(MIN_BLOCK_MINUTES, Math.min(remaining, capacity));
}

export type TimeAxis = {
  /** Minutes from midnight of the first gridline. Always on the hour. */
  startMinutes: number;
  /** Minutes from midnight of the last gridline. Always on the hour. */
  endMinutes: number;
  /** Every gridline, inclusive of both ends. */
  hours: number[];
  totalMinutes: number;
};

/**
 * The vertical extent of the day.
 *
 * Starts from the configured working hours, then GROWS to contain any job that
 * falls outside them. Growing is not optional: a 6am start that the owner
 * booked deliberately would otherwise be drawn above the top of the calendar,
 * i.e. not drawn, and the one thing worse than a cramped calendar is one that
 * silently omits work. Clamped to whole hours so the gridlines are round
 * numbers, and to a floor of MIN_AXIS_HOURS so an empty day is still a day
 * rather than a sliver.
 */
const MIN_AXIS_HOURS = 6;

export function buildTimeAxis({
  entries,
  workdayStart,
  workdayEnd,
}: {
  entries: TimelineEntry[];
  /** "07:30" from account settings. Falls back to 8am–6pm. */
  workdayStart?: string | null;
  workdayEnd?: string | null;
}): TimeAxis {
  const configuredStart = parseClockMinutes(workdayStart) ?? 8 * 60;
  const configuredEnd = parseClockMinutes(workdayEnd) ?? 18 * 60;

  let start = Math.min(configuredStart, configuredEnd);
  let end = Math.max(configuredStart, configuredEnd);

  for (const entry of entries) {
    if (entry.startMinutes == null) continue;
    start = Math.min(start, entry.startMinutes);
    end = Math.max(end, entry.startMinutes + Math.max(entry.durationMinutes, MIN_BLOCK_MINUTES));
  }

  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.min(24 * 60, Math.ceil(end / 60) * 60);

  // A floor, applied downward first so a late-finishing day does not get pushed
  // past midnight, then upward with whatever room is left.
  if (end - start < MIN_AXIS_HOURS * 60) {
    const shortfall = MIN_AXIS_HOURS * 60 - (end - start);
    const grewDown = Math.min(shortfall, start);
    start -= grewDown;
    end = Math.min(24 * 60, end + (shortfall - grewDown));
  }

  const hours: number[] = [];
  for (let minute = start; minute <= end; minute += 60) hours.push(minute);

  return { startMinutes: start, endMinutes: end, hours, totalMinutes: Math.max(60, end - start) };
}

export type PackedEntry = {
  key: string;
  startMinutes: number;
  endMinutes: number;
  /** Which side-by-side slot this block sits in, 0-based. */
  column: number;
  /** How many slots its overlap cluster needs. Width is 1/columns. */
  columns: number;
};

/**
 * Side-by-side placement for jobs booked at the same time.
 *
 * MAKING OVERLAPS VISIBLE IS THE POINT OF THIS VIEW. Two jobs at 9am in a month
 * cell are two chips in a list and look exactly like two jobs on the same day;
 * on a time axis they are two blocks in the same rectangle, and if they are
 * drawn on top of each other the view has hidden the very thing it exists to
 * show. So overlapping blocks split the column between them.
 *
 * The grouping is TRANSITIVE, not pairwise: A overlaps B, B overlaps C, and A
 * and C do not touch. All three still have to share, because otherwise A and C
 * both take the full width and B — which genuinely conflicts with both — has
 * nowhere to go. So the sweep tracks a cluster's running end rather than
 * comparing pairs.
 *
 * Within a cluster each block takes the lowest column whose last occupant has
 * already finished, which is the ordinary greedy interval-colouring and gives
 * the fewest columns for the cluster.
 *
 * Untimed entries are not returned. They have no position on a time axis and
 * the caller lists them separately.
 */
export function packOverlaps(entries: TimelineEntry[]): PackedEntry[] {
  const timed = entries
    .filter((entry): entry is TimelineEntry & { startMinutes: number } => entry.startMinutes != null)
    .map((entry) => ({
      key: entry.key,
      startMinutes: entry.startMinutes,
      endMinutes: entry.startMinutes + Math.max(entry.durationMinutes, MIN_BLOCK_MINUTES),
    }))
    // Longest first among equal starts, so the big job takes column 0 and the
    // short ones stack beside it rather than pushing it right.
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes || a.key.localeCompare(b.key));

  const packed: PackedEntry[] = [];
  let cluster: PackedEntry[] = [];
  let clusterEnd = -Infinity;
  /** Column index -> the minute its current occupant frees up. */
  let columnEnds: number[] = [];

  const flush = () => {
    const columns = Math.max(1, columnEnds.length);
    for (const entry of cluster) entry.columns = columns;
    packed.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -Infinity;
  };

  for (const entry of timed) {
    // `>=` not `>`: a job ending at 10:00 and one starting at 10:00 are
    // back-to-back, not a conflict, and forcing them to share the width would
    // halve every block on a tightly packed day.
    if (entry.startMinutes >= clusterEnd) flush();

    let column = columnEnds.findIndex((end) => end <= entry.startMinutes);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(entry.endMinutes);
    } else {
      columnEnds[column] = entry.endMinutes;
    }

    cluster.push({ ...entry, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, entry.endMinutes);
  }
  flush();

  return packed;
}

/** True if any two timed entries in the list actually overlap in time. */
export function hasOverlap(entries: TimelineEntry[]): boolean {
  return packOverlaps(entries).some((entry) => entry.columns > 1);
}

/**
 * Overlapping jobs that need the SAME PERSON.
 *
 * Two jobs at 9am is a normal Tuesday for a business with two crews. The same
 * crew member booked on both is somebody who is about to not turn up, and it is
 * the only overlap worth putting a warning marker on in the month view.
 */
export function findCrewConflicts(
  entries: Array<TimelineEntry & { crewIds: string[] }>,
): Array<{ crewId: string; keys: string[] }> {
  const byCrew = new Map<string, Array<TimelineEntry>>();
  for (const entry of entries) {
    for (const crewId of entry.crewIds) {
      const bucket = byCrew.get(crewId) ?? [];
      bucket.push(entry);
      byCrew.set(crewId, bucket);
    }
  }

  const conflicts: Array<{ crewId: string; keys: string[] }> = [];
  for (const [crewId, bucket] of byCrew) {
    if (bucket.length < 2) continue;
    const clashing = packOverlaps(bucket).filter((entry) => entry.columns > 1);
    if (clashing.length > 0) conflicts.push({ crewId, keys: clashing.map((entry) => entry.key) });
  }
  return conflicts;
}

/** Where a block sits in its column, as percentages of the axis. */
export function blockPosition(
  entry: PackedEntry,
  axis: TimeAxis,
): { top: number; height: number; left: number; width: number } {
  const top = ((entry.startMinutes - axis.startMinutes) / axis.totalMinutes) * 100;
  const height = ((entry.endMinutes - entry.startMinutes) / axis.totalMinutes) * 100;
  const width = 100 / entry.columns;
  return {
    // Clamped so a job starting before the axis (which buildTimeAxis prevents,
    // but a stale axis passed in from elsewhere would not) never draws above it.
    top: Math.max(0, Math.min(100, top)),
    height: Math.max(0, Math.min(100 - Math.max(0, top), height)),
    left: entry.column * width,
    width,
  };
}
