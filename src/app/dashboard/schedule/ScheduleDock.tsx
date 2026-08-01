'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useScheduleDrag } from './ScheduleDragProvider';

// The unscheduled jobs, as a bottom sheet on a phone.
//
// WHY A SHEET. Putting a job on a date needs the job and the date on screen at
// once — the drag hit-tests whatever is under the finger, and tap-to-place needs
// somewhere to tap. On a narrow screen there is no room for a rail, so the jobs
// come up over the calendar instead of sitting a screen below it.
//
// It wraps its children rather than re-rendering them, so the job rows stay
// server-rendered with their server actions intact. There is exactly one copy of
// that markup; this only decides where it sits.
//
// On desktop the wrapper is `display: contents` (see globals.css) — the section
// flows into the rail as if this component were not here at all.
export default function ScheduleDock({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { armedJob } = useScheduleDrag();

  // ARMING A JOB CLOSES THE SHEET. You have just said which job; what you need
  // next is dates, and the sheet is sitting on half of them. Measured on a
  // Pixel 7 with the sheet up there were only eight cells left above it, and
  // none at all without scrolling first — so leaving it open meant arming a job
  // and then hunting for somewhere to put it. The toast keeps saying what is
  // armed, so nothing is lost by collapsing.
  useEffect(() => {
    if (armedJob) setOpen(false);
  }, [armedJob]);

  // Escape closes it, matching every other dismissible surface on this page.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`schedule-dock${open ? ' is-open' : ''}`} data-count={count}>
      <button
        type="button"
        className="schedule-dock-tab"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="schedule-dock-body"
      >
        <span className="schedule-dock-count">{count}</span>
        <span>{count === 1 ? 'job needs a date' : 'jobs need a date'}</span>
        <span className="schedule-dock-chevron" aria-hidden="true">{open ? '▾' : '▴'}</span>
      </button>
      <div className="schedule-dock-body" id="schedule-dock-body" hidden={undefined}>
        {children}
      </div>
    </div>
  );
}
