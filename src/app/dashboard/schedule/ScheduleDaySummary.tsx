'use client';

import { capacityStatus, crewLabel } from '@/lib/schedule-agenda';

/* The same words the weather digest uses, so a day does not read one way in an
   email and another on the calendar. Duplicated as a map rather than imported
   from lib/weather, which pulls the whole assessment engine into a client
   bundle for four strings. */
const RISK_WORD: Record<string, string> = {
  watch: 'Keep an eye on it',
  risky: 'Risky',
  unworkable: "Don't plan on it",
};
import { openQueue } from './QueueTriggers';
import type { CalendarJob, CrewOption } from './schedule-calendar';

/**
 * What the day you are looking at actually holds — above the day, not inside it.
 *
 * THE DAY VIEW WAS THE ONLY ONE THAT SAID NOTHING ABOUT ITSELF. Capacity colors
 * every cell by how full it is, the mobile agenda prints "2h of 8h booked" over
 * the day it is showing, and the desktop Day view — the view you open when you
 * want to know about ONE day — drew an empty grid with a job or two on it and
 * left you to add the hours up. Same numbers, same words, same component
 * (capacityStatus) as the phone, so a day cannot read as busy on one and open
 * on the other.
 *
 * And when the day is empty it says so with the way out attached, rather than
 * showing eleven hours of ruled lines and no explanation of what to do about it.
 */
export default function ScheduleDaySummary({
  dateKey,
  jobs,
  crew,
  assignments,
  bookedHours,
  unknownJobs,
  capacityHours,
  blockedReason,
  queueCount,
  weather,
}: {
  dateKey: string;
  jobs: CalendarJob[];
  crew: CrewOption[];
  assignments: Record<string, string[]>;
  bookedHours: number;
  unknownJobs: number;
  capacityHours: number;
  /** Set when the day is taken off entirely, in which case capacity is moot. */
  blockedReason: string | null;
  /** Approved work with no date, so the empty state can name what it would do. */
  queueCount: number;
  /**
   * What the sky is doing on this day, already judged against this trade's
   * thresholds — a roofer's "risky" and a painter's are different numbers.
   *
   * Null when the account has weather alerts switched off, when it has no
   * service center to forecast for, or when the day is past the end of the
   * forecast. Nothing is drawn in any of those cases: a weather line that says
   * "unknown" is worse than no weather line.
   */
  weather: { level: string; reasons: string[]; summary: string } | null;
}) {
  const capacity = capacityStatus(bookedHours, capacityHours, unknownJobs);

  // WHO IS ON THIS DAY, AND WHO IS NOT. The second half is the useful half:
  // "4 of 6" answers "can I take this job on" in a way that a list of the four
  // people already out does not.
  const working = new Set<string>();
  for (const job of jobs) for (const id of assignments[job.id] ?? []) working.add(id);
  const free = crew.filter((member) => !working.has(member.id));
  const freeNames = crewLabel(free.map((member) => member.name));

  return (
    <div className="sched-daysum">
      <div className="sched-cap" data-state={blockedReason ? 'empty' : capacity.state}>
        <p className="sched-cap-text">
          <strong>{blockedReason ? 'Day off' : capacity.word}</strong>
          <span>{blockedReason ?? capacity.detail}</span>
        </p>
        {blockedReason ? null : (
          <div className="sched-cap-bar" role="img" aria-label={capacity.label}>
            <span style={{ width: `${capacity.pct}%` }} />
          </div>
        )}
      </div>

      {/* ONLY WHEN IT IS WORTH SAYING. 'clear' is the answer on most days, and
          a line reading "Looks fine" every day is furniture you stop seeing —
          which is exactly what makes the one bad Tuesday invisible. */}
      {weather && weather.level !== 'clear' ? (
        <p className="sched-daysum-weather" data-level={weather.level}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.4 10a3.75 3.75 0 0 1-.4 7.5Z" />
            <path d="M9 20.5l-.7 1.4M13 20.5l-.7 1.4M17 20.5l-.7 1.4" />
          </svg>
          <strong>{RISK_WORD[weather.level] ?? 'Check the forecast'}</strong>
          {/* The reasons, not the poetry: "1.1in of rain" and "gusts to 31mph"
              are what decides whether the crew goes out. The NWS sentence is
              kept in the title for anyone who wants it. */}
          <span title={weather.summary}>{weather.reasons.join(' · ') || weather.summary}</span>
        </p>
      ) : null}

      {crew.length > 0 ? (
        <p className="sched-daysum-crew">
          <strong>
            {free.length} of {crew.length}
          </strong>{' '}
          {free.length === 1 ? 'person' : 'people'} free
          {freeNames ? <span className="sched-daysum-who"> · {freeNames}</span> : null}
        </p>
      ) : null}

      {/* NOTHING ON THE DAY IS A STATE WITH AN ACTION, not a blank grid. It only
          offers the queue when there is something in it — an empty prompt
          pointing at an empty list is worse than silence. */}
      {jobs.length === 0 && !blockedReason ? (
        <p className="sched-daysum-empty">
          Nothing booked{' '}
          {queueCount > 0 ? (
            <button type="button" onClick={() => openQueue()}>
              Schedule {queueCount === 1 ? 'the job' : `one of the ${queueCount} waiting`}
            </button>
          ) : (
            <span className="sched-daysum-quiet">and nothing waiting for a date.</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
