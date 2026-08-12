'use client';

import Link from 'next/link';
import { OPEN_SCHEDULE_QUEUE_EVENT } from './dock-events';

/**
 * ONE BAR WHERE THERE WERE FOUR CONTROLS.
 *
 * Every one of these said the same thing about the same jobs and pointed at the
 * same list, and on a phone three of them were stacked one under the other
 * before the calendar had drawn a single date:
 *
 *   "11 need dates"        in the summary line under the title
 *   "+ Schedule 11 jobs"   the primary button
 *   "11 jobs need dates"   the banner, with its own count badge and arrow
 *   "11 · Ready to book"   the fourth stat card, also linking to the queue
 *
 * Four is not emphasis. It is four chances to read a different number and
 * conclude the page disagrees with itself — which it did, because two of them
 * counted every unscheduled job and two counted only the approved ones.
 *
 * WHAT REPLACES THEM SAYS BOTH NUMBERS AND OFFERS BOTH ACTIONS. The split is
 * real and it is the thing the old controls kept hiding: work that is approved
 * and waiting for a date is a scheduling job, and a quote nobody has accepted is
 * a sales one. They are different tasks, so they get different buttons rather
 * than one button and a footnote.
 */

/**
 * @param focusJobId Which card to land on. The queue focuses the first job
 *   waiting by default, and for "review the quote" that is the wrong one — the
 *   approved jobs are sorted above the unapproved ones.
 */
function openQueue(focusJobId?: string) {
  /* This used to have to undo a collapsed desktop rail first — RailToggle could
     hide the queue's docked home behind a body attribute, so the event alone
     would open something that was display:none. That toggle is gone, nothing
     sets the attribute now, and the rail is always there to open.

     The stored preference is still cleared, once, for anyone who left the rail
     collapsed before it went. */
  try {
    window.localStorage.removeItem('lgq.schedule.railCollapsed');
  } catch {
    // Storage disabled — nothing was stored to begin with.
  }
  window.dispatchEvent(new CustomEvent(OPEN_SCHEDULE_QUEUE_EVENT, { detail: focusJobId ? { focusJobId } : undefined }));
}

export type ScheduleQueueBarProps = {
  /** Approved work with no date. What the nav rail's Schedule badge counts. */
  approved: number;
  /** Quotes nobody has accepted yet, also with no date. A sales task. */
  unapproved: number;
  /**
   * The first unapproved job, so a single one can be opened directly rather
   * than by opening a list and hunting for it. Null when there are none.
   */
  firstUnapprovedId: string | null;
};

export function ScheduleQueueBar({ approved, unapproved, firstUnapprovedId }: ScheduleQueueBarProps) {
  const total = approved + unapproved;

  /* NOTHING WAITING IS STILL A STATE WORTH A CONTROL. Booking work is why
     somebody opens this page, and with an empty queue there is no list to open —
     so it becomes the way to make a job in the first place. */
  if (total === 0) {
    return (
      <div className="sched-queue-bar is-clear">
        <p className="sched-queue-bar-line">
          <strong>Everything is scheduled</strong>
          <span>No job is waiting for a date.</span>
        </p>
        <div className="sched-queue-bar-actions">
          <Link className="btn primary sched-queue-bar-go" href="/dashboard/jobs">
            <span aria-hidden="true">＋</span> New job
          </Link>
        </div>
      </div>
    );
  }

  // "3 jobs ready to schedule · 1 awaiting approval", with either half dropped
  // when it is zero rather than printed as a zero.
  const parts = [
    approved > 0 ? `${approved} ${approved === 1 ? 'job' : 'jobs'} ready to schedule` : null,
    unapproved > 0 ? `${unapproved} awaiting approval` : null,
  ].filter(Boolean);

  return (
    <div className="sched-queue-bar" data-tone={approved > 0 ? 'ready' : 'waiting'}>
      <p className="sched-queue-bar-line">
        {/* THE BADGE ONLY EARNS ITS PLACE WHEN IT SAYS SOMETHING NEW. With one
            population the total IS the number the sentence opens with, so the
            badge rendered "11" immediately followed by "11 jobs ready to
            schedule" — this bar committing, in miniature, the duplication it
            exists to remove. With two it is the sum of a split, which neither
            half states. */}
        {parts.length > 1 ? <span className="sched-queue-bar-count" aria-hidden="true">{total}</span> : null}
        <strong>{parts.join(' · ')}</strong>
      </p>
      <div className="sched-queue-bar-actions">
        {approved > 0 ? (
          <button type="button" className="btn primary sched-queue-bar-go" onClick={() => openQueue()}>
            Schedule {approved === 1 ? '1 job' : `${approved} jobs`}
          </button>
        ) : null}

        {/* A quote is reviewed on the job, not in a scheduling queue — so one of
            them goes straight there. Several open the queue focused on the first
            of them, because there is no list of "quotes awaiting approval" that
            is not this one. */}
        {unapproved > 0 ? (
          unapproved === 1 && firstUnapprovedId ? (
            <Link
              className={`btn ${approved > 0 ? 'secondary' : 'primary'} sched-queue-bar-go`}
              href={`/dashboard/jobs/${firstUnapprovedId}`}
            >
              Review unapproved job
            </Link>
          ) : (
            <button
              type="button"
              className={`btn ${approved > 0 ? 'secondary' : 'primary'} sched-queue-bar-go`}
              onClick={() => openQueue(firstUnapprovedId ?? undefined)}
            >
              Review {unapproved} unapproved
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
