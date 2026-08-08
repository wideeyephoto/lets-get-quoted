'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { weekdayShort, dayOfMonth } from '@/lib/schedule-agenda';
import {
  blockPosition,
  buildTimeAxis,
  formatAxisHour,
  formatClockMinutes,
  packOverlaps,
  parseClockMinutes,
  type TimelineEntry,
} from '@/lib/schedule-timeline';
import type { CalendarJob, CrewOption, PlannedVisit } from './schedule-calendar';
import { useScheduleDrag } from './ScheduleDragProvider';

/**
 * The day / three-day / week timeline: a vertical clock with the work drawn on
 * it at the size it actually takes.
 *
 * WHAT THIS REPLACES AND WHY. The month grid asked one ~95px cell to carry a
 * customer, a start time, a price, a crew, a status and a duration. Every one
 * of them ellipsised, so the cell held six half-facts instead of one whole one.
 * More to the point it could not answer the question a dispatcher actually has:
 * two jobs on Tuesday are two chips in a list whether they are at 8am and 2pm
 * or both at 9am with the same person on them. On a time axis the first is a
 * calm column and the second is two blocks fighting for the same rectangle.
 *
 * ONE COMPONENT, THREE VIEWS. Day, three-day and week differ only in how many
 * date keys they are handed. There is no separate tablet component and no
 * duplicated block-rendering: the caller decides the column count from the
 * viewport, this draws whatever it is given. That is deliberate — three copies
 * of this layout would drift within a month.
 */

/**
 * How tall an hour is. Read by the CSS through a custom property so the two
 * cannot disagree, and overridden per breakpoint in globals.css.
 *
 * Everything positional in here is a PERCENTAGE of the axis, not a pixel, so
 * shrinking this on a tablet moves every block correctly with no JS involved.
 */
const HOUR_PX = 62;

/**
 * How much of a block has to exist before its detail lines are worth printing.
 *
 * In MINUTES, not pixels, so the thresholds survive the hour height changing
 * per breakpoint. A 30-minute job is a strip: time and name, nothing else. An
 * hour has room for the city. Anything longer gets the crew and the status too.
 */
