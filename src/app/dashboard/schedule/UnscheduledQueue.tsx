'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useScheduleDrag } from './ScheduleDragProvider';
import { OPEN_SCHEDULE_QUEUE_EVENT } from './dock-events';
import { useModal } from './use-modal';

/**
 * The jobs waiting for a date.
 *
 * ONE COPY OF THE MARKUP, TWO PLACES IT CAN LIVE. The rows are server-rendered
 * (they carry server actions and a crew form each), so this wraps them rather
 * than re-rendering them and only decides where the box sits:
 *
 *   >= 1280px   the desktop rail, permanently visible beside the calendar. The
 *               wrapper is `display: contents`, so the section is a rail child
 *               as if this component were not in the tree at all.
 *   <  1280px   a full-screen panel, opened from the "jobs need dates" banner
 *               and dismissed with a real Back button.
 *
 * WHAT THIS REPLACES. The old ScheduleDock was a `position: fixed` bar pinned to
 * the bottom of the viewport at every width below 1100px — so on a tablet and a
 * phone it sat permanently on top of the calendar, covering the last row of
 * dates, and it out-stacked the job dialog because both were page-level fixed
 * elements with hand-picked z-indexes. A tray that covers the thing it schedules
 * onto is the collision; a panel you open and close is not.
 *
 * ONLY ONE OVERLAY AT A TIME is enforced through useModal, which marks the body
 * while something is open. Opening a job dialog stands this down (CSS), and this
 * being open is what the dialog checks before it lets the tray paint.
 */
export default function UnscheduledQueue({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Whether this width shows the queue as an overlay at all. Behaviour only —
  // the markup is identical either way, so there is nothing to mismatch on
  // hydration and CSS remains the single source of the breakpoint.
  const [isOverlay, setIsOverlay] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { armedJob } = useScheduleDrag();

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1279.98px)');
    const sync = () => setIsOverlay(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Growing past the breakpoint while the panel is open would otherwise leave
  // the rail rendering in its opened state and the scroll lock still applied.
  useEffect(() => {
    if (!isOverlay) setOpen(false);
  }, [isOverlay]);

  const close = useCallback(() => setOpen(false), []);
  useModal(open && isOverlay, panelRef, close, 'queue');

  // PICKING A JOB CLOSES THE PANEL. You have just said which job; what you need
  // next is the calendar, and the panel is covering all of it.
  useEffect(() => {
    if (armedJob) setOpen(false);
  }, [armedJob]);

  // The banner and the mobile agenda both ask for this by name.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SCHEDULE_QUEUE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SCHEDULE_QUEUE_EVENT, onOpen);
  }, []);

  const label = `${count} ${count === 1 ? 'job needs' : 'jobs need'} a date`;

  return (
    <div className={`sched-queue${open ? ' is-open' : ''}`} data-count={count}>
      {/* The backdrop only exists in overlay mode; on desktop the whole wrapper
          is display:contents and this never paints. */}
      <div className="sched-queue-scrim" onClick={close} aria-hidden="true" />
      <div
        className="sched-queue-panel"
        ref={panelRef}
        tabIndex={-1}
        /* Only a dialog when it behaves like one. On the desktop rail this is a
           permanently visible region, and calling that a modal dialog would be a
           lie to every screen reader that met it. */
        role={isOverlay ? 'dialog' : 'region'}
        aria-modal={isOverlay && open ? true : undefined}
        aria-label={isOverlay ? label : 'Jobs waiting for a date'}
      >
        <div className="sched-queue-head">
          <button type="button" className="sched-queue-back" onClick={close}>
            <span aria-hidden="true">←</span> Back
          </button>
          <p className="sched-queue-head-id">{label}</p>
        </div>
        <div className="sched-queue-body">{children}</div>
      </div>
    </div>
  );
}
