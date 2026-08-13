'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SaveButton from '@/components/save-button';
import FloatingPanel from '@/components/floating-panel';
import { DayColumnMenuRows, HiddenDaysNotice } from './CalendarDayColumns';
import ScheduleDaySummary from './ScheduleDaySummary';
import ScheduleMobileAgenda from './ScheduleMobileAgenda';
import ScheduleTimeline, { type TimelineDayMeta } from './ScheduleTimeline';
import ScheduleCrewLanes from './ScheduleCrewLanes';
import ScheduleMonthCapacity from './ScheduleMonthCapacity';
import CalendarLegend from './CalendarLegend';
import { occurrenceMinutes } from '@/lib/schedule-timeline';
import { monthKeyOf, parseDateKey, shiftDateKey } from '@/lib/schedule-agenda';
import { setCalendarViewAction, setCalendarWeekendAction } from '../view-actions';
import type { CalendarView, WeekendDays } from '@/lib/dashboard-views';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import { removeJobScheduleAction, scheduleJobAction, textCrewJobDateAction, toggleJobCrewAction } from '../jobs/actions';
/* Drag is no longer coordinated here. Each surface that can be a drop target
   — the timeline columns, the capacity cells, the crew lanes — calls
   useScheduleDrag itself, because they are the ones that own a date. */
import { useModal } from './use-modal';
import { addDaysToDateKey, formatJobSchedule, formatJobTime, formatMoney, weekdayOfDateKey } from '@/lib/jobs';
import { loadOverWindow } from '@/lib/schedule-load';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Seven views is past what a segmented control can hold without shrinking every
 * label to an abbreviation, so the switcher is a menu with room to say what
 * each view is actually for.
 *
 * ORDER IS BY ZOOM: one day, a few days, a month, then the specialist views.
 *
 * EVERY NAME HERE DESCRIBES ONE CONCEPT ON EVERY SCREEN. That was not true and
 * it was the most expensive thing about this page:
 *
 *   "Agenda" meant a month-long list on a desktop and a single day on a phone
 *   "Month"  meant a capacity heatmap on a desktop and a grid of counts on a phone
 *   "Week"   meant three days on a tablet without saying so
 *
 * so a word learned in one place taught the wrong thing in the other. The names
 * now say what you get: Capacity is a capacity view, Job list is a list of jobs,
 * Crew day is one day of crew, Projects is the multi-day work, Year is a year.
 *
 * THE IDS ARE UNCHANGED ON PURPOSE. They are cookie values (CALENDAR_VIEW_COOKIE)
 * and renaming them would silently reset the view for everybody who has ever
 * chosen one. `timeline` is still the id of the view now called Projects.
 */
