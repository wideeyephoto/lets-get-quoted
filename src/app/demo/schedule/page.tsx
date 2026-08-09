import Link from 'next/link';
import { computeHoursByDate } from '@/lib/booking';
import { expandScheduledJobs, formatMoney, listJobs } from '@/lib/jobs';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { deriveJobListBadge } from '@/lib/job-badges';
import { DEMO_ACCOUNT_ID, DEMO_BOOKING } from '@/lib/demo-data';
import { demoSupabase } from '@/lib/demo-rows';
import ScheduleCalendar, { type CalendarCell, type CalendarJob } from '@/app/dashboard/schedule/schedule-calendar';
import ScheduleDragProvider from '@/app/dashboard/schedule/ScheduleDragProvider';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Schedule — Live Demo' };

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shortClientName(name: string): string {
  const [first = '', last = ''] = name.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
}

function shortCity(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[1] ?? null : null;
}

/**
 * The job calendar, for a logged-out visitor.
 *
 * The REAL calendar now — the same component the app renders, with its five
 * views, its multi-day bands, its crew popover and its month navigation. The
 * demo used to draw its own 227-line month grid, which meant none of that was
 * visible to a prospect and fixes to the real one never reached them. The crew
 * initials fix earlier in this session is a case in point: it would have landed
 * on the app and left the demo showing the bug.
 *
 * `readOnly` keeps the view and weekend-day pickers working locally while
 * withholding crew assignment, which texts the person assigned.
 */
export default async function DemoSchedulePage({ searchParams }: { searchParams: { month?: string } }) {
  const [jobs, crew] = await Promise.all([
    listJobs(demoSupabase, DEMO_ACCOUNT_ID),
    listCrew(demoSupabase, DEMO_ACCOUNT_ID, { activeOnly: true }),
  ]);

  const now = new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? '');
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();

  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push({ day, dateKey: toDateKey(year, monthIndex, day) });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const scheduledJobs = jobs.filter((job) => job.status !== 'archived' && job.scheduled_for);
  const occurrences = expandScheduledJobs(scheduledJobs, 8, DEMO_BOOKING.weekdays as unknown as number[]);
  const assignmentsByJob = await listCrewAssignmentsForJobs(demoSupabase, DEMO_ACCOUNT_ID, scheduledJobs.map((job) => job.id));
  const crewInitialsById = new Map(
    crew.map((member) => [
      member.id,
      member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''),
    ]),
  );

  // Built exactly as the app builds them — including the badge, which is
  // derived from payments and invoices rather than asserted. The demo has no
  // invoices attached to these occurrences, so the badge falls back to the
  // job's own status, which is the same thing a new account sees.
  const calendarJobs: CalendarJob[] = occurrences.map((job) => {
    const badge = deriveJobListBadge(job, [], [], 0);
    return {
      id: job.id,
      occurrence_key: `${job.id}:${job.scheduled_for}`,
      client_name: job.client_name,
      short_name: shortClientName(job.client_name),
      city_label: shortCity(job.address),
      status: job.status,
      scheduled_for: job.scheduled_for,
      scheduled_time: job.scheduled_time,
      crew_notified_at: null,
      confirmed: false,
      badge_label: badge.label,
      badge_tone: badge.tone,
      badge_title: badge.title ?? null,
      value_label: job.quoted_amount > 0 ? formatMoney(job.quoted_amount) : null,
      hours_label: job.estimated_hours ? `${job.estimated_hours}h` : null,
      // Sizes the block in the Day / Week / Crew views. Built the same way the
      // real page builds it so the demo cannot show a shape the app never does.
      estimated_hours: Number.isFinite(Number(job.estimated_hours)) && Number(job.estimated_hours) > 0
        ? Number(job.estimated_hours)
        : null,
      // Same as the real page: an entered range spreads its hours evenly, a
      // guessed one fills day after day. The demo must not show a shape the
      // app never draws.
      scheduled_until: job.scheduled_until ?? null,
      crew_initials: (assignmentsByJob[job.id] ?? [])
        .map((crewId) => crewInitialsById.get(crewId))
        .filter((value): value is string => Boolean(value)),
      scope_label: job.scope,
    };
  });

  /* THE MONTH VIEW IS A CAPACITY OVERVIEW NOW, so a demo that passes no hours
     would draw "3 jobs" over "0 / 8 hrs" in the same cell — a contradiction, on
     the page we point strangers at. Same helper the real page uses. */
  const DEMO_DAY_HOURS = 8;
  const hoursByDate = computeHoursByDate(
    scheduledJobs.map((job) => ({
      scheduled_for: job.scheduled_for,
      scheduled_until: job.scheduled_until ?? null,
      estimated_hours: job.estimated_hours,
    })),
    DEMO_DAY_HOURS,
    0,
    [...DEMO_BOOKING.weekdays],
  );
  const fullDates = [...hoursByDate.entries()].filter(([, hrs]) => hrs >= DEMO_DAY_HOURS).map(([key]) => key);

  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const previous = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  const monthHref = (date: Date) => `/demo/schedule?month=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Schedule</p>
          <h2>Job calendar</h2>
        </div>

        {/* The drag provider is what couples the (server-rendered) unscheduled
            list to the grid. The demo has no unscheduled list, but the calendar
            calls useScheduleDrag unconditionally, so the provider has to be
            here or it throws. */}
        <ScheduleDragProvider>
          <ScheduleCalendar
            weeks={weeks}
            todayKey={toDateKey(now.getFullYear(), now.getMonth(), now.getDate())}
            jobs={calendarJobs}
            crew={crew.map((member) => ({ id: member.id, name: member.name, role_label: member.role_label }))}
            assignmentsByJob={assignmentsByJob}
            initialDayKey={toDateKey(now.getFullYear(), now.getMonth(), now.getDate())}
            hoursByDate={Object.fromEntries(hoursByDate)}
            capacityHours={DEMO_DAY_HOURS}
            fullDates={fullDates}
            /* The demo account's own working hours — see demo-rows. */
            workdayStart="07:30"
            workdayEnd="17:00"
            monthNav={
              <div className="calendar-monthnav">
                <Link href={monthHref(previous)} className="btn ghost" aria-label="Previous month">←</Link>
                <strong>{new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
                <Link href={monthHref(next)} className="btn ghost" aria-label="Next month">→</Link>
              </div>
            }
            basePath="/demo"
            readOnly
            key={monthKey}
          />
        </ScheduleDragProvider>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Drag work onto a day</h2>
        </div>
        <p className="workspace-card-copy">
          In your own account you can drag an unscheduled job straight onto a date, assign crew from the
          calendar, and text them the day — this demo account is read-only.
        </p>
        <a href={APP_SIGNUP_URL} className="btn primary">
          Build my free site
        </a>
      </section>
    </main>
  );
}
