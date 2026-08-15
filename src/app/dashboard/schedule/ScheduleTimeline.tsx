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
 * 22, half of 44, which was itself down from 62 by way of 52. Thirteen hours —
 * 7am to 8pm — is 286px, so the whole working day and its evening take about a
 * quarter of a laptop screen and the week is readable without scrolling the
 * grid at all. That is the point of a short hour: the DAY fits, not the job.
 *
 * IT IS NOT A FREE NUMBER, and there are two places the bill lands.
 *
 * blockSize below is the first. A block's height is its duration times this,
 * so every pixel off the hour comes off every card. At 62 an hour-long job had
 * 62px and four lines; at 44, two; at 22 it has 22px and one. The thresholds
 * move with the hour every time, so a card prints only what it has room for —
 * the alternative is the same lines clipped mid-word, which is how a calendar
 * starts lying about what it knows. A city now needs a three-hour job to earn
 * its line, where at 44 it needed ninety minutes.
 *
 * The second is short jobs, and it is the reason .sched-tl-job carries a
 * min-height. Half an hour is 11px here, and 11px cannot hold a line of type at
 * any size worth reading — so the shortest blocks are floored at one row. Their
 * TOP edge is still exactly right, which is what the eye reads a calendar by;
 * their bottom edge overstates a very short job by a few pixels. That is the
 * trade this height buys, taken deliberately: a block whose height is
 * approximate beats a block nobody can read.
 */
const HOUR_PX = 22;

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
 * the one that has to fit — and against the TABLET hour, 21px, because it is
 * the smaller of the two and a threshold that only works on the desktop one
 * clips on every tablet. At 21px an hour, 180 minutes is 63px (sm needs 60)
 * and 240 is 84px (md needs 80). Both clear, neither by much.
 *
 * They have moved up twice now, once when the hour came down from 62px and
 * again when it halved from 44. An hour-long job lost its city line the first
 * time; a ninety-minute one lost it this time. That is the trade a shorter
 * grid buys, taken deliberately each time: the line is still in the DOM for a
 * screen reader, still in the hover title, and still on the card for any job
 * long enough to hold it. A clipped line would have been the alternative, and
 * a calendar that prints half a city name is worse than one that prints none.
 */
