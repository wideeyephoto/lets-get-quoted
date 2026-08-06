'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SaveButton from '@/components/save-button';
import FloatingPanel from '@/components/floating-panel';
import CalendarWeekendToggles from './CalendarWeekendToggles';
import ScheduleMobileAgenda from './ScheduleMobileAgenda';
import { setCalendarViewAction, setCalendarWeekendAction } from '../view-actions';
import type { CalendarView, WeekendDays } from '@/lib/dashboard-views';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import { removeJobScheduleAction, scheduleJobAction, textCrewJobDateAction, toggleJobCrewAction } from '../jobs/actions';
import { useScheduleDrag } from './ScheduleDragProvider';
import { formatJobSchedule, formatJobTime } from '@/lib/jobs';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Five views is past what a segmented control can hold without shrinking every
// label to an abbreviation, so the switcher is a menu with room to say what
// each view is actually for.
const VIEW_OPTIONS: Array<{ id: CalendarView; label: string; hint: string; icon: string }> = [
  { id: 'month', label: 'Month', hint: 'The full grid, one cell a day', icon: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12ZM4 10h16M9.5 10v10M14.5 10v10M4 15h16' },
  { id: 'week', label: 'Week', hint: 'One week, taller cells', icon: 'M3.5 8.5h17v7h-17zM8.5 8.5v7M13 8.5v7M17 8.5v7' },
  { id: 'agenda', label: 'Agenda', hint: 'Just the days with work on them', icon: 'M4.5 7h2M10 7h9.5M4.5 12h2M10 12h9.5M4.5 17h2M10 17h9.5' },
  { id: 'timeline', label: 'Timeline', hint: 'One bar per job across the month', icon: 'M4 7.5h9M7 12h12M5 16.5h7' },
  { id: 'year', label: '12 months', hint: 'The year at a glance', icon: 'M4.5 5h6v6h-6zM13.5 5h6v6h-6zM4.5 13h6v6h-6zM13.5 13h6v6h-6z' },
];

function CalendarViewMenu({ value, onChange }: { value: CalendarView; onChange: (next: CalendarView) => void }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = VIEW_OPTIONS.find((option) => option.id === value) ?? VIEW_OPTIONS[0];

  return (
    <div className="calendar-view-menu">
      <button
        ref={buttonRef}
        type="button"
        className={`calendar-view-trigger${open ? ' open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg className="calendar-view-trigger-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={current.icon} />
        </svg>
        <span className="calendar-view-trigger-text">
          <small>View</small>
          <strong>{current.label}</strong>
        </span>
        <svg className="calendar-view-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <FloatingPanel anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} className="calendar-view-panel" width={264}>
        <div role="menu" aria-label="Calendar view">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === value}
              className={`calendar-view-option${option.id === value ? ' active' : ''}`}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
            >
              <svg className="calendar-view-option-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={option.icon} />
              </svg>
              <span className="calendar-view-option-text">
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </span>
              {option.id === value ? <span className="calendar-view-option-tick" aria-hidden="true">✓</span> : null}
            </button>
          ))}
        </div>
      </FloatingPanel>
    </div>
  );
}

export type CalendarCell = { day: number; dateKey: string } | null;

export type CalendarJob = {
  id: string;
  occurrence_key: string;
  client_name: string;
  short_name: string;
  city_label: string | null;
  status: string;
  scheduled_for: string;
  scheduled_time: string | null;
  crew_notified_at: string | null;
  confirmed: boolean;
  badge_label: string;
  badge_tone: string;
  badge_title: string | null;
  value_label: string | null;
  hours_label: string | null;
  crew_initials: string[];
  /** What the work IS. Optional because only the mobile agenda has the width to
      print it — a 33px month cell never did. */
  scope_label?: string | null;
};

export type CrewOption = {
  id: string;
  name: string;
  role_label: string;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hasJobOnDate(jobsByDate: Map<string, CalendarJob[]>, jobId: string, dateKey: string): boolean {
  return (jobsByDate.get(dateKey) ?? []).some((job) => job.id === jobId);
}

function getBandColorClass(jobId: string): string {
  let hash = 0;
  for (const character of jobId) {
    hash = (hash + character.charCodeAt(0)) % 6;
  }
  return `calendar-band-color-${hash}`;
}

// A recurring visit the plan will create on the day. Structurally kept apart
// from CalendarJob so nothing can accidentally drag it, assign crew to it, or
// link to a job page that doesn't exist yet.
export type PlannedVisit = {
  planId: string;
  planTitle: string;
  clientName: string;
  dateKey: string;
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  cycle: number;
  remainingAfter: number | null;
};

const CADENCE_WORD: Record<PlannedVisit['frequency'], string> = {
  weekly: 'weekly',
  biweekly: 'every 2 weeks',
  monthly: 'monthly',
};

// Says what it is AND that it isn't booked yet — the chip is visibly different,
// but a tooltip that only repeats the name would leave the difference to colour.
function plannedTitle(visit: PlannedVisit): string {
  const money = visit.amount > 0 ? ` · $${Math.round(visit.amount).toLocaleString('en-US')}` : '';
  const left = visit.remainingAfter != null ? ` · ${visit.remainingAfter} visit${visit.remainingAfter === 1 ? '' : 's'} left after this` : '';
  return `${visit.clientName} — ${visit.planTitle} (${CADENCE_WORD[visit.frequency]})${money}${left}. The job is created automatically on the day.`;
}

function PlannedChip({ visit }: { visit: PlannedVisit }) {
  return (
    <Link href="/dashboard/recurring" className="calendar-planned-chip" title={plannedTitle(visit)}>
      <span className="calendar-planned-mark" aria-hidden="true">↻</span>
      <span className="calendar-planned-name">{visit.clientName}</span>
      <span className="sr-only"> — recurring visit, not booked yet</span>
    </Link>
  );
}

function compareCalendarJobs(first: CalendarJob, second: CalendarJob): number {
  return `${first.scheduled_time ?? ''}${first.client_name}${first.id}`.localeCompare(`${second.scheduled_time ?? ''}${second.client_name}${second.id}`);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// "8:14 AM" -> "8:14a". A month cell is ~110px wide; the meridiem costs three
// characters that the client's name needs more.
function compactTime(time: string | null): string | null {
  const label = formatJobTime(time);
  return label ? label.replace(' AM', 'a').replace(' PM', 'p') : null;
}

function formatCrewNotifiedAt(value: string): string {
  const date = new Date(value);
  const dateText = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const timeText = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${timeText} on ${dateText}`;
}

export default function ScheduleCalendar({
  weeks,
  todayKey,
  jobs,
  planned = [],
  crew,
  assignmentsByJob,
  blocks = [],
  fullDates = [],
  monthNav,
  toolbarActions,
  weekendDays = { sat: true, sun: true },
  initialView = 'month',
  hoursByDate = {},
  capacityHours = 8,
  blockedDays = {},
  unscheduledCount = 0,
  initialDayKey,
  readOnly = false,
  basePath = '/dashboard',
}: {
  weeks: CalendarCell[][];
  /**
   * The logged-out demo. Three things on this calendar write: the weekend-days
   * cookie, the view cookie, and toggling a crew member onto a job. The first
   * two still take effect locally — they are layout, and a visitor changing the
   * shape of the grid is the point of a demo. The third is withheld outright,
   * because assigning somebody TEXTS them.
   */
  readOnly?: boolean;
  basePath?: string;
  todayKey: string;
  jobs: CalendarJob[];
  /** Recurring visits whose job doesn't exist yet. Never treated as a job. */
  planned?: PlannedVisit[];
  crew: CrewOption[];
  assignmentsByJob: Record<string, string[]>;
  blocks?: Array<{ start_date: string; end_date: string; reason: string | null }>;
  fullDates?: string[];
  /** Server-rendered month arrows + label, so they share the toolbar row. */
  monthNav?: ReactNode;
  /** Sits beside the view switcher — Plan my day belongs with the controls that
      decide what you're looking at, not floating under the stats. */
  toolbarActions?: ReactNode;
  /** Seeded from the cookie server-side so the grid never flashes 7 columns. */
  weekendDays?: WeekendDays;
  /** Ditto for the shape of the calendar — see CALENDAR_VIEW_COOKIE. */
  initialView?: CalendarView;
  /* --- the mobile agenda's inputs. All optional and all additive: the desktop
     calendar reads none of them. --- */
  /** Booked hours per date, buffer included. Drives the capacity line. */
  hoursByDate?: Record<string, number>;
  capacityHours?: number;
  /** Date key -> why the day is unavailable. Same map the drag guard uses. */
  blockedDays?: Record<string, string>;
  unscheduledCount?: number;
  /** Which day the agenda opens on — today, unless you navigated elsewhere. */
  initialDayKey?: string;
}) {
  const fullSet = useMemo(() => new Set(fullDates), [fullDates]);

  // Local state so a toggle lands instantly; the cookie write is fire-and-forget
  // and only decides what the NEXT page load starts with.
  const [days, setDays] = useState<WeekendDays>(weekendDays);
  function updateDays(next: WeekendDays) {
    setDays(next);
    if (readOnly) return;
    void setCalendarWeekendAction(next).catch(() => {});
  }

  // Real weekday indexes (0=Sun … 6=Sat), kept rather than re-indexed: the
  // multi-day job bars read the neighbouring date off this index, and a
  // renumbered array would make Friday think Sunday was next to it.
  const visibleDays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((d) => (d !== 0 || days.sun) && (d !== 6 || days.sat)),
    [days],
  );
  const router = useRouter();
  const [assignments, setAssignments] = useState(assignmentsByJob);
  const [openOccurrenceKey, setOpenOccurrenceKey] = useState<string | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  // When true, adding a crew member to a job texts them the assignment. Toggled
  // per session from the crew popover; only affects assigns (never unassigns).
  const [notifyCrew, setNotifyCrew] = useState(true);
  const [, startTransition] = useTransition();
  // Seeded from the cookie, not hardcoded to 'month'. Stepping a month is a
  // real navigation, so a purely local view was thrown away on every arrow
  // click. Local state still drives the UI instantly; the cookie write is
  // fire-and-forget and decides what the NEXT load starts with.
  const [calendarView, setCalendarViewState] = useState<CalendarView>(initialView);
  const setCalendarView = (next: CalendarView) => {
    setCalendarViewState(next);
    if (readOnly) return;
    startTransition(async () => { await setCalendarViewAction(next); });
  };
  // Drag-to-schedule is coordinated by the shared provider so the (server-
  // rendered) unscheduled list and this calendar share one drag session.
  const { beginDrag, overDateKey, draggingJobId, armedJob, placeArmed } = useScheduleDrag();

  // Keep local optimistic state in sync once the server revalidates this
  // route's data (e.g. after a toggle round-trips, or on manual refresh).
  useEffect(() => {
    setAssignments(assignmentsByJob);
  }, [assignmentsByJob]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    for (const job of jobs) {
      const bucket = map.get(job.scheduled_for) ?? [];
      bucket.push(job);
      map.set(job.scheduled_for, bucket);
    }
    return map;
  }, [jobs]);

  const openJob = openOccurrenceKey ? jobs.find((job) => job.occurrence_key === openOccurrenceKey) ?? null : null;
  const openJobAssignedMembers = openJob
    ? (assignments[openJob.id] ?? [])
      .map((id) => crew.find((member) => member.id === id))
      .filter((member): member is CrewOption => Boolean(member))
    : [];

  const weekAtAGlance = useMemo(() => {
    return weeks.find((week) => week.some((cell) => cell?.dateKey === todayKey))
      ?? weeks.find((week) => week.some((cell) => cell && (jobsByDate.get(cell.dateKey)?.length ?? 0) > 0))
      ?? weeks.find((week) => week.some(Boolean))
      ?? [];
  }, [jobsByDate, todayKey, weeks]);

  const visibleWeeks = useMemo(() => calendarView === 'week' ? [weekAtAGlance] : weeks, [calendarView, weekAtAGlance, weeks]);

  // Every real day in the month, in order. Padding cells are null, so filtering
  // them out leaves exactly the month — which is what both new views count in.
  const monthDays = useMemo(
    () => weeks.flat().filter((cell): cell is Exclude<CalendarCell, null> => Boolean(cell)),
    [weeks],
  );

  // Agenda: only the days that have work on them. A month of empty rows is the
  // month grid with extra scrolling.
  const plannedByDate = useMemo(() => {
    const map = new Map<string, PlannedVisit[]>();
    for (const visit of planned) {
      const bucket = map.get(visit.dateKey) ?? [];
      bucket.push(visit);
      map.set(visit.dateKey, bucket);
    }
    return map;
  }, [planned]);

  const agendaDays = useMemo(
    () =>
      monthDays
        .map((cell) => ({
          cell,
          dayJobs: [...(jobsByDate.get(cell.dateKey) ?? [])].sort(compareCalendarJobs),
          dayPlanned: plannedByDate.get(cell.dateKey) ?? [],
        }))
        // A day whose only entry is a recurring visit still belongs in the
        // agenda — leaving it out is the whole complaint this fixes.
        .filter((entry) => entry.dayJobs.length > 0 || entry.dayPlanned.length > 0),
    [monthDays, jobsByDate, plannedByDate],
  );

  // Timeline: one row per JOB, not per occurrence. `jobs` arrives already
  // expanded to a row per day, so this folds those back into a first and last
  // column — which is the only view that shows a multi-day job as one thing.
  const timelineRows = useMemo(() => {
    const columnByDate = new Map(monthDays.map((cell, index) => [cell.dateKey, index]));
    const byJob = new Map<string, { job: CalendarJob; first: number; last: number }>();

    for (const job of jobs) {
      const column = columnByDate.get(job.scheduled_for);
      // A job running in from the previous month has occurrences outside this
      // grid; the ones inside it still place the bar correctly.
      if (column === undefined) continue;
      const row = byJob.get(job.id);
      if (!row) {
        byJob.set(job.id, { job, first: column, last: column });
        continue;
      }
      // Keep the earliest occurrence as the row's representative so its time,
      // and the popover it opens, belong to day one.
      if (column < row.first) {
        row.first = column;
        row.job = job;
      }
      if (column > row.last) row.last = column;
    }

    return [...byJob.values()].sort(
      (a, b) => a.first - b.first || b.last - b.first - (a.last - a.first) || a.job.client_name.localeCompare(b.job.client_name),
    );
  }, [jobs, monthDays]);

  // Work booked on each weekend day in the month on screen.
  //
  // Counted whether the column is shown or not — that is the whole point. The
  // old version only counted HIDDEN days, which meant the number existed only
  // while it was too late to be useful; a chip has to be able to say "6" before
  // you hide the day as well as after.
  //
  // Indexes are real weekday numbers (0=Sun … 6=Sat) because `weeks` keeps all
  // seven columns and hiding is a render-time concern, not a data one.
  const weekendJobCounts = useMemo(() => {
    let sun = 0;
    let sat = 0;
    for (const week of visibleWeeks) {
      const sunday = week[0];
      const saturday = week[6];
      if (sunday) sun += jobsByDate.get(sunday.dateKey)?.length ?? 0;
      if (saturday) sat += jobsByDate.get(saturday.dateKey)?.length ?? 0;
    }
    return { sun, sat };
  }, [visibleWeeks, jobsByDate]);

  const visibleWeekLayouts = useMemo(() => {
    return visibleWeeks.map((week) => {
      const laneByJobId = new Map<string, number>();
      const lanesByDate = new Map<string, Array<CalendarJob | null>>();

      for (const cell of week) {
        if (!cell) continue;
        const lanes: Array<CalendarJob | null> = [];
        const usedLanes = new Set<number>();
        const dayJobs = [...(jobsByDate.get(cell.dateKey) ?? [])].sort(compareCalendarJobs);

        for (const job of dayJobs) {
          let lane = laneByJobId.get(job.id);
          if (lane === undefined || usedLanes.has(lane)) {
            lane = 0;
            while (usedLanes.has(lane)) lane++;
            laneByJobId.set(job.id, lane);
          }
          lanes[lane] = job;
          usedLanes.add(lane);
        }

        lanesByDate.set(cell.dateKey, lanes);
      }

      const laneCount = Math.max(0, ...Array.from(lanesByDate.values()).map((lanes) => lanes.length));
      return { lanesByDate, laneCount };
    });
  }, [jobsByDate, visibleWeeks]);

  function openJobActions(occurrenceKey: string) {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(occurrenceKey);
  }

  function closeJobActions() {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(null);
  }

  function navigateToMonth(monthKey: string) {
    setCalendarView('month');
    router.push(`/dashboard/schedule?month=${monthKey}`);
  }

  const twelveMonthSummary = useMemo(() => {
    const firstVisibleCell = weeks.flat().find(Boolean);
    const baseDate = firstVisibleCell ? new Date(`${firstVisibleCell.dateKey}T00:00:00`) : new Date(`${todayKey}T00:00:00`);

    return Array.from({ length: 12 }, (_, index) => {
      const monthDate = addMonths(baseDate, index);
      const monthKey = toMonthKey(monthDate);
      const monthOccurrences = jobs
        .filter((job) => job.scheduled_for.startsWith(monthKey))
        .sort((a, b) => `${a.scheduled_for}${a.scheduled_time ?? ''}`.localeCompare(`${b.scheduled_for}${b.scheduled_time ?? ''}`));
      const uniqueJobs = Array.from(new Map(monthOccurrences.map((job) => [job.id, job])).values());

      return {
        monthKey,
        label: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        uniqueJobCount: uniqueJobs.length,
        jobs: uniqueJobs.slice(0, 3),
        extraJobCount: Math.max(0, uniqueJobs.length - 3),
      };
    });
  }, [jobs, todayKey, weeks]);

  function handleToggle(jobId: string, crewId: string) {
    // Assigning somebody to a job sends them a text. Not something a public
    // demo gets to do, and not something to fake optimistically either — the
    // popover still opens and still shows who is on the job.
    if (readOnly) return;
    const key = `${jobId}:${crewId}`;
    const wasAssigned = (assignments[jobId] ?? []).includes(crewId);

    setPendingKey(key);
    setAssignments((prev) => {
      const current = prev[jobId] ?? [];
      return {
        ...prev,
        [jobId]: wasAssigned ? current.filter((id) => id !== crewId) : [...current, crewId],
      };
    });

    startTransition(async () => {
      try {
        // Only assigns text; toggling a crew member OFF never texts regardless.
        await toggleJobCrewAction(jobId, crewId, notifyCrew);
      } catch (error) {
        console.error('Failed to update crew assignment', error);
        // Revert the optimistic update if the server call failed.
        setAssignments((prev) => {
          const current = prev[jobId] ?? [];
          const stillAssigned = current.includes(crewId);
          return {
            ...prev,
            [jobId]: stillAssigned ? current.filter((id) => id !== crewId) : [...current, crewId],
          };
        });
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <>
      {/* Month nav and view switcher share one row. They were two separate
          blocks stacked above each other, both about which dates you're
          looking at. */}
      <div className="calendar-toolbar">
        {monthNav}
        <div className="calendar-toolbar-actions">
          {toolbarActions}
          <CalendarViewMenu value={calendarView} onChange={setCalendarView} />
        </div>
      </div>

      {/* PHONES GET A DIFFERENT PAGE, NOT A NARROWER ONE. Both trees render and
          CSS picks one at 640px — see .sched-mobile / .calendar-desktop-views
          in globals.css. The job actions panel below is shared, so a card's
          Options button and a desktop chip open the same thing. */}
      <ScheduleMobileAgenda
        weeks={weeks}
        todayKey={todayKey}
        initialDayKey={initialDayKey ?? todayKey}
        jobs={jobs}
        planned={planned}
        crew={crew}
        assignments={assignments}
        hoursByDate={hoursByDate}
        capacityHours={capacityHours}
        blockedDays={blockedDays}
        unscheduledCount={unscheduledCount}
        onOpenJob={openJobActions}
      />

      <div className="calendar-desktop-views">
      {calendarView === 'agenda' ? (
        agendaDays.length === 0 ? (
          <p className="calendar-view-empty">Nothing scheduled this month.</p>
        ) : (
          <ol className="calendar-agenda">
            {agendaDays.map(({ cell, dayJobs, dayPlanned }) => (
              <li className={`calendar-agenda-day${cell.dateKey === todayKey ? ' today' : ''}`} key={cell.dateKey}>
                <div className="calendar-agenda-date">
                  <small>{WEEKDAY_LABELS[new Date(`${cell.dateKey}T00:00:00`).getDay()]}</small>
                  <strong>{cell.day}</strong>
                  {fullSet.has(cell.dateKey) ? <span className="calendar-agenda-flag" title="Daily capacity reached">Full</span> : null}
                </div>
                <div className="calendar-agenda-jobs">
                  {dayJobs.map((job) => {
                    const assignedMembers = (assignments[job.id] ?? [])
                      .map((id) => crew.find((member) => member.id === id))
                      .filter((member): member is CrewOption => Boolean(member));
                    return (
                      <button
                        type="button"
                        key={job.occurrence_key}
                        className={`calendar-agenda-job status-${job.status} ${getBandColorClass(job.id)}`}
                        onClick={() => openJobActions(job.occurrence_key)}
                      >
                        <span className="calendar-agenda-when">{formatJobTime(job.scheduled_time) ?? 'No set time'}</span>
                        <span className="calendar-agenda-who">
                          <strong>
                            {job.confirmed ? <span className="calendar-confirm-tick" title="Confirmed by client">✓</span> : null}
                            {job.client_name}
                          </strong>
                          {job.city_label ? <small>{job.city_label}</small> : null}
                        </span>
                        {/* The row has the width the month cell never had, so
                            the status label can be spelled out instead of
                            ellipsised to "WORK S…". */}
                        <span className={`calendar-agenda-badge status-${job.badge_tone}`} title={job.badge_title ?? undefined}>{job.badge_label}</span>
                        <span className="calendar-agenda-figures">
                          {job.value_label ? <em>{job.value_label}</em> : null}
                          {job.hours_label ? <i>{job.hours_label}</i> : null}
                        </span>
                        <span className="calendar-agenda-crew">
                          {assignedMembers.length > 0 ? assignedMembers.map((member) => initials(member.name)).join(' ') : '—'}
                        </span>
                      </button>
                    );
                  })}
                  {dayPlanned.map((visit) => (
                    <Link
                      key={`${visit.planId}-${visit.dateKey}`}
                      href="/dashboard/recurring"
                      className="calendar-agenda-job calendar-agenda-planned"
                      title={plannedTitle(visit)}
                    >
                      <span className="calendar-agenda-when">Recurring</span>
                      <span className="calendar-agenda-who">
                        <strong><span className="calendar-planned-mark" aria-hidden="true">↻</span>{visit.clientName}</strong>
                        <small>{visit.planTitle}</small>
                      </span>
                      <span className="calendar-agenda-badge status-neutral">Not booked yet</span>
                      <span className="calendar-agenda-figures">
                        {visit.amount > 0 ? <em>${Math.round(visit.amount).toLocaleString('en-US')}</em> : null}
                        <i>{CADENCE_WORD[visit.frequency]}</i>
                      </span>
                      <span className="calendar-agenda-crew">—</span>
                    </Link>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )
      ) : calendarView === 'timeline' ? (
        timelineRows.length === 0 ? (
          <p className="calendar-view-empty">Nothing scheduled this month.</p>
        ) : (
          <div className="calendar-timeline-scroll">
            <div
              className="calendar-timeline"
              style={{
                gridTemplateColumns: `minmax(140px, 180px) repeat(${monthDays.length}, minmax(26px, 1fr))`,
                minWidth: 180 + monthDays.length * 26,
              }}
            >
              {/* Full-height column tints, drawn first so the bars paint over
                  them. Without something to count against, a bar 20 columns
                  along is impossible to place by eye. Explicit end line rather
                  than -1, which resolves against explicit rows this grid
                  doesn't have. */}
              {monthDays.map((cell, dayIndex) => {
                const weekday = new Date(`${cell.dateKey}T00:00:00`).getDay();
                const isToday = cell.dateKey === todayKey;
                if (!isToday && weekday !== 0 && weekday !== 6) return null;
                return (
                  <span
                    key={`column-${cell.dateKey}`}
                    aria-hidden="true"
                    className={`calendar-timeline-column${isToday ? ' today' : ' weekend'}`}
                    style={{ gridColumn: dayIndex + 2, gridRow: `1 / ${timelineRows.length + 2}` }}
                  />
                );
              })}
              <span className="calendar-timeline-corner" style={{ gridRow: 1 }}>Job</span>
              {monthDays.map((cell, dayIndex) => {
                const weekday = new Date(`${cell.dateKey}T00:00:00`).getDay();
                return (
                  <span
                    key={cell.dateKey}
                    style={{ gridRow: 1, gridColumn: dayIndex + 2 }}
                    className={`calendar-timeline-head${cell.dateKey === todayKey ? ' today' : ''}${weekday === 0 || weekday === 6 ? ' weekend' : ''}`}
                  >
                    {cell.day}
                  </span>
                );
              })}
              {timelineRows.map(({ job, first, last }, rowIndex) => {
                const span = last - first + 1;
                return (
                  // Both cells pinned to the same explicit row. Auto-placement
                  // won't do it: the bar has an explicit column, and an
                  // explicitly-placed item drops into the first row it FITS
                  // rather than the one its sibling name just landed in — which
                  // scattered names and bars onto different rows entirely.
                  <Fragment key={job.id}>
                    <span className="calendar-timeline-name" style={{ gridRow: rowIndex + 2, gridColumn: 1 }} title={job.client_name}>
                      {job.client_name}
                    </span>
                    <button
                      type="button"
                      className={`calendar-timeline-bar status-${job.status} ${getBandColorClass(job.id)}`}
                      // +2, not +1: column 1 is the job name.
                      style={{ gridRow: rowIndex + 2, gridColumn: `${first + 2} / span ${span}` }}
                      title={[job.client_name, `${span} day${span === 1 ? '' : 's'}`, job.badge_label, job.value_label, job.hours_label, job.city_label].filter(Boolean).join(' · ')}
                      onClick={() => openJobActions(job.occurrence_key)}
                    >
                      {/* A one-day bar is ~26px. Anything written in it comes
                          out as "8. P…", so below three days the bar is just a
                          block and the label lives in the tooltip. */}
                      {span >= 3 ? (
                        <span>
                          {span} days{job.value_label ? ` · ${job.value_label}` : ''}
                        </span>
                      ) : null}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )
      ) : calendarView === 'year' ? (
        <div className="calendar-year-grid">
          {twelveMonthSummary.map((month) => (
            <article className="calendar-year-card" key={month.monthKey}>
              <div className="calendar-year-card-header">
                <button type="button" className="calendar-year-month-link" onClick={() => navigateToMonth(month.monthKey)}>
                  {month.label}
                </button>
                <span>{month.uniqueJobCount}</span>
              </div>
              {month.jobs.length > 0 ? (
                <div className="calendar-year-jobs">
                  {month.jobs.map((job) => (
                    <button type="button" className={`calendar-year-job status-${job.status}`} key={job.occurrence_key} onClick={() => openJobActions(job.occurrence_key)}>
                      <span>{new Date(`${job.scheduled_for}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <strong>{job.client_name}</strong>
                    </button>
                  ))}
                  {month.extraJobCount > 0 ? <p className="calendar-year-more">+{month.extraJobCount} more</p> : null}
                </div>
              ) : (
                <p className="calendar-year-empty">No scheduled jobs</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="calendar-grid" style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
          {visibleDays.map((day) => (
            <div className="calendar-weekday" key={day}>{WEEKDAY_LABELS[day]}</div>
          ))}
          {visibleWeeks.map((week, weekIndex) =>
            visibleDays.map((cellIndex) => {
              const cell = week[cellIndex];
              if (!cell) {
                return <div className="calendar-cell empty" key={`${weekIndex}-${cellIndex}`} />;
              }
              const weekLayout = visibleWeekLayouts[weekIndex];
              const dayLanes = weekLayout?.lanesByDate.get(cell.dateKey) ?? [];
              const laneJobs = Array.from({ length: weekLayout?.laneCount ?? 0 }, (_, laneIndex) => dayLanes[laneIndex] ?? null);
              const previousDateKey = cellIndex > 0 ? addDaysToDateKey(cell.dateKey, -1) : null;
              const nextDateKey = cellIndex < week.length - 1 ? addDaysToDateKey(cell.dateKey, 1) : null;
              const block = blocks.find((b) => cell.dateKey >= b.start_date && cell.dateKey <= b.end_date);
              const isFull = !block && fullSet.has(cell.dateKey);
              return (
                <div
                  className={`calendar-cell${cell.dateKey === todayKey ? ' today' : ''}${overDateKey === cell.dateKey ? ' drag-over' : ''}${block ? ' blocked' : ''}${isFull ? ' full' : ''}${armedJob ? ' armable' : ''}`}
                  key={cell.dateKey}
                  data-date-key={cell.dateKey}
                  // Only a drop target while something is armed, so an ordinary
                  // click on a day still belongs to the jobs inside it.
                  role={armedJob ? 'button' : undefined}
                  tabIndex={armedJob ? 0 : undefined}
                  aria-label={armedJob ? `Schedule ${armedJob.jobName} on ${cell.dateKey}` : undefined}
                  onClick={armedJob ? () => placeArmed(cell.dateKey) : undefined}
                  onKeyDown={armedJob ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); placeArmed(cell.dateKey); }
                  } : undefined}
                >
                  <span className="calendar-day-number">{cell.day}</span>
                  {block ? <span className="calendar-blocked-chip" title={block.reason || 'Blocked off'}>Off</span> : null}
                  {isFull ? <span className="calendar-full-chip" title="Daily capacity reached">Full</span> : null}
                  <div className="calendar-day-jobs">
                    {laneJobs.map((job, laneIndex) => {
                      if (!job) {
                        return <div className="calendar-job-slot empty" key={`${cell.dateKey}-lane-${laneIndex}`} aria-hidden="true" />;
                      }
                      const continuesFromPrevious = previousDateKey ? hasJobOnDate(jobsByDate, job.id, previousDateKey) : false;
                      const continuesToNext = nextDateKey ? hasJobOnDate(jobsByDate, job.id, nextDateKey) : false;
                      const bandClass = continuesFromPrevious
                        ? continuesToNext
                          ? 'calendar-band-middle'
                          : 'calendar-band-end'
                        : continuesToNext
                          ? 'calendar-band-start'
                          : 'calendar-band-single';
                      const bandColorClass = getBandColorClass(job.id);
                      const assignedIds = assignments[job.id] ?? [];
                      const assignedMembers = assignedIds
                        .map((id) => crew.find((member) => member.id === id))
                        .filter((member): member is CrewOption => Boolean(member));
                      return (
                        <div className={`calendar-job-item calendar-band ${bandClass} ${bandColorClass} status-${job.status}`} key={job.occurrence_key}>
                          <div
                            role="button"
                            tabIndex={0}
                            className={`calendar-job-chip status-${job.status}${draggingJobId === job.id ? ' dragging' : ''}`}
                            title={[job.client_name, job.badge_label, job.value_label, job.hours_label, job.city_label, job.crew_initials.length ? `Crew: ${job.crew_initials.join(', ')}` : null, 'drag to move'].filter(Boolean).join(' · ')}
                            onPointerDown={(event) => beginDrag({ jobId: job.id, jobName: job.client_name, time: job.scheduled_time ?? '', sourceDateKey: job.scheduled_for }, event, () => openJobActions(job.occurrence_key))}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openJobActions(job.occurrence_key); } }}
                          >
                            {/* Two lines. The status badge used to take nearly
                                half the chip and still ellipsised to something
                                like "WORK S…" — the chip's own colour already
                                carries the status, and the full label is in the
                                tooltip, so that space now holds what the job is
                                worth, how long it takes, and who's on it. */}
                            <span className="calendar-job-chip-lines">
                              {/* Name first. Leading with the time meant the
                                  time filled the line on its own and the client
                                  was ellipsised away entirely — the chip told
                                  you when something was happening but never to
                                  whom. The time drops to the detail line, where
                                  it sits with the money. */}
                              <span className="calendar-job-chip-main">
                                {job.confirmed ? <span className="calendar-confirm-tick" title="Confirmed by client" aria-label="Confirmed by client">✓</span> : null}
                                {job.short_name}
                              </span>
                              {(job.scheduled_time || job.value_label) && (
                                <span className="calendar-job-chip-meta">
                                  {/* Time and money only. A 117px month cell
                                      fits about fourteen characters here;
                                      hours and crew initials were being
                                      squeezed into unreadable fragments like
                                      "1!". Both are in the tooltip, and the
                                      crew button beside the chip already shows
                                      whether anyone's assigned. */}
                                  {compactTime(job.scheduled_time) ? <b>{compactTime(job.scheduled_time)}</b> : null}
                                  {job.value_label ? <em>{job.value_label}</em> : null}
                                </span>
                              )}
                              {/* Where it is. Its own line because time and
                                  money already fill the one above, and a city
                                  squeezed in beside them would be the sort of
                                  fragment this whole pass is removing. */}
                              {job.city_label ? <span className="calendar-job-chip-city">{job.city_label}</span> : null}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={`calendar-crew-toggle${assignedMembers.length > 0 ? ' has-crew' : ''}`}
                            onClick={() => openJobActions(job.occurrence_key)}
                            title={
                              assignedMembers.length > 0
                                ? `Assigned: ${assignedMembers.map((member) => member.name).join(', ')}`
                                : 'Assign crew'
                            }
                            // The visible text is initials and a count, which
                            // reads as nonsense aloud. The names are already in
                            // the title for a mouse; this is the same thing for
                            // a screen reader.
                            aria-label={
                              assignedMembers.length > 0
                                ? `Assigned: ${assignedMembers.map((member) => member.name).join(', ')}`
                                : 'Assign crew'
                            }
                          >
                            {/* One pair of initials, then a count — NOT two pairs.
                                "GY DW" renders about 2.9rem wide, which is wider
                                than the space the name line reserves for this
                                badge, so it sat on top of the client's name in
                                any cell narrower than full screen. A count is
                                fixed-width whatever the crew is called, so the
                                reservation can be exact; the tooltip still names
                                everyone assigned. */}
                            {assignedMembers.length === 0
                              ? '+'
                              : assignedMembers.length === 1
                                ? initials(assignedMembers[0]!.name)
                                : `${initials(assignedMembers[0]!.name)}+${assignedMembers.length - 1}`}
                          </button>
                        </div>
                      );
                    })}
                    {/* Below the real work, deliberately: these are commitments
                        the plan will turn into jobs, not jobs. They sit outside
                        the lane layout because they never span days. */}
                    {(plannedByDate.get(cell.dateKey) ?? []).map((visit) => (
                      <PlannedChip key={`${visit.planId}-${visit.dateKey}`} visit={visit} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      {calendarView !== 'year' && (
        <div className="calendar-days-row">
          {/* Said once, plainly, rather than left for the owner to work out from
              a dashed border why some entries can't be dragged or assigned. */}
          {planned.length > 0 ? (
            <p className="calendar-planned-note">
              <span className="calendar-planned-mark" aria-hidden="true">↻</span>
              {planned.length} recurring {planned.length === 1 ? 'visit' : 'visits'} this month. The job for each one is
              created automatically on the morning of the visit — until then there&apos;s nothing to assign or move.{' '}
              <Link href="/dashboard/recurring">Manage plans</Link>
            </p>
          ) : null}
          <CalendarWeekendToggles days={days} onChange={updateDays} counts={weekendJobCounts} />
        </div>
      )}
      </div>

      {openJob ? (
        <div className="crew-assign-backdrop" onClick={closeJobActions}>
          <div className="crew-assign-panel schedule-job-actions-panel" onClick={(event) => event.stopPropagation()}>
            <div className="crew-assign-header">
              <div>
                <p className="crew-assign-title">{openJob.client_name}</p>
                <p className="crew-assign-sub">
                  <span className={`status-badge status-${openJob.badge_tone}`} title={openJob.badge_title ?? undefined}>{openJob.badge_label}</span>
                  <span>{formatJobSchedule(openJob.scheduled_for, openJob.scheduled_time)}</span>
                  {openJob.confirmed ? <span className="status-badge status-complete" title="The client confirmed this appointment by text">✓ Confirmed</span> : null}
                </p>
              </div>
              <button type="button" className="crew-assign-close" onClick={closeJobActions} aria-label="Close">
                ×
              </button>
            </div>

            <div className="schedule-job-actions">
              <div className="schedule-job-quick-actions">
                <Link href={`${basePath}/jobs/${openJob.id}`} className="btn secondary schedule-job-open-link">Open job</Link>
                <Link href={`${basePath}/jobs/${openJob.id}?open=costs`} className="btn secondary schedule-job-open-link">Add expense</Link>
                <Link href={`${basePath}/jobs/${openJob.id}?open=payment#request-payment`} className="btn primary schedule-job-open-link">Request payment</Link>
                <div className="schedule-crew-action-wrap">
                  <div className="schedule-crew-action-group">
                    <details className="schedule-crew-quick">
                      <summary className="btn secondary">
                        Crew
                        {openJobAssignedMembers.length > 0 ? <span>{openJobAssignedMembers.map((member) => initials(member.name)).join(' ')}</span> : null}
                      </summary>
                      <div className="schedule-crew-quick-panel">
                        <div className="schedule-job-section-heading">
                          <strong>Active crew</strong>
                          <span>Check crew on or off for this job.</span>
                        </div>
                        <label className="schedule-crew-notify-toggle">
                          <input type="checkbox" checked={notifyCrew} onChange={(event) => setNotifyCrew(event.currentTarget.checked)} />
                          <span>Text crew when I add them</span>
                        </label>
                        {crew.length === 0 ? (
                          <p className="crew-assign-empty">
                            No active crew yet. <Link href="/dashboard/crew">Add your team →</Link>
                          </p>
                        ) : (
                          <div className="crew-assign-list schedule-crew-check-list">
                            {crew.map((member) => {
                              const assignedIds = assignments[openJob.id] ?? [];
                              const isAssigned = assignedIds.includes(member.id);
                              const isRowPending = pendingKey === `${openJob.id}:${member.id}`;
                              return (
                                <button
                                  type="button"
                                  key={member.id}
                                  className={`crew-assign-option schedule-crew-check-option${isAssigned ? ' assigned' : ''}${isRowPending ? ' pending' : ''}`}
                                  onClick={() => handleToggle(openJob.id, member.id)}
                                  disabled={isRowPending}
                                  aria-pressed={isAssigned}
                                >
                                  <span className="schedule-crew-checkbox" aria-hidden="true">{isAssigned ? '✓' : ''}</span>
                                  <span className="crew-assign-option-info">
                                    <span className="crew-assign-option-name">{member.name}</span>
                                    <span className="crew-assign-option-role">{member.role_label}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                    <form action={textCrewJobDateAction.bind(null, openJob.id)}>
                      <button
                        type="submit"
                        className="schedule-crew-notify-button"
                        disabled={openJobAssignedMembers.length === 0}
                        title={openJobAssignedMembers.length === 0 ? 'Assign crew before texting the date' : 'Text assigned crew the scheduled date'}
                      >
                        Notify
                      </button>
                    </form>
                  </div>
                  <p className={`schedule-crew-notify-status${openJob.crew_notified_at ? ' notified' : ''}`}>
                    {openJob.crew_notified_at
                      ? `Crew Notified ${formatCrewNotifiedAt(openJob.crew_notified_at)}`
                      : 'Crew not notified'}
                  </p>
                </div>
              </div>
              <form action={scheduleJobAction.bind(null, openJob.id)} className="schedule-job-reschedule-form" key={`reschedule-${openJob.occurrence_key}`}>
                <div className="schedule-job-section-heading">
                  <strong>Reschedule</strong>
                  <span>Choose a new start date or time for this job.</span>
                </div>
                <div className="schedule-job-reschedule-grid">
                  <ScheduledDatePicker id={`calendarScheduledFor-${openJob.occurrence_key}`} name="scheduledFor" defaultValue={openJob.scheduled_for} required />
                  <TimeSlotSelect id={`calendarScheduledTime-${openJob.occurrence_key}`} name="scheduledTime" defaultValue={openJob.scheduled_time ?? ''} />
                </div>
                <SaveButton className="btn primary schedule-job-submit" pendingLabel="Saving..." savedLabel="Saved">Save new start date</SaveButton>
              </form>

              <div className="schedule-remove-box">
                {isConfirmingRemove ? (
                  <form action={removeJobScheduleAction.bind(null, openJob.id)} className="schedule-remove-confirm">
                    <strong>Remove this job from the schedule?</strong>
                    <span>It will move back to unscheduled jobs. Crew assignments and job details stay intact.</span>
                    <div className="schedule-remove-actions">
                      <button type="button" className="btn secondary" onClick={() => setIsConfirmingRemove(false)}>Keep scheduled</button>
                      <button type="submit" className="btn danger">Yes, remove it</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="btn secondary schedule-remove-trigger" onClick={() => setIsConfirmingRemove(true)}>Remove from schedule</button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
