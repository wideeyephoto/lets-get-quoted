import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireOwnerContext } from '@/lib/auth';
import { getMapPins } from '@/lib/map-pins';
import { CALENDAR_VIEW_COOKIE, CALENDAR_WEEKEND_COOKIE, MAP_THEME_COOKIE, mapViewCookie, normalizeCalendarView, normalizeMapTheme, normalizeMapView, normalizeWeekendDays } from '@/lib/dashboard-views';
import { expandScheduledJobs, formatJobTime, formatMoney, listJobs, addDaysToDateKey, type Job } from '@/lib/jobs';
import { computeHoursByDate } from '@/lib/booking';
import { bookingAvailabilityFromAccount, normalizeBookingWeekdays } from '@/lib/booking-availability';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { deriveJobListBadge } from '@/lib/job-badges';
import type { Invoice } from '@/lib/invoices';
import type { Payment } from '@/lib/payments';
import ActionIcon from '@/components/action-icon';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import { scheduleJobAction, sendClientScheduleOptionsAction, updateJobCrewAction } from '../jobs/actions';
import { updateCrewAction } from '../crew/actions';
import { listActiveScheduleRequests } from '@/lib/scheduling';
import { listRecurringPlans, projectPlanVisits } from '@/lib/recurring';
import { getAvailableBookingDays } from '@/lib/booking';
import ScheduleCalendar from './schedule-calendar';
import ScheduleDock from './ScheduleDock';
import ScheduleMap from './ScheduleMap';
import ClientScheduleOptionsCalendar from './client-schedule-options-calendar';
import JobDragHandle from './JobDragHandle';
import ScheduleDragProvider from './ScheduleDragProvider';
import AutomationLink from '@/components/automation-link';
import { listUpcomingBlocks } from '@/lib/availability-blocks';
import WorkingHoursPanel from '@/components/working-hours-panel';
import BookingRequests from './BookingRequests';
import { listPendingBookings, toPendingBookings } from '@/lib/booking-requests';

const STATUS_LABEL: Record<Job['status'], string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

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

function addDaysToKey(date: Date, days: number): string {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return toDateKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
}

