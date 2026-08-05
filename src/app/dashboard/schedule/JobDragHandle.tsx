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
      className={`schedule-drag-handle${armed ? ' armed' : ''}`}
      onPointerDown={onPointerDown}
      // Keyboard users never get a pointerdown, so Enter/Space has to arm it
      // directly. Guarded on detail === 0 so a mouse click — which already went
      // through beginDrag's tap path — cannot arm and immediately disarm it.
      onClick={(event) => { if (event.detail === 0) armJob(job); }}
      aria-pressed={armed}
      aria-label={armed ? `${jobName} is waiting for a date — choose one on the calendar` : `Schedule ${jobName}: drag onto a calendar date, or press to pick one`}
      title="Drag onto a calendar date, or tap and then tap a date"
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