function blockSize(minutes: number): 'xs' | 'sm' | 'md' {
  if (minutes < 45) return 'xs';
  if (minutes < 90) return 'sm';
  return 'md';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/** Same six-way hash the month chips used, so a job keeps its colour. */
function bandColor(jobId: string): string {
  let hash = 0;
  for (const character of jobId) hash = (hash + character.charCodeAt(0)) % 6;
  return `calendar-band-color-${hash}`;
}

export type TimelineDayMeta = {
  /** Which day of a multi-day job this occurrence is, and how many there are. */
  dayIndex: number;
  dayCount: number;
  /** Minutes this occurrence occupies — already spread across a multi-day job. */
  minutes: number;
};

export default function ScheduleTimeline({
  dayKeys,
  todayKey,
  jobsByDate,
  plannedByDate,
  crew,
  assignments,
  metaByOccurrence,
  workdayStart,
  workdayEnd,
  fullDates,
  blockedDays,
  onOpenJob,
  readOnly = false,
}: {
  /** One key for Day, three for a tablet, seven (or five) for a week. */
  dayKeys: string[];
  todayKey: string;
  jobsByDate: Map<string, CalendarJob[]>;
  plannedByDate: Map<string, PlannedVisit[]>;
  crew: CrewOption[];
  assignments: Record<string, string[]>;
  metaByOccurrence: Map<string, TimelineDayMeta>;
  workdayStart: string | null;
  workdayEnd: string | null;
  fullDates: Set<string>;
  blockedDays: Record<string, string>;
  onOpenJob: (occurrenceKey: string) => void;
  readOnly?: boolean;
}) {
  const { beginDrag, overDateKey, draggingJobId, armedJob, placeArmed } = useScheduleDrag();
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Every timed job across every visible column, so one axis fits them all. */
  const axis = useMemo(() => {
    const entries: TimelineEntry[] = [];
    for (const key of dayKeys) {
      for (const job of jobsByDate.get(key) ?? []) {
        entries.push({
          key: job.occurrence_key,
          startMinutes: parseClockMinutes(job.scheduled_time),
          durationMinutes: metaByOccurrence.get(job.occurrence_key)?.minutes ?? 60,
        });
      }
    }
    return buildTimeAxis({ entries, workdayStart, workdayEnd });
  }, [dayKeys, jobsByDate, metaByOccurrence, workdayStart, workdayEnd]);

  /** Per column: the blocks with a position, and the ones with no time at all. */
  const columns = useMemo(() => dayKeys.map((dateKey) => {
    const dayJobs = jobsByDate.get(dateKey) ?? [];
    const entries: TimelineEntry[] = dayJobs.map((job) => ({
      key: job.occurrence_key,
      startMinutes: parseClockMinutes(job.scheduled_time),
      durationMinutes: metaByOccurrence.get(job.occurrence_key)?.minutes ?? 60,
    }));
    const packed = new Map(packOverlaps(entries).map((entry) => [entry.key, entry]));
    const jobByKey = new Map(dayJobs.map((job) => [job.occurrence_key, job]));

    return {
      dateKey,
      /* A job with no start time cannot be placed on a clock, and guessing one
         would be inventing a commitment. They get a strip above the axis
         instead — the same place an all-day event goes in every calendar. */
      untimed: dayJobs.filter((job) => parseClockMinutes(job.scheduled_time) == null),
      blocks: [...packed.values()]
        .map((entry) => {
          const job = jobByKey.get(entry.key);
          if (!job) return null;
          return { job, entry, box: blockPosition(entry, axis) };
        })
        .filter((block): block is NonNullable<typeof block> => block !== null),
      planned: plannedByDate.get(dateKey) ?? [],
    };
  }), [axis, dayKeys, jobsByDate, metaByOccurrence, plannedByDate]);

  /**
   * The now line, and the timezone label above the gutter.
   *
   * Both are computed after mount rather than during render. The server has no
   * idea what time it is where the contractor is standing, so rendering either
   * of them on the server produces markup that is wrong by however many hours
   * apart the two are — and React would then keep the wrong one.
   */
  const [now, setNow] = useState<{ minutes: number; zone: string } | null>(null);
  useEffect(() => {
    const read = () => {
      const date = new Date();
      const zone = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
        .formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? '';
      setNow({ minutes: date.getHours() * 60 + date.getMinutes(), zone });
    };
    read();
    const timer = window.setInterval(read, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const nowTop = now && now.minutes >= axis.startMinutes && now.minutes <= axis.endMinutes
    ? ((now.minutes - axis.startMinutes) / axis.totalMinutes) * 100
    : null;

  /**
   * OPEN ON THE WORK, NOT ON MIDNIGHT.
   *
   * The axis grows to hold a 6am start, which is right, but it means the
   * default scroll position can be an hour of empty grid above the first job.
   * Scrolls to just before the earliest block once, on the first render for a
   * given set of days.
   */
  const firstBlockTop = Math.min(...columns.flatMap((column) => column.blocks.map((block) => block.box.top)), Infinity);
  const scrollKey = dayKeys.join(',');
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !Number.isFinite(firstBlockTop)) return;
    const target = (firstBlockTop / 100) * (axis.totalMinutes / 60) * HOUR_PX - HOUR_PX * 0.4;
    node.scrollTop = Math.max(0, target);
    // firstBlockTop is intentionally out of the dependency list: this should run
    // when the visible days change, not every time a block moves under a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  return (
    <div
      className="sched-tl"
      style={{ '--tl-hour-h': `${HOUR_PX}px`, '--tl-hours': axis.hours.length - 1 } as React.CSSProperties}
      data-days={dayKeys.length}
    >
      <div className="sched-tl-head">
        <div className="sched-tl-zone" aria-hidden="true">{now?.zone ?? ''}</div>
        {dayKeys.map((dateKey) => {
          const dayJobs = jobsByDate.get(dateKey) ?? [];
          return (
            <div
              key={dateKey}
              className={`sched-tl-day-head${dateKey === todayKey ? ' today' : ''}`}
            >
              <small>{weekdayShort(dateKey).toUpperCase()}</small>
              <strong>{dayOfMonth(dateKey)}</strong>
              {blockedDays[dateKey] ? (
                <span className="sched-tl-head-flag blocked" title={blockedDays[dateKey]}>Off</span>
              ) : fullDates.has(dateKey) ? (
                <span className="sched-tl-head-flag full" title="Daily capacity reached">Full</span>
              ) : dayJobs.length > 0 ? (
                <span className="sched-tl-head-count">{dayJobs.length}</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Only rendered when something needs it. An always-present empty strip
          costs a row of vertical space on every screen to say nothing. */}
      {columns.some((column) => column.untimed.length > 0 || column.planned.length > 0) ? (
        <div className="sched-tl-anytime">
          <div className="sched-tl-anytime-label" aria-hidden="true">Any time</div>
          {columns.map((column) => (
            <div className="sched-tl-anytime-col" key={column.dateKey} data-date-key={column.dateKey}>
              {column.untimed.map((job) => (
                <button
                  type="button"
                  key={job.occurrence_key}
                  className={`sched-tl-chip status-${job.status} ${bandColor(job.id)}`}
                  onPointerDown={(event) => beginDrag(
                    { jobId: job.id, jobName: job.client_name, time: '', sourceDateKey: job.scheduled_for },
                    event,
                    () => onOpenJob(job.occurrence_key),
                  )}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenJob(job.occurrence_key); }
                  }}
                  title={`${job.client_name} — no start time set`}
                >
                  <span className="sched-tl-chip-name">{job.short_name}</span>
                  <span className="sched-tl-chip-note">No time</span>
                </button>
              ))}
              {column.planned.map((visit) => (
                <Link
                  key={`${visit.planId}-${visit.dateKey}`}
                  href="/dashboard/recurring"
                  className="sched-tl-chip sched-tl-chip-planned"
                  title={`${visit.clientName} — recurring visit, not booked yet`}
                >
                  <span className="sched-tl-chip-name">
                    <span aria-hidden="true">↻</span> {visit.clientName}
                  </span>
                  <span className="sr-only"> — recurring visit, not booked yet</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="sched-tl-scroll" ref={scrollRef}>
        <div className="sched-tl-body">
          <div className="sched-tl-gutter" aria-hidden="true">
            {axis.hours.slice(0, -1).map((minute) => (
              <span className="sched-tl-hour" key={minute}>{formatAxisHour(minute)}</span>
            ))}
          </div>

          {columns.map((column) => {
            const blocked = blockedDays[column.dateKey];
            return (
              <div
                key={column.dateKey}
                className={[
                  'sched-tl-col',
                  column.dateKey === todayKey ? 'today' : '',
                  overDateKey === column.dateKey ? 'drag-over' : '',
                  blocked ? 'blocked' : '',
                  armedJob ? 'armable' : '',
                ].filter(Boolean).join(' ')}
                data-date-key={column.dateKey}
                role={armedJob ? 'button' : undefined}
                tabIndex={armedJob ? 0 : undefined}
                aria-label={armedJob ? `Schedule ${armedJob.jobName} on ${column.dateKey}` : undefined}
                onClick={armedJob ? () => placeArmed(column.dateKey) : undefined}
                onKeyDown={armedJob ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); placeArmed(column.dateKey); }
                } : undefined}
              >
                {column.dateKey === todayKey && nowTop != null ? (
                  <div className="sched-tl-now" style={{ top: `${nowTop}%` }} aria-hidden="true" />
                ) : null}

                {column.blocks.map(({ job, entry, box }) => {
                  const assigned = (assignments[job.id] ?? [])
                    .map((id) => crew.find((member) => member.id === id))
                    .filter((member): member is CrewOption => Boolean(member));
                  const meta = metaByOccurrence.get(job.occurrence_key);
                  const size = blockSize(entry.endMinutes - entry.startMinutes);
                  return (
                    <div
                      key={job.occurrence_key}
                      role="button"
                      tabIndex={0}
                      className={[
                        'sched-tl-job',
                        `status-${job.status}`,
                        bandColor(job.id),
                        draggingJobId === job.id ? 'dragging' : '',
                        entry.columns > 1 ? 'shared' : '',
                      ].filter(Boolean).join(' ')}
                      data-size={size}
                      /* WIDTH MATTERS AS MUCH AS HEIGHT, and data-size only
                         knows about height. A three-way overlap in a 190px
                         column is 47px a block: an eight-hour job is still
                         "md" and was printing a city, a crew, a status badge
                         and "Day 2/4" into it, all four ellipsised to nothing.
                         Past two columns the block keeps the time and the name
                         and gives up the rest to the tooltip. */
                      data-narrow={entry.columns >= 3 ? 'true' : undefined}
                      style={{
                        top: `${box.top}%`,
                        height: `${box.height}%`,
                        left: `${box.left}%`,
                        width: `${box.width}%`,
                      }}
                      title={[
                        job.client_name,
                        `${formatClockMinutes(entry.startMinutes)} – ${formatClockMinutes(entry.endMinutes)}`,
                        job.city_label,
                        job.badge_label,
                        job.value_label,
                        assigned.length ? `Crew: ${assigned.map((member) => member.name).join(', ')}` : 'No crew assigned',
                        meta && meta.dayCount > 1 ? `Day ${meta.dayIndex + 1} of ${meta.dayCount}` : null,
                        readOnly ? null : 'drag to move',
                      ].filter(Boolean).join(' · ')}
                      onPointerDown={(event) => beginDrag(
                        { jobId: job.id, jobName: job.client_name, time: job.scheduled_time ?? '', sourceDateKey: job.scheduled_for },
                        event,
                        () => onOpenJob(job.occurrence_key),
                      )}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenJob(job.occurrence_key); }
                      }}
                    >
                      <span className="sched-tl-job-time">
                        {formatClockMinutes(entry.startMinutes)}
                        {size === 'md' ? <i>–{formatClockMinutes(entry.endMinutes)}</i> : null}
                      </span>
                      <strong className="sched-tl-job-name">
                        {job.confirmed ? <span className="calendar-confirm-tick" title="Confirmed by client">✓</span> : null}
                        {job.short_name}
                      </strong>
                      {/* Everything below is hidden by CSS on a short block —
                          see [data-size] in globals.css. It stays in the DOM so
                          a screen reader still hears the whole job. */}
                      {job.city_label ? <small className="sched-tl-job-city">{job.city_label}</small> : null}
                      <span className="sched-tl-job-foot">
                        <span className="sched-tl-job-crew">
                          {assigned.length === 0
                            ? 'No crew'
                            : assigned.length === 1
                              ? `Crew ${initials(assigned[0]!.name)}`
                              : `Crew ${initials(assigned[0]!.name)}+${assigned.length - 1}`}
                        </span>
                        <span className={`sched-tl-job-badge status-${job.badge_tone}`} title={job.badge_title ?? undefined}>
                          {job.badge_label}
                        </span>
                      </span>
                      {meta && meta.dayCount > 1 ? (
                        <span className="sched-tl-job-span">Day {meta.dayIndex + 1}/{meta.dayCount}</span>
                      ) : null}
                    </div>
                  );
                })}

                {blocked && column.blocks.length === 0 && column.untimed.length === 0 ? (
                  <p className="sched-tl-blocked-note">{blocked}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
