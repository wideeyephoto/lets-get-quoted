import type { SupabaseClient } from '@supabase/supabase-js';
import { coordOf, type LatLng } from '@/lib/distance';
import { driveMatrix, DRIVE_MATRIX_MAX_POINTS } from '@/lib/drive-time';
import { backfillJobCoordinates } from '@/lib/jobs';
import { listCrewAssignmentsForJobs } from '@/lib/crew';
import { planDayRoute, type PlanStop, type RoutePlan } from '@/lib/route-plan';

// Loads one day off the calendar and hands it to the pure planner in
// src/lib/route-plan.ts. Everything that touches the database or Google lives
// here; the ordering maths stays testable next door.

export type DayPlan = RoutePlan & {
  dateKey: string;
  // Jobs on the day that were filtered out because they belong to other crew.
  filteredOutCount: number;
  // Confirmed appointments we pinned, for the page's explanation line.
  lockedCount: number;
  // The crew this plan is for, when filtered.
  crewId: string | null;
};

export type PlanJobRow = {
  id: string;
  client_name: string;
  client_phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_for: string | null;
  scheduled_time: string | null;
  estimated_hours: number | null;
  status: string;
  appointment_confirmed_at: string | null;
};

const JOB_FIELDS =
  'id, client_name, client_phone, address, lat, lng, scheduled_for, scheduled_time, estimated_hours, status, appointment_confirmed_at';

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
  defaultVisitMinutes: number;
  homeBase: LatLng | null;
  driveTimeEnabled: boolean;
};

export async function getPlanAccountSettings(
  supabase: SupabaseClient,
  accountId: string,
): Promise<PlanAccountSettings> {
  const { data } = await supabase
    .from('accounts')
    .select(
      'timezone, workday_start, workday_end, job_buffer_minutes, schedule_day_hours, service_center_lat, service_center_lng, instant_book_drive_time',
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
    // A job with no hours estimate gets a conservative slice of the working day
    // rather than a guess of zero, which would stack stops on top of each other.
    defaultVisitMinutes: Math.max(30, Math.round(((Number(data?.schedule_day_hours) || 8) / 4) * 60)),
    homeBase: homeLat != null && homeLng != null ? { lat: Number(homeLat), lng: Number(homeLng) } : null,
    driveTimeEnabled: Boolean(data?.instant_book_drive_time),
  };
}

// The jobs that make up a day's route: active work with a date, optionally
// narrowed to one crew member so a multi-truck shop plans each truck separately.
export async function listDayJobs(
  supabase: SupabaseClient,
  accountId: string,
  dateKey: string,
  crewId?: string | null,
): Promise<{ jobs: PlanJobRow[]; filteredOutCount: number }> {
  // Self-healing, same as the dashboard map: a job that never got geocoded can't
  // be routed, so try a small batch before we plan.
  await backfillJobCoordinates(supabase, accountId, 12);

  const { data } = await supabase
    .from('jobs')
    .select(JOB_FIELDS)
    .eq('account_id', accountId)
    .eq('scheduled_for', dateKey)
    .not('status', 'in', '(complete,archived)')
    .order('scheduled_time', { ascending: true, nullsFirst: false });

  const all = (data ?? []) as PlanJobRow[];
  if (!crewId) return { jobs: all, filteredOutCount: 0 };

  const assignments = await listCrewAssignmentsForJobs(supabase, accountId, all.map((job) => job.id));
  // Unassigned jobs stay in every crew's plan — somebody has to do them, and
  // hiding them would quietly drop work off the day.
  const jobs = all.filter((job) => {
    const assigned = assignments[job.id] ?? [];
    return assigned.length === 0 || assigned.includes(crewId);
  });
  return { jobs, filteredOutCount: all.length - jobs.length };
}

export function toPlanStop(job: PlanJobRow, defaultVisitMinutes: number): PlanStop {
  const hours = Number(job.estimated_hours);
  return {
    id: job.id,
    label: job.client_name,
    address: job.address,
    lat: job.lat != null ? Number(job.lat) : null,
    lng: job.lng != null ? Number(job.lng) : null,
    scheduledTime: job.scheduled_time,
    visitMinutes: Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : defaultVisitMinutes,
    // The one hard constraint: a customer who confirmed their appointment by text
    // keeps that time, full stop.
    locked: Boolean(job.appointment_confirmed_at),
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
  const { jobs, filteredOutCount } = await listDayJobs(supabase, accountId, dateKey, crewId);
  const stops = jobs.map((job) => toPlanStop(job, settings.defaultVisitMinutes));

  // Real drive legs when the owner opted into Distance Matrix and the day is
  // small enough for one request. Anything else stays on straight-line.
  let matrix: Map<string, { miles: number; minutes: number }> | undefined;
  if (settings.driveTimeEnabled) {
    const points: Array<{ id: string; coord: LatLng }> = [];
    if (settings.homeBase) points.push({ id: 'start', coord: settings.homeBase });
    for (const stop of stops) {
      const coord = coordOf(stop);
      if (coord) points.push({ id: stop.id, coord });
    }
    if (points.length >= 2 && points.length <= DRIVE_MATRIX_MAX_POINTS) {
      matrix = (await driveMatrix(points)) ?? undefined;
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

  return {
    plan: {
      ...plan,
      dateKey,
      filteredOutCount,
      lockedCount: stops.filter((stop) => stop.locked).length,
      crewId: crewId ?? null,
    },
    jobs,
    settings,
  };
}
