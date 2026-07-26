'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { useScheduleDrag } from './ScheduleDragProvider';

// The drag source for an unscheduled job. Uses pointer events (works on touch
// and mouse), coordinated through the shared ScheduleDragProvider — the calendar
// owns the drop targets and the forced-time prompt.
export default function JobDragHandle({ jobId, jobName }: { jobId: string; jobName: string }) {
  const { beginDrag } = useScheduleDrag();

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    beginDrag({ jobId, jobName, time: '', sourceDateKey: null }, event);
  }

  return (
    <div
      className="schedule-drag-handle"
      onPointerDown={onPointerDown}
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
