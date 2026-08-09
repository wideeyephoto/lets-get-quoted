'use client';

import Link from 'next/link';
import { OPEN_SCHEDULE_QUEUE_EVENT } from './dock-events';

/**
 * The two ways into the unscheduled queue.
 *
 * Both are here rather than in the page because the page is a server component
 * and opening the queue is a client event. They are deliberately the same
 * gesture pointed at the same panel: "Schedule a job" is what you press when you
 * came here to book something, the banner is what catches your eye when
 * something is waiting. Splitting them across two mechanisms is how the old page
 * ended up with three different controls that all meant "show me the list".
 */

function openQueue() {
  /* This used to have to undo a collapsed desktop rail first — RailToggle could
     hide the queue's docked home behind a body attribute, so the event alone
     would open something that was display:none. That toggle is gone (it said
     "Show jobs (10)" one row under a stat saying "10 · Ready to book"), nothing
     sets the attribute now, and the rail is always there to open.

     The stored preference is still cleared, once, for anyone who left the rail
     collapsed before it went. Costs a line and closes the only path by which an
     old browser could still be carrying the flag. */
  try {
    window.localStorage.removeItem('lgq.schedule.railCollapsed');
  } catch {
    // Storage disabled — nothing was stored to begin with.
  }
  window.dispatchEvent(new CustomEvent(OPEN_SCHEDULE_QUEUE_EVENT));
}

/**
 * THE PRIMARY ACTION ON THE PAGE. It was "Plan my day" — a route optimiser for
 * work that is already booked — sitting in the calendar toolbar at every width,
 * while the thing the page is for had no button at all.
 *
 * With nothing waiting there is nothing for the queue to show, so it becomes a
 * link to Jobs, where a job gets created in the first place.
 */
export function ScheduleJobButton({ pending }: { pending: number }) {
  if (pending === 0) {
    return (
      <Link className="sched-primary" href="/dashboard/jobs">
        <span aria-hidden="true">＋</span> Schedule a job
      </Link>
    );
  }
  /* THE LABEL CARRIES THE COUNT. "Schedule a job" is a promise of a picker;
     what this actually does is take you to the list of jobs waiting for a
     date. On a desktop, where that list is already on screen, the old label
     made the button look broken — it did the right thing and named the wrong
     one. */
  return (
    <button type="button" className="sched-primary" onClick={openQueue}>
      <span aria-hidden="true">＋</span> Schedule {pending === 1 ? '1 job' : `${pending} jobs`}
      <span className="sched-primary-go" aria-hidden="true">→</span>
    </button>
  );
}

/**
 * The attention line, under the header.
 *
 * WHY IT SPELLS OUT BOTH NUMBERS. The rail badge counts approved jobs waiting
 * for a date; this page's old "Needs date" counter counted every unscheduled job
 * including quotes nobody has accepted yet. Two numbers, two populations, and
 * neither label said which — so the nav read "Schedule 3" beside a page reading
 * "Needs date 4" and the difference looked like a bug. Now each says what it
 * counts, and the unapproved remainder is named rather than folded in silently.
 */
export function UnscheduledBanner({ approved, unapproved }: { approved: number; unapproved: number }) {
  const total = approved + unapproved;
  if (total === 0) return null;

  return (
    <button type="button" className="sched-banner" onClick={openQueue}>
      <span className="sched-banner-count" aria-hidden="true">{total}</span>
      <span className="sched-banner-copy">
        <strong>
          {total === 1 ? '1 job needs a date' : `${total} jobs need dates`}
        </strong>
        <small>
          {approved > 0 && unapproved > 0
            ? `${approved} approved and ready to book · ${unapproved} still awaiting quote approval`
            : approved > 0
              ? `${approved === 1 ? 'Approved' : 'All approved'} and ready to book`
              : `${unapproved === 1 ? 'Awaiting' : 'All awaiting'} quote approval`}
        </small>
      </span>
      <span className="sched-banner-go" aria-hidden="true">→</span>
    </button>
  );
}
