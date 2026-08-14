import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { getMapPins } from '@/lib/map-pins';
import { CALENDAR_VIEW_COOKIE, CALENDAR_WEEKEND_COOKIE, MAP_THEME_COOKIE, mapViewCookie, normalizeCalendarView, normalizeMapTheme, normalizeMapView, normalizeWeekendDays } from '@/lib/dashboard-views';
import { expandScheduledJobs, formatJobTime, formatMoney, listJobs, addDaysToDateKey, type Job } from '@/lib/jobs';
import { isRequestedToday } from '@/lib/schedule-readiness';
import { computeHoursByDate } from '@/lib/booking';
import { countUnknownDurationByDate } from '@/lib/schedule-capacity';
import { daysWithScatter, loadOverWindow } from '@/lib/schedule-load';
import { outlookByDay } from '@/lib/weather-data';
/* Local, not UTC: `new Date('2026-08-17')` is midnight UTC and lands on the
   16th everywhere west of Greenwich. See the note at the top of that file. */
import { parseDateKey } from '@/lib/schedule-agenda';
import { normalizeBookingWeekdays } from '@/lib/booking-availability';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { deriveJobListBadge } from '@/lib/job-badges';
import type { Invoice } from '@/lib/invoices';
import type { Payment } from '@/lib/payments';
import ActionIcon from '@/components/action-icon';
import { listActiveScheduleRequests } from '@/lib/scheduling';
import { listRecurringPlans, projectPlanVisits } from '@/lib/recurring';
import { getAvailableBookingDays } from '@/lib/booking';
import ScheduleCalendar from './schedule-calendar';
import ScheduleWorkbench from './ScheduleWorkbench';
import { ScheduleQueueBar } from './QueueTriggers';
import ScheduleMap from './ScheduleMap';
import ScheduleDragProvider from './ScheduleDragProvider';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import BookingRequests from './BookingRequests';
import { listPendingBookings, toPendingBookings } from '@/lib/booking-requests';

export const metadata = { title: 'Schedule' };

