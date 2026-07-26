'use client';

import type { DragEvent } from 'react';

// The drag source for scheduling. Lives in the (server-rendered) unscheduled
// list; the calendar owns the drop targets and the time prompt. The two only
// communicate through the native drag dataTransfer, so no shared React state is
// needed. Desktop-only (native drag doesn't fire on touch) — the Add Start Date
// buttons remain the path on mobile.
export const JOB_DRAG_TYPE = 'application/x-lgq-job';

export default function JobDragHandle({ jobId, jobName }: { jobId: string; jobName: string }) {
  function onDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData(JOB_DRAG_TYPE, JSON.stringify({ id: jobId, name: jobName }));
    event.dataTransfer.setData('text/plain', jobName);
    event.dataTransfer.effectAllowed = 'move';

    // A custom drag image so you "watch the job" move as a labelled chip rather
    // than a ghost of the handle. It's snapshotted synchronously, then removed.
    const ghost = document.createElement('div');
    ghost.className = 'schedule-drag-ghost';
    ghost.textContent = jobName;
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 14, 14);
    window.setTimeout(() => ghost.remove(), 0);
  }

  return (
    <div
      className="schedule-drag-handle"
      draggable
      onDragStart={onDragStart}
      role="button"
      tabIndex={-1}
      aria-label={`Drag ${jobName} onto a calendar date`}
      title="Drag onto a calendar date to schedule"
    >
      <span className="schedule-drag-grip" aria-hidden="true">⠿</span>
      Drag to calendar
    </div>
  );
}
