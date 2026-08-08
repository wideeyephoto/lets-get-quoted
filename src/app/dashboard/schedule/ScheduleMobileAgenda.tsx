'use client';

import { useMemo, useState } from 'react';
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
  capacityHours: number;
  blockedDays: Record<string, string>;
  onOpenJob: (occurrenceKey: string) => void;
};

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
  capacityHours,
  blockedDays,
  onOpenJob,
}: Props) {
  const router = useRouter();
  // Agenda every time, deliberately not persisted. Month is somewhere you go to
  // pick a date and come straight back from; landing in it would mean opening
  // the page on a screen with no jobs on it.
  const [view, setView] = useState<MobileView>('agenda');
  const [selected, setSelected] = useState(initialDayKey);

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
  const capacity = capacityStatus(hoursByDate[selected] ?? 0, capacityHours);
  const relative = relativeDayLabel(selected, todayKey);
  const blockedReason = blockedDays[selected] ?? null;
  const strip = dayStrip(selected, 5);

  return (
    <div className="sched-mobile">
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
            Agenda
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

      {/* One day, named in full, with an arrow either side of it. */}
      <div className="sched-nav">
        <button
          type="button"
          className="sched-nav-btn sched-nav-prev"
          onClick={() => goToDay(shiftDateKey(selected, -1))}
          aria-label={`Previous day, ${shortDateLabel(shiftDateKey(selected, -1))}`}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className="sched-nav-date">
          <h2 className="sched-mobile-date">{longDateLabel(selected)}</h2>
          <p className="sched-nav-sub">
            {relative ? <span className="sched-nav-rel">{relative}</span> : null}
            <span>{jobCountLabel(dayCount)}</span>
          </p>
        </div>
        <button
          type="button"
          className="sched-nav-btn sched-nav-next"
          onClick={() => goToDay(shiftDateKey(selected, 1))}
          aria-label={`Next day, ${shortDateLabel(shiftDateKey(selected, 1))}`}
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* Five days around the one you are on, with how much is booked on each. */}
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

      {view === 'agenda' ? (
        <div className="sched-mobile-panel" data-view="agenda" id="sched-panel" role="tabpanel" aria-labelledby="sched-tab-agenda">
          {/* How full the day is, beside the day it belongs to — a word and a
              number, not a colour. */}
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
          <p className="sched-mini-hint">Pick a day to see what is on it.</p>
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
              return (
                <button
                  type="button"
                  key={cell.dateKey}
                  className={`sched-mini-day${isSelected ? ' is-on' : ''}${cell.dateKey === todayKey ? ' is-today' : ''}${blockedDays[cell.dateKey] ? ' is-blocked' : ''}`}
                  aria-current={isSelected ? 'date' : undefined}
                  aria-label={`${shortDateLabel(cell.dateKey)}, ${jobCountLabel(count)}`}
                  onClick={() => goToDay(cell.dateKey)}
                >
                  <strong>{cell.day}</strong>
                  <span className={`sched-mini-count${count > 0 ? '' : ' is-empty'}`} aria-hidden="true">
                    {count > 0 ? count : ''}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="sched-mini-foot">
            <Link href={`/dashboard/schedule?month=${monthKeyOf(shiftDateKey(`${monthKey}-01`, -1))}`}>← Previous month</Link>
            <Link href={`/dashboard/schedule?month=${monthKeyOf(shiftDateKey(`${monthKey}-28`, 7))}`}>Next month →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