function nextWeekdayKey(date: Date, weekday: number): string {
  const nextDate = new Date(date);
  const distance = (weekday + 7 - nextDate.getDay()) % 7 || 7;
  nextDate.setDate(nextDate.getDate() + distance);
  return toDateKey(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
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

// Marks for the four header stats. Drawn here rather than pulled from the baked
// icon set — that set is trade glyphs (wrench, droplet, roller) for contractor
// sites, and none of them mean "revenue". Four paths is cheaper than growing
// that set for dashboard chrome.
const STAT_PATHS: Record<string, string> = {
  briefcase: 'M3 8.5h18v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-10Zm5-1V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M3 12.5h18',
  money: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm2.6 5.2a3 3 0 0 0-2.6-1.2c-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.7.8 2.7 2-1.2 2-2.7 2a3 3 0 0 1-2.7-1.3M12 6v12',
  trend: 'M3.5 16.5 9 11l3.5 3.5L20.5 6.5M15.5 6.5h5v5',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12ZM8 3v4M16 3v4M4 10h16M8.5 13.5h.01M12 13.5h.01M15.5 13.5h.01M8.5 16.5h.01M12 16.5h.01',
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
  searchParams: { month?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const [{ data: account }, jobs, { data: site }] = await Promise.all([
    supabase.from('accounts').select('schedule_day_hours, appointment_reminders_enabled, job_buffer_minutes, booking_weekdays, workday_start, workday_end').eq('id', accountId).single(),
    listJobs(supabase, accountId),
    supabase.from('sites').select('published, subdomain').eq('account_id', accountId).maybeSingle(),
  ]);
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;
  // The working week, reused from booking: a span guessed from estimated hours
  // shouldn't spill onto days nobody works.
  const workingWeekdays = normalizeBookingWeekdays((account as { booking_weekdays?: unknown } | null)?.booking_weekdays);
  const remindersOn = Boolean((account as { appointment_reminders_enabled?: boolean } | null)?.appointment_reminders_enabled);

  // Self-serve booking link — the same public page customers use, built from the
  // site's subdomain. Only offered when the site is live with a subdomain.
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingSubdomain = site?.published ? site?.subdomain ?? null : null;
  const bookingUrl = bookingSubdomain ? `${appOrigin}/book/${bookingSubdomain}` : null;
  const bookingDays = bookingUrl ? await getAvailableBookingDays(supabase, accountId) : [];
  const openWindowCount = bookingDays.reduce((sum, day) => sum + day.slots.length, 0);

  const activeJobs = jobs.filter((job) => job.status !== 'archived');
  const scheduledJobs = activeJobs.filter((job) => job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours, workingWeekdays);
  const readinessRank = (status: Job['status']) => (status === 'in_progress' ? 0 : status === 'new_lead' ? 1 : 2);
  const unscheduledJobs = activeJobs
    .filter((job) => !job.scheduled_for)
    .sort((a, b) => readinessRank(a.status) - readinessRank(b.status));

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const assignmentsByJob = await listCrewAssignmentsForJobs(
    supabase,
    accountId,
    activeJobs.map((job) => job.id)
  );
  const crewInitialsById = new Map(crew.map((member) => [member.id, crewInitials(member.name)]));
  const crewById = new Map(crew.map((member) => [member.id, member]));
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
  const plannedVisits = projectPlanVisits(
    await listRecurringPlans(supabase, accountId),
    { fromKey: toDateKey(year, monthIndex, 1), toKey: toDateKey(year, monthIndex, daysInMonth) },
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
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonth = monthParam(year, monthIndex - 1);
  const nextMonth = monthParam(year, monthIndex + 1);
  const currentMonth = monthParam(now.getFullYear(), now.getMonth());
  // "Today" is dead weight while you're looking at this month — which is most
  // visits, since that's where the page lands.
  const viewingThisMonth = monthParam(year, monthIndex) === currentMonth;
  const quickSchedulePresets = [
    { label: 'Today 8 AM', date: todayKey, time: '08:00' },
    { label: 'Tomorrow 8 AM', date: addDaysToKey(now, 1), time: '08:00' },
    { label: 'Next Mon 8 AM', date: nextWeekdayKey(now, 1), time: '08:00' },
    { label: 'Next Fri 9 AM', date: nextWeekdayKey(now, 5), time: '09:00' },
  ];

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

  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const next30Key = toDateKey(in30Days.getFullYear(), in30Days.getMonth(), in30Days.getDate());
  const scheduledNext30DayJobs = scheduledJobs.filter((job) => {
    const dateKey = job.scheduled_for as string;
    return dateKey >= todayKey && dateKey <= next30Key;
  });
  const scheduledNext30Days = scheduledNext30DayJobs.length;
  const estimatedRevenue = scheduledNext30DayJobs.reduce((sum, job) => sum + Number(job.quoted_amount || 0), 0);
  const next30JobIds = scheduledNext30DayJobs.map((job) => job.id);
  const { data: next30Costs } = next30JobIds.length > 0
    ? await supabase
        .from('costs')
        .select('amount')
        .eq('account_id', accountId)
        .in('job_id', next30JobIds)
    : { data: [] as Array<{ amount: number | string | null }> };
  const estimatedCost = (next30Costs ?? []).reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  const estimatedProfit = estimatedRevenue - estimatedCost;

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
      hours_label: job.estimated_hours ? `${job.estimated_hours}h` : null,
      crew_initials: (assignmentsByJob[job.id] ?? [])
        .map((crewId) => crewInitialsById.get(crewId))
        .filter((initials): initials is string => Boolean(initials)),
    };
  });

  const crewOptions = crew.map((member) => ({
    id: member.id,
    name: member.name,
    role_label: member.role_label,
  }));

  const mapView = normalizeMapView(cookies().get(mapViewCookie('schedule'))?.value);
  const mapTheme = normalizeMapTheme(cookies().get(MAP_THEME_COOKIE)?.value);
  const weekendDays = normalizeWeekendDays(cookies().get(CALENDAR_WEEKEND_COOKIE)?.value);
  // Read server-side so the calendar renders in the right shape on the first
  // paint — and, more to the point, so stepping a month doesn't reset it.
  const calendarView = normalizeCalendarView(cookies().get(CALENDAR_VIEW_COOKIE)?.value);
  const mapPins = mapView !== 'off' ? await getMapPins(supabase, accountId) : [];

  const { data: bookingSettings } = await supabase
    .from('accounts')
    .select('timezone, booking_enabled, booking_weekdays, booking_windows, booking_max_per_day, booking_lead_days, instant_book_enabled, instant_book_min_amount, instant_book_radius_miles, instant_book_geo_mode, instant_book_drive_time')
    .eq('id', accountId)
    .maybeSingle();

  const blockCount = availabilityBlocks.length;
  // booking_weekdays is a stored string, not an array — read it through the same
  // normalizer the form uses so the folded header can't drift from the form.
  const bookingAvailability = bookingAvailabilityFromAccount(
    bookingSettings as Parameters<typeof bookingAvailabilityFromAccount>[0],
  );
  const bookingWeekdayCount = bookingAvailability.weekdays.length;

  // One header for the whole feature, so the folded row says whether customers
  // can actually book right now — not just that the setting exists. Clearing
  // every weekday is how you pause online booking, so it counts as paused even
  // though booking_enabled is still true.
  const bookingPaused = !bookingAvailability.enabled || bookingWeekdayCount === 0;
  const bookingStatus = !bookingUrl ? 'Not live' : bookingPaused ? 'Paused' : `${openWindowCount} open`;
  const bookingTone: 'neutral' | 'on' | 'warn' = !bookingUrl
    ? 'neutral'
    : bookingPaused || openWindowCount === 0
      ? 'warn'
      : 'on';

  return (
    <main className="wide-shell workspace-shell">
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
      />

      <div className="schedule-workbench">
      <section className="panel workspace-section-card schedule-calendar-panel">
        {/* Two rows, not six. The page used to spend ~470px on desktop and
            ~640px on mobile introducing itself — an eyebrow, a title, a lead
            paragraph, an action row, a metric card, then a SECOND eyebrow and
            heading for the same calendar — before showing a single date. */}
        <header className="schedule-bar">
          {/* No "SCHEDULE" eyebrow: the nav already marks where you are and the
              heading says it again. It cost a line on every screen size. */}
          <h1 className="workspace-title schedule-bar-id">Job calendar</h1>

          <div className="schedule-stats">
            <Link className="sched-stat" href="/dashboard/jobs" aria-label={`${scheduledNext30Days} jobs booked in the next 30 days`}>
              <StatIcon shape="briefcase" />
              <strong>{scheduledNext30Days}</strong>
              <small>Jobs · 30d</small>
            </Link>
            <Link className="sched-stat" href="/dashboard/jobs" aria-label={`${formatMoney(estimatedRevenue)} estimated revenue in the next 30 days`}>
              <StatIcon shape="money" />
              <strong>{formatMoney(estimatedRevenue)}</strong>
              <small>Revenue</small>
            </Link>
            <Link className="sched-stat" href="/dashboard/jobs" aria-label={`${formatMoney(estimatedProfit)} estimated profit in the next 30 days`}>
              <StatIcon shape="trend" />
              <strong>{formatMoney(estimatedProfit)}</strong>
              <small>Profit</small>
            </Link>
            <a
              className={`sched-stat${unscheduledJobs.length > 0 ? ' needs' : ''}`}
              href="#unscheduled-jobs"
              aria-label={`${unscheduledJobs.length} active ${unscheduledJobs.length === 1 ? 'job needs' : 'jobs need'} a scheduled date`}
            >
              <StatIcon shape="calendar" />
              <strong>{unscheduledJobs.length}</strong>
              <small>Needs date</small>
            </a>
          </div>

        </header>

        <ScheduleCalendar
          monthNav={
            <div className="month-nav">
              <Link href={`/dashboard/schedule?month=${prevMonth}`} className="month-nav-arrow" aria-label="Previous month">←</Link>
              <h2 className="month-nav-label">{monthLabel}</h2>
              <Link href={`/dashboard/schedule?month=${nextMonth}`} className="month-nav-arrow" aria-label="Next month">→</Link>
              {!viewingThisMonth && (
                <Link href={`/dashboard/schedule?month=${currentMonth}`} className="month-nav-today">Today</Link>
              )}
            </div>
          }
          weekendDays={weekendDays}
          initialView={calendarView}
          /* Beside the view switcher rather than under the stats: both decide
             what you do with the month you are looking at. */
          toolbarActions={
            <Link href="/dashboard/schedule/plan" className="action-btn action-btn--plan schedule-bar-cta">
              <ActionIcon name="plan" />
              Plan my day
            </Link>
          }
          weeks={weeks}
          todayKey={todayKey}
          planned={plannedVisits}
          jobs={calendarJobs}
          crew={crewOptions}
          assignmentsByJob={assignmentsByJob}
          blocks={availabilityBlocks}
          fullDates={fullDates}
        />

        <div className="schedule-panel-foot">
          <p>Click a job to reschedule it, remove it from the schedule, or manage crew.</p>
          <div className="schedule-panel-foot-links">
            <a href="#booking-availability">Set booking availability &darr;</a>
            <AutomationLink id="reminders" label="Appointment reminders" on={remindersOn} />
          </div>
        </div>
      </section>

      {/* The rail. Jobs first because that is the drag source and it wants to
          be level with the top of the grid; the map sits under it as context
          for the month rather than a working surface — the real map work is
          Plan my day. */}
      <aside className="schedule-rail">
      {unscheduledJobs.length > 0 ? (
        <ScheduleDock count={unscheduledJobs.length}>
        <section className="panel workspace-section-card" id="unscheduled-jobs">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Needs a date</p>
            <h2>Unscheduled jobs</h2>
            <p className="schedule-drag-hint">Drag a job onto a calendar date above to schedule it — you&apos;ll pick a start time when you drop it. Or use the buttons.</p>
          </div>
          <div className="sign-in-methods-list">
            {unscheduledJobs.map((job) => {
              const boundSchedule = scheduleJobAction.bind(null, job.id);
              const boundSendScheduleOptions = sendClientScheduleOptionsAction.bind(null, job.id);
              const boundUpdateCrew = updateJobCrewAction.bind(null, job.id, true);
              const scheduleRequest = scheduleRequestByJob[job.id];
              const assignedCrewIds = assignmentsByJob[job.id] ?? [];
              const assignedCrewIdSet = new Set(assignedCrewIds);
              const assignedCrewInitials = (assignmentsByJob[job.id] ?? [])
                .map((crewId) => crewInitialsById.get(crewId))
                .filter((initials): initials is string => Boolean(initials));
              const assignedCrewMembers = assignedCrewIds
                .map((crewId) => crewById.get(crewId))
                .filter((member): member is typeof crew[number] => Boolean(member));
              return (
                /* Tinted with the colour this job will BE once it lands on a
                   date — the calendar chips key off status, so an unscheduled
                   card and its future chip now agree. Dragging it becomes a
                   thing moving rather than a grey row turning into a gold one. */
                <div className={`sign-in-method-row schedule-method-row status-${job.status}`} key={job.id}>
                  <div className="method-info">
                    <div>
                      <Link className="method-name" href={`/dashboard/jobs/${job.id}`}>{job.client_name}</Link>
                      <span className="method-detail">
                        {STATUS_LABEL[job.status]} · {job.address || 'No address on file'} · Est. hours: {job.estimated_hours ? `${job.estimated_hours} hrs` : 'Not set'}
                      </span>
                      {scheduleRequest && scheduleRequest.status !== 'selected' ? (
                        <div>
                          <span className={`schedule-request-flag ${scheduleRequest.status === 'needs_more_options' ? 'warn' : 'pending'}`}>
                            {scheduleRequest.status === 'needs_more_options'
                              ? '● Client asked for different dates — send new ones'
                              : '● Dates sent — waiting on the client'}
                          </span>
                        </div>
                      ) : null}
                      {job.status === 'new_lead' ? (
                        <div>
                          <span className="schedule-request-flag muted">○ Quote not approved yet</span>
                        </div>
                      ) : null}
                      <div className="schedule-crew-initials" aria-label={assignedCrewInitials.length > 0 ? `Assigned crew: ${assignedCrewInitials.join(', ')}` : 'No crew assigned'}>
                        <details className="schedule-crew-picker" name={`schedule-crew-picker-${job.id}`}>
                          <summary>Crew</summary>
                          <form action={boundUpdateCrew} className="schedule-crew-picker-panel">
                            <div className="schedule-crew-picker-heading">
                              <strong>Active crew</strong>
                              <span>Add or remove crew for this job.</span>
                            </div>
                            {crew.length === 0 ? (
                              <p className="crew-assign-empty">No active crew yet. <Link href="/dashboard/crew">Add your team →</Link></p>
                            ) : (
                              <div className="schedule-crew-picker-list">
                                {crew.map((member) => (
                                  <label className="schedule-crew-picker-option" key={member.id}>
                                    <input name="crewIds" type="checkbox" value={member.id} defaultChecked={assignedCrewIdSet.has(member.id)} />
                                    <span className="schedule-crew-picker-check" aria-hidden="true">✓</span>
                                    <span className="schedule-crew-picker-copy">
                                      <strong>{member.name}</strong>
                                      <small>{member.role_label}</small>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                            <div className="schedule-crew-picker-actions">
                              <button type="submit" formAction={updateJobCrewAction.bind(null, job.id, true)} className="btn primary schedule-crew-picker-save" aria-label={`Save crew for ${job.client_name} and text newly added crew`}>Save &amp; text</button>
                              <button type="submit" formAction={updateJobCrewAction.bind(null, job.id, false)} className="btn secondary schedule-crew-picker-save" aria-label={`Save crew for ${job.client_name} without texting`}>Save without texting</button>
                            </div>
                          </form>
                        </details>
                        {assignedCrewMembers.length > 0 ? assignedCrewMembers.map((member) => (
                          <details className="schedule-crew-card" key={member.id} name={`schedule-crew-${job.id}`}>
                            <summary className="schedule-crew-badge" title={member.name}>
                              <strong>{crewInitials(member.name)}</strong>
                            </summary>
                            <div className="schedule-crew-card-panel">
                              <div className="schedule-crew-card-header">
                                <div>
                                  <strong>{member.name}</strong>
                                  <span>{member.role_label}</span>
                                </div>
                                <Link href="/dashboard/crew" className="btn secondary">Crew page</Link>
                              </div>
                              <dl className="schedule-crew-card-details">
                                <div>
                                  <dt>Phone</dt>
                                  <dd>{member.phone}</dd>
                                </div>
                                <div>
                                  <dt>Rate</dt>
                                  <dd>{member.hourly_rate > 0 ? `${formatMoney(member.hourly_rate)}/hr` : 'Not set'}</dd>
                                </div>
                              </dl>
                              <details className="schedule-crew-edit">
                                <summary className="btn secondary">Edit Crew Member</summary>
                                <form action={updateCrewAction.bind(null, member.id)} className="schedule-crew-edit-form">
                                  <label htmlFor={`scheduleCrewName-${job.id}-${member.id}`}>Name</label>
                                  <input id={`scheduleCrewName-${job.id}-${member.id}`} name="name" required defaultValue={member.name} />
                                  <label htmlFor={`scheduleCrewPhone-${job.id}-${member.id}`}>Phone</label>
                                  <input id={`scheduleCrewPhone-${job.id}-${member.id}`} name="phone" type="tel" required defaultValue={member.phone} />
                                  <label htmlFor={`scheduleCrewRole-${job.id}-${member.id}`}>Role</label>
                                  <input id={`scheduleCrewRole-${job.id}-${member.id}`} name="roleLabel" defaultValue={member.role_label} />
                                  <label htmlFor={`scheduleCrewRate-${job.id}-${member.id}`}>Hourly rate ($)</label>
                                  <input id={`scheduleCrewRate-${job.id}-${member.id}`} name="hourlyRate" type="number" min="0" step="0.01" defaultValue={member.hourly_rate} />
                                  <button type="submit" className="btn primary">Save crew member</button>
                                </form>
                              </details>
                            </div>
                          </details>
                        )) : <em>None</em>}
                      </div>
                    </div>
                  </div>
                  <div className="schedule-action-buttons">
                    <JobDragHandle jobId={job.id} jobName={job.client_name} />
                    <details className="schedule-popover" name={`schedule-popover-${job.id}`}>
                      <summary className="btn secondary">Add Start Date</summary>
                      <div className="schedule-popover-panel schedule-start-panel">
                        <form action={boundSchedule} className="schedule-inline-form schedule-start-form">
                          <div className="schedule-inline-field schedule-inline-date">
                            <ScheduledDatePicker id={`scheduledFor-${job.id}`} name="scheduledFor" required />
                          </div>
                          <div className="schedule-inline-field schedule-inline-time">
                            <TimeSlotSelect id={`scheduledTime-${job.id}`} name="scheduledTime" />
                          </div>
                          <button type="submit" className="btn primary schedule-save-button">Save Start Date</button>
                        </form>
                        <div className="schedule-preset-grid" aria-label={`Quick schedule presets for ${job.client_name}`}>
                          {quickSchedulePresets.map((preset) => (
                            <form action={boundSchedule} key={`${job.id}-${preset.label}`}>
                              <input type="hidden" name="scheduledFor" value={preset.date} />
                              <input type="hidden" name="scheduledTime" value={preset.time} />
                              <button type="submit" className="schedule-preset-button">{preset.label}</button>
                            </form>
                          ))}
                        </div>
                      </div>
                    </details>
                    <details className="schedule-popover" name={`schedule-popover-${job.id}`}>
                      <summary className="btn secondary">Let the client choose</summary>
                      <div className="schedule-popover-panel">
                        <form action={boundSendScheduleOptions} className="schedule-inline-form schedule-client-options-form">
                          <div className="schedule-client-options-intro">
                            <strong>Send up to 3 dates that you&apos;re available to your client.</strong>
                            <span>We&apos;ll email you and flag it on your dashboard the moment they respond.</span>
                          </div>
                          <div className="schedule-inline-field schedule-inline-date">
                            <label htmlFor={`scheduleClientPhone-${job.id}`}>Client mobile</label>
                            <input id={`scheduleClientPhone-${job.id}`} name="scheduleClientPhone" type="tel" defaultValue={job.client_phone ?? ''} placeholder="(248) 555-0117" />
                          </div>
                          <ClientScheduleOptionsCalendar availability={clientScheduleAvailability} />
                          <label className="sms-consent-check">
                            <input name="scheduleSmsConsent" type="checkbox" required />
                            <span>The client agreed to receive transactional scheduling texts. Reply STOP to opt out.</span>
                          </label>
                          <button type="submit" className="btn primary schedule-save-button">Send Dates to Client</button>
                        </form>
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        </ScheduleDock>
      ) : null}

      <ScheduleMap pins={mapPins} mapView={mapView} mapTheme={mapTheme} />
      </aside>
      </div>

      {/* Everything below is configured once and then rarely touched. Folded by
          default and mutually exclusive, so the page ends with a short list of
          settings rather than three screens of forms you scroll past to get
          back to the calendar. */}
      {/* Booking, availability and time off now live on their own screen —
          they had grown into three forms and a preview, which is a page, not a
          footer. This is the way in, and it reads as a status line so you can
          tell at a glance whether the public page is working. */}
      <Link className="schedule-setup-link" href="/dashboard/schedule/booking" id="booking-availability">
        <span className="schedule-setup-link-copy">
          <span className="eyebrow">Setup</span>
          <strong>Instant Online Booking and Availability</strong>
          <span>
            {bookingStatus === 'Not live'
              ? 'Publish your website to let customers book themselves.'
              : bookingPaused
                ? 'Online booking is paused — no days are open.'
                : `${bookingWeekdayCount} day${bookingWeekdayCount === 1 ? '' : 's'} a week · ${openWindowCount} open window${openWindowCount === 1 ? '' : 's'} · ${blockCount} day${blockCount === 1 ? '' : 's'} blocked off`}
          </span>
        </span>
        <span className={`schedule-setup-pill tone-${bookingTone}`}>{bookingStatus}</span>
        <span className="schedule-setup-go" aria-hidden="true">→</span>
      </Link>

      </ScheduleDragProvider>
      {/* The settings that decide when a day is full, under the calendar that
          shows it. Condensed — the summary states them; opening is only for
          changing them. */}
      <WorkingHoursPanel
        scheduleDayHours={scheduleDayHours}
        jobBufferMinutes={jobBufferMinutes}
        workdayStart={(account as { workday_start?: string } | null)?.workday_start ?? null}
        workdayEnd={(account as { workday_end?: string } | null)?.workday_end ?? null}
      />
    </main>
  );
}
