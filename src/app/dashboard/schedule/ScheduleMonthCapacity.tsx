'use client';

import { findCrewConflicts, parseClockMinutes } from '@/lib/schedule-timeline';
import { CAPACITY_LABEL, capacityLevel } from '@/lib/schedule-capacity';
import type { CalendarCell, CalendarJob, PlannedVisit } from './schedule-calendar';
import type { TimelineDayMeta } from './ScheduleTimeline';
import { useScheduleDrag } from './ScheduleDragProvider';

/**
 * The month, as capacity rather than as detail.
 *
 * WHAT CHANGED AND WHY. This used to stack a card per job inside each cell,
 * where a cell is about 95px wide at 1366 and about 117px at 1440. Six facts —
 * customer, time, price, crew, status, duration — went in and six ellipses came
 * out. The fix is not smaller type; it is accepting that a month cell cannot
 * hold a job, and asking it the question it CAN answer at that size: how full
 * is that day, and is anything wrong with it.
 *
 * So each cell is four things and no more: the date, how many jobs, booked
 * against available hours, and a bar. Attention markers sit beside the date
 * because they are the reason to click. Clicking opens the day itself, where
 * there is room to print a job properly.
 */

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ScheduleMonthCapacity({
  weeks,
  visibleDays,
  todayKey,
  jobsByDate,
  plannedByDate,
  assignments,
  metaByOccurrence,
  hoursByDate,
  unknownDurationByDate,
  capacityHours,
  fullDates,
  blocks,
  onOpenDay,
}: {
  weeks: CalendarCell[][];
  /** Real weekday indexes still shown after the weekend toggles. */
  visibleDays: number[];
  todayKey: string;
  jobsByDate: Map<string, CalendarJob[]>;
  plannedByDate: Map<string, PlannedVisit[]>;
  assignments: Record<string, string[]>;
  metaByOccurrence: Map<string, TimelineDayMeta>;
  hoursByDate: Record<string, number>;
  /** Jobs per date with no estimated duration — none of them are in hoursByDate. */
  unknownDurationByDate: Record<string, number>;
  capacityHours: number;
  fullDates: Set<string>;
  blocks: Array<{ start_date: string; end_date: string; reason: string | null }>;
  onOpenDay: (dateKey: string) => void;
}) {
  const { overDateKey, armedJob, placeArmed } = useScheduleDrag();

  return (
    <div
      className="sched-month"
      style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(0, 1fr))` }}
    >
      {visibleDays.map((day) => (
        <div className="calendar-weekday" key={day}>{WEEKDAY_LABELS[day]}</div>
      ))}

      {weeks.map((week, weekIndex) =>
        visibleDays.map((dayIndex) => {
          const cell = week[dayIndex];
          if (!cell) return <div className="sched-month-cell empty" key={`${weekIndex}-${dayIndex}`} />;

          const dayJobs = jobsByDate.get(cell.dateKey) ?? [];
          const planned = plannedByDate.get(cell.dateKey) ?? [];
          const booked = hoursByDate[cell.dateKey] ?? 0;
          // Work on this day that `booked` does not include and cannot.
          const unknown = unknownDurationByDate[cell.dateKey] ?? 0;
          const block = blocks.find((b) => cell.dateKey >= b.start_date && cell.dateKey <= b.end_date);
          const isFull = !block && fullDates.has(cell.dateKey);
          const pct = capacityHours > 0 ? Math.min(100, (booked / capacityHours) * 100) : 0;
          // Over capacity is its own state, not a bar that stops at full: a day
          // booked to 11 of 8 hours is a promise somebody is going to break.
          const over = booked > capacityHours + 0.01;
          /* HOW FULL, IN COLOR, ACROSS THE WHOLE MONTH AT ONCE.
             Every cell used to draw the same orange bar whatever was in it, so
             "where is there room in August" meant reading thirty-one cells one
             at a time and comparing two small numbers in each. The ramp answers
             it in one look: green is room, red is trouble. A blocked day is
             outside the ramp entirely — it has no capacity to be a fraction
             of, and tinting it green would offer a day that is closed. */
          const level = block
            ? null
            : capacityLevel({ bookedHours: booked, capacityHours, jobCount: dayJobs.length, markedFull: isFull, unknownJobs: unknown });

          const unassigned = dayJobs.filter((job) => (assignments[job.id] ?? []).length === 0).length;
          const conflicts = findCrewConflicts(dayJobs.map((job) => ({
            key: job.occurrence_key,
            startMinutes: parseClockMinutes(job.scheduled_time),
            durationMinutes: metaByOccurrence.get(job.occurrence_key)?.minutes ?? 60,
            crewIds: assignments[job.id] ?? [],
          })));

          /* Every fact in the cell, in a sentence, because the cell itself is
             four abbreviations and a bar. This is the button's accessible name
             and its tooltip — one string, so they cannot drift. */
          const summary = [
            `${cell.day}: ${dayJobs.length === 0 ? 'nothing booked' : `${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'}`}`,
            dayJobs.length > 0 ? `${booked.toFixed(booked % 1 ? 1 : 0)} of ${capacityHours} hours booked` : null,
            // Said before the band, because it is the reason the band reads the
            // way it does — and because "0 of 8 hours booked" on its own is the
            // sentence that made this day look free.
            unknown > 0
              ? `${unknown} of them ${unknown === 1 ? 'has' : 'have'} no duration set, so the hours above are not the whole day`
              : null,
            block ? (block.reason ? `Blocked off — ${block.reason}` : 'Blocked off') : null,
            // The color band, in words, so the ramp is not the only place it
            // is said. 'open' is already covered by "nothing booked" above.
            level && level !== 'open' ? CAPACITY_LABEL[level] : null,
            conflicts.length > 0 ? `${conflicts.length} crew double-booked` : null,
            unassigned > 0 ? `${unassigned} with no crew` : null,
            planned.length > 0 ? `${planned.length} recurring visit${planned.length === 1 ? '' : 's'}` : null,
          ].filter(Boolean).join('. ');

          return (
            <button
              type="button"
              key={cell.dateKey}
              data-date-key={cell.dateKey}
              /* The band drives every color on the cell — border, bar, tint —
                 from one attribute, so they cannot disagree with each other or
                 with the summary above. */
              data-load={level ?? undefined}
              className={[
                'sched-month-cell',
                cell.dateKey === todayKey ? 'today' : '',
                block ? 'blocked' : '',
                over ? 'over' : isFull ? 'full' : '',
                dayJobs.length === 0 && !block ? 'quiet' : '',
                overDateKey === cell.dateKey ? 'drag-over' : '',
                armedJob ? 'armable' : '',
              ].filter(Boolean).join(' ')}
              title={summary}
              aria-label={armedJob ? `Schedule ${armedJob.jobName} on ${cell.dateKey}` : `${summary}. Open this day.`}
              onClick={() => (armedJob ? placeArmed(cell.dateKey) : onOpenDay(cell.dateKey))}
            >
              <span className="sched-month-top">
                <span className="sched-month-day">{cell.day}</span>
                <span className="sched-month-flags">
                  {conflicts.length > 0 ? (
                    <i className="sched-month-flag clash" aria-hidden="true">!</i>
                  ) : null}
                  {unassigned > 0 ? (
                    <i className="sched-month-flag crewless" aria-hidden="true">◇</i>
                  ) : null}
                  {/* A shape, not just a shade. The band for this state is a
                      neutral hatch precisely so it is not a sixth hue on a ramp
                      that is already the pattern red/green blindness flattens,
                      and this mark is the second way of saying it. */}
                  {unknown > 0 ? (
                    <i className="sched-month-flag unknown" aria-hidden="true">?</i>
                  ) : null}
                  {block ? (
                    <em className="sched-month-state off">Off</em>
                  ) : over ? (
                    <em className="sched-month-state over">Over</em>
                  ) : isFull ? (
                    <em className="sched-month-state full">Full</em>
                  ) : null}
                </span>
              </span>

              {dayJobs.length > 0 || planned.length > 0 ? (
                <>
                  <span className="sched-month-count">
                    {dayJobs.length} job{dayJobs.length === 1 ? '' : 's'}
                    {planned.length > 0 ? <i title="Recurring visits not booked yet"> · {planned.length}↻</i> : null}
                  </span>
                  <span className="sched-month-hours">
                    {/* Trailing ".0" on every whole number is four cells of
                        noise across a month. */}
                    {booked % 1 ? booked.toFixed(1) : booked}
                    {/* "2+ / 8" rather than "2 / 8". The figure is a floor, not
                        a total, whenever something on the day has no length —
                        and one character is the difference between reporting
                        what is known and claiming it is everything. */}
                    {unknown > 0 ? <b className="sched-month-atleast" title={`Plus ${unknown} job${unknown === 1 ? '' : 's'} of unknown length`}>+</b> : null}
                    {' '}/ {capacityHours} hrs
                  </span>
                  <span className="sched-month-bar" aria-hidden="true">
                    <i style={{ width: `${Math.max(pct, 3)}%` }} />
                  </span>
                </>
              ) : (
                <span className="sched-month-open">{block ? 'Blocked' : 'Open'}</span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
