import type { SupabaseClient } from '@supabase/supabase-js';
import { coordOf, type LatLng } from '@/lib/distance';
import { driveMatrix, DRIVE_MATRIX_MAX_POINTS } from '@/lib/drive-time';
import { listCrewAssignmentsForJobs } from '@/lib/crew';
import { parseTimeMinutes, planDayRoute, type PlanStop, type RoutePlan } from '@/lib/route-plan';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import {
  addDaysToDateKey,
  daysBetweenInclusive,
  getJobScheduleSpanDays,
  isMissingColumnError,
  weekdayOfDateKey,
} from '@/lib/jobs';
import { dayLoad } from '@/lib/job-day-load';
import { normalizeBookingWeekdays } from '@/lib/booking-availability';

// Loads one day off the calendar and hands it to the pure planner in
// src/lib/route-plan.ts. Everything that touches the database or Google lives
// here; the ordering maths stays testable next door.

export type DayPlan = RoutePlan & {
  dateKey: string;
  // Set when the contractor has marked this day off. The plan is still produced —
  // they may be looking at it deliberately — but the page says so rather than
  // quietly proposing a route for a day they aren't working.
  blockedReason: string | null;
  // Jobs on the day that were filtered out because they belong to other crew.
  filteredOutCount: number;
  // Confirmed appointments we pinned, for the page's explanation line.
  lockedCount: number;
  // The crew this plan is for, when filtered.
  crewId: string | null;
  // Set when real drive time was enabled but couldn't be used for this day.
  driveTimeSkipped: 'too_many_stops' | null;
};

export type PlanJobRow = {
  id: string;
  client_name: string;
  client_phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_for: string | null;
  scheduled_until?: string | null;
  scheduled_time: string | null;
  estimated_hours: number | null;
  status: string;
  appointment_confirmed_at: string | null;
};

const JOB_FIELDS_BASE =
  'id, client_name, client_phone, address, lat, lng, scheduled_for, scheduled_time, estimated_hours, status, appointment_confirmed_at';
const JOB_FIELDS = `${JOB_FIELDS_BASE}, scheduled_until`;

/**
 * How far back to look for a job that STARTED before this day and runs into it.
 *
 * A day's route used to be `scheduled_for = dateKey`, which is the one thing a
 * multi-day job is not: a fortnight of three-hour mornings appeared on the
 * Monday and on none of the twelve days after it, so the plan for Tuesday was
 * an empty route for a day the contractor spends on site. Every other surface
 * — the calendar, the capacity map, online booking — has expanded spans for as
 * long as the end date has existed. This one never did.
 *
 * 120 days is a bound rather than a rule: the query has to start somewhere, and
 * a job running longer than four months is not what this screen is for.
 */
const SPAN_LOOKBACK_DAYS = 120;

