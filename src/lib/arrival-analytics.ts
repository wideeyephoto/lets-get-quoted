// Did we keep the promise?
//
// Round one let a contractor tell somebody a time. This asks whether that time
// was true — which is the only thing that makes the feature worth having. A
// window nobody meets is worse than no window, because it converts a vague
// expectation into a specific broken one.
//
// Pure over rows, so every definition below is testable and arguable. The
// definitions are the hard part; the arithmetic isn't.

export type ArrivalTripRow = {
  crew_id: string | null;
  sent_by: string | null;
  status: string;
  arrival_start: string | null;
  arrival_end: string | null;
  arrived_at: string | null;
  en_route_at: string | null;
  eta_minutes: number | null;
  suggested_minutes: number | null;
  sms_status: string | null;
  first_viewed_at: string | null;
  view_count: number | null;
};

/**
 * Minutes past the promised window, floored at zero.
 *
 * Zero anywhere inside the window: that is what a window IS. Measuring from the
 * midpoint (or from arrival_start) would report a contractor as late for
 * arriving at 2:40 inside a 2:15–2:45 window, which is not late, and would make
 * the whole number untrustworthy the first time somebody checked it by hand.
 */
export function latenessMinutes(row: ArrivalTripRow): number | null {
  if (!row.arrived_at || !row.arrival_end) return null;
  const arrived = new Date(row.arrived_at).getTime();
  const promised = new Date(row.arrival_end).getTime();
  if (!Number.isFinite(arrived) || !Number.isFinite(promised)) return null;
  return Math.max(0, Math.round((arrived - promised) / 60_000));
}

/** How long the trip actually took, door to door. */
export function travelMinutes(row: ArrivalTripRow): number | null {
  if (!row.arrived_at || !row.en_route_at) return null;
  const start = new Date(row.en_route_at).getTime();
  const end = new Date(row.arrived_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 60_000);
}

/**
 * A text that never sent cannot be opened, and counting it against the open
 * rate would blame the customer for our failure. Only delivered texts are
 * eligible.
 */
export function wasDelivered(row: ArrivalTripRow): boolean {
  return row.sms_status === 'sent';
}

export type ArrivalSummary = {
  trips: number;
  /** Trips whose text actually reached a phone. */
  delivered: number;
  opened: number;
  /** Opened ÷ delivered. Null when nothing was delivered — not zero. */
  openRate: number | null;
  /** Trips that both promised a window and recorded an arrival. */
  measured: number;
  onTime: number;
  onTimeRate: number | null;
  /** Mean lateness across MEASURED trips, including the on-time zeroes. */
  averageLateness: number | null;
  /** Typical lateness. Reported next to the mean because one 3-hour disaster
   *  drags an average somewhere no individual customer experienced. */
  medianLateness: number | null;
  worstLateness: number | null;
  rescheduled: number;
  cancelled: number;
  noAccess: number;
  /** Rescheduled + cancelled + no-access ÷ trips: how often a visit fell over. */
  falloverRate: number | null;
  /** Mean actual travel time, for sanity-checking the ETAs people give. */
  averageTravel: number | null;
  /** Signed mean of (actual − promised ETA): negative means chronically
   *  over-promising speed. Null until there are trips to measure. */
  etaBias: number | null;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10
    : sorted[middle];
}

function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

export function summariseArrivals(rows: ArrivalTripRow[]): ArrivalSummary {
  const delivered = rows.filter(wasDelivered);
  const opened = delivered.filter((row) => Boolean(row.first_viewed_at));

  const lateness: number[] = [];
  for (const row of rows) {
    const late = latenessMinutes(row);
    if (late !== null) lateness.push(late);
  }
  const onTime = lateness.filter((minutes) => minutes === 0).length;

  const travel: number[] = [];
  const bias: number[] = [];
  for (const row of rows) {
    const actual = travelMinutes(row);
    if (actual === null) continue;
    travel.push(actual);
    // Against what the tech PROMISED, not what GPS guessed: the promise is the
    // thing the customer planned their afternoon around.
    if (typeof row.eta_minutes === 'number') bias.push(actual - row.eta_minutes);
  }

  const rescheduled = rows.filter((row) => row.status === 'rescheduled').length;
  const cancelled = rows.filter((row) => row.status === 'cancelled').length;
  const noAccess = rows.filter((row) => row.status === 'no_access').length;

  return {
    trips: rows.length,
    delivered: delivered.length,
    opened: opened.length,
    openRate: rate(opened.length, delivered.length),
    measured: lateness.length,
    onTime,
    onTimeRate: rate(onTime, lateness.length),
    averageLateness: mean(lateness),
    medianLateness: median(lateness),
    worstLateness: lateness.length > 0 ? Math.max(...lateness) : null,
    rescheduled,
    cancelled,
    noAccess,
    falloverRate: rate(rescheduled + cancelled + noAccess, rows.length),
    averageTravel: mean(travel),
    etaBias: mean(bias),
  };
}

export type CrewArrivalRow = ArrivalSummary & { crewId: string | null; name: string };

/**
 * Per-person. Grouped by crew_id, falling back to the snapshotted sender name
 * so trips sent from the office (no crew_id) still appear rather than silently
 * vanishing from the totals.
 */
export function summariseByCrew(rows: ArrivalTripRow[]): CrewArrivalRow[] {
  const groups = new Map<string, { name: string; crewId: string | null; rows: ArrivalTripRow[] }>();
  for (const row of rows) {
    const key = row.crew_id ?? `name:${row.sent_by ?? 'Unknown'}`;
    const existing = groups.get(key);
    if (existing) existing.rows.push(row);
    else groups.set(key, { name: row.sent_by || 'Unknown', crewId: row.crew_id, rows: [row] });
  }

  return [...groups.values()]
    .map((group) => ({ crewId: group.crewId, name: group.name, ...summariseArrivals(group.rows) }))
    // Most trips first: the person with two visits is not the story.
    .sort((left, right) => right.trips - left.trips);
}

/**
 * One line an owner can act on, or nothing.
 *
 * Deliberately silent below a floor of trips. A "you're late 100% of the time"
 * banner drawn from two visits is how a useful number gets ignored forever.
 */
export const ADVICE_MIN_TRIPS = 8;

export function arrivalAdvice(summary: ArrivalSummary): string | null {
  if (summary.measured < ADVICE_MIN_TRIPS) return null;

  if (summary.onTimeRate !== null && summary.onTimeRate < 70 && summary.etaBias !== null && summary.etaBias > 5) {
    return `Your arrival times run about ${Math.round(summary.etaBias)} minutes optimistic. Widening your window, or adding that to the time you give, would turn most of these into on-time arrivals.`;
  }
  if (summary.onTimeRate !== null && summary.onTimeRate < 70) {
    return `You're hitting the window ${summary.onTimeRate}% of the time. A wider window costs nothing and is kept far more often than a tight one.`;
  }
  if (summary.openRate !== null && summary.openRate < 40 && summary.delivered >= ADVICE_MIN_TRIPS) {
    return `Only ${summary.openRate}% of customers open the tracking link. The arrival time in the text itself is doing the work — worth keeping it there.`;
  }
  if (summary.onTimeRate !== null && summary.onTimeRate >= 90) {
    return `You're hitting your arrival window ${summary.onTimeRate}% of the time. That's the kind of thing worth saying out loud on your website.`;
  }
  return null;
}