function parseMonthParam(month?: string): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    if (m >= 1 && m <= 12) return { year: y, monthIndex: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "Nina Delacroix" -> "Nina D." — a month cell is ~110px wide, and the full
// name pushed everything else off the chip. The full name stays in the tooltip
// and on the job itself.
function shortClientName(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// The city off an address, short enough for a 117px calendar cell and never
// cut mid-word. Standard postal abbreviations first ("Madison Heights" ->
// "Madison Hts"), then whole trailing words are dropped until it fits
// ("Grosse Pointe Farms" -> "Grosse Pt"). An ellipsised "Grosse Poi…" tells
// you less than a whole word does.
const CITY_MAX = 12;
const CITY_SHORT: Array<[RegExp, string]> = [
  [/\bHeights\b/i, 'Hts'],
  [/\bTownship\b/i, 'Twp'],
  [/\bSaint\b/i, 'St'],
  [/\bMount\b/i, 'Mt'],
  [/\bPointe?\b/i, 'Pt'],
  [/\bVillage\b/i, 'Vlg'],
];

function shortCity(address: string | null): string | null {
  if (!address) return null;
  // "1775 E 14 Mile Rd, Madison Heights, MI 48071" — the city is the middle part.
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let city = parts[parts.length - 2];
  if (!city || /^\d/.test(city)) return null;
  for (const [pattern, abbrev] of CITY_SHORT) city = city.replace(pattern, abbrev);

  // Drop whole trailing words rather than keeping only the first one.
  // "Saint Clair Shores" abbreviates to "St Clair Shores", and first-word-only
  // rendered that city as, simply, "St".
  const words = city.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && words.join(' ').length > CITY_MAX) words.pop();
  return words.join(' ') || null;
}

function crewInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function extractCity(address: string | null): string {
  if (!address) return 'No address on file';
  const normalized = address.replace(/\s+/g, ' ').trim();
  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  const statePattern = /^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i;
  const deriveTrailingCity = (value: string) => {
    const tokens = value.split(/\s+/).filter(Boolean);
    if (/^\d/.test(tokens[0] || '')) {
      if (tokens.length >= 4) return tokens.slice(-2).join(' ');
      if (tokens.length >= 2) return tokens.slice(1).join(' ');
    }
    if (tokens.length >= 2) return tokens.slice(-2).join(' ');
    return value;
  };
  const cityPart = parts.find((part, index) => index > 0 && !statePattern.test(part));
  if (cityPart) return cityPart;

  const stateIndex = parts.findIndex((part) => statePattern.test(part));
  const fallback = stateIndex > 0 ? parts[stateIndex - 1] : parts[0];
  const inferredCity = fallback.match(/(?:\b(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Blvd|Boulevard|Way|Trail|Trl|Circle|Cir)\b\.?\s+)(.+)$/i)?.[1];
  if (inferredCity) return inferredCity;
  if (stateIndex > 0) return deriveTrailingCity(fallback);

  if (!normalized.includes(',')) {
    return deriveTrailingCity(normalized);
  }

  return fallback || normalized || 'No address on file';
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function monthParam(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function groupByJobId<T extends { job_id: string }>(rows: T[]): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((groups, row) => {
    groups[row.job_id] = [...(groups[row.job_id] ?? []), row];
    return groups;
  }, {});
}

// Marks for the three header stats. Drawn here rather than pulled from the
// baked icon set — that set is trade glyphs (wrench, droplet, roller) for
// contractor sites, and none of them mean "how full is the month". Three paths
// is cheaper than growing that set for dashboard chrome.
//
// The money and trend marks went with the cards they belonged to; a briefcase
// went with the jobs card, whose number is a caption now.
const STAT_PATHS: Record<string, string> = {
  /** A dial with a needle: how full, at a glance, before the number is read. */
  gauge: 'M4.2 17.5a8.5 8.5 0 1 1 15.6 0M12 17l3.8-5.2',
  people: 'M9 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19.5a5.5 5.5 0 0 1 11 0M16 6.2a3 3 0 0 1 0 5.8M17.5 14.6a5.5 5.5 0 0 1 3 4.9',
  route: 'M6.5 3.5a2.6 2.6 0 0 1 2.6 2.6c0 1.9-2.6 4.6-2.6 4.6S3.9 8 3.9 6.1A2.6 2.6 0 0 1 6.5 3.5Zm11 9a2.6 2.6 0 0 1 2.6 2.6c0 1.9-2.6 4.6-2.6 4.6s-2.6-2.7-2.6-4.6a2.6 2.6 0 0 1 2.6-2.6ZM6.5 13.5v2.2a2.3 2.3 0 0 0 2.3 2.3h2.6',
};

function StatIcon({ shape }: { shape: keyof typeof STAT_PATHS }) {
  return (
    <svg className="sched-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={STAT_PATHS[shape]} />
    </svg>
  );
}

export default async function SchedulePage({
  searchParams,
}: {
  /** `day` is read only by the mobile agenda — stepping off the end of a month
      has to carry the day as well as the month, or coming back lands on the
      1st. The desktop calendar ignores it. */
  searchParams: { month?: string; day?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const [{ data: account }, jobs, { data: site }] = await Promise.all([
    supabase.from('accounts').select('schedule_day_hours, appointment_reminders_enabled, job_buffer_minutes, booking_weekdays, workday_start, workday_end, weather_alerts_enabled, service_center_lat, service_center_lng').eq('id', accountId).single(),
    listJobs(supabase, accountId),
    supabase.from('sites').select('published, subdomain').eq('account_id', accountId).maybeSingle(),
  ]);
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  // The working week, reused from booking: a span guessed from estimated hours
  // shouldn't spill onto days nobody works.
  const workingWeekdays = normalizeBookingWeekdays((account as { booking_weekdays?: unknown } | null)?.booking_weekdays);

  // Self-serve booking link — the same public page customers use, built from the
  // site's subdomain. Only offered when the site is live with a subdomain.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingSubdomain = site?.published ? site?.subdomain ?? null : null;
  const bookingUrl = bookingSubdomain ? `${appOrigin}/book/${bookingSubdomain}` : null;
  /* Still read here, and ONLY for the booking-requests panel below: it needs to
     know whether a customer's second choice is still free. The folded "N open
     windows" header this also fed has moved to /dashboard/schedule/settings,
     which computes its own. */
  const bookingDays = bookingUrl ? await getAvailableBookingDays(supabase, accountId) : [];

  const activeJobs = jobs.filter((job) => job.status !== 'archived');
  const scheduledJobs = activeJobs.filter((job) => job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours, workingWeekdays);
  const readinessRank = (status: Job['status']) => (status === 'in_progress' ? 0 : status === 'new_lead' ? 1 : 2);
  const unscheduledJobs = activeJobs
    .filter((job) => !job.scheduled_for)
    .sort((a, b) => readinessRank(a.status) - readinessRank(b.status));

  // TWO POPULATIONS, AND THEY ARE NOT THE SAME NUMBER.
  //
  // The nav rail's Schedule badge counts approved work with no date
  // (status === 'in_progress' && !scheduled_for — see api/account/status).
  // This page's counter used to count EVERY unscheduled active job, quotes
  // nobody has accepted included. So the rail said 3, the page said 4, and
  // nothing on either of them said why. The counter below now counts exactly
  // what the rail counts, and the banner names the remainder out loud instead
  // of folding it in.
  const approvedUnscheduled = unscheduledJobs.filter((job) => job.status === 'in_progress').length;
  const unapprovedUnscheduled = unscheduledJobs.length - approvedUnscheduled;
  // So one unapproved quote can be opened directly instead of by opening a list
  // and hunting through it. `unscheduledJobs` is sorted approved-first, so this
  // is also the card the queue focuses when there are several.
  const firstUnapprovedId = unscheduledJobs.find((job) => job.status === 'new_lead')?.id ?? null;

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const assignmentsByJob = await listCrewAssignmentsForJobs(
    supabase,
    accountId,
    activeJobs.map((job) => job.id)
  );
  const crewInitialsById = new Map(crew.map((member) => [member.id, crewInitials(member.name)]));
  const scheduleRequestByJob = await listActiveScheduleRequests(supabase, accountId, unscheduledJobs.map((job) => job.id));

  // Self-serve bookings that have not been answered. These are NOT in
  // unscheduledJobs above and must never be: they are not work waiting for a
  // date, they are a customer waiting for a yes.
  const pendingBookingRows = await listPendingBookings(supabase, accountId);

  const { year, monthIndex } = parseMonthParam(searchParams.month);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<{ day: number; dateKey: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, dateKey: toDateKey(year, monthIndex, day) });
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const availabilityBlocks = await listUpcomingBlocks(supabase, accountId, todayKey);

  // Recurring visits past the horizon.
  //
  // A plan puts its next few visits on the calendar as real jobs the moment
  // it's created. Everything after that is still only a cadence, so it's drawn
  // from the plan itself — the month shows the whole commitment, not just the
  // part that has been materialized. A visit that already HAS a job is skipped
  // here, or the same afternoon would appear twice.
  const materializedVisits = new Set(
    jobs
      .filter((job) => job.recurring_plan_id && job.recurring_visit_date)
      .map((job) => `${job.recurring_plan_id}:${job.recurring_visit_date}`),
  );
  // A WEEK EITHER SIDE OF THE MONTH, NOT THE MONTH.
  //
  // The Week view snaps to a calendar week, so the week containing the 1st
  // reaches back into the previous month and the week containing the last day
  // reaches into the next. Projecting only the month meant those spill days
  // showed their jobs but silently dropped their recurring visits — a Monday
  // that reads empty in one view and busy in another.
  const plannedVisits = projectPlanVisits(
    await listRecurringPlans(supabase, accountId),
    {
      fromKey: addDaysToDateKey(toDateKey(year, monthIndex, 1), -7),
      toKey: addDaysToDateKey(toDateKey(year, monthIndex, daysInMonth), 7),
    },
    undefined,
    materializedVisits,
  );

  // Days at/over the daily hours capacity ("full"), and a reason map for the soft
  // warning shown when you drag a job onto a full or blocked day (you can override).
  const jobBufferMinutes = Number((account as { job_buffer_minutes?: number } | null)?.job_buffer_minutes) || 0;
  const hoursByDateForCalendar = computeHoursByDate(
    // scheduled_until included so a multi-day job marks every day it runs as
    // busy, not just the first ones.
    scheduledJobs.map((job) => ({
      scheduled_for: job.scheduled_for,
      scheduled_until: job.scheduled_until ?? null,
      estimated_hours: job.estimated_hours,
    })),
    scheduleDayHours,
    jobBufferMinutes,
    workingWeekdays,
  );
  // WORK THAT CANNOT BE COUNTED, COUNTED SEPARATELY.
  //
  // computeHoursByDate above skips a job whose estimated hours come to nothing,
  // and it is right to: the same function decides which slots the public
  // booking page offers, and inventing a duration there would close days that
  // are genuinely free. But the calendar was then drawing a Tuesday with three
  // unestimated jobs on it as "0 / 8 hrs" under a lime "up to half full" band —
  // emptier-looking than a day with nothing on it at all.
  const unknownDurationByDate = countUnknownDurationByDate(scheduledJobOccurrences);
  const fullDates: string[] = [];
  for (const [key, hrs] of hoursByDateForCalendar) if (hrs >= scheduleDayHours) fullDates.push(key);
  const unavailableDays: Record<string, string> = {};
  for (const key of fullDates) unavailableDays[key] = `That day's ${scheduleDayHours}h capacity is already full.`;
  for (const block of availabilityBlocks) {
    for (let i = 0; i < 400; i++) {
      const key = addDaysToDateKey(block.start_date, i);
      if (key > block.end_date) break;
      unavailableDays[key] = block.reason ? `Blocked off — ${block.reason}.` : 'This day is blocked off.';
    }
  }
  // The day the mobile agenda opens on: the one asked for if it belongs to the
  // month being rendered, else today, else the 1st. Never a date outside the
  // grid — the agenda's five-day strip and its month picker read the same weeks.
  const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const requestedDay = typeof searchParams.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.day)
    ? searchParams.day
    : null;
  const initialDayKey = requestedDay?.startsWith(monthPrefix)
    ? requestedDay
    : todayKey.startsWith(monthPrefix)
      ? todayKey
      : toDateKey(year, monthIndex, 1);

  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonth = monthParam(year, monthIndex - 1);
  const nextMonth = monthParam(year, monthIndex + 1);
  const currentMonth = monthParam(now.getFullYear(), now.getMonth());
  // "Today" is dead weight while you're looking at this month — which is most
  // visits, since that's where the page lands.
  const viewingThisMonth = monthParam(year, monthIndex) === currentMonth;
  /* THE FOUR QUICK PRESETS ARE GONE. "Today 8 AM", "Tomorrow 8 AM", "Next Mon
     8 AM", "Next Fri 9 AM" — the same four guesses on every card, on a page
     that knew exactly which days were full, which were blocked, which are not
     worked at all and how many hours were left on each. The scheduling panel
     proposes days that actually have room; see lib/schedule-suggestions. */

  const clientScheduleAvailability = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index);
    const key = toDateKey(date.getFullYear(), date.getMonth(), date.getDate());
    const dayJobs = scheduledJobOccurrences.filter((job) => job.scheduled_for === key);
    const hours = dayJobs.reduce((sum, job) => sum + (Number(job.estimated_hours) || 0), 0);

    return {
      key,
      label: dayLabel(date),
      summary: `${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'}`,
      detail: hours ? `${hours} est hrs` : 'Scheduled work',
      busy: dayJobs.length > 0,
      isToday: key === todayKey,
      jobHints: dayJobs.map((job) => ({
        id: `${job.id}-${job.scheduled_for}-${job.scheduled_time ?? 'anytime'}`,
        clientName: job.client_name,
        time: formatJobTime(job.scheduled_time) || 'Time TBD',
        city: extractCity(job.address),
      })),
    };
  });

  /* THE HEADER ANSWERS THE PAGE'S OWN QUESTION NOW.
     It carried jobs, revenue and profit — the three an accounts screen would
     carry, and on a calendar the middle one was the sum of every quote in the
     window whether the work had happened or not. The questions this page exists
     for are: am I full, is anybody assigned, and is a day's work scattered.
     Revenue is real and it is not one of them; Insights is built to explain it
     and links to it from the nav.

     The costs query went with it. It fetched every cost row against thirty days
     of jobs to compute a subtraction that, on future work, was almost always
     revenue minus nothing — one round trip per page load for a figure that
     printed the figure above it. */
  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const next30Key = toDateKey(in30Days.getFullYear(), in30Days.getMonth(), in30Days.getDate());
  const scheduledNext30DayJobs = scheduledJobs.filter((job) => {
    const dateKey = job.scheduled_for as string;
    return dateKey >= todayKey && dateKey <= next30Key;
  });
  const scheduledNext30Days = scheduledNext30DayJobs.length;

  // Work starting in the next seven days with nobody on it. Seven and not
  // thirty: a job three weeks out with no crew is normal, and a job on Thursday
  // with no crew is a phone call.
  const in7Key = addDaysToDateKey(todayKey, 6);
  const unassignedThisWeek = scheduledJobs.filter((job) => {
    const dateKey = job.scheduled_for as string;
    return dateKey >= todayKey && dateKey <= in7Key && (assignmentsByJob[job.id]?.length ?? 0) === 0;
  }).length;

  /* WHO IS ALREADY BOOKED, BY DAY.
     From the assignments and scheduled jobs already in hand, so it costs no
     extra query. The scheduling panel reads it to say "already on 2 jobs that
     day" beside a name — the alternative is assigning somebody to two places
     at once and finding out on the morning of the work.

     Duplicates are kept rather than de-duplicated: two entries for the same
     crew member on the same date is two jobs, which is exactly the count the
     panel prints. */
  const busyCrewByDate: Record<string, string[]> = {};
  for (const job of scheduledJobs) {
    const dateKey = job.scheduled_for as string;
    const assigned = assignmentsByJob[job.id] ?? [];
    if (assigned.length === 0) continue;
    (busyCrewByDate[dateKey] ??= []).push(...assigned);
  }

  const scheduledJobIds = scheduledJobs.map((job) => job.id);
  const { data: crewDateTextEvents } = scheduledJobIds.length > 0
    ? await supabase
        .from('job_feed')
        .select('job_id, created_at')
        .eq('account_id', accountId)
        .in('title', ['Crew date text sent', 'Crew assignment text sent'])
        .in('job_id', scheduledJobIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<{ job_id: string; created_at: string }> };
  const crewNotifiedAtByJob = new Map<string, string>();
  for (const event of crewDateTextEvents ?? []) {
    const jobId = event.job_id as string;
    if (!crewNotifiedAtByJob.has(jobId)) crewNotifiedAtByJob.set(jobId, event.created_at as string);
  }

  // Jobs the client confirmed by text (appointment_confirmed_at set) — surfaced
  // as a ✓ on the calendar. Defensive: a read error just yields no ticks.
  const { data: confirmedRows } = scheduledJobIds.length > 0
    ? await supabase.from('jobs').select('id').eq('account_id', accountId).in('id', scheduledJobIds).not('appointment_confirmed_at', 'is', null)
    : { data: [] as Array<{ id: string }> };
  const confirmedJobIds = new Set((confirmedRows ?? []).map((row) => row.id as string));

  const [{ data: invoiceRows, error: invoiceError }, { data: paymentRows, error: paymentError }, { data: clientAccessRows, error: clientAccessError }] =
    scheduledJobIds.length > 0
      ? await Promise.all([
          supabase
            .from('invoices')
            .select('*')
            .eq('account_id', accountId)
            .in('job_id', scheduledJobIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('payments')
            .select('*')
            .eq('account_id', accountId)
            .in('job_id', scheduledJobIds)
            .order('requested_at', { ascending: false }),
          supabase
            .from('client_job_access')
            .select('job_id')
            .eq('account_id', accountId)
            .in('job_id', scheduledJobIds)
            .is('revoked_at', null),
        ])
      : [
          { data: [] as Invoice[] | null, error: null },
          { data: [] as Payment[] | null, error: null },
          { data: [] as Array<{ job_id: string }> | null, error: null },
        ];

  if (invoiceError) throw invoiceError;
  if (paymentError) throw paymentError;
  if (clientAccessError) throw clientAccessError;

  const invoicesByJob = groupByJobId((invoiceRows ?? []) as Invoice[]);
  const paymentsByJob = groupByJobId((paymentRows ?? []) as Payment[]);
  const clientAccessCountByJob = (clientAccessRows ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.job_id] = (counts[row.job_id] ?? 0) + 1;
    return counts;
  }, {});

  const calendarJobs = scheduledJobOccurrences.map((job) => {
    const badge = deriveJobListBadge(job, paymentsByJob[job.id] ?? [], invoicesByJob[job.id] ?? [], clientAccessCountByJob[job.id] ?? 0);
    return {
      id: job.id,
      occurrence_key: `${job.id}:${job.scheduled_for}`,
      client_name: job.client_name,
      short_name: shortClientName(job.client_name),
      city_label: shortCity(job.address),
      status: job.status,
      scheduled_for: job.scheduled_for,
      scheduled_time: job.scheduled_time,
      crew_notified_at: crewNotifiedAtByJob.get(job.id) ?? null,
      confirmed: confirmedJobIds.has(job.id),
      badge_label: badge.label,
      badge_tone: badge.tone,
      badge_title: badge.title ?? null,
      // What a chip needs to be worth reading before it's opened: what the job
      // is worth, how long it'll take, and who's on it. All of it is already
      // loaded — it just wasn't being passed down.
      value_label: job.quoted_amount > 0 ? formatMoney(job.quoted_amount) : null,
      value: Number(job.quoted_amount) || 0,
      hours_label: job.estimated_hours ? `${job.estimated_hours}h` : null,
      // The same figure unformatted. The time views draw a block this many
      // hours tall, and it is the difference between a job that looks like a
      // half-day and one that looks like a fifteen-minute call.
      estimated_hours: Number.isFinite(Number(job.estimated_hours)) && Number(job.estimated_hours) > 0
        ? Number(job.estimated_hours)
        : null,
      // Whether the SPAN was stated or worked out. The occurrences reaching the
      // calendar are already one per day, so this is the only thing left that
      // can tell "runs Mon–Sat, three hours a day" from "eighteen hours, which
      // is about three days of work" — and they draw differently.
      scheduled_until: job.scheduled_until ?? null,
      crew_initials: (assignmentsByJob[job.id] ?? [])
        .map((crewId) => crewInitialsById.get(crewId))
        .filter((initials): initials is string => Boolean(initials)),
      // What the work actually is. Only the mobile agenda prints it — a month
      // cell has no room for a sentence, but a full-width card does, and
      // "Dana Whitfield" alone does not tell you what you are turning up to do.
      scope_label: job.scope?.trim() || null,
    };
  });

  const crewOptions = crew.map((member) => ({
    id: member.id,
    name: member.name,
    role_label: member.role_label,
  }));

  /* --- what the queue and the scheduling panel need ------------------------
     The rows used to be server-rendered, each carrying two bound actions and a
     crew form of its own — nine jobs waiting meant eighteen buttons and
     eighteen inline panels in the markup. Selecting a job has to be client
     state, so the rows cross as plain data and the actions are called once,
     for the job actually chosen. */
  const queueJobs = unscheduledJobs.map((job) => ({
    id: job.id,
    clientName: job.client_name,
    clientPhone: job.client_phone ?? null,
    scope: job.scope?.trim() || null,
    address: job.address ?? null,
    cityLabel: extractCity(job.address),
    estimatedHours: Number.isFinite(Number(job.estimated_hours)) && Number(job.estimated_hours) > 0
      ? Number(job.estimated_hours)
      : null,
    approved: job.status === 'in_progress',
    // Against the account's own today, computed above from `now` — not in the
    // browser, where it would be the visitor's timezone.
    requestedToday: isRequestedToday(job.created_at, todayKey),
    crewIds: assignmentsByJob[job.id] ?? [],
    requestState: (() => {
      const request = scheduleRequestByJob[job.id];
      if (!request || request.status === 'selected') return 'none' as const;
      return request.status === 'needs_more_options' ? ('needs_more_options' as const) : ('sent' as const);
    })(),
    lat: job.lat != null ? Number(job.lat) : null,
    lng: job.lng != null ? Number(job.lng) : null,
  }));

  // How many jobs sit on each day, and where they are. Both feed the slot
  // suggestions: the count is what tells a day with work but no stated hours
  // from an empty one, and the places are what let a suggestion say whether the
  // job is near that day's route.
  const jobCountByDate: Record<string, number> = {};
  const placesByDate: Record<string, Array<{ lat: number; lng: number }>> = {};
  for (const occurrence of scheduledJobOccurrences) {
    const key = occurrence.scheduled_for as string;
    jobCountByDate[key] = (jobCountByDate[key] ?? 0) + 1;
    if (occurrence.lat != null && occurrence.lng != null) {
      (placesByDate[key] ??= []).push({ lat: Number(occurrence.lat), lng: Number(occurrence.lng) });
    }
  }

  // Days deliberately taken off — NOT `unavailableDays`, which also holds every
  // day that is merely full. See the note where this is passed down.
  const blockedOnlyDays: Record<string, string> = {};
  for (const block of availabilityBlocks) {
    for (let i = 0; i < 400; i++) {
      const key = addDaysToDateKey(block.start_date, i);
      if (key > block.end_date) break;
      blockedOnlyDays[key] = block.reason ? `Blocked off — ${block.reason}.` : 'This day is blocked off.';
    }
  }

  const load = loadOverWindow({
    fromKey: todayKey,
    days: 30,
    hoursByDate: Object.fromEntries(hoursByDateForCalendar),
    unknownByDate: unknownDurationByDate,
    capacityPerDay: scheduleDayHours,
    workingWeekdays,
    /* Availability blocks only. A day that is merely FULL still has capacity —
       it is spent, which is the whole point of the ratio. Passing the map that
       also holds full days would shrink the denominator every time the numerator
       grew, and a fully booked month would read as 100% however much work was
       in it. */
    blockedDays: blockedOnlyDays,
  });

  /* SCATTER IS 15 STRAIGHT-LINE MILES, and that number is a flag rather than a
     measurement. The app's own city-driving fallback is two minutes a mile
     (minutesFromMiles, ~30mph door to door), so 15 miles between a day's two
     furthest stops is about half an hour each way before anybody has picked up
     a tool — the point where a day stops being one neighborhood.

     It is haversine over coordinates the jobs already carry: no API call and no
     drive time, and a river or a highway can make nonsense of it. That is why
     the card names miles rather than minutes, says "straight line" where it is
     read, and points at the route planner rather than pretending to be one.

     Checked against this account's real data at 25 miles first, where it never
     fired: the widest day in the window is 19.5 miles across four stops, which
     is exactly the day worth looking at. */
  const scatter = daysWithScatter({ fromKey: todayKey, days: 30, placesByDate, thresholdMiles: 15 });

  /* WEATHER, FOR THE DAY VIEW ONLY, AND ONLY IF IT IS SWITCHED ON.
     The reason this was left out of the header two commits ago still holds — a
     thirty-day count of "weather conflicts" is not a number anybody acts on,
     and the forecast belongs on the day you are looking at. This is that day.

     Gated on the account's own switch before a single query runs, so an account
     with weather off pays nothing; when it is on, getForecast serves from
     weather_cache and only reaches NWS when the row is stale. One point, not one
     per job: jobsAtRisk already answers "which booked work is in trouble" and
     fetches per grid cell across up to 200 jobs, which is a digest's shape. */
  const weatherAccount = account as { weather_alerts_enabled?: boolean; service_center_lat?: number | null; service_center_lng?: number | null } | null;
  const weatherByDay = weatherAccount?.weather_alerts_enabled
    ? await outlookByDay(supabase, accountId, {
        lat: weatherAccount.service_center_lat ?? null,
        lng: weatherAccount.service_center_lng ?? null,
      })
    : {};

  /* CLOSED UNLESS ASKED FOR, ON THIS PAGE ONLY.
     normalizeMapView's absent-cookie default is 'large', which is right for
     Leads and Customers where the map IS the screen. Here the calendar is the
     screen and the map was mounting a Google map, its script, its tiles and its
     markers under it on every load — the single largest thing left on a phone
     once the settings moved off. An explicit choice still persists both ways;
     only the meaning of "never chose" changes. */
  const mapCookie = cookies().get(mapViewCookie('schedule'))?.value;
  const mapView = mapCookie ? normalizeMapView(mapCookie) : 'off';
  const mapTheme = normalizeMapTheme(cookies().get(MAP_THEME_COOKIE)?.value);
  /* THE DEFAULT WEEK IS THE WEEK THIS BUSINESS WORKS.
     Both weekend columns were on until somebody turned them off, so a Mon–Fri
     landscaper opened a seven-column week and paid for two columns of nothing
     with the width of the five that matter — measured at ~78px a weekday on a
     1920 screen, which is where the clipped labels in this pass come from.
     `booking_weekdays` is the business's own answer to the same question and is
     already loaded for the booking engine; DEFAULT_BOOKING_WEEKDAYS is Mon–Fri,
     so an account that never configured it gets the workweek too.

     ONLY THE DEFAULT. A cookie always wins, in both directions, so anybody who
     has ever pressed one of these keeps exactly what they chose. And the case
     this could get wrong — a business that works Saturdays without having said
     so — is the one the hidden-days notice was built for: it names the work on
     the missing column and puts it back in one press. */
  const weekendCookie = cookies().get(CALENDAR_WEEKEND_COOKIE)?.value;
  const weekendDays = weekendCookie
    ? normalizeWeekendDays(weekendCookie)
    : { sat: workingWeekdays.includes(6), sun: workingWeekdays.includes(0) };
  // Read server-side so the calendar renders in the right shape on the first
  // paint — and, more to the point, so stepping a month doesn't reset it.
  const calendarView = normalizeCalendarView(cookies().get(CALENDAR_VIEW_COOKIE)?.value);
  const mapPins = mapView !== 'off' ? await getMapPins(supabase, accountId) : [];

  /* A SECOND accounts SELECT USED TO SIT HERE. Eleven booking columns, fetched
     on every load of the calendar, feeding one folded status pill at the very
     bottom of the page. The pill is on the settings route now and reads them
     there, so this page makes one fewer round trip per visit than it did. */

  return (
    /* NOT .wide-shell. That caps every page it is on at 1100px and centers it,
       which on this one meant a seven-column calendar squeezed into 1100px with
       ~400px of dead gutter either side at 1920 — the grid got narrower than the
       rail beside it. This shell is fluid: it takes whatever the app rail leaves
       and spends all of it on the calendar. */
    <main className="schedule-shell">
      <ScheduleDragProvider unavailable={unavailableDays}>
      {/* CALENDAR AND THE JOBS THAT NEED A DATE, SIDE BY SIDE.
          Dragging is resolved by hit-testing whatever is under the pointer
          (ScheduleDragProvider), and nothing auto-scrolls — so the job and the
          date it is going onto have to be on screen together or the gesture is
          impossible. Stacked, they never were: the calendar ran ~700px, the map
          another ~400, and the list of unscheduled jobs started a screen and a
          half below the grid it was meant to be dragged into. */}
      {/* Above the calendar on purpose. Somebody chose a time and is waiting to
          hear back; that outranks looking at the month. */}
      <BookingRequests
        requests={toPendingBookings(pendingBookingRows, Date.now(), todayKey)}
        /* Only so the panel can say whether a SECOND choice is still free —
           second choices are never held, so one can quietly go to somebody else
           while the request waits. Null when there is nothing to compare
           against (booking off, or no open windows at all), because "gone" and
           "we can't tell" are different things to say to a contractor. */
        openSlots={
          bookingDays.length > 0
            ? bookingDays.flatMap((day) => day.slots.map((slot) => `${day.dateKey}|${slot.time}`))
            : null
        }
      />

      {/* QUEUE, CALENDAR, OPEN JOB — left to right.
          The page used to put the calendar first with the queue in a rail
          beside it, and every card in that rail carried its own inline
          scheduling form: opening one pushed the card to ~480px and shoved the
          rest of the list off screen, and at tablet widths the expanded form
          left a column of dead space next to it. The list you choose from and
          the form you fill in were the same column, fighting for it.

          The calendar stays server-rendered and is passed through as children —
          it is the most expensive thing on this page and has no business
          re-rendering because a row was selected. */}
      <ScheduleWorkbench
        jobs={queueJobs}
        crew={crewOptions}
        context={{
          todayKey,
          hoursByDate: Object.fromEntries(hoursByDateForCalendar),
          jobsByDate: jobCountByDate,
          placesByDate: placesByDate,
          capacityHours: scheduleDayHours,
          /* Availability blocks ONLY. `unavailableDays` below also holds every
             day that is merely FULL, and a full day is one the ranking should
             put last rather than never mention — passing that map would have
             hidden every busy day from the suggestions instead of ordering
             them. */
          blockedDays: blockedOnlyDays,
          workingWeekdays,
          workdayStart: (account as { workday_start?: string } | null)?.workday_start ?? null,
          busyCrewByDate,
        }}
        clientAvailability={clientScheduleAvailability}
      >
      <section className="panel workspace-section-card schedule-calendar-panel">
        {/* Two rows, not six. The page used to spend ~470px on desktop and
            ~640px on mobile introducing itself — an eyebrow, a title, a lead
            paragraph, an action row, a metric card, then a SECOND eyebrow and
            heading for the same calendar — before showing a single date. */}
        <header className="schedule-bar">
          {/* No "SCHEDULE" eyebrow: the nav already marks where you are and the
              heading says it again. It cost a line on every screen size. */}
          <div className="schedule-bar-id">
            <h1 className="workspace-title">Job calendar</h1>
            {/* THE PHONE'S VERSION OF THE FOUR STAT CARDS. Those cards are 4
                tiles of an icon, a figure and a caption; at 390px they either
                went two-up at ~168px each — where "Costs logged" truncated — or
                four-up at 84px, which fits nothing. One sentence carries the
                same three numbers and wraps instead of clipping. It is
                aria-hidden because the cards below say all of it again to a
                screen reader, with links attached. */}
            {/* NO LONGER CARRIES "N need dates". That was the fourth control
                saying it, and it was one of the two that counted every
                unscheduled job while the other two counted only approved work —
                so the same page printed 11 and 3 for the same question. The bar
                below owns that number now, and says which is which. */}
            <p className="sched-sum" aria-hidden="true">
              <span><strong>{load.percent === null ? '—' : `${load.percent}%`}</strong> booked</span>
              <span><strong>{scheduledNext30Days}</strong> jobs · 30d</span>
              {unassignedThisWeek > 0 ? <span><strong>{unassignedThisWeek}</strong> need crew</span> : null}
            </p>
          </div>

          <div className="schedule-stats">
            {/* HOW FULL, WHICH IS THE QUESTION THE PAGE IS FOR.
                Booked hours against the hours there are to book: working days
                in the window that are not blocked, times the day's own figure.
                Over 100% is its own state and not a bar that stops at full — a
                month booked to 34 of 30 days is a promise somebody breaks.

                The jobs count rides in the caption rather than taking a card of
                its own. It is the same window and the same work, and it was
                answering "how much" with a number that says nothing about
                whether it fits. */}
            <Link
              className={`sched-stat${load.percent !== null && load.percent > 100 ? ' needs' : ''}`}
              href="/dashboard/schedule/settings"
              aria-label={
                load.percent === null
                  ? `No working days in the next 30 days, so there is no capacity to book against. ${scheduledNext30Days} jobs are scheduled.`
                  : `${load.percent} percent booked over the next 30 days: ${load.bookedHours} of ${load.capacityHours} hours across ${load.workingDays} working days, holding ${scheduledNext30Days} jobs.${load.unknownJobs > 0 ? ` ${load.unknownJobs} of them have no duration set and are not in that total.` : ''} Opens schedule settings, where the working week and the hours in a day are set.`
              }
              title={
                load.percent === null
                  ? 'No working days in the next 30 days'
                  : `${load.bookedHours} of ${load.capacityHours} hrs across ${load.workingDays} working days${load.unknownJobs > 0 ? ` · ${load.unknownJobs} ${load.unknownJobs === 1 ? 'job has' : 'jobs have'} no duration set, and are not counted` : ''}`
              }
            >
              <StatIcon shape="gauge" />
              <strong>{load.percent === null ? '—' : `${load.percent}%`}</strong>
              <small>Booked · {scheduledNext30Days} jobs</small>
            </Link>

            {/* WORK THIS WEEK WITH NOBODY ON IT. Amber only when there is some:
                the card that is asking for something should not look like the
                ones that are not. */}
            <Link
              className={`sched-stat${unassignedThisWeek > 0 ? ' needs' : ''}`}
              href="/dashboard/crew"
              aria-label={
                unassignedThisWeek > 0
                  ? `${unassignedThisWeek} ${unassignedThisWeek === 1 ? 'job' : 'jobs'} in the next 7 days have no crew assigned`
                  : 'Every job in the next 7 days has crew assigned'
              }
            >
              <StatIcon shape="people" />
              <strong>{unassignedThisWeek}</strong>
              <small>Need crew · 7d</small>
            </Link>

            {/* DAYS WHOSE STOPS ARE A LONG WAY APART. Straight-line, said out
                loud, and pointed at the planner that can do better than a
                straight line. */}
            <Link
              className={`sched-stat${scatter.days > 0 ? ' needs' : ''}`}
              href="/dashboard/schedule/plan"
              aria-label={
                scatter.days > 0
                  ? `${scatter.days} ${scatter.days === 1 ? 'day' : 'days'} in the next 30 have stops more than 15 miles apart in a straight line, the widest ${scatter.worstMiles} miles. Opens the route planner.`
                  : 'No day in the next 30 has stops more than 15 miles apart. Opens the route planner.'
              }
              title={
                scatter.worstKey
                  /* dayLabel and not the raw key: "2026-08-17" is a database
                     value, and this is the one string on the card a person
                     reads to decide whether to go and look at that day. */
                  ? `Widest day: ${scatter.worstMiles} miles between stops on ${dayLabel(parseDateKey(scatter.worstKey))}. Straight-line, not drive time.`
                  : 'Straight-line distance between the two furthest stops on a day, not drive time'
              }
            >
              <StatIcon shape="route" />
              <strong>{scatter.days}</strong>
              <small>Spread out · 30d</small>
            </Link>
            {/* NO WEATHER CARD, AND IT IS THE ONE THING ON THE LIST THAT IS
                MISSING. A forecast is a network call per load, on a page that
                just gave one up — and the weather panel it would duplicate is on
                the settings route. It belongs on the day you are looking at
                rather than in a thirty-day count; see the Day view. */}
          </div>

        </header>

        {/* THE ONE THING THIS PAGE IS FOR, SAID ONCE. Replaces the primary
            button, the attention banner, the summary-line counter and the
            fourth stat card — four controls, two different numbers, one
            destination. It renders at every width: the banner used to appear
            only below 1280 on the theory that the desktop rail said it already,
            which left the desktop with a button that named a count and no
            statement of what the count was made of. */}
        <ScheduleQueueBar
          approved={approvedUnscheduled}
          unapproved={unapprovedUnscheduled}
          firstUnapprovedId={firstUnapprovedId}
        />

        <ScheduleCalendar
          monthNav={
            <div className="month-nav">
              <Link href={`/dashboard/schedule?month=${prevMonth}`} className="month-nav-arrow" aria-label="Previous month">←</Link>
              <h2 className="month-nav-label">{monthLabel}</h2>
              <Link href={`/dashboard/schedule?month=${nextMonth}`} className="month-nav-arrow" aria-label="Next month">→</Link>
              {/* ALWAYS ON THE ROW, disabled while you are already looking at
                  this month — the same rule the Day/Week stepper follows. It
                  used to appear only once you had navigated away, so the one
                  month you never saw the control was the month you started in,
                  and it never became a thing you knew was there. A span rather
                  than a disabled link because there is no disabled state for an
                  anchor; it keeps the shape and stops being a target. */}
              {viewingThisMonth ? (
                <span className="month-nav-today" aria-disabled="true" title="You are looking at this month">Today</span>
              ) : (
                <Link href={`/dashboard/schedule?month=${currentMonth}`} className="month-nav-today">Today</Link>
              )}
            </div>
          }
          weekendDays={weekendDays}
          initialView={calendarView}
          /* So the Day view's empty state can say what pressing it does. The
             approved count, not every unscheduled job: the other population is
             a quote nobody has accepted, and "schedule one of those" is the
             wrong offer. */
          queueCount={approvedUnscheduled}
          /* Keyed by date so stepping the day needs no round trip — the anchor
             day is client state. Empty when the feature is off. */
          weatherByDay={weatherByDay}
          /* NO RAIL TOGGLE HERE ANY MORE. It read "Show jobs (10)" one row under
             a stat that read "10 · Ready to book" and pointed at the same rail —
             the same number and the same destination, twice. The stat is the one
             that stays: it is already a link to #unscheduled-jobs and it says
             what the number means. */
          /* NO "Plan my day" HERE ANY MORE. It sat in this toolbar at every
             width, in the accent color, permanently — the loudest control on a
             page whose job is booking work, pointed at a route optimiser for
             work that is already booked. It is now secondary (the panel foot,
             below) and contextual (the mobile agenda offers it on a day that
             actually has a route to plan — see ScheduleMobileAgenda). */
          weeks={weeks}
          todayKey={todayKey}
          planned={plannedVisits}
          jobs={calendarJobs}
          crew={crewOptions}
          assignmentsByJob={assignmentsByJob}
          blocks={availabilityBlocks}
          fullDates={fullDates}
          /* The mobile agenda's inputs. Same numbers the drag guard and the
             "Full" chip already use, so a day cannot read as full in one place
             and open in another. */
          hoursByDate={Object.fromEntries(hoursByDateForCalendar)}
          /* Jobs those hours could not include, because nobody has said how
             long they take. Passed alongside rather than folded in — a count of
             unmeasured jobs is a different fact from a number of hours, and
             adding a guess would put the lie somewhere harder to find. */
          unknownDurationByDate={unknownDurationByDate}
          capacityHours={scheduleDayHours}
          blockedDays={unavailableDays}
          initialDayKey={initialDayKey}
          /* The vertical extent of the Day / Week / Crew views. The axis grows
             past these for anything booked outside them, so an early start is
             never drawn off the top of the grid. */
          workdayStart={(account as { workday_start?: string } | null)?.workday_start ?? null}
          workdayEnd={(account as { workday_end?: string } | null)?.workday_end ?? null}
          /* So the Year view can say what a month's capacity is. Same list the
             booking engine and the weekend default read. */
          workingWeekdays={workingWeekdays}
        />

        <div className="schedule-panel-foot">
          <p>Select a job to reschedule it, remove it from the schedule, or manage crew.</p>
          <div className="schedule-panel-foot-links">
            {/* Secondary, and phrased as what it does rather than as a slogan. */}
            <Link href="/dashboard/schedule/plan" className="schedule-foot-plan">
              <ActionIcon name="plan" />
              Plan today&apos;s route
            </Link>
            {/* A LINK OUT, NOT A JUMP DOWN. The arrow used to be honest — the
                settings were 1,500px below this line on the same page. They are
                a route now, and this is a real target rather than the 17px of
                text it measured on a phone. */}
            <Link href="/dashboard/schedule/settings" className="schedule-foot-settings">
              Schedule settings
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
      </ScheduleWorkbench>
      </ScheduleDragProvider>

      {/* THE MAP IS THE ONLY THING LEFT DOWN HERE, and it stays because it is
          about work that is already booked rather than about how booking is
          configured. A booking link, a working-hours panel, a weather panel and
          a reminders switch used to be stacked beside it under a heading trying
          to explain what the five had in common — and they are the reason this
          page ran ~2,700px on a desktop. They are now their own route; see
          /dashboard/schedule/settings. */}
      <section className="sched-settings" id="schedule-map" aria-labelledby="schedule-map-h">
        <h2 className="sched-settings-h" id="schedule-map-h">Where the work is</h2>
        <ScheduleMap
          pins={mapPins}
          mapView={mapView}
          mapTheme={mapTheme}
          /* The same occurrences the calendar draws, as the list half. Pins
             answer "where" and nothing else — you cannot sort a map by value,
             or scan one for the two jobs in a town, and a screen reader cannot
             use it at all.

             FILTERED TO THE MONTH ON SCREEN. calendarJobs holds every scheduled
             occurrence there is, not a month's worth — the grid does the
             narrowing. Passing it whole put 124 rows under a heading reading
             "August 2026", opening on three jobs from April, June and October. */
          jobs={calendarJobs
            .filter((job) => job.scheduled_for.startsWith(monthPrefix))
            .map((job) => ({
              id: job.id,
              client_name: job.client_name,
              city_label: job.city_label,
              scheduled_for: job.scheduled_for,
              scheduled_time: job.scheduled_time,
              value_label: job.value_label,
              hours_label: job.hours_label,
              crew_initials: job.crew_initials,
            }))}
          monthLabel={monthLabel}
        />
      </section>
    </main>
  );
}
