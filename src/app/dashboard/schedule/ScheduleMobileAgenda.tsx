'use client';

import { useMemo, useRef, useState, type TouchEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatJobTime } from '@/lib/jobs';
import {
  capacityStatus,
  crewLabel,
  dayOfMonth,
  dayStrip,
  jobCountLabel,
  longDateLabel,
  monthKeyOf,
  relativeDayLabel,
  shiftDateKey,
  shortDateLabel,
  weekdayShort,
} from '@/lib/schedule-agenda';
import { CAPACITY_LABEL, capacityLevel } from '@/lib/schedule-capacity';
import type { CalendarCell, CalendarJob, CrewOption, PlannedVisit } from './schedule-calendar';

/**
 * The Schedule page on a phone: one day at a time, as rows you can read.
 *
 * WHY THIS EXISTS. Measured at 390px, the seven-column month grid gave each day
 * 33px and each job inside it a chip 10px wide and 46px tall — a client's name
 * rendered one character per line, at 9.92px, with all 13 of them clipped. At
 * 320px the page also scrolled 39px sideways. Seven columns of detail do not
 * fit on a phone, and no amount of shrinking makes them fit; the answer is to
 * stop showing seven days at once.
 *
 * IT IS A SIBLING OF THE DESKTOP CALENDAR, NOT A REPLACEMENT. Both render and
 * CSS decides which one is on screen (the pattern the Leads table already
 * uses). A JS media query would mean either a hydration mismatch or a flash of
 * the wrong layout, and it would put the breakpoint in two places.
 *
 * OPTIONS OPENS THE EXISTING JOB PANEL. Rescheduling, crew and removal are the
 * same server actions the desktop calendar calls, reached by a button rather
 * than a drag — which is also the accessible path, since a drag cannot be done
 * with a keyboard or comfortably with a thumb.
 */

type Props = {
  weeks: CalendarCell[][];
  todayKey: string;
  /** The day the agenda opens on — today when today is in this month. */
  initialDayKey: string;
  jobs: CalendarJob[];
  planned: PlannedVisit[];
  crew: CrewOption[];
  assignments: Record<string, string[]>;
  /** Booked hours per date, already including the job buffer. */
  hoursByDate: Record<string, number>;
  /** Jobs per date those hours could not count, for want of an estimate. */
  unknownDurationByDate: Record<string, number>;
  capacityHours: number;
  /**
   * Date key -> why the day cannot take more work. NOT the same thing as "the
   * day is closed": the page fills this from availability blocks AND from days
   * already at capacity, so most of a busy month is in here.
   */
  blockedDays: Record<string, string>;
  /**
   * The availability blocks themselves — days deliberately taken off.
   *
   * Needed separately from blockedDays above, and the difference is the whole
   * point. A day OFF has no capacity to be a fraction of, so it stays off the
   * ramp. A day that is merely FULL is the most important thing the ramp has to
   * say, and reading blockedDays as "closed" suppressed the band on every one
   * of them — leaving the color on the four quiet days and off the twenty
   * busy ones, which is the ramp exactly backwards.
   */
  blocks: Array<{ start_date: string; end_date: string; reason: string | null }>;
  onOpenJob: (occurrenceKey: string) => void;
};

/**
 * `agenda` is the day you are standing on; `month` is the picker you go to a
 * date with and come straight back from.
 *
 * On screen these are "Day" and "Month", and the internal names match.
 *
 * "Agenda" was the word that had to go: on a phone it meant a single day while
 * on a desktop it meant a month-long list, so nothing you learned from one
 * screen carried to the other. "Dates" was the first replacement — it avoided
 * the second collision, where a phone "Month" was a grid of counts and a
 * desktop "Month" was a capacity heatmap. It also named the panel after what it
 * contains rather than after the span it covers, which is not how anyone asks
 * for it. This is a month of days; it is called Month.
 */
type MobileView = 'agenda' | 'month';

function compareJobs(first: CalendarJob, second: CalendarJob): number {
  return `${first.scheduled_time ?? '99:99'}${first.client_name}`.localeCompare(`${second.scheduled_time ?? '99:99'}${second.client_name}`);
}

