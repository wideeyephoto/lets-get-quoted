'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import UnscheduledQueue from './UnscheduledQueue';
import SchedulePanel from './SchedulePanel';
import JobDragHandle from './JobDragHandle';
import ClientScheduleOptionsCalendar from './client-schedule-options-calendar';
import type { CrewOption } from './schedule-calendar';
import type { QueueJob, SuggestContext } from './schedule-queue-types';

/**
 * Queue, calendar, and the job you have open — in that order, left to right.
 *
 * WHAT THE PAGE WAS. Calendar first with the queue in a rail to its right, and
 * every card in that rail carrying its own inline scheduling form. Opening one
 * pushed the card to roughly 480px and shoved the rest of the list off the
 * screen; at tablet widths the expanded form left a column of dead space beside
 * it. The list you were choosing from and the form you were filling in were the
 * same column, fighting for it.
 *
 * Three columns separate the three questions: which job, which day, and what
 * exactly am I committing to. The queue can stay a queue because it no longer
 * has to be a form as well.
 *
 * ONE STATE OWNER, NO CONTEXT. The calendar arrives as `children` so it stays
 * server-rendered between the two client columns — a provider would have meant
 * every consumer re-rendering when a selection changed, and the calendar is the
 * most expensive thing on the page.
 */

const ROW_STATE: Record<QueueJob['requestState'], string | null> = {
  none: null,
  sent: 'Dates sent — waiting on the client',
  needs_more_options: 'Client asked for different dates',
};

export default function ScheduleWorkbench({
  jobs,
  crew,
  context,
  clientAvailability,
  children,
}: {
  jobs: QueueJob[];
  crew: CrewOption[];
  context: SuggestContext;
  clientAvailability: React.ComponentProps<typeof ClientScheduleOptionsCalendar>['availability'];
  /** The calendar. Server-rendered, and it stays that way. */
  children: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = jobs.find((job) => job.id === selectedId) ?? null;

  /**
   * Whether the detail rail is a column or an overlay.
   *
   * Behavior only — the markup is the same either way, so there is nothing for
   * hydration to disagree about, and CSS stays the single source of the
   * breakpoint. It has to MATCH the stylesheet's third-column query or the
   * panel announces itself as a modal dialog while sitting in a docked column,
   * or the reverse — see the note on .schedule-workbench for why 1760.
   */
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1760px)');
    const sync = () => setDocked(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // A job that has just been scheduled leaves the queue. Holding its id would
  // leave the rail open on a job that is no longer waiting for a date.
  useEffect(() => {
    if (selectedId && !jobs.some((job) => job.id === selectedId)) setSelectedId(null);
  }, [jobs, selectedId]);

  const crewNameById = new Map(crew.map((member) => [member.id, member.name]));

  return (
    <div className="schedule-workbench">
      {jobs.length > 0 ? (
        <UnscheduledQueue count={jobs.length}>
          <section className="panel workspace-section-card sched-queue-col" id="unscheduled-jobs">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Needs a date</p>
              <h2>Unscheduled jobs</h2>
              {/* One sentence, and only where dragging is possible. The old pair
                  told every device to press a button AND described a drag the
                  reader could not do — on a phone the calendar it referred to
                  was not even on screen. */}
              <p className="schedule-drag-hint">
                Press a job to schedule it.
                <span className="schedule-drag-hint-mouse">
                  {' '}On a mouse you can also drag one straight onto a calendar date.
                </span>
              </p>
            </div>

            <ol className="sched-rows">
              {jobs.map((job) => {
                const crewNames = job.crewIds.map((id) => crewNameById.get(id)).filter(Boolean) as string[];
                const state = ROW_STATE[job.requestState];
                const on = job.id === selectedId;
                return (
                  <li key={job.id}>
                    <div className={`sched-row${on ? ' is-on' : ''}${job.approved ? '' : ' is-unapproved'}`}>
                      <JobDragHandle jobId={job.id} jobName={job.clientName} />

                      {/* THE WHOLE ROW IS THE CONTROL. It was a name that linked
                          to the job page with two buttons underneath — so the
                          large obvious target took you AWAY from the page you
                          were scheduling on. */}
                      <button
                        type="button"
                        className="sched-row-open"
                        aria-pressed={on}
                        onClick={() => setSelectedId(on ? null : job.id)}
                      >
                        <span className="sched-row-top">
                          <strong>{job.clientName}</strong>
                          {/* Readiness as a word, not only as the row's tint —
                              the tint is the same hue the calendar uses for an
                              unapproved chip, and a hue is not a sentence. */}
                          {job.approved ? null : <em className="sched-row-flag">Quote not approved</em>}
                        </span>
                        <span className="sched-row-what">{job.scope ?? 'No scope written yet'}</span>
                        <span className="sched-row-facts">
                          <span>{job.cityLabel}</span>
                          {/* An unestimated job is why a day can read as empty
                              when it is not, so it is named here rather than
                              left blank. */}
                          <span className={job.estimatedHours ? undefined : 'sched-row-missing'}>
                            {job.estimatedHours ? `${job.estimatedHours} hrs` : 'No duration'}
                          </span>
                          <span className={crewNames.length > 0 ? undefined : 'sched-row-missing'}>
                            {crewNames.length > 0 ? crewNames.join(', ') : 'No crew'}
                          </span>
                        </span>
                        {state ? <span className="sched-row-state">{state}</span> : null}
                      </button>

                      {/* ONE PRIMARY ACTION. "Choose date & time" and "Offer
                          customer times" were two buttons of equal weight on
                          every card; which of you picks the time is a question
                          inside scheduling, and it is asked in the panel. */}
                      <button
                        type="button"
                        className="btn primary sched-row-go"
                        onClick={() => setSelectedId(job.id)}
                        aria-label={`Schedule ${job.clientName}`}
                      >
                        Schedule
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="sched-rows-foot">
              <Link href="/dashboard/jobs">Open the jobs list →</Link>
            </p>
          </section>
        </UnscheduledQueue>
      ) : null}

      {children}

      <SchedulePanel
        job={selected}
        crew={crew}
        context={context}
        clientAvailability={clientAvailability}
        onClose={() => setSelectedId(null)}
        docked={docked}
      />
    </div>
  );
}