function blockSize(minutes: number): 'xs' | 'sm' | 'md' {
  if (minutes < 180) return 'xs';
  if (minutes < 240) return 'sm';
  return 'md';
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

/**
 * The color a block is, and what it means.
 *
 * IT USED TO MEAN NOTHING. Blocks took their color from a six-way hash of the
 * job's id, inherited from the month chips: a day showed blue, yellow, purple
 * and green and none of it encoded anything a dispatcher could act on. Asked
 * for a legend, the honest answer was that there was nothing to put in one.
 *
 * Status is the thing the calendar already knows and the thing that changes
 * what you do next, so it is what the color carries now. CalendarLegend names
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
  const { beginDrag, overDateKey, draggingJobId, armedJob, placeArmed, aimSlot } = useScheduleDrag();
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

  /**
   * HOW MANY LANES THE COLUMN CAN ACTUALLY HOLD.
   *
   * This was `1 or 2` — a width constraint written as a constant, and the
   * constant was wrong in exactly one place. Day view is ONE column across the
   * whole calendar, about a thousand pixels, and it was still folding
   * everything past the second lane behind a "+3" whose only action is "open
   * this day" — which is the view you are already in. A dead control sitting on
   * top of three jobs you then had no way to reach at all.
   *
   * Derived from the measured width instead, against the same MIN_LANE_PX the
   * old rule used, so the narrow cases are unchanged: a 190px week column still
   * gets two, a 99px one still gets one, and the day gets as many as fit.
   * Null until the first measurement, where two is the server's guess.
   */
  const maxLanes =
    colWidth == null ? 2 : Math.max(1, Math.floor((colWidth - OVERFLOW_PX) / MIN_LANE_PX));

  /**
   * …and whether the marker that remains is a control at all.
   *
   * It navigates to the day on its own. With one day on screen that is where
   * you are, so there is nothing to press — it becomes a count, which is what
   * it was always saying.
   */
  const overflowOpensDay = Boolean(onOpenDay) && dayKeys.length > 1;

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

    /**
     * THE HOURS WITH NOTHING IN THEM, which are the ones you can point at.
     *
     * Computed from the packed entries rather than from the raw jobs so the
     * folded-away overlaps count too: an hour hidden behind a "+2" marker is
     * occupied, and offering it as free would be offering a slot on top of work
     * the grid has already decided it has no room to draw.
     *
     * An hour is free only if NOTHING overlaps it at all — not "mostly free",
     * not "free in the second half". A calendar that offers 10:00 while a job
     * runs 10:30–11:30 is a calendar proposing a double-booking.
     */
    const busy = [
      ...laid.map((entry) => [entry.startMinutes, entry.endMinutes] as const),
      ...overflows.map((overflow) => [overflow.startMinutes, overflow.endMinutes] as const),
    ];
    const freeHours = axis.hours
      .slice(0, -1)
      .filter((hour) => !busy.some(([start, end]) => start < hour + 60 && end > hour));

    return {
      dateKey,
      freeHours,
      /* A job with no start time cannot be placed on a clock, and guessing one
         would be inventing a commitment. They get a strip above the axis
         instead — the same place an all-day event goes in every calendar. */
      untimed: dayJobs.filter((job) => parseClockMinutes(job.scheduled_time) == null),
      blocks: (() => {
        const placed = laid
          .map((entry) => {
            const job = jobByKey.get(entry.key);
            if (!job) return null;
            return { job, entry, box: blockPosition(entry, axis) };
          })
          .filter((block): block is NonNullable<typeof block> => block !== null);

        /**
         * THE JOB BEFORE THIS ONE, IF IT IS SOMEWHERE ELSE.
         *
         * The honest travel warning available from data this page already has.
         * There is no distance here and computing one would be a routing call
         * per job on a calendar that just gave one up — but "the 9am is in
         * Fenton and the 11am is in Riverside" is a real fact about a real
         * drive, and it is the one a dispatcher reads a day for.
         *
         * Read in START order and off the previous TIMED job, not the previous
         * lane: two blocks side by side at the same hour are not a journey.
         * Silent when either city is missing, because "unknown to Riverside" is
         * not a warning about anything.
         */
        const inOrder = [...placed].sort((a, b) => a.entry.startMinutes - b.entry.startMinutes);
        const travel = new Map<string, string | null>();
        let previous: { city: string; endMinutes: number } | null = null;
        for (const block of inOrder) {
          const city = block.job.city_label?.trim() || '';
          travel.set(
            block.job.occurrence_key,
            previous && city && previous.city && previous.city !== city && block.entry.startMinutes >= previous.endMinutes
              ? previous.city
              : null,
          );
          if (city) previous = { city, endMinutes: block.entry.endMinutes };
        }

        return placed.map((block) => ({ ...block, travelFrom: travel.get(block.job.occurrence_key) ?? null }));
      })(),
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
                /* "3" sat at the far right of a row, where nothing else was a
                   number. Stacked under a 1.4rem "11" it would have read as a
                   second date, so it says what it counts. */
                <span className="sched-tl-head-count">{dayJobs.length} {dayJobs.length === 1 ? 'job' : 'jobs'}</span>
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
              {column.untimed.map((job) => {
                const assigned = (assignments[job.id] ?? [])
                  .map((id) => crew.find((member) => member.id === id)?.name)
                  .filter((name): name is string => Boolean(name));
                const facts = [
                  job.city_label,
                  job.hours_label ? `${job.hours_label} est.` : 'Duration needed',
                  assigned.length > 0 ? assigned.join(', ') : 'No crew',
                ].filter((fact): fact is string => Boolean(fact));
                return (
                  <button
                    type="button"
                    key={job.occurrence_key}
                    className={`sched-tl-chip sched-tl-chip-untimed status-${job.status} ${statusColor(job.status)}`}
                    onPointerDown={(event) => beginDrag(
                      { jobId: job.id, jobName: job.client_name, time: '', sourceDateKey: job.scheduled_for },
                      event,
                      () => onOpenJob(job.occurrence_key),
                    )}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenJob(job.occurrence_key); }
                    }}
                    title={`${job.client_name} — ${job.scope_label ?? 'scope not set'} — ${facts.join(' — ')} — no start time set`}
                  >
                    <span className="sched-tl-chip-lines">
                      <strong className="sched-tl-chip-name">{job.short_name}</strong>
                      {job.scope_label ? <span className="sched-tl-chip-scope">{job.scope_label}</span> : null}
                      <span className="sched-tl-chip-meta">{facts.join(' · ')}</span>
                    </span>
                    <span className="sched-tl-chip-note">No time</span>
                  </button>
                );
              })}
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

                {/**
                 * THE EMPTY HOURS, AS TARGETS.
                 *
                 * An empty column used to be scenery: the only way to book into
                 * it was to go to the queue, arm a job, and come back — and
                 * having come back, clicking anywhere in the column placed the
                 * job with no time at all, so aiming at ten o'clock and being
                 * asked "pick a start time" threw away the only thing the click
                 * had said.
                 *
                 * REAL BUTTONS, ONE PER FREE HOUR, rather than a click handler
                 * doing pointer arithmetic on the column. Arithmetic cannot be
                 * reached by a keyboard, has no accessible name, and has no way
                 * to know it is over a job — these are laid out under the
                 * blocks, so an hour that has work in it never renders one.
                 *
                 * ONE TAB STOP PER COLUMN. Ten hours across seven days is
                 * seventy focus stops between the calendar and whatever is after
                 * it, which would make the grid something to escape rather than
                 * something to use. The first free hour of each column is the
                 * stop; Up and Down move within it, which is the same roving
                 * pattern any date grid uses.
                 *
                 * `readOnly` hides them entirely — a demo that offers to book
                 * work and then cannot is worse than one that offers nothing.
                 */}
                {!readOnly && !blocked
                  ? column.freeHours.map((hour, index) => {
                      const time = `${String(Math.floor(hour / 60)).padStart(2, '0')}:${String(hour % 60).padStart(2, '0')}`;
                      const when = `${formatClockMinutes(hour)} on ${new Date(`${column.dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`;
                      return (
                        <button
                          key={hour}
                          type="button"
                          className="sched-tl-slot"
                          style={{
                            top: `${((hour - axis.startMinutes) / axis.totalMinutes) * 100}%`,
                            height: `${(60 / axis.totalMinutes) * 100}%`,
                          }}
                          tabIndex={index === 0 ? 0 : -1}
                          aria-label={armedJob ? `Schedule ${armedJob.jobName} at ${when}` : `Book a job at ${when}`}
                          onClick={(event) => {
                            /* The column itself is a drop target while a job is
                               armed, and its handler carries no time. Without
                               this the bubble would immediately re-place the
                               job at the whole day, undoing the hour. */
                            event.stopPropagation();
                            if (armedJob) placeArmed(column.dateKey, time);
                            else aimSlot({ dateKey: column.dateKey, time, label: when });
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                            event.preventDefault();
                            const slots = Array.from(
                              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.sched-tl-slot') ?? [],
                            );
                            const at = slots.indexOf(event.currentTarget);
                            slots[at + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
                          }}
                        >
                          <span aria-hidden="true">＋</span>
                        </button>
                      );
                    })
                  : null}

                {column.blocks.map(({ job, entry, box, travelFrom }) => {
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
                        // The length, said as a length. The block's height is
                        // the only place a duration was stated, and a height is
                        // a comparison rather than a number — you can see that
                        // one job is longer than another and not that it is
                        // three hours.
                        job.hours_label,
                        job.scope_label,
                        job.city_label,
                        travelFrom ? `Different town from the job before it, in ${travelFrom}` : null,
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
                      {job.city_label ? (
                        <small className="sched-tl-job-city">
                          {/* THE ONLY NEW MARK ON THE BLOCK, and it is on the
                              city line because that is what it is about. A
                              different town from the job before means a drive
                              between them, which is the thing that makes a day
                              undeliverable while every job on it looks fine. */}
                          {travelFrom ? (
                            <i className="sched-tl-job-travel" title={`Different town from the job before it, in ${travelFrom}`}>↗</i>
                          ) : null}
                          {job.city_label}
                        </small>
                      ) : null}
                      <span className="sched-tl-job-foot">
                        <span className="sched-tl-job-crew">
                          {assigned.length === 0
                            ? 'No crew'
                            : assigned.length === 1
                              ? `Crew ${initials(assigned[0]!.name)}`
                              : `Crew ${initials(assigned[0]!.name)}+${assigned.length - 1}`}
                        </span>
                        {/* Only on the tallest blocks, and only when the job has
                            one. A duration is what the height already implies,
                            so it earns its line by being exact rather than by
                            being new — and on anything shorter the row it would
                            take belongs to the crew and the status. */}
                        {size === 'md' && job.hours_label ? (
                          <span className="sched-tl-job-hours">{job.hours_label}</span>
                        ) : null}
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

                {/* WHAT THE LANES COULD NOT HOLD.
                    Positioned over the hidden jobs' own minutes rather than at
                    the top of the day, so it points at when they are. Pressing
                    it opens that day on its own, where every one of them fits
                    at full width — which is the "accessible popover or day
                    agenda" without a second overlay to trap focus in.

                    A BUTTON ONLY WHERE THERE IS SOMEWHERE TO GO. On the day
                    view its destination is the view you are already in, so it
                    was a control that looked like one and did nothing. There it
                    is a count instead — and with the lane cap now taken from
                    the column's real width, a day wide enough to show the jobs
                    does that rather than counting them. */}
                {column.overflows.map((overflow) => {
                  const label = `${overflow.keys.length} more overlapping ${overflow.keys.length === 1 ? 'job' : 'jobs'}${overflow.names.length ? ` — ${overflow.names.join(', ')}` : ''}`;
                  const position = { top: `${overflow.box.top}%`, height: `${overflow.box.height}%` };
                  const key = `${column.dateKey}-of-${overflow.startMinutes}`;
                  return overflowOpensDay ? (
                    <button
                      key={key}
                      type="button"
                      className="sched-tl-overflow"
                      style={position}
                      title={`Also on this day at the same time: ${overflow.names.join(', ')}. Open the day to see them.`}
                      onClick={() => onOpenDay?.(column.dateKey)}
                    >
                      <span aria-hidden="true">+{overflow.keys.length}</span>
                      <span className="sr-only">{label}. Open this day to see them.</span>
                    </button>
                  ) : (
                    <span key={key} className="sched-tl-overflow is-static" style={position} title={label}>
                      <span aria-hidden="true">+{overflow.keys.length}</span>
                      <span className="sr-only">{label}.</span>
                    </span>
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
