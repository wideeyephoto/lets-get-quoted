'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useScheduleDrag } from './ScheduleDragProvider';

// The drag source for an unscheduled job. Uses pointer events (works on touch
// and mouse), coordinated through the shared ScheduleDragProvider — the calendar
// owns the drop targets and the forced-time prompt.
//
// It is also the TAP target. A press that never moves far enough to be a drag
// arms the job instead, and the next tap on a date places it. That two-tap path
// is the one that actually works on a phone, where dragging across a scrolling
// page is a fight, and it is the only path that works from a keyboard — which
// is why this is a real <button> rather than the div with tabIndex={-1} it used
// to be.
export default function JobDragHandle({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { beginDrag, armJob, armedJob } = useScheduleDrag();
  const armed = armedJob?.jobId === jobId;
  const job = { jobId, jobName, time: '', sourceDateKey: null };

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    beginDrag(job, event, () => armJob(job));
  }

  return (
    <button
      type="button"
      /* The queue's focus target. "Schedule N jobs" sends focus to the first of
         these, so pressing it lands on the first job waiting for a date rather
         than merely revealing a list.

         IT CARRIES THE ID. "Review N unapproved" asks for a particular card,
         because the queue sorts approved work above unapproved and the first
         row is the wrong one for that task. */
      data-queue-job={jobId}
      className={`schedule-drag-handle${armed ? ' armed' : ''}`}
      onPointerDown={onPointerDown}
      // Keyboard users never get a pointerdown, so Enter/Space has to arm it
      // directly. Guarded on detail === 0 so a mouse click — which already went
      // through beginDrag's tap path — cannot arm and immediately disarm it.
      onClick={(event) => { if (event.detail === 0) armJob(job); }}
      aria-pressed={armed}
      /* THE LABEL LEADS WITH THE TAP, NOT THE DRAG.
         It used to open with "drag onto a calendar date", which on a phone
         describes a gesture that is a fight against a scrolling page — and this
         control is not primarily a drag source there, it is the tap-to-arm
         path. The drag is still available and still works; it is just no longer
         the first thing the button claims to be. The section used to carry a
         written hint about the drag; the title below is what is left of it.
         Not deleted on touch: this is the only keyboard path to scheduling, and
         hiding it by pointer type would take it from anybody on a touchscreen
         laptop. */
      aria-label={armed ? `${jobName} is waiting for a date — choose one on the calendar` : `Pick a date for ${jobName}`}
      title="Tap, then tap a date on the calendar. You can also drag it there."
    >
      <span className="schedule-drag-grip" aria-hidden="true">⠿</span>
      {/* The words used to be printed on the button. They are still SAID — a
          grip with no accessible text is a mystery to a screen reader, and the
          armed state has to announce itself to somebody who cannot see the
          card light up. What is gone is only the visible label: it sat at the
          foot of the card, a third the width of it, saying what the grip
          already means. The section's own hint still explains the gesture. */}
      <span className="sr-only">{armed ? 'Pick a date…' : 'Drag to calendar'}</span>
    </button>
  );
}