export default function ScheduleMobileAgenda({
  weeks,
  todayKey,
  initialDayKey,
  jobs,
  planned,
  crew,
  assignments,
  hoursByDate,
  unknownDurationByDate,
  capacityHours,
  blockedDays,
  blocks,
  onOpenJob,
}: Props) {
  const router = useRouter();
  // Agenda every time, deliberately not persisted. Month is somewhere you go to
  // pick a date and come straight back from; landing in it would mean opening
  // the page on a screen with no jobs on it.
  const [view, setView] = useState<MobileView>('agenda');
  const [selected, setSelected] = useState(initialDayKey);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const monthKey = useMemo(() => {
    const first = weeks.flat().find(Boolean);
    return first ? monthKeyOf(first.dateKey) : monthKeyOf(todayKey);
  }, [weeks, todayKey]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    for (const job of jobs) {
      const bucket = map.get(job.scheduled_for) ?? [];
      bucket.push(job);
      map.set(job.scheduled_for, bucket);
    }
    for (const bucket of map.values()) bucket.sort(compareJobs);
    return map;
  }, [jobs]);

  const plannedByDate = useMemo(() => {
    const map = new Map<string, PlannedVisit[]>();
    for (const visit of planned) {
      const bucket = map.get(visit.dateKey) ?? [];
      bucket.push(visit);
      map.set(visit.dateKey, bucket);
    }
    return map;
  }, [planned]);

  const crewNameById = useMemo(() => new Map(crew.map((member) => [member.id, member.name])), [crew]);

  const countFor = (dateKey: string) =>
    (jobsByDate.get(dateKey)?.length ?? 0) + (plannedByDate.get(dateKey)?.length ?? 0);

  /**
   * Moving a day can leave the month the server rendered. Inside it that is
   * local state; outside it, it is a navigation — so the URL carries the day as
   * well as the month, and the page comes back showing the day you asked for
   * rather than the 1st.
   */
  function goToDay(dateKey: string) {
    setView('agenda');
    if (monthKeyOf(dateKey) === monthKey) {
      setSelected(dateKey);
      return;
    }
    router.push(`/dashboard/schedule?month=${monthKeyOf(dateKey)}&day=${dateKey}`);
  }

  const dayJobs = jobsByDate.get(selected) ?? [];
  const dayPlanned = plannedByDate.get(selected) ?? [];
  const dayCount = dayJobs.length + dayPlanned.length;
  const capacity = capacityStatus(hoursByDate[selected] ?? 0, capacityHours, unknownDurationByDate[selected] ?? 0);
  const relative = relativeDayLabel(selected, todayKey);
  const blockedReason = blockedDays[selected] ?? null;
  const strip = dayStrip(selected, 5);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
    new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1),
  );

  function goToMonth(offset: number) {
    const base = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1 + offset, 1);
    const nextMonth = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
    router.push(`/dashboard/schedule?month=${nextMonth}`);
  }

  const handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    if (touch) {
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          if (view === 'month') goToMonth(1);
          else goToDay(shiftDateKey(selected, 1));
        } else {
          if (view === 'month') goToMonth(-1);
          else goToDay(shiftDateKey(selected, -1));
        }
      }
    }
    touchStartRef.current = null;
  };

  return (
    <div className="sched-mobile" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="sched-mobile-bar">
        <div className="sched-tabs" role="tablist" aria-label="Schedule view">
          <button
            type="button"
            role="tab"
            id="sched-tab-agenda"
            aria-selected={view === 'agenda'}
            aria-controls="sched-panel"
            className={`sched-tab sched-tab-agenda${view === 'agenda' ? ' is-on' : ''}`}
            onClick={() => setView('agenda')}
          >
            Day
          </button>
          <button
            type="button"
            role="tab"
            id="sched-tab-month"
            aria-selected={view === 'month'}
            aria-controls="sched-panel"
            className={`sched-tab sched-tab-month${view === 'month' ? ' is-on' : ''}`}
            onClick={() => setView('month')}
          >
            Month
          </button>
        </div>
        <button
          type="button"
          className="sched-nav-today"
          onClick={() => goToDay(todayKey)}
          disabled={selected === todayKey && view === 'agenda'}
        >
          Today
        </button>
      </div>

      {/* The navigation follows the selected view. Month used to keep showing
          the selected DAY and day arrows above a month grid, then put the real
          month navigation below the fold. */}
      <div className="sched-nav">
        <button
          type="button"
          className="sched-nav-btn sched-nav-prev"
          onClick={() => view === 'month' ? goToMonth(-1) : goToDay(shiftDateKey(selected, -1))}
          aria-label={view === 'month' ? 'Previous month' : `Previous day, ${shortDateLabel(shiftDateKey(selected, -1))}`}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="sched-nav-date">
          {view === 'month' ? (
            <>
              <h2 className="sched-mobile-date">{monthLabel}</h2>
              <p className="sched-nav-sub"><span>Pick a day to open it</span></p>
            </>
          ) : (
            <>
              <h2 className="sched-mobile-date">{longDateLabel(selected)}</h2>
              <p className="sched-nav-sub">
                {relative ? <span className="sched-nav-rel">{relative}</span> : null}
                <span>{jobCountLabel(dayCount)}</span>
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          className="sched-nav-btn sched-nav-next"
          onClick={() => view === 'month' ? goToMonth(1) : goToDay(shiftDateKey(selected, 1))}
          aria-label={view === 'month' ? 'Next month' : `Next day, ${shortDateLabel(shiftDateKey(selected, 1))}`}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* Five days around the one you are on, with how much is booked on each.
          ONLY IN THE DAY VIEW. The Month panel below is a month of the same
          buttons doing the same job, and having both on screen at once put two
          date pickers on a 390px phone, one directly above the other — the
          strip also being the thing that pushed the actual schedule down. */}
      {view === 'agenda' ? (
      <ol className="sched-strip" aria-label="Nearby days">
        {strip.map((dateKey) => {
          const count = countFor(dateKey);
          const isSelected = dateKey === selected;
          return (
            <li key={dateKey}>
              <button
                type="button"
                className={`sched-strip-day${isSelected ? ' is-on' : ''}${dateKey === todayKey ? ' is-today' : ''}`}
                // aria-current is what carries "selected" to a screen reader;
                // the ring and the fill are the visual half of the same thing.
                aria-current={isSelected ? 'date' : undefined}
                aria-label={`${shortDateLabel(dateKey)}, ${jobCountLabel(count)}${dateKey === todayKey ? ', today' : ''}`}
                onClick={() => goToDay(dateKey)}
              >
                <small>{weekdayShort(dateKey)}</small>
                <strong>{dayOfMonth(dateKey)}</strong>
                {count > 0 ? <span className="sched-strip-count" aria-hidden="true">{count}</span> : <span className="sched-strip-count is-empty" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ol>
      ) : null}

      {view === 'agenda' ? (
        <div className="sched-mobile-panel" data-view="agenda" id="sched-panel" role="tabpanel" aria-labelledby="sched-tab-agenda">
          {/* How full the day is, beside the day it belongs to — a word and a
              number, not a color. */}
          <div className="sched-cap" data-state={capacity.state}>
            <p className="sched-cap-text">
              <strong>{capacity.word}</strong>
              <span>{capacity.detail}</span>
            </p>
            <div className="sched-cap-bar" role="img" aria-label={capacity.label}>
              <span style={{ width: `${capacity.pct}%` }} />
            </div>
          </div>

          {blockedReason ? <p className="sched-blocked">{blockedReason}</p> : null}

          {/* PLAN THE ROUTE ONLY WHEN THERE IS A ROUTE. It used to be the
              loudest button on the page at every width, on every day, including
              days with nothing on them — a route optimiser offered for an empty
              afternoon. Two stops is the point at which the order starts to
              matter, so that is when it appears.

              The page-level "Schedule a job" button and the "jobs need dates"
              banner both sit above this in the header, so neither is repeated
              here — that duplication is what made the old mobile screen carry
              three controls that all opened the same list. */}
          {dayJobs.length > 1 ? (
            <Link className="sched-cta-secondary" href="/dashboard/schedule/plan">
              Plan this day&apos;s route
              <small>{dayJobs.length} stops</small>
            </Link>
          ) : null}

          {dayCount === 0 ? (
            <p className="sched-empty">Nothing scheduled on this day.</p>
          ) : (
            <ol className="sched-list">
              {dayJobs.map((job) => {
                const names = (assignments[job.id] ?? [])
                  .map((id) => crewNameById.get(id))
                  .filter((name): name is string => Boolean(name));
                const crewText = crewLabel(names);
                return (
                  <li className={`sched-card status-${job.status}`} key={job.occurrence_key}>
                    <p className="sched-card-top">
                      <span className="sched-card-time">{formatJobTime(job.scheduled_time) ?? 'No set time'}</span>
                      <span className={`sched-card-badge status-${job.badge_tone}`}>{job.badge_label}</span>
                    </p>
                    <Link className="sched-card-name" href={`/dashboard/jobs/${job.id}`}>
                      {job.confirmed ? <span className="calendar-confirm-tick" title="Confirmed by client">✓</span> : null}
                      {job.client_name}
                    </Link>
                    <p className="sched-card-where">{job.city_label ?? 'No address on file'}</p>
                    {job.scope_label ? <p className="sched-card-what">{job.scope_label}</p> : null}
                    <p className="sched-card-figures">
                      {job.value_label ? <span className="sched-card-money">{job.value_label}</span> : null}
                      {job.hours_label ? <span className="sched-card-hours">{job.hours_label} est.</span> : null}
                      <span className="sched-card-crew">{crewText ? `Crew: ${crewText}` : 'No crew assigned'}</span>
                    </p>
                    <button
                      type="button"
                      className="sched-card-options"
                      onClick={() => onOpenJob(job.occurrence_key)}
                      aria-label={`Details and options for ${job.client_name} — reschedule, crew, or remove from the schedule`}
                    >
                      Details &amp; options
                    </button>
                  </li>
                );
              })}

              {/* A visit the plan will turn into a job on the morning. It has no
                  options because there is nothing yet to move or assign. */}
              {dayPlanned.map((visit) => (
                <li className="sched-card sched-card-planned" key={`${visit.planId}-${visit.dateKey}`}>
                  <p className="sched-card-top">
                    <span className="sched-card-time">Recurring</span>
                    <span className="sched-card-badge status-neutral">Not booked yet</span>
                  </p>
                  <Link className="sched-card-name" href="/dashboard/recurring">
                    <span className="calendar-planned-mark" aria-hidden="true">↻</span>
                    {visit.clientName}
                  </Link>
                  <p className="sched-card-what">{visit.planTitle}</p>
                  <p className="sched-card-figures">
                    {visit.amount > 0 ? <span className="sched-card-money">${Math.round(visit.amount).toLocaleString('en-US')}</span> : null}
                    <span className="sched-card-crew">The job is created automatically on the day.</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="sched-mobile-panel" data-view="month" id="sched-panel" role="tabpanel" aria-labelledby="sched-tab-month">
          <p className="sched-mini-hint">Bands show daily capacity; hatched dates still need durations.</p>
          {/* THE SAME RAMP THE DESKTOP DRAWS, at the size a picker can carry.
              This grid used to show a bare count, so the phone could tell you a
              day had four jobs on it and not whether that was a full day or an
              hour of work — the number that decides whether you can fit
              anything else in. One hairline of band under each date is as much
              capacity as 44px of cell will hold, and it means the same thing
              here as it does in the Capacity view. */}
          {/* A DATE SELECTOR, NOT A SHRUNKEN CALENDAR. Numbers and a count of
              what is booked — the moment a client's name goes in a cell this
              becomes the 33px column the agenda exists to replace. */}
          <div className="sched-mini-head" aria-hidden="true">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter, index) => (
              <span key={`${letter}-${index}`}>{letter}</span>
            ))}
          </div>
          <div className="sched-mini-grid">
            {weeks.flat().map((cell, index) => {
              if (!cell) return <span className="sched-mini-pad" key={`pad-${index}`} />;
              const count = countFor(cell.dateKey);
              const isSelected = cell.dateKey === selected;
              // Deliberately taken off, as opposed to merely unbookable. Only
              // the first has no capacity to be a fraction of; a full day IS a
              // fraction, and it is the one the ramp exists to show.
              const closed = blocks.some((block) => cell.dateKey >= block.start_date && cell.dateKey <= block.end_date);
              const unavailable = Boolean(blockedDays[cell.dateKey]);
              const level = closed
                ? null
                : capacityLevel({
                  bookedHours: hoursByDate[cell.dateKey] ?? 0,
                  capacityHours,
                  jobCount: jobsByDate.get(cell.dateKey)?.length ?? 0,
                  unknownJobs: unknownDurationByDate[cell.dateKey] ?? 0,
                });
              return (
                <button
                  type="button"
                  key={cell.dateKey}
                  data-load={level ?? undefined}
                  className={`sched-mini-day${isSelected ? ' is-on' : ''}${cell.dateKey === todayKey ? ' is-today' : ''}${unavailable ? ' is-blocked' : ''}`}
                  aria-current={isSelected ? 'date' : undefined}
                  // The band in words, so the hairline is never the only place
                  // it is said — and the count alone never was enough. "Blocked
                  // off" is reserved for a day that IS blocked off; a day that
                  // is simply full already gets that word from the band.
                  aria-label={`${shortDateLabel(cell.dateKey)}, ${jobCountLabel(count)}${level && level !== 'open' ? `, ${CAPACITY_LABEL[level].toLowerCase()}` : ''}${closed ? ', blocked off' : ''}`}
                  onClick={() => goToDay(cell.dateKey)}
                >
                  <strong>{cell.day}</strong>
                  <span className={`sched-mini-count${count > 0 ? '' : ' is-empty'}`} aria-hidden="true">
                    {count > 0 ? count : ''}
                  </span>
                  {level && level !== 'open' ? <span className="sched-mini-band" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
