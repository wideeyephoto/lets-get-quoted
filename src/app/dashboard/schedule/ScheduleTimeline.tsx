'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { weekdayShort, dayOfMonth } from '@/lib/schedule-agenda';
import {
  blockPosition,
  buildTimeAxis,
  capLanes,
  formatAxisHour,
  formatClockMinutes,
  overflowPosition,
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
 *
 * 44, down from 62 by way of 52. Thirteen hours — 7am to 8pm — is 572px, so
 * the whole working day and its evening fit on a laptop with no scrollbar
 * inside the page's own scrollbar, and with room left under the calendar for
 * the unscheduled rail. That was the point of shortening it.
 *
 * IT IS NOT A FREE NUMBER, and blockSize below is where the bill lands. A
 * block's height is its duration times this, so every pixel taken off the hour
 * is taken off every card on the grid. At 62 an hour-long job had 62px and
 * could carry four lines; at 44 it has 44 and can carry two. The thresholds
 * moved with it, so the card still prints only what it has room for — the
 * alternative is the same four lines clipped mid-word, which is how a calendar
 * starts lying about what it knows.
 *
 * Anything shorter than this and the SM band stops working: three lines need
 * about 60px, so the shortest job that can carry a city — an hour and a half —
 * would fall under it. That is the floor, not a preference.
 */
const HOUR_PX = 44;

/**
 * The bottom of the calendar: 8pm, so the last labelled hour is 7 PM.
 *
 * The gutter labels the TOP of each row (hours.slice(0, -1)), so an axis
 * ending at 19:00 puts "6 PM" on the last label and leaves the 6–7pm band
 * unnamed at its foot — which reads as a calendar that stops at six. Ending at
 * 20:00 makes 7 PM a row of its own, which is also the row an evening job
 * needs somewhere to land.
 *
 * A floor, not a cap. A job at 9pm still grows the axis to hold it; the point
 * is only that a quiet week does not shrink to the working day and leave the
 * evening off the grid.
 */
const AXIS_END_MINUTES = 20 * 60;

/**
 * How narrow a block is allowed to get before a lane is taken away.
 *
 * The audit's floor is "about 56px", and lane arithmetic alone cannot always
 * reach it: a 99px day column — which is what a seven-day week is on a 1440
 * laptop with the unscheduled rail up — has 53px to give even at ONE lane
 * beside a marker. So this is not a guarantee, it is a preference: prefer two
 * lanes, drop to one the moment two would be worse than one, and past that the
 * only remedy is a wider calendar (collapse the rail) or fewer days (the
 * three-day or Day view). Better to say that than to draw four 26px slivers.
 */
const MIN_LANE_PX = 56;
/** Must match --tl-overflow-w in globals.css. */
const OVERFLOW_PX = 46;

/**
 * How much of a block has to exist before its detail lines are worth printing.
 *
 * In MINUTES, not pixels, so the thresholds survive the hour height changing
 * per breakpoint — which is the whole reason this is a duration and not a
 * measurement. What each band draws, and what that costs at 12px type with the
 * card's own padding and border:
 *
 *   xs   time and name, side by side on one row          ~20px
 *   sm   time, name, city, stacked                       ~60px
 *   md   all of it — crew, status, "Day 2 of 4"          ~80px
 *
 * The thresholds are set from the SHORTEST job in each band, because that is
 * the one that has to fit: at 44px an hour, 90 minutes is 66px (sm needs 60)
 * and 120 minutes is 88px (md needs 80). Both clear, neither by much.
 *
 * They moved up when the hour came down from 62px, and an hour-long job lost
 * its city line to it. That is the trade the shorter grid buys, taken
 * deliberately: the line is still in the DOM for a screen reader, still in the
 * hover title, and still on the card in Day view, where an hour is 44px of a
 * much wider column. A clipped line would have been the alternative, and a
 * calendar that prints half a city name is worse than one that prints none.
 */
function blockSize(minutes: number): 'xs' | 'sm' | 'md' {
  if (minutes < 90) return 'xs';
  if (minutes < 120) return 'sm';
  return 'md';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/**
 * The colour a block is, and what it means.
 *
 * IT USED TO MEAN NOTHING. Blocks took their colour from a six-way hash of the
 * job's id, inherited from the month chips: a day showed blue, yellow, purple
 * and green and none of it encoded anything a dispatcher could act on. Asked
 * for a legend, the honest answer was that there was nothing to put in one.
 *
 * Status is the thing the calendar already knows and the thing that changes
 * what you do next, so it is what the colour carries now. CalendarLegend names
 * all four. The hash's one real job — telling two abutting blocks apart — is
 * done by the hairline box-shadow on .sched-tl-job.
 */
function statusColor(status: string): string {
  return `calendar-job-status-${status}`;
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
  onOpenDay,
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
  /** Press a day head, or an overflow marker, to open that day on its own. */
  onOpenDay?: (dateKey: string) => void;
  readOnly?: boolean;
}) {
  const { beginDrag, overDateKey, draggingJobId, armedJob, placeArmed } = useScheduleDrag();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /**
   * How wide one day actually is, measured rather than assumed.
   *
   * The lane count is a layout decision and layout is the only thing that knows
   * it: the same seven-day week is 190px a column with the rail collapsed and
   * 99px with it up, and 99px cannot hold two readable lanes beside a marker.
   * Starts null so the server and the first client render agree on two lanes —
   * the width is not knowable until there is a box to measure.
   */
  const [colWidth, setColWidth] = useState<number | null>(null);
  useEffect(() => {
    const node = bodyRef.current?.querySelector('.sched-tl-col');
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setColWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [dayKeys.length]);

  const maxLanes = colWidth != null && colWidth < MIN_LANE_PX * 2 + OVERFLOW_PX ? 1 : 2;

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
    return buildTimeAxis({ entries, workdayStart, workdayEnd, minEndMinutes: AXIS_END_MINUTES });
  }, [dayKeys, jobsByDate, metaByOccurrence, workdayStart, workdayEnd]);

  /** Per column: the blocks with a position, and the ones with no time at all. */
  const columns = useMemo(() => dayKeys.map((dateKey) => {
    const dayJobs = jobsByDate.get(dateKey) ?? [];
    const entries: TimelineEntry[] = dayJobs.map((job) => ({
      key: job.occurrence_key,
      startMinutes: parseClockMinutes(job.scheduled_time),
      durationMinutes: metaByOccurrence.get(job.occurrence_key)?.minutes ?? 60,
    }));
    /* TWO LANES, AND A COUNT FOR THE REST. packOverlaps gives a cluster as many
       columns as it needs, which is honest and, past two, unreadable: a
       four-way overlap in a 190px column is 47px a block, and four slivers say
       less than "two jobs, and two more". capLanes keeps the two widest and
       folds everything else into a marker over the hidden jobs' own minutes.
       Nothing is ever hidden without being counted. */
    const { entries: laid, overflows } = capLanes(packOverlaps(entries), maxLanes);
    const jobByKey = new Map(dayJobs.map((job) => [job.occurrence_key, job]));

    return {
      dateKey,
      /* A job with no start time cannot be placed on a clock, and guessing one
         would be inventing a commitment. They get a strip above the axis
         instead — the same place an all-day event goes in every calendar. */
      untimed: dayJobs.filter((job) => parseClockMinutes(job.scheduled_time) == null),
      blocks: laid
        .map((entry) => {
          const job = jobByKey.get(entry.key);
          if (!job) return null;
          return { job, entry, box: blockPosition(entry, axis) };
        })
        .filter((block): block is NonNullable<typeof block> => block !== null),
      overflows: overflows.map((overflow) => ({
        ...overflow,
        box: overflowPosition(overflow, axis),
        // Read out on the marker, so "+2 overlapping" is not the whole story a
        // screen reader gets.
        names: overflow.keys
          .map((key) => jobByKey.get(key)?.short_name)
          .filter((name): name is string => Boolean(name)),
      })),
      planned: plannedByDate.get(dateKey) ?? [],
    };
  }), [axis, dayKeys, jobsByDate, maxLanes, metaByOccurrence, plannedByDate]);

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
          const closed = blockedDays[dateKey];
          /* "OFF" said nothing about what it was off — the crew, the day, the
             column? "Closed" is the working-hours setting in the word the
             setting uses. And a closed day WITH work on it is the one state
             that needs saying out loud: the jobs are real and they are outside
             configured hours. Nothing is moved or hidden either way. */
          const closedWithWork = Boolean(closed) && dayJobs.length > 0;
          const label = `${weekdayShort(dateKey)} ${dayOfMonth(dateKey)}`;
          return (
            <button
              key={dateKey}
              type="button"
              /* The head was a div, so the obvious thing to do with "Fri 7" —
                 press it to see Friday — did nothing. */
              className={`sched-tl-day-head${dateKey === todayKey ? ' today' : ''}`}
              onClick={() => onOpenDay?.(dateKey)}
              title={`Open ${label}${dayJobs.length ? ` — ${dayJobs.length} ${dayJobs.length === 1 ? 'job' : 'jobs'}` : ''}`}
            >
              <small>{weekdayShort(dateKey).toUpperCase()}</small>
              <strong>{dayOfMonth(dateKey)}</strong>
              {closed ? (
                <span
                  className="sched-tl-head-flag blocked"
                  data-with-work={closedWithWork || undefined}
                  title={
                    closedWithWork
                      ? `${closed} — ${dayJobs.length} ${dayJobs.length === 1 ? 'job is' : 'jobs are'} scheduled outside configured working hours. Nothing has been moved.`
                      : closed
                  }
                >
                  Closed{closedWithWork ? ` · ${dayJobs.length}` : ''}
                </span>
              ) : fullDates.has(dateKey) ? (
                <span className="sched-tl-head-flag full" title="Daily capacity reached">Full</span>
              ) : dayJobs.length > 0 ? (
                <span className="sched-tl-head-count">{dayJobs.length}</span>
              ) : null}
              <span className="sr-only">
                {closedWithWork
                  ? ` — closed, and ${dayJobs.length} ${dayJobs.length === 1 ? 'job is' : 'jobs are'} scheduled outside configured working hours`
                  : closed
                    ? ' — closed'
                    : ''}
                . Open this day.
              </span>
            </button>
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
                  className={`sched-tl-chip status-${job.status} ${statusColor(job.status)}`}
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
        <div className="sched-tl-body" ref={bodyRef}>
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
                        statusColor(job.status),
                        draggingJobId === job.id ? 'dragging' : '',
                        entry.columns > 1 ? 'shared' : '',
                      ].filter(Boolean).join(' ')}
                      data-size={size}
                      /* data-narrow used to live here, keyed off
                         `entry.columns >= 3`. capLanes caps columns at two, so
                         that condition became unreachable the moment the lane
                         cap shipped — the attribute never appeared and four CSS
                         rules keyed off it could never match. The job it was
                         doing (width, which data-size cannot see) is done
                         properly now by container queries on the card itself. */
                      /* Percentages while the column is uncrowded. Once a
                         marker is drawn beside them the lanes have to give up
                         its fixed width, which no percentage can express — so
                         the two cases are two different calcs rather than one
                         approximation. */
                      style={
                        column.overflows.length
                          ? {
                              top: `${box.top}%`,
                              height: `${box.height}%`,
                              left: `calc((100% - var(--tl-overflow-w)) / ${entry.columns} * ${entry.column})`,
                              width: `calc((100% - var(--tl-overflow-w)) / ${entry.columns})`,
                            }
                          : {
                              top: `${box.top}%`,
                              height: `${box.height}%`,
                              left: `${box.left}%`,
                              width: `${box.width}%`,
                            }
                      }
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

                {/* WHAT THE TWO LANES COULD NOT HOLD.
                    Positioned over the hidden jobs' own minutes rather than at
                    the top of the day, so it points at when they are. Pressing
                    it opens that day on its own, where every one of them fits
                    at full width — which is the "accessible popover or day
                    agenda" without a second overlay to trap focus in. */}
                {column.overflows.map((overflow) => (
                  <button
                    key={`${column.dateKey}-of-${overflow.startMinutes}`}
                    type="button"
                    className="sched-tl-overflow"
                    style={{ top: `${overflow.box.top}%`, height: `${overflow.box.height}%` }}
                    title={`Also on this day at the same time: ${overflow.names.join(', ')}. Open the day to see them.`}
                    onClick={() => onOpenDay?.(column.dateKey)}
                  >
                    <span aria-hidden="true">+{overflow.keys.length}</span>
                    <span className="sr-only">
                      {overflow.keys.length} more overlapping {overflow.keys.length === 1 ? 'job' : 'jobs'}
                      {overflow.names.length ? ` — ${overflow.names.join(', ')}` : ''}. Open this day to see them.
                    </span>
                  </button>
                ))}

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