const VIEW_OPTIONS: Array<{ id: CalendarView; label: string; hint: string; icon: string }> = [
  { id: 'day', label: 'Day', hint: 'One day against the clock', icon: 'M6 4.5h12A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5ZM4.5 9h15M8 12.5h8M8 16h5' },
  { id: 'week', label: 'Week', hint: 'The week against the clock — sized by how long each job takes', icon: 'M3.5 5.5h17v13h-17zM3.5 9h17M8 9v9.5M12.5 9v9.5M17 9v9.5' },
  { id: 'month', label: 'Capacity', hint: 'How full each day of the month is — click a date to open it', icon: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12ZM4 10h16M9.5 10v10M14.5 10v10M4 15h16' },
  { id: 'crew', label: 'Crew day', hint: 'One lane per person, for a single day', icon: 'M4 7h16M4 12h16M4 17h16M7.5 5.5v3M13 10.5v3M9.5 15.5v3' },
  { id: 'agenda', label: 'Job list', hint: 'Every job this month as rows you can read', icon: 'M4.5 7h2M10 7h9.5M4.5 12h2M10 12h9.5M4.5 17h2M10 17h9.5' },
  { id: 'timeline', label: 'Projects', hint: 'Multi-day work as one bar per job', icon: 'M4 7.5h9M7 12h12M5 16.5h7' },
  { id: 'year', label: 'Year', hint: 'Twelve months of jobs, hours and value', icon: 'M4.5 5h6v6h-6zM13.5 5h6v6h-6zM4.5 13h6v6h-6zM13.5 13h6v6h-6z' },
];

/** The views laid out against a clock, which are the ones that step by day. */
const TIME_VIEWS = new Set<CalendarView>(['day', 'week', 'crew']);

/**
 * The views built out of day COLUMNS — the only ones the weekend toggles can
 * do anything to. See the note at their render site.
 */
const COLUMN_VIEWS = new Set<CalendarView>(['week', 'month']);

/**
 * The three you actually switch between, promoted out of the menu.
 *
 * Seven views will not fit in a segmented control — that is why the menu exists
 * and the note above still stands. But these three are the zoom level, they get
 * used constantly, and reaching them was two clicks and a read: open the menu,
 * find the row, click it. The other four are destinations you pick occasionally
 * and they stay where they are.
 */
const QUICK_VIEWS = new Set<CalendarView>(['day', 'week', 'month']);
const QUICK_VIEW_OPTIONS = VIEW_OPTIONS.filter((option) => QUICK_VIEWS.has(option.id));
const MENU_VIEW_OPTIONS = VIEW_OPTIONS.filter((option) => !QUICK_VIEWS.has(option.id));

function CalendarViewMenu({
  value,
  onChange,
  columns,
  hasProjects,
  days,
  onDaysChange,
  weekendCounts,
  weekendRangeWord,
  showDayColumns,
}: {
  value: CalendarView;
  onChange: (next: CalendarView) => void;
  /**
   * How many day columns this width can carry.
   *
   * A tablet has always shown three days when Week is picked, and has always
   * gone on calling it Week — so the control said one thing and the grid did
   * another, and there was no way to tell a deliberate three-day view from a
   * broken seven-day one. The button now says what it will actually give you.
   */
  columns: 7 | 3 | 1 | null;
  /**
   * Whether there is multi-day work to draw.
   *
   * Projects is the one view with a precondition: with nothing running across
   * days it is an empty grid, and listing a destination that is always empty
   * teaches you the menu is full of dead ends. It stays listed while you are IN
   * it — a view that vanishes from under you is worse than one that is empty.
   */
  hasProjects: boolean;
  /** The weekend switches, which are in here rather than on the row — see the
      note at the top of CalendarDayColumns. */
  days: WeekendDays;
  onDaysChange: (next: WeekendDays) => void;
  weekendCounts: { sat: number; sun: number };
  /** Which range those counts were taken over — see the prop on the rows. */
  weekendRangeWord: string;
  showDayColumns: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const current = VIEW_OPTIONS.find((option) => option.id === value) ?? VIEW_OPTIONS[0];
  // The menu holds the other four now, so it only names a view when one of
  // those is the one you are in; otherwise it is just the way to the rest.
  const inMenu = !QUICK_VIEWS.has(value);

  return (
    <div className="calendar-view-menu">
      {/* One press each, and the pressed one is the view you are in. Same
          onChange the menu rows call, so there is one path through the state. */}
      <div className="calendar-view-quick" role="group" aria-label="Calendar view">
        {QUICK_VIEW_OPTIONS.map((option) => {
          // Week on a three-column tablet is three days. Saying "Week" there is
          // the naming bug this whole pass is about, one screen size down.
          const narrowWeek = option.id === 'week' && columns === 3;
          const label = narrowWeek ? '3 days' : option.label;
          return (
            <button
              key={option.id}
              type="button"
              className={`calendar-view-quick-btn${option.id === value ? ' active' : ''}`}
              aria-pressed={option.id === value}
              title={narrowWeek ? 'Three days against the clock — this window is too narrow for seven columns' : option.hint}
              onClick={() => onChange(option.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={option.icon} />
              </svg>
              {label}
            </button>
          );
        })}
      </div>
      <button
        ref={buttonRef}
        type="button"
        className={`calendar-view-trigger${open ? ' open' : ''}${inMenu ? ' is-current' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          `${inMenu ? `Calendar view: ${current.label}. More views` : 'More calendar views'}${showDayColumns ? ' and day columns' : ''}`
        }
      onClick={() => setOpen((current) => !current)}
      >
        <svg className="calendar-view-trigger-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={inMenu ? current.icon : MENU_VIEW_OPTIONS[0].icon} />
        </svg>
        <span className="calendar-view-trigger-text">
          <small>{inMenu ? 'View' : 'More'}</small>
          <strong>{inMenu ? current.label : 'Views'}</strong>
        </span>
        <svg className="calendar-view-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <FloatingPanel anchorRef={buttonRef} open={open} onClose={() => setOpen(false)} className="calendar-view-panel" width={264}>
        <div role="menu" aria-label="More calendar views">
          {MENU_VIEW_OPTIONS.filter((option) => option.id !== 'timeline' || hasProjects || value === 'timeline').map((option) => (
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
          {/* Underneath the views, not instead of them: this menu is now
              everything about what the grid draws, which is what stopped the
              toolbar needing a second row of controls. */}
          {showDayColumns ? (
            <DayColumnMenuRows days={days} onChange={onDaysChange} counts={weekendCounts} rangeWord={weekendRangeWord} />
          ) : null}
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
  /** The same money as a number. value_label is already formatted, and the Year
      view has to ADD twelve months of these — parsing "$4,525" back out of a
      string this component was handed as a number is not a summary. */
  value?: number | null;
  hours_label: string | null;
  /** The same number hours_label prints, unformatted. The time views size a
      block from it, and parsing "3.5h" back out of the label to do that would
      be reading a string this component already had as a number. */
  estimated_hours: number | null;
  /**
   * The END of an entered range, or null when the span was guessed from hours.
   *
   * Only its presence is read, not its value — the occurrences are already
   * expanded one per day by the time they get here, so this answers the one
   * question that expansion throws away: did somebody SAY this runs six days,
   * or did we work it out? Even spreading is right for the first and wrong for
   * the second. See occurrenceMinutes.
   */
  scheduled_until: string | null;
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
// but a tooltip that only repeats the name would leave the difference to color.
function plannedTitle(visit: PlannedVisit): string {
  const money = visit.amount > 0 ? ` · $${Math.round(visit.amount).toLocaleString('en-US')}` : '';
  const left = visit.remainingAfter != null ? ` · ${visit.remainingAfter} visit${visit.remainingAfter === 1 ? '' : 's'} left after this` : '';
  return `${visit.clientName} — ${visit.planTitle} (${CADENCE_WORD[visit.frequency]})${money}${left}. The job is created automatically on the day.`;
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
  weekendDays = { sat: true, sun: true },
  /* Matches normalizeCalendarView's default. A caller that passes no view (the
     demo) must not open on a different one from a real account with no cookie. */
  initialView = 'week',
  hoursByDate = {},
  unknownDurationByDate = {},
  capacityHours = 8,
  blockedDays = {},
  initialDayKey,
  workdayStart = null,
  workdayEnd = null,
  workingWeekdays = [],
  queueCount = 0,
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
  /* NO `toolbarActions` SLOT ANY MORE. It existed for one caller passing one
     control ("Plan my day"), which moved out of this toolbar when it stopped
     being the loudest thing on a page about booking work — and then nobody
     passed it, so it rendered `undefined` into the row at every width. */
  /** Seeded from the cookie server-side so the grid never flashes 7 columns. */
  weekendDays?: WeekendDays;
  /** Ditto for the shape of the calendar — see CALENDAR_VIEW_COOKIE. */
  initialView?: CalendarView;
  /* --- the mobile agenda's inputs. All optional and all additive: the desktop
     calendar reads none of them. --- */
  /** Booked hours per date, buffer included. Drives the capacity line. */
  hoursByDate?: Record<string, number>;
  /**
   * Jobs per date that contributed NOTHING to hoursByDate because nobody has
   * estimated them. Absent keys mean none. Without this the capacity views
   * cannot tell a quiet day from an unmeasured one, and they were calling every
   * unmeasured day quiet.
   */
  unknownDurationByDate?: Record<string, number>;
  capacityHours?: number;
  /** Date key -> why the day is unavailable. Same map the drag guard uses. */
  blockedDays?: Record<string, string>;
  /** Which day the agenda opens on — today, unless you navigated elsewhere. */
  initialDayKey?: string;
  /**
   * The business's own working hours ("07:30"/"17:00"), which set the vertical
   * extent of the time views. The axis GROWS past them for a job booked outside
   * them — see buildTimeAxis — so an early start is never drawn off the top.
   */
  workdayStart?: string | null;
  workdayEnd?: string | null;
  /** Weekday numbers this business works (0=Sun … 6=Sat). Empty means all seven.
      The Year view needs it to know what a month's capacity even is. */
  workingWeekdays?: number[];
  /** Approved work with no date, so the Day view's empty state can name what
      pressing it would do. Zero on the demo, which has no queue. */
  queueCount?: number;
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
  // Whether the person has picked a view since the page loaded. The narrow-width
  // fallback below is a DEFAULT, not a restriction: Month stays in the menu and
  // choosing it deliberately is respected.
  const [viewWasChosen, setViewWasChosen] = useState(false);
  const setCalendarView = (next: CalendarView) => {
    setViewWasChosen(true);
    setCalendarViewState(next);
    if (readOnly) return;
    startTransition(async () => { await setCalendarViewAction(next); });
  };

  /**
   * HOW MANY DAY COLUMNS THE WIDTH CAN CARRY.
   *
   * Not a view of its own and not a preference — the same Week view, given
   * fewer columns. Seven columns beside the unscheduled rail at 1024 is about
   * 80px each, which is narrower than a customer's name, so a tablet gets the
   * selected day plus the next two. A phone never gets columns at all; it gets
   * the agenda, which is a different component entirely.
   *
   * `null` until the first effect runs. Rendering a guess would mean the server
   * markup and the first client render disagree about the column count, and
   * React would keep the wrong one.
   */
  const [span, setSpan] = useState<7 | 3 | 1 | null>(null);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1280px)');
    const mid = window.matchMedia('(min-width: 641px)');
    const sync = () => setSpan(wide.matches ? 7 : mid.matches ? 3 : 1);
    sync();
    wide.addEventListener('change', sync);
    mid.addEventListener('change', sync);
    return () => { wide.removeEventListener('change', sync); mid.removeEventListener('change', sync); };
  }, []);
  const narrow = span !== null && span < 7;

  // MONTH FALLS BACK TO AGENDA WHEN IT GOES TOO DENSE.
  //
  // Month is a capacity overview now rather than a grid of job cards, so it
  // survives a narrow window far better than it used to — but below 1280 it is
  // sharing the row with the rail, and seven capacity cells at 80px is four
  // abbreviations with nowhere to sit. The cookie is deliberately NOT written:
  // this is a response to the window, not a change of preference, and
  // persisting it would silently rewrite what the same person sees on a desktop.
  const effectiveView: CalendarView =
    !viewWasChosen && narrow && calendarView === 'month' ? 'agenda' : calendarView;
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const openJobAssignedMembers = openJob
    ? (assignments[openJob.id] ?? [])
      .map((id) => crew.find((member) => member.id === id))
      .filter((member): member is CrewOption => Boolean(member))
    : [];


  /**
   * WHICH DAY THE TIME VIEWS ARE POINTED AT.
   *
   * Month navigation is a real navigation (`?month=`) because the month grid,
   * the recurring projection and the agenda are all built server-side for one
   * month. Day and Week are not: `jobs` arrives holding EVERY scheduled
   * occurrence, not a month's worth, so stepping a week is a local state change
   * with no round trip and no spinner.
   *
   * It does have to follow the month when you navigate — land on September and
   * the week you are looking at should be in September — hence the effect
   * below rather than a plain useState initialiser.
   */
  const [anchorDayKey, setAnchorDayKey] = useState(initialDayKey ?? todayKey);
  const monthOfGrid = useMemo(() => {
    const first = weeks.flat().find(Boolean);
    return first ? monthKeyOf(first.dateKey) : monthKeyOf(todayKey);
  }, [weeks, todayKey]);
  useEffect(() => {
    setAnchorDayKey((current) => {
      if (monthKeyOf(current) === monthOfGrid) return current;
      // Today if the month you navigated to is the one today is in, otherwise
      // its first day — landing on "the 1st" is right for a month you are
      // looking ahead to and wrong for the one you are standing in.
      return monthKeyOf(todayKey) === monthOfGrid ? todayKey : `${monthOfGrid}-01`;
    });
  }, [monthOfGrid, todayKey]);

  /**
   * All seven days of the week on screen, hidden ones included.
   *
   * Separate from timelineDayKeys BECAUSE of the hiding: the notice that says
   * "there is work on a column you cannot see" has to look at the columns you
   * cannot see, and reading the filtered list would count them as zero — the
   * one state it exists for would be the one state it could never report.
   */
  const weekDayKeys = useMemo(() => {
    const weekday = new Date(`${anchorDayKey}T00:00:00`).getDay();
    const sunday = shiftDateKey(anchorDayKey, -weekday);
    return [0, 1, 2, 3, 4, 5, 6].map((day) => shiftDateKey(sunday, day));
  }, [anchorDayKey]);

  /**
   * The columns a time view shows.
   *
   * Week snaps to the calendar week and drops the weekend days the toggles
   * hid — those toggles are a statement about which days this business works,
   * and two dead columns cost a seventh of the width every week of the year.
   * Day and Crew are a single column. A tablet gets the anchor plus the next
   * two, which deliberately does NOT snap to a week: on three columns "the rest
   * of this week" is more useful than "Sunday to Tuesday".
   */
  const timelineDayKeys = useMemo(() => {
    if (span === null) return [anchorDayKey];
    if (effectiveView === 'day' || effectiveView === 'crew') return [anchorDayKey];
    if (span === 1) return [anchorDayKey];
    if (span === 3) return [0, 1, 2].map((offset) => shiftDateKey(anchorDayKey, offset));

    return weekDayKeys.filter((_, day) => (day !== 0 || days.sun) && (day !== 6 || days.sat));
  }, [days.sat, days.sun, effectiveView, span, weekDayKeys]);

  /**
   * How long each occurrence runs, and where it sits in a multi-day job.
   *
   * A multi-day job arrives already expanded to one row per day, every row
   * carrying the same scheduled_time and the same total estimated_hours. Drawn
   * literally that is a 20-hour block on three consecutive days — three times
   * the work. Computed once here for every view that needs a length.
   */
  const metaByOccurrence = useMemo(() => {
    const daysByJob = new Map<string, string[]>();
    for (const job of jobs) {
      const list = daysByJob.get(job.id) ?? [];
      list.push(job.scheduled_for);
      daysByJob.set(job.id, list);
    }
    for (const list of daysByJob.values()) list.sort();

    const meta = new Map<string, TimelineDayMeta>();
    for (const job of jobs) {
      const list = daysByJob.get(job.id) ?? [job.scheduled_for];
      const dayIndex = Math.max(0, list.indexOf(job.scheduled_for));
      meta.set(job.occurrence_key, {
        dayIndex,
        dayCount: list.length,
        minutes: occurrenceMinutes({
          totalHours: job.estimated_hours,
          dayIndex,
          dayCount: list.length,
          workdayHours: capacityHours,
          // An entered range means the pacing was stated, so the hours spread
          // evenly across it — the same division the month bar and the booking
          // engine have always done.
          spanEntered: Boolean(job.scheduled_until),
        }),
      });
    }
    return meta;
  }, [capacityHours, jobs]);

  // Every real day in the month, in order. Padding cells are null, so filtering
  // them out leaves exactly the month — which is what both new views count in.
  const monthDays = useMemo(
    () => weeks.flat().filter((cell): cell is Exclude<CalendarCell, null> => Boolean(cell)),
    [weeks],
  );

  // Whether the band is on screen at all. The legend's own note argues against
  // captioning colors the grid is not using, and "Duration needed" is absent
  // from most months — it should not become permanent furniture on the strength
  // of one job from March.
  const hasUnknownDuration = useMemo(
    () => monthDays.some((cell) => (unknownDurationByDate[cell.dateKey] ?? 0) > 0),
    [monthDays, unknownDurationByDate],
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

  /**
   * SEARCH AND A STATUS FILTER, because a list is the one view you can look
   * something UP in.
   *
   * Every other view answers "what is on this day" and is bounded by the day.
   * The Job list is the month — 124 rows on this account in August — and it had
   * no way to narrow it at all, so finding one customer meant scrolling past
   * everybody else, and "what is still unapproved" meant reading 124 badges.
   *
   * Matching is on what the row SHOWS: the client, the city and what the work
   * is. Searching a field that is not on screen returns rows for a reason you
   * cannot see.
   */
  const [agendaQuery, setAgendaQuery] = useState('');
  const [agendaStatus, setAgendaStatus] = useState<'all' | 'new_lead' | 'in_progress' | 'complete'>('all');

  const agendaDays = useMemo(() => {
    const needle = agendaQuery.trim().toLowerCase();
    const matches = (job: CalendarJob) => {
      if (agendaStatus !== 'all' && job.status !== agendaStatus) return false;
      if (!needle) return true;
      return [job.client_name, job.city_label, job.scope_label]
        .some((field) => (field ?? '').toLowerCase().includes(needle));
    };

    return monthDays
      .map((cell) => ({
        cell,
        dayJobs: [...(jobsByDate.get(cell.dateKey) ?? [])].filter(matches).sort(compareCalendarJobs),
        /* A recurring visit has no status and no client to search, so a filter
           of either kind excludes it rather than letting it through — a "New
           lead" filter that returns projections is not a filter. */
        dayPlanned: needle || agendaStatus !== 'all' ? [] : plannedByDate.get(cell.dateKey) ?? [],
      }))
      // A day whose only entry is a recurring visit still belongs in the
      // agenda — leaving it out is the whole complaint this fixes.
      .filter((entry) => entry.dayJobs.length > 0 || entry.dayPlanned.length > 0);
  }, [monthDays, jobsByDate, plannedByDate, agendaQuery, agendaStatus]);

  /** How many rows the filters are hiding, so the list can say so. */
  const agendaTotals = useMemo(() => {
    let shown = 0;
    for (const day of agendaDays) shown += day.dayJobs.length;
    let all = 0;
    for (const cell of monthDays) all += jobsByDate.get(cell.dateKey)?.length ?? 0;
    return { shown, all };
  }, [agendaDays, monthDays, jobsByDate]);

  // Timeline: one row per JOB, not per occurrence. `jobs` arrives already
  // expanded to a row per day, so this folds those back into a first and last
  // column — which is the only view that shows a multi-day job as one thing.
  /**
   * The days Projects lays out — the month, or one week of it.
   *
   * A MONTH OF 26px COLUMNS IS NOT A CHART, IT IS A BARCODE. 31 columns plus a
   * 180px name gutter is 986px, which does not fit the 728px calendar column at
   * 1920, so the view arrived pre-scrolled sideways with every bar too narrow to
   * label. Zoomed to a week the same grid gives each day ~78px and a two-day job
   * gets 156px — enough to say what it is on the bar itself.
   */
  const [timelineZoom, setTimelineZoom] = useState<'month' | 'week'>('month');
  const timelineDays = useMemo(() => {
    if (timelineZoom === 'month') return monthDays;
    const inWeek = new Set(weekDayKeys);
    const week = monthDays.filter((cell) => inWeek.has(cell.dateKey));
    // A week that has run off the end of the month leaves nothing to draw;
    // showing the month beats showing an empty grid.
    return week.length > 0 ? week : monthDays;
  }, [monthDays, timelineZoom, weekDayKeys]);

  /**
   * One bar per job, for work that RUNS — not for everything in the month.
   *
   * The view is called Projects and it drew every job in the month, one-day
   * jobs included: thirteen 26px blocks with nothing written in any of them,
   * which is a worse month grid rather than a picture of multi-day work. A job
   * that starts and finishes on Tuesday is not a project, and the six views
   * either side of this one all show it better.
   *
   * `spans` is the honest population; `rows` is what gets drawn.
   */
  const timelineRows = useMemo(() => {
    const columnByDate = new Map(timelineDays.map((cell, index) => [cell.dateKey, index]));
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

    return [...byJob.values()]
      /* Two days on the grid, or an entered end date. The second half matters
         at a month boundary: a job running Jan 30 – Feb 4 has two columns in
         January and four in February, and it is one project in both. */
      .filter(({ first, last, job }) => last > first || Boolean(job.scheduled_until))
      .sort(
        (a, b) => a.first - b.first || b.last - b.first - (a.last - a.first) || a.job.client_name.localeCompare(b.job.client_name),
      );
  }, [jobs, timelineDays]);

  /**
   * Whether there is any multi-day work in the month at all.
   *
   * Read at MONTH scale on purpose, so zooming to a week that happens to hold
   * none does not make the view disappear out from under you.
   */
  const hasProjects = useMemo(() => {
    const daysByJob = new Map<string, Set<string>>();
    for (const job of jobs) {
      if (job.scheduled_until) return true;
      const set = daysByJob.get(job.id) ?? new Set<string>();
      set.add(job.scheduled_for);
      if (set.size > 1) return true;
      daysByJob.set(job.id, set);
    }
    return false;
  }, [jobs]);

  /**
   * Work booked on each weekend day of the range on screen.
   *
   * Counted whether the column is shown or not — that is the whole point. The
   * first version counted only HIDDEN days, so the number existed only once it
   * was too late to be useful.
   *
   * THE RANGE IS THE ONE YOU ARE LOOKING AT, WHICH IS NOT ALWAYS THE MONTH.
   * This read `visibleWeeks`, and in Week that is `weekAtAGlance` — the week
   * containing TODAY, which stops moving the moment you step the week stepper.
   * Walk forward three weeks with two Saturday jobs waiting there and the notice
   * still reported on the week you left. Capacity really does span the month, so
   * the range follows the view rather than being fixed to either.
   */
  const weekendJobCounts = useMemo(() => {
    let sun = 0;
    let sat = 0;
    const count = (dateKey: string) => {
      const weekday = weekdayOfDateKey(dateKey);
      if (weekday === 0) sun += jobsByDate.get(dateKey)?.length ?? 0;
      if (weekday === 6) sat += jobsByDate.get(dateKey)?.length ?? 0;
    };
    if (effectiveView === 'week') {
      // All seven, not the five on screen — see weekDayKeys.
      for (const dateKey of weekDayKeys) count(dateKey);
    } else {
      for (const week of weeks) for (const cell of week) if (cell) count(cell.dateKey);
    }
    return { sun, sat };
  }, [effectiveView, weekDayKeys, weeks, jobsByDate]);

  /** What those counts are OF, in the words the notice and the menu use. */
  const weekendRangeWord = effectiveView === 'week' ? 'this week' : 'this month';

  /**
   * Why a day is off, or null — availability blocks ONLY.
   *
   * `blockedDays` cannot answer this. It is the drag guard's reason map, and it
   * holds every day that is merely at CAPACITY as well ("That day's 10h capacity
   * is already full"), which is right for a warning you can override and wrong
   * for everything else. The timeline read it as "closed" and so every fully
   * booked weekday came up flagged `Closed · 5` with a tooltip claiming five
   * jobs were scheduled outside configured working hours — the `Full` branch one
   * line below it was unreachable. Measured on this account: five of five
   * weekdays, all of them simply busy.
   */
  function blockReasonFor(dateKey: string): string | null {
    const block = blocks.find((b) => dateKey >= b.start_date && dateKey <= b.end_date);
    if (!block) return null;
    return block.reason ? `Blocked off — ${block.reason}.` : 'This day is blocked off.';
  }

  /** The same answer as a map, for the day columns. Only the days on screen. */
  const closedDays = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dateKey of timelineDayKeys) {
      const reason = blockReasonFor(dateKey);
      if (reason) map[dateKey] = reason;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineDayKeys, blocks]);

  function openJobActions(occurrenceKey: string) {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(occurrenceKey);
  }

  // Stable identity: useModal holds it in a dependency array, and a new function
  // every render would tear the trap down and rebuild it on each keystroke.
  const closeJobActions = useCallback(() => {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(null);
  }, []);

  // Focus in, focus trapped, Escape closes, focus returned to the chip that
  // opened it, page behind locked. None of that was here: the panel was a plain
  // div, so a keyboard user landed nowhere and tabbed straight through it into
  // the calendar underneath.
  useModal(Boolean(openJob), dialogRef, closeJobActions, 'job');

  // THE DIALOG HAS TO LEAVE THIS SUBTREE TO BE A DIALOG.
  //
  // It is rendered inside .panel, and .panel carries `backdrop-filter: blur()`.
  // A filtered element becomes the containing block for `position: fixed`
  // descendants, so `inset: 0` resolved against the calendar card rather than
  // the window: measured at 1366x768 the backdrop came out 633x1228 starting at
  // y=48, which put 262px of the dialog below the fold with no way to scroll to
  // it. Centring, 100dvh and z-index were all being applied correctly to a box
  // that was never the viewport.
  //
  // Portalling to <body> is the fix rather than removing the blur, which is a
  // deliberate part of how every panel in this app looks. Gated on mount so the
  // server render (where document does not exist) simply omits it — the dialog
  // only ever exists in response to a click, so there is nothing to hydrate.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function navigateToMonth(monthKey: string) {
    setCalendarView('month');
    router.push(`/dashboard/schedule?month=${monthKey}`);
  }

  const twelveMonthSummary = useMemo(() => {
    const firstVisibleCell = weeks.flat().find(Boolean);
    const baseDate = firstVisibleCell ? new Date(`${firstVisibleCell.dateKey}T00:00:00`) : new Date(`${todayKey}T00:00:00`);
    /* Availability blocks, as the map loadOverWindow wants. Only real blocks:
       a month is not less capable of holding work because it is already full. */
    const blockedDays: Record<string, true> = {};
    for (const block of blocks) {
      for (let i = 0; i < 400; i += 1) {
        const key = addDaysToDateKey(block.start_date, i);
        if (key > block.end_date) break;
        blockedDays[key] = true;
      }
    }

    return Array.from({ length: 12 }, (_, index) => {
      const monthDate = addMonths(baseDate, index);
      const monthKey = toMonthKey(monthDate);
      const monthOccurrences = jobs
        .filter((job) => job.scheduled_for.startsWith(monthKey))
        .sort((a, b) => `${a.scheduled_for}${a.scheduled_time ?? ''}`.localeCompare(`${b.scheduled_for}${b.scheduled_time ?? ''}`));
      const uniqueJobs = Array.from(new Map(monthOccurrences.map((job) => [job.id, job])).values());

      /* HOW FULL EACH MONTH IS, not just how many jobs are in it.
         Twelve cards of a bare count answered "is there work in November" and
         nothing else — a month with three 40-hour jobs and a month with three
         one-hour jobs printed the same 3. Same function as the header stat, so
         the two cannot disagree; capacity is the working days in that month
         that are not blocked, times the day's own hours. */
      const load = loadOverWindow({
        fromKey: `${monthKey}-01`,
        days: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate(),
        hoursByDate,
        unknownByDate: unknownDurationByDate,
        capacityPerDay: capacityHours,
        workingWeekdays,
        blockedDays,
      });

      /* The value of the work, once per job rather than once per occurrence —
         a six-day job is not six times the money. Money is deliberately absent
         from this page's header (a calendar is not an accounts screen), but a
         twelve-month planning view is the one place where "how much work is in
         November" is the question being asked. */
      const value = uniqueJobs.reduce((sum, job) => sum + (job.value ?? 0), 0);

      return {
        monthKey,
        label: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        uniqueJobCount: uniqueJobs.length,
        jobs: uniqueJobs.slice(0, 3),
        extraJobCount: Math.max(0, uniqueJobs.length - 3),
        load,
        value,
      };
    });
  }, [blocks, capacityHours, hoursByDate, jobs, todayKey, unknownDurationByDate, weeks, workingWeekdays]);

  /**
   * Stepping, and what the range is called.
   *
   * The arrow moves by whatever is on screen — a week view steps a week, a
   * three-column tablet steps three days — so pressing it twice never skips
   * days or shows you the same job twice.
   *
   * A SNAPPED WEEK STEPS SEVEN EVEN WHEN IT DRAWS FIVE. This was the column
   * count alone, which was right while a week meant seven columns. With the
   * weekend columns off by default it made the step five: from Monday the 10th,
   * +5 is Saturday the 15th, which snaps back to the week of the 9th — press
   * Next twice and you are looking at the same five days you started on. The
   * tablet's three-day view does not snap, so there the column count is still
   * the honest answer.
   */
  const stepDays = effectiveView === 'week' && span === 7 ? 7 : timelineDayKeys.length > 1 ? timelineDayKeys.length : 1;
  const stepNoun = stepDays === 1 ? 'day' : stepDays === 7 ? 'week' : `${stepDays} days`;
  const rangeLabel = useMemo(() => {
    const first = timelineDayKeys[0];
    const last = timelineDayKeys[timelineDayKeys.length - 1];
    if (!first) return '';
    /* "Wed, August 12" and not "Wednesday, August 12". The long form measured
       188px, which put the Day view's nav at 388px — and 388 + 365 of controls
       does not fit a 728px toolbar, so the one view with the longest label was
       the one view still wrapping onto two rows. The worst case here is
       "Wednesday, September 30"; shortening the weekday buys 55px of it. */
    if (first === last) {
      return parseDateKey(first).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
    }
    const firstDate = new Date(`${first}T00:00:00`);
    const lastDate = new Date(`${last}T00:00:00`);
    const sameMonth = firstDate.getMonth() === lastDate.getMonth() && firstDate.getFullYear() === lastDate.getFullYear();
    const head = firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tail = lastDate.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
    return `${head} – ${tail}, ${lastDate.getFullYear()}`;
  }, [timelineDayKeys]);

  /* Today may be in a month the server has not sent, so this is a navigation
     when it has to be and local state when it does not. */
  const goToToday = useCallback(() => {
    setAnchorDayKey(todayKey);
    if (monthKeyOf(todayKey) !== monthOfGrid) router.push(`${basePath}/schedule?month=${monthKeyOf(todayKey)}&day=${todayKey}`);
  }, [basePath, monthOfGrid, router, todayKey]);

  /**
   * WHERE THE DAY VIEW WAS OPENED FROM, SO THERE IS A WAY BACK.
   *
   * Clicking a date in Month drops you into Day, and the only route back was
   * the View menu — a dropdown you have to remember exists and re-navigate,
   * which lands you at the top of a month you had already scrolled through.
   * Nothing on screen said where you had come from or how to undo it.
   *
   * This holds the month label and the scroll position at the moment of the
   * click, which is what "back" has to restore for it to feel like going back
   * rather than navigating somewhere new. Cleared whenever the view changes by
   * any other route, so the control can never offer to return you somewhere you
   * did not come from.
   */
  const [cameFromMonth, setCameFromMonth] = useState<{ label: string; scrollY: number } | null>(null);

  const openDay = useCallback((dateKey: string) => {
    setCameFromMonth({
      label: new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      scrollY: window.scrollY,
    });
    setAnchorDayKey(dateKey);
    setCalendarView('day');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToMonth = useCallback(() => {
    const from = cameFromMonth;
    setCameFromMonth(null);
    setCalendarView('month');
    // After paint, or the month grid does not exist yet to scroll within.
    if (from) requestAnimationFrame(() => window.scrollTo({ top: from.scrollY, behavior: 'auto' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameFromMonth]);

  // Any other change of view means the breadcrumb is no longer true.
  useEffect(() => {
    if (effectiveView !== 'day') setCameFromMonth(null);
  }, [effectiveView]);

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
      {/* Month nav and view switcher share one row — and now they FIT on one,
          which they did not before. Measured on this account at 1920, 1440,
          1366 and 1024: 85px tall at every one of them, because the nav (304px)
          and the controls (600px) could not both fit a calendar column that is
          728px at its widest. Two of those controls have moved (the weekend
          switches, into the menu; "Plan my day", out of here entirely) and the
          rest compact against the COLUMN rather than the window — see
          .calendar-toolbar-wrap. One row, 46px.

          WHICH NAV depends on the view, because they step different things. The
          month views are server-navigated (`?month=`) and the arrows are links,
          rendered upstream. The time views step by day in local state, so a
          month arrow there would jump you a month for no reason and reload the
          page to do it. */}
      <div className="calendar-toolbar-wrap">
      <div className="calendar-toolbar">
        {TIME_VIEWS.has(effectiveView) ? (
          <div className="month-nav sched-range-nav">
            {/* Only when you actually arrived here from Month. A permanent
                "back to month" would be a fourth navigation control competing
                with the three beside it, and it would be lying about half the
                time. */}
            {cameFromMonth ? (
              <button type="button" className="sched-back-to-month" onClick={backToMonth}>
                <span aria-hidden="true">←</span> Back to {cameFromMonth.label}
              </button>
            ) : null}
            <button
              type="button"
              className="month-nav-arrow"
              aria-label={`Previous ${stepNoun}`}
              onClick={() => setAnchorDayKey((key) => shiftDateKey(key, -stepDays))}
            >
              ←
            </button>
            <h2 className="month-nav-label">{rangeLabel}</h2>
            <button
              type="button"
              className="month-nav-arrow"
              aria-label={`Next ${stepNoun}`}
              onClick={() => setAnchorDayKey((key) => shiftDateKey(key, stepDays))}
            >
              →
            </button>
            {/* Always on the row, and disabled while you are already looking at
                today. It used to render only when today was OUT of range —
                so the one week you never saw the control was the week you were
                standing in, and it never became a thing you knew was there. */}
            <button
              type="button"
              className="month-nav-today"
              onClick={goToToday}
              disabled={timelineDayKeys.includes(todayKey)}
              title={timelineDayKeys.includes(todayKey) ? 'Today is already in view' : 'Jump to today'}
            >
              Today
            </button>
          </div>
        ) : (
          monthNav
        )}
        <div className="calendar-toolbar-actions">
          <CalendarViewMenu
            value={calendarView}
            onChange={setCalendarView}
            columns={span}
            hasProjects={hasProjects}
            days={days}
            onDaysChange={updateDays}
            weekendCounts={weekendJobCounts}
            weekendRangeWord={weekendRangeWord}
            /* ONLY WHERE THERE ARE COLUMNS TO HIDE. Week and Capacity are the
               two views built out of day columns. Day and Crew day show the
               single day you picked; the Job list shows days that have work;
               Projects lays out the whole month regardless; Year has no days at
               all. Listing the switches there would be listing a control that
               does nothing. */
            showDayColumns={COLUMN_VIEWS.has(effectiveView)}
          />
        </div>
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
        unknownDurationByDate={unknownDurationByDate}
        capacityHours={capacityHours}
        blockedDays={blockedDays}
        /* Separately from blockedDays, which also holds days that are merely
           full — see the note on the prop. */
        blocks={blocks}
        onOpenJob={openJobActions}
      />

      {/* Under the toolbar and above the grid: a caption belongs beside the
          thing it explains, and it is not a control, so it does not belong in
          a row of them.

          WHICH caption depends on the view, because the two grids are colored
          by different things. Day, Week and Crew draw blocks whose color is
          the job's status; Month draws no blocks at all — a cell is one bar
          answering how full the day is, on the five-step ramp. Showing the
          status key over Month was a legend for colors that were not on the
          screen. */}
      <div className="calendar-desktop-views">
        {/* A VIEW SWAPPED UNDER YOU SHOULD SAY SO. Capacity below 1280 is seven
            cells at ~80px sharing the row with the rail, so it stands down to
            the job list — but it did that in silence, which reads as the
            control being broken rather than as the window being narrow. Naming
            it also names the way out: choosing Capacity deliberately is
            respected, and the sentence disappears the moment you do. */}
        {effectiveView !== calendarView ? (
          <p className="calendar-view-swapped">
            This window is too narrow for {VIEW_OPTIONS.find((option) => option.id === calendarView)?.label},
            so you are seeing {VIEW_OPTIONS.find((option) => option.id === effectiveView)?.label}.{' '}
            <button type="button" onClick={() => setCalendarView(calendarView)}>
              Show {VIEW_OPTIONS.find((option) => option.id === calendarView)?.label} anyway
            </button>
          </p>
        ) : null}
        {/* THE SECOND SENTENCE OF THE SAME KIND, and it belongs beside the
            first: "what is on the grid is not everything" is a caption, not a
            control. It started life in the toolbar and would not fit there — at
            1920 the row is 728px and nav + notice + views wanted 1,021, so it
            put the toolbar straight back onto the two rows this pass removed.
            The switches it reports on are in the views menu. */}
        {COLUMN_VIEWS.has(effectiveView) ? (
          <HiddenDaysNotice days={days} onChange={updateDays} counts={weekendJobCounts} rangeWord={weekendRangeWord} />
        ) : null}
        <CalendarLegend variant={effectiveView === 'month' ? 'capacity' : 'status'} showUnknown={hasUnknownDuration} />
        {/* DAY ONLY. In Week the same strip would be summarising seven days
            through one of them, and the columns already carry their own
            "closed · 5" headers. */}
        {effectiveView === 'day' ? (
          <ScheduleDaySummary
            dateKey={anchorDayKey}
            jobs={jobsByDate.get(anchorDayKey) ?? []}
            crew={crew}
            assignments={assignments}
            bookedHours={hoursByDate[anchorDayKey] ?? 0}
            unknownJobs={unknownDurationByDate[anchorDayKey] ?? 0}
            capacityHours={capacityHours}
            blockedReason={blockReasonFor(anchorDayKey)}
            queueCount={queueCount}
          />
        ) : null}
      {effectiveView === 'day' || effectiveView === 'week' ? (
        <ScheduleTimeline
          dayKeys={timelineDayKeys}
          todayKey={todayKey}
          jobsByDate={jobsByDate}
          plannedByDate={plannedByDate}
          crew={crew}
          assignments={assignments}
          metaByOccurrence={metaByOccurrence}
          workdayStart={workdayStart}
          workdayEnd={workdayEnd}
          fullDates={fullSet}
          /* Blocks only — see blockReasonFor. Passing the drag guard's map here
             was what made every busy day claim to be closed. */
          blockedDays={closedDays}
          onOpenJob={openJobActions}
          onOpenDay={openDay}
          readOnly={readOnly}
        />
      ) : effectiveView === 'crew' ? (
        <ScheduleCrewLanes
          dayKey={anchorDayKey}
          todayKey={todayKey}
          jobs={[...(jobsByDate.get(anchorDayKey) ?? [])].sort(compareCalendarJobs)}
          crew={crew}
          assignments={assignments}
          metaByOccurrence={metaByOccurrence}
          workdayStart={workdayStart}
          workdayEnd={workdayEnd}
          onOpenJob={openJobActions}
        />
      ) : effectiveView === 'month' ? (
        <ScheduleMonthCapacity
          weeks={weeks}
          visibleDays={visibleDays}
          todayKey={todayKey}
          jobsByDate={jobsByDate}
          plannedByDate={plannedByDate}
          assignments={assignments}
          metaByOccurrence={metaByOccurrence}
          hoursByDate={hoursByDate}
          unknownDurationByDate={unknownDurationByDate}
          capacityHours={capacityHours}
          fullDates={fullSet}
          blocks={blocks}
          onOpenDay={openDay}
        />
      ) : effectiveView === 'agenda' ? (
        <>
        {/* Above the list, and only when there is a list worth narrowing. Three
            rows do not need a search box, and offering one is a suggestion that
            you are missing something. */}
        {agendaTotals.all > 6 ? (
          <div className="calendar-agenda-filters">
            <label className="calendar-agenda-search">
              <span className="sr-only">Search this month&apos;s jobs</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                type="search"
                value={agendaQuery}
                placeholder="Customer, town or work"
                onChange={(event) => setAgendaQuery(event.target.value)}
              />
            </label>
            <label className="calendar-agenda-status">
              <span className="sr-only">Filter by status</span>
              <select value={agendaStatus} onChange={(event) => setAgendaStatus(event.target.value as typeof agendaStatus)}>
                <option value="all">Any status</option>
                <option value="new_lead">Quote not approved</option>
                <option value="in_progress">Booked</option>
                <option value="complete">Complete</option>
              </select>
            </label>
            {/* What was taken out, and the way back. A list that has silently
                dropped 118 of 124 rows looks like a month with six jobs in it. */}
            {agendaTotals.shown !== agendaTotals.all ? (
              <p className="calendar-agenda-count">
                {agendaTotals.shown} of {agendaTotals.all}
                <button type="button" onClick={() => { setAgendaQuery(''); setAgendaStatus('all'); }}>Clear</button>
              </p>
            ) : (
              <p className="calendar-agenda-count">{agendaTotals.all} jobs</p>
            )}
          </div>
        ) : null}
        {agendaDays.length === 0 ? (
          <p className="calendar-view-empty">
            {agendaQuery || agendaStatus !== 'all' ? (
              <>
                Nothing this month matches.{' '}
                <button type="button" onClick={() => { setAgendaQuery(''); setAgendaStatus('all'); }}>
                  Show all {agendaTotals.all}
                </button>
              </>
            ) : (
              'Nothing scheduled this month.'
            )}
          </p>
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
        )}
        </>
      ) : effectiveView === 'timeline' ? (
        timelineRows.length === 0 ? (
          /* NAMES WHAT THE VIEW IS FOR, rather than "nothing scheduled" — the
             month is usually full of work, and the reason this is empty is that
             none of it runs longer than a day. */
          <p className="calendar-view-empty">
            No multi-day work {timelineZoom === 'week' ? 'this week' : 'this month'}. Projects draws jobs that run
            across several days as one bar; everything booked here starts and finishes the same day.
            {timelineZoom === 'week' ? (
              <>
                {' '}
                <button type="button" onClick={() => setTimelineZoom('month')}>Show the whole month</button>
              </>
            ) : null}
          </p>
        ) : (
          <>
            <div className="calendar-timeline-zoom" role="group" aria-label="How much time to show">
              {(['month', 'week'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`calendar-timeline-zoom-btn${timelineZoom === option ? ' active' : ''}`}
                  aria-pressed={timelineZoom === option}
                  onClick={() => setTimelineZoom(option)}
                >
                  {option === 'month' ? 'Month' : 'Week'}
                </button>
              ))}
              <span className="calendar-timeline-zoom-note">
                {timelineRows.length} {timelineRows.length === 1 ? 'project' : 'projects'}
              </span>
            </div>
          <div className="calendar-timeline-scroll">
            <div
              className="calendar-timeline"
              style={{
                /* 34px, not 26. The bars carry their own labels now and a
                   two-day job is the shortest thing on this grid, so the
                   narrowest bar it can draw is 68px rather than 52. */
                gridTemplateColumns: `minmax(140px, 180px) repeat(${timelineDays.length}, minmax(34px, 1fr))`,
                minWidth: 180 + timelineDays.length * 34,
              }}
            >
              {/* Full-height column tints, drawn first so the bars paint over
                  them. Without something to count against, a bar 20 columns
                  along is impossible to place by eye. Explicit end line rather
                  than -1, which resolves against explicit rows this grid
                  doesn't have. */}
              {timelineDays.map((cell, dayIndex) => {
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
              {timelineDays.map((cell, dayIndex) => {
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
                      {/* EVERY BAR SAYS SOMETHING NOW. The old rule was that
                          below three days a bar was a bare block with its label
                          in the tooltip — and with one-day jobs on the grid that
                          was most of them, so the view was a row of unlabeled
                          rectangles you had to hover one at a time. The shortest
                          bar here is two days at 68px, which holds "2 days"; the
                          client's name and the value arrive as there is room for
                          them. The name is also in column 1, so the bar losing
                          it is not the same as it being unavailable.

                          WHICH PARTS SHOW IS A CONTAINER QUERY ON THE BAR, not a
                          day count. A day count was right at one zoom and wrong
                          at the other: three days is 102px across a month and
                          286px across a week, and the week's version was hiding
                          a name it had 190px of room for. The bar knows how wide
                          it is; nothing else here does. */}
                      <span className="calendar-timeline-bar-label">
                        <b>{span} days</b>
                        <i>{job.short_name}</i>
                        {job.value_label ? <em>{job.value_label}</em> : null}
                      </span>
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
          </>
        )
      ) : effectiveView === 'year' ? (
        <>
        {/* WHICH TWELVE MONTHS. The toolbar above says "August 2026", which is
            the month the arrows step and not what is on the screen — so the one
            view that is not about a month was captioned with one. The window
            starts at the month you have navigated to, which is also what the
            arrows do to it, and that is worth saying once. */}
        <p className="calendar-year-range">
          <strong>
            {twelveMonthSummary[0]?.label} – {twelveMonthSummary[twelveMonthSummary.length - 1]?.label}
          </strong>
          <span>Hours booked against the hours in each month. Press a month to open it.</span>
        </p>
        <div className="calendar-year-grid">
          {twelveMonthSummary.map((month) => (
            <article className="calendar-year-card" key={month.monthKey}>
              <div className="calendar-year-card-header">
                <button type="button" className="calendar-year-month-link" onClick={() => navigateToMonth(month.monthKey)}>
                  {month.label}
                </button>
                <span data-empty={month.uniqueJobCount === 0 || undefined}>{month.uniqueJobCount === 1 ? '1 job' : `${month.uniqueJobCount} jobs`}</span>
              </div>
              {/* A COUNT ALONE SAID ALMOST NOTHING. Three 40-hour jobs and three
                  one-hour jobs both printed "3". The bar is the same ramp the
                  Capacity view uses, and the hours under it are the reason it is
                  that color. */}
              <div className="calendar-year-load" data-load={month.load.percent === null ? 'none' : month.load.percent > 100 ? 'over' : month.load.percent >= 75 ? 'high' : month.load.percent > 0 ? 'some' : 'none'}>
                <div
                  className="calendar-year-load-bar"
                  role="img"
                  aria-label={
                    month.load.percent === null
                      ? 'No working days in this month'
                      : `${month.load.percent}% booked — ${month.load.bookedHours} of ${month.load.capacityHours} hours${month.load.unknownJobs > 0 ? `, and ${month.load.unknownJobs} ${month.load.unknownJobs === 1 ? 'job with' : 'jobs with'} no duration set` : ''}`
                  }
                >
                  <span style={{ width: `${Math.min(100, month.load.percent ?? 0)}%` }} />
                </div>
                <p aria-hidden="true">
                  <b>{month.load.percent === null ? '—' : `${month.load.percent}%`}</b>
                  <span>
                    {month.load.bookedHours} / {month.load.capacityHours} hrs
                  </span>
                  {month.value > 0 ? <em>{formatMoney(month.value)}</em> : null}
                </p>
                {month.load.unknownJobs > 0 ? (
                  <p className="calendar-year-unknown">
                    {month.load.unknownJobs} {month.load.unknownJobs === 1 ? 'job has' : 'jobs have'} no duration set
                  </p>
                ) : null}
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
        </>
      ) : null}
      {effectiveView !== 'year' && (
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

        </div>
      )}
      </div>

      {openJob && mounted ? createPortal((
        <div className="crew-assign-backdrop schedule-job-backdrop" onClick={closeJobActions}>
          <div
            className="crew-assign-panel schedule-job-actions-panel"
            onClick={(event) => event.stopPropagation()}
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-job-dialog-title"
          >
            <div className="crew-assign-header">
              <div>
                <p className="crew-assign-title" id="schedule-job-dialog-title">{openJob.client_name}</p>
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

            {/* WHAT THE MONTH CELL NO LONGER HAS ROOM TO SAY.
                A 117px cell was carrying the customer, the time, the money, the
                city and a crew badge, each ellipsised into a fragment — "WORK
                S…", "1!". The chip is now time, name and one signal; everything
                else is here, at a width where it can be read, spelled out and
                labelled rather than inferred from a color. */}
            <dl className="schedule-job-facts">
              <div>
                <dt>Where</dt>
                <dd>{openJob.city_label ?? 'No address on file'}</dd>
              </div>
              <div>
                <dt>Value</dt>
                <dd>{openJob.value_label ?? 'Not quoted'}</dd>
              </div>
              <div>
                <dt>Est. time</dt>
                <dd>{openJob.hours_label ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Crew</dt>
                <dd>
                  {openJobAssignedMembers.length > 0
                    ? openJobAssignedMembers.map((member) => member.name).join(', ')
                    : 'Nobody assigned'}
                </dd>
              </div>
              {openJob.scope_label ? (
                <div className="schedule-job-facts-wide">
                  <dt>Work</dt>
                  <dd>{openJob.scope_label}</dd>
                </div>
              ) : null}
            </dl>

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
      ), document.body) : null}
    </>
  );
}
