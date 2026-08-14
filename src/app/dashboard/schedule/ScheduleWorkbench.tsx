'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import UnscheduledQueue from './UnscheduledQueue';
import SchedulePanel from './SchedulePanel';
import JobDragHandle from './JobDragHandle';
import ClientScheduleOptionsCalendar from './client-schedule-options-calendar';
import { jobBlockers, queueRank } from '@/lib/schedule-readiness';
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

  /**
   * WHAT TO DO NEXT, FIRST.
   *
   * The page already sorted approved work above unapproved. This sorts within
   * those groups by how close each job is to being finishable in one pass — a
   * job missing only a date beats one that will also need a duration, a crew
   * and an address. A stable tiebreak on the incoming order, so two equally
   * ready jobs keep the order the server sent and the list does not reshuffle
   * itself between renders.
   */
  const ordered = jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => queueRank(a.job) - queueRank(b.job) || a.index - b.index)
    .map((entry) => entry.job);

  return (
    <div className="schedule-workbench">
      {/* selectedJobId is passed down so the queue can get out of the way of the
          panel it just opened — below 1280 both are full-screen overlays, and
          the job's details opened behind the list. */}
      {jobs.length > 0 ? (
        <UnscheduledQueue count={jobs.length} selectedJobId={selectedId}>
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
              {ordered.map((job) => {
                const crewNames = job.crewIds.map((id) => crewNameById.get(id)).filter(Boolean) as string[];
                const state = ROW_STATE[job.requestState];
                const on = job.id === selectedId;
                // Approval has its own flag on the row above; repeating it as a
                // chip would say the same thing twice in two inches.
                const blockers = jobBlockers(job).filter((blocker) => blocker.key !== 'approval');
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
                          {/* Came in today. The queue is sorted by readiness
                              rather than by age, so without this the newest
                              request can sit ninth with nothing saying it is
                              new. */}
                          {job.requestedToday ? <em className="sched-row-new">Requested today</em> : null}
                        </span>
                        <span className="sched-row-what">{job.scope ?? 'No scope written yet'}</span>
                        <span className="sched-row-facts">
                          <span>{job.cityLabel}</span>
                          <span>{job.estimatedHours ? `${job.estimatedHours} hrs` : 'Duration not set'}</span>
                          <span>{crewNames.length > 0 ? crewNames.join(', ') : 'No crew yet'}</span>
                        </span>
                        {/* WHAT THIS JOB IS SHORT OF, as chips rather than as
                            three greyed-out facts above that read as absences
                            you have to notice. Same helper the panel reads, so
                            the card and the panel cannot disagree. Approval is
                            already stated as its own flag at the top of the
                            row, so it is not repeated down here. */}
                        {blockers.length > 0 ? (
                          <span className="sched-row-blockers">
                            {blockers.map((blocker) => (
                              <em key={blocker.key} className="sched-row-blocker">
                                {blocker.short}
                              </em>
                            ))}
                          </span>
                        ) : null}
                        {state ? <span className="sched-row-state">{state}</span> : null}
                      </button>

                      {/* THE ACTION DEPENDS ON WHETHER THERE IS ANYTHING TO ACT ON.
                          Every card used to get the same orange "Schedule"
                          button, approved or not — so a quote nobody has
                          accepted was offered the same next step as work that
                          is sold, directly underneath a row that says "Quote
                          not approved". The page contradicted itself twice in
                          two inches.

                          Approved work keeps the one primary action. An
                          unapproved quote leads with the thing that actually
                          unblocks it, and keeps scheduling as a quieter second
                          option — the product does allow a date on an
                          unapproved job and removing that would be taking away
                          a capability rather than fixing a label, so it is
                          named for what it is instead. */}
                      {job.approved ? (
                        <button
                          type="button"
                          className="btn primary sched-row-go"
                          onClick={() => setSelectedId(job.id)}
                          aria-label={`Schedule ${job.clientName}`}
                        >
                          Schedule
                        </button>
                      ) : (
                        <span className="sched-row-actions">
                          <Link
                            className="btn primary sched-row-go"
                            href={`/dashboard/jobs/${job.id}`}
                            aria-label={`Review the quote for ${job.clientName} to get it approved`}
                          >
                            Review quote
                          </Link>
                          <button
                            type="button"
                            className="btn ghost sched-row-tentative"
                            onClick={() => setSelectedId(job.id)}
                            aria-label={`Tentatively schedule ${job.clientName} before the quote is approved`}
                          >
                            Tentatively schedule
                          </button>
                        </span>
                      )}
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