// Today in the account's own timezone, so a contractor planning at 11pm gets the
// day they mean. en-CA yields YYYY-MM-DD.
export function accountToday(timeZone: string, date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export type PlanAccountSettings = {
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  bufferMinutes: number;
  /** The account's daily capacity, in hours. */
  scheduleDayHours: number;
  /**
   * The account's working week (0 = Sunday).
   *
   * Only ever affects a span this code GUESSED from estimated hours — a range
   * the owner entered is drawn literally, weekend or not. Same rule as the
   * calendar's, because it is the calendar's function doing the work.
   */
  workingWeekdays: number[];
  defaultVisitMinutes: number;
  homeBase: LatLng | null;
  // The text the owner typed, so the Google Maps link can use a real address
  // rather than a lat/lng pair nobody recognizes.
  mailingAddress: string | null;
  driveTimeEnabled: boolean;
};

export async function getPlanAccountSettings(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PlanAccountSettings> {
  const { data } = await supabase
    .from('accounts')
    .select(
      'timezone, workday_start, workday_end, job_buffer_minutes, schedule_day_hours, booking_weekdays, service_center_lat, service_center_lng, instant_book_drive_time, mailing_address, operating_address',
    )
    .eq('id', accountId)
    .maybeSingle();

  const homeLat = data?.service_center_lat;
  const homeLng = data?.service_center_lng;

  return {
    timezone: (data?.timezone as string) || 'America/New_York',
    // Times come back as "HH:MM:SS" from a `time` column; the planner parses both.
    workdayStart: (data?.workday_start as string) || '08:00',
    workdayEnd: (data?.workday_end as string) || '17:00',
    bufferMinutes: Number(data?.job_buffer_minutes) || 0,
    /**
     * Capacity, bounded by the working day it has to fit inside.
     *
     * schedule_day_hours and workday_start/end are two independent settings,
     * and nothing has ever stopped them disagreeing — a 10-hour capacity on an
     * 08:00–17:00 day says a job can take ten hours of a nine-hour day. The
     * route is the one place that difference becomes a wrong number rather than
     * a rounding one, so the smaller of the two wins here.
     */
    scheduleDayHours: Math.min(
      Number(data?.schedule_day_hours) || 8,
      Math.max(1, ((parseTimeMinutes((data?.workday_end as string) || '17:00') ?? 17 * 60) -
        (parseTimeMinutes((data?.workday_start as string) || '08:00') ?? 8 * 60)) / 60),
    ),
    workingWeekdays: normalizeBookingWeekdays((data as { booking_weekdays?: unknown } | null)?.booking_weekdays),
    // A job with no hours estimate gets a conservative slice of the working day
    // rather than a guess of zero, which would stack stops on top of each other.
    defaultVisitMinutes: Math.max(30, Math.round(((Number(data?.schedule_day_hours) || 8) / 4) * 60)),
    homeBase: homeLat != null && homeLng != null ? { lat: Number(homeLat), lng: Number(homeLng) } : null,
    // The operating location if there is one, the mailing address otherwise —
    // the same order the geocode uses, so the text on the map link names the
    // place the coordinates actually came from. Showing the mailing address
    // beside a point geocoded from the yard would be a map link that opens
    // somewhere the route was never measured to.
    mailingAddress: ((data?.operating_address as string | null) || (data?.mailing_address as string | null) || null),
    driveTimeEnabled: Boolean(data?.instant_book_drive_time),
  };
}

export type DayAnchor = {
  coord: LatLng | null;
  address: string | null;
  // Whose address the day is measured from, so the page can say so rather than
  // leaving the owner to wonder why one crew's mileage looks different.
  source: 'crew' | 'business' | null;
  crewName: string | null;
};

// Where the day starts and ends.
//
// A two-truck shop's drivers don't both leave from the shop. When the plan is
// filtered to one crew member and that person has their own start address, their
// route is measured from there; everything else falls back to the business
// address, and a shop with neither is routed stop-to-stop.
export async function resolveDayAnchor(
  supabase: SupabaseClient,
  accountId: string,
  crewId: string | null | undefined,
  settings: PlanAccountSettings,
): Promise<DayAnchor> {
  const business: DayAnchor = {
    coord: settings.homeBase,
    address: settings.mailingAddress,
    source: settings.homeBase ? 'business' : null,
    crewName: null,
  };
  if (!crewId) return business;

  // Defensive: the start_* columns arrive with 2026-07-31-route-stops.sql, and a
  // deploy ahead of the migration must fall back rather than throw.
  const { data, error } = await supabase
    .from('crew')
    .select('name, start_address, start_lat, start_lng')
    .eq('account_id', accountId)
    .eq('id', crewId)
    .maybeSingle();
  if (error || !data) return business;

  const lat = (data as { start_lat?: number | null }).start_lat;
  const lng = (data as { start_lng?: number | null }).start_lng;
  if (lat == null || lng == null) return business;

  return {
    coord: { lat: Number(lat), lng: Number(lng) },
    address: ((data as { start_address?: string | null }).start_address ?? null) || null,
    source: 'crew',
    crewName: (data as { name?: string }).name ?? null,
  };
}

/**
 * Which day of a multi-day job this is, and how many days it runs.
 *
 * `of: 1` is the ordinary case and the one that changes nothing. Anything more
 * is a job the contractor is on site for part of, on several days — see
 * lib/job-day-load for the arithmetic and why it is not new.
 */
export type JobDayPlacement = { day: number; of: number };

/**
 * Place a job on the days it occupies, by the same rule the calendar uses.
 *
 * An entered range is drawn literally — the owner picked both ends and "runs
 * through Sunday" means through Sunday. A span GUESSED from estimated hours
 * skips days the account does not work, so a two-day guess starting Friday
 * lands on Friday and Monday. Both of those rules live in lib/jobs, which is
 * where the calendar reads them from; this calls the same functions rather than
 * restating them, so the route and the calendar cannot disagree about what day
 * a job is on.
 */
export function jobDayKeys(job: PlanJobRow, workDayHours: number, workingWeekdays: number[] | null): string[] {
  if (!job.scheduled_for) return [];
  const entered = daysBetweenInclusive(job.scheduled_for, job.scheduled_until ?? null);
  if (entered) {
    return Array.from({ length: entered }, (_, offset) => addDaysToDateKey(job.scheduled_for!, offset));
  }

  const span = getJobScheduleSpanDays(
    {
      // PlanJobRow carries status as a plain string — it comes off a select
      // rather than out of the Job type — and the only branch that reads it is
      // "complete or archived means one day", which listDayJobs has already
      // excluded from the query.
      status: job.status as Parameters<typeof getJobScheduleSpanDays>[0]['status'],
      estimated_hours: job.estimated_hours,
      scheduled_until: null,
      scheduled_for: job.scheduled_for,
    },
    workDayHours,
  );
  const working = workingWeekdays && workingWeekdays.length > 0 ? new Set(workingWeekdays) : null;
  const keys: string[] = [];
  // Bounded because a span is at most a few days and the skipping could
  // otherwise walk forever on bad weekday data.
  for (let offset = 0; keys.length < span && offset < 366; offset++) {
    const key = addDaysToDateKey(job.scheduled_for, offset);
    // Day one is always the day it is scheduled. If the owner put a job on a
    // Saturday that IS where it is.
    if (keys.length > 0 && working && !working.has(weekdayOfDateKey(key))) continue;
    keys.push(key);
  }
  return keys;
}

// The jobs that make up a day's route: active work running on this day,
// optionally narrowed to one crew member so a multi-truck shop plans each truck
// separately.
//
// "Running on this day" and not "starting on this day". A job with an end date
// is on the route every day between the two, which is the whole point of having
// entered one — before this, the second morning of a three-day job showed an
// empty plan.
export async function listDayJobs(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
  crewId?: string | null,
  span?: { workDayHours: number; workingWeekdays: number[] | null },
): Promise<{ jobs: PlanJobRow[]; filteredOutCount: number; placement: Map<string, JobDayPlacement> }> {
  const query = (fields: string) =>
    supabase
      .from('jobs')
      .select(fields)
      .eq('account_id', accountId)
      .gte('scheduled_for', addDaysToDateKey(dateKey, -SPAN_LOOKBACK_DAYS))
      .lte('scheduled_for', dateKey)
      .not('status', 'in', '(complete,archived)')
      .order('scheduled_time', { ascending: true, nullsFirst: false });

  // Naming a column PostgREST does not know fails the WHOLE select, which here
  // would read as "nothing is scheduled" and hand back an empty day.
  const withEndDate = await query(JOB_FIELDS);
  const rows = (
    isMissingColumnError(withEndDate.error) ? (await query(JOB_FIELDS_BASE)).data : withEndDate.data
  ) as unknown as PlanJobRow[] | null;

  const placement = new Map<string, JobDayPlacement>();
  const onThisDay: PlanJobRow[] = [];
  for (const job of rows ?? []) {
    const keys = jobDayKeys(job, span?.workDayHours ?? 8, span?.workingWeekdays ?? null);
    const index = keys.indexOf(dateKey);
    if (index === -1) continue;
    placement.set(job.id, { day: index + 1, of: keys.length });
    onThisDay.push(job);
  }

  const all = onThisDay;
  if (!crewId) return { jobs: all, filteredOutCount: 0, placement };

  const assignments = await listCrewAssignmentsForJobs(supabase, accountId, all.map((job) => job.id));
  // Unassigned jobs stay in every crew's plan — somebody has to do them, and
  // hiding them would quietly drop work off the day.
  const jobs = all.filter((job) => {
    const assigned = assignments[job.id] ?? [];
    return assigned.length === 0 || assigned.includes(crewId);
  });
  return { jobs, filteredOutCount: all.length - jobs.length, placement };
}

/**
 * TODAY'S hours, not the job's whole estimate.
 *
 * This is the bug that put "Finish around 11:59 PM" on every row of a real
 * account's plan. estimated_hours is the TOTAL for the job; the router was
 * reading it as the length of one visit, so a 16-hour job across two days was
 * booked as a single sixteen-hour stop — 8:00 AM plus 16 hours is midnight, and
 * formatTimeLabel clamps at 23:59. Everything after it inherited the same
 * clamped arrival, which is why the second stop also said 11:59 PM.
 *
 * dayLoad is the same division lib/booking has done for as long as the end date
 * has existed, and the same one the job form prints under the date fields. The
 * 'over' case takes a full day rather than the arithmetic: the owner has been
 * told the range is too short for the hours, and the honest thing for the route
 * to show is the most a day can hold.
 */
export function toPlanStop(
  job: PlanJobRow,
  defaultVisitMinutes: number,
  opts?: { placement?: JobDayPlacement; capacityHours?: number },
): PlanStop {
  const hours = Number(job.estimated_hours);
  const of = opts?.placement?.of ?? 1;
  const capacityHours = opts?.capacityHours ?? 8;
  const load = dayLoad({ totalHours: hours, days: of, capacityHours });
  const hoursToday =
    load.kind === 'spread' ? load.perDay : load.kind === 'over' ? load.capacity : hours;

  return {
    id: job.id,
    label: job.client_name,
    address: job.address,
    lat: job.lat != null ? Number(job.lat) : null,
    lng: job.lng != null ? Number(job.lng) : null,
    scheduledTime: job.scheduled_time,
    visitMinutes:
      Number.isFinite(hoursToday) && hoursToday > 0 ? Math.round(hoursToday * 60) : defaultVisitMinutes,
    // The one hard constraint: a customer who confirmed their appointment by text
    // keeps that time, full stop.
    locked: Boolean(job.appointment_confirmed_at),
    span:
      of > 1
        ? { day: opts!.placement!.day, of, totalHours: Number.isFinite(hours) && hours > 0 ? hours : null }
        : null,
  };
}

// `dateKey` null ⇒ today in the account's own timezone.
export async function buildDayPlan(
  supabase: SupabaseClient,
  accountId: string,
  requestedDate: string | null,
  crewId?: string | null,
): Promise<{ plan: DayPlan; jobs: PlanJobRow[]; settings: PlanAccountSettings }> {
  const settings = await getPlanAccountSettings(supabase, accountId);
  const dateKey = requestedDate ?? accountToday(settings.timezone);
  const { jobs, filteredOutCount, placement } = await listDayJobs(supabase, accountId, dateKey, crewId, {
    workDayHours: settings.scheduleDayHours,
    workingWeekdays: settings.workingWeekdays,
  });
  const stops = jobs.map((job) =>
    toPlanStop(job, settings.defaultVisitMinutes, {
      placement: placement.get(job.id),
      capacityHours: settings.scheduleDayHours,
    }),
  );

  // Real drive legs when the owner opted into Distance Matrix and the day is
  // small enough for one request. Anything else stays on straight-line.
  let matrix: Map<string, { miles: number; minutes: number }> | undefined;
  // Why the downgrade happened, so the page can say "too many stops for one
  // lookup" instead of leaving the contractor to wonder why the numbers changed.
  let driveTimeSkipped: 'too_many_stops' | null = null;
  if (settings.driveTimeEnabled) {
    const points: Array<{ id: string; coord: LatLng }> = [];
    if (settings.homeBase) points.push({ id: 'start', coord: settings.homeBase });
    for (const stop of stops) {
      const coord = coordOf(stop);
      if (coord) points.push({ id: stop.id, coord });
    }
    if (points.length >= 2 && points.length <= DRIVE_MATRIX_MAX_POINTS) {
      matrix = (await driveMatrix(points)) ?? undefined;
    } else if (points.length > DRIVE_MATRIX_MAX_POINTS) {
      driveTimeSkipped = 'too_many_stops';
    }
  }

  const plan = planDayRoute({
    stops,
    homeBase: settings.homeBase,
    workdayStart: settings.workdayStart,
    workdayEnd: settings.workdayEnd,
    bufferMinutes: settings.bufferMinutes,
    defaultVisitMinutes: settings.defaultVisitMinutes,
    matrix,
  });

  // Is this day blocked off? listUpcomingBlocks only returns ranges ending today
  // or later, so a past date simply never matches — correct, and no extra query.
  let blockedReason: string | null = null;
  try {
    const blocks = await listUpcomingBlocks(supabase, accountId, dateKey);
    const covering = blocks.find((b) => b.start_date <= dateKey && dateKey <= b.end_date);
    if (covering) blockedReason = covering.reason?.trim() || 'Blocked off';
  } catch {
    // A blocks read failure must not stop the plan; worst case we don't warn.
  }

  return {
    plan: {
      ...plan,
      dateKey,
      blockedReason,
      driveTimeSkipped,
      filteredOutCount,
      lockedCount: stops.filter((stop) => stop.locked).length,
      crewId: crewId ?? null,
    },
    jobs,
    settings,
  };
}

// The nearest day (forward, then backward) that actually has work on it.
//
// "No jobs scheduled for this day" is a dead end when the contractor is a couple
// of taps from the day they meant — most of the time they landed on today, today
// is empty, and the useful answer is "your next day out is Monday".
export async function findNearestDayWithJobs(
  supabase: SupabaseClient,
  accountId: string,
  fromDateKey: string,
): Promise<{ dateKey: string; direction: 'next' | 'previous' } | null> {
  const base = supabase
    .from('jobs')
    .select('scheduled_for')
    .eq('account_id', accountId)
    .not('scheduled_for', 'is', null)
    .not('status', 'in', '(complete,archived)');

  const { data: next } = await base
    .gt('scheduled_for', fromDateKey)
    .order('scheduled_for', { ascending: true })
    .limit(1);
  const forward = (next ?? [])[0]?.scheduled_for as string | undefined;
  if (forward) return { dateKey: forward, direction: 'next' };

  // Nothing ahead — offer the most recent day behind instead, so the page still
  // gives them somewhere to go.
  const { data: prev } = await supabase
    .from('jobs')
    .select('scheduled_for')
    .eq('account_id', accountId)
    .not('scheduled_for', 'is', null)
    .not('status', 'in', '(complete,archived)')
    .lt('scheduled_for', fromDateKey)
    .order('scheduled_for', { ascending: false })
    .limit(1);
  const back = (prev ?? [])[0]?.scheduled_for as string | undefined;
  return back ? { dateKey: back, direction: 'previous' } : null;
}
