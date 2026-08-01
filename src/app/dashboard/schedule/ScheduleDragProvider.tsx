'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { removeJobScheduleAction, scheduleJobAction } from '../jobs/actions';

// A job being dragged. `sourceDateKey` is null for an unscheduled job, or its
// current date for a scheduled one (so we can no-op a same-day drop and support
// undo). `time` seeds the drop modal (keep the existing time or change it).
export type DragJob = { jobId: string; jobName: string; time: string; sourceDateKey: string | null };

type ScheduleDragContextValue = {
  beginDrag: (job: DragJob, event: ReactPointerEvent, onTap?: () => void) => void;
  overDateKey: string | null;
  draggingJobId: string | null;
  /** TAP TO PLACE: the job waiting for a date, or null. */
  armedJob: DragJob | null;
  armJob: (job: DragJob) => void;
  cancelArm: () => void;
  /** Called by a calendar cell when something is armed. */
  placeArmed: (dateKey: string) => void;
};

const ScheduleDragContext = createContext<ScheduleDragContextValue | null>(null);

export function useScheduleDrag(): ScheduleDragContextValue {
  const context = useContext(ScheduleDragContext);
  if (!context) throw new Error('useScheduleDrag must be used within ScheduleDragProvider');
  return context;
}

const DRAG_THRESHOLD = 6;

const QUICK_DROP_TIMES = [
  { label: '7 AM', value: '07:00' },
  { label: '8 AM', value: '08:00' },
  { label: '9 AM', value: '09:00' },
  { label: '10 AM', value: '10:00' },
  { label: '11 AM', value: '11:00' },
  { label: '12 PM', value: '12:00' },
  { label: '1 PM', value: '13:00' },
  { label: '2 PM', value: '14:00' },
  { label: '3 PM', value: '15:00' },
  { label: '4 PM', value: '16:00' },
  { label: '5 PM', value: '17:00' },
];

function formatDropDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

type PendingDrop = { jobId: string; jobName: string; dateKey: string; sourceDateKey: string | null; sourceTime: string };
type UndoInfo = { jobId: string; jobName: string; sourceDateKey: string | null; sourceTime: string; isMove: boolean };

export default function ScheduleDragProvider({ children, unavailable = {} }: { children: ReactNode; unavailable?: Record<string, string> }) {
  const router = useRouter();
  const [overDateKey, setOverDateKey] = useState<string | null>(null);
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [dropTime, setDropTime] = useState('');
  const [isSchedulingDrop, startDropTransition] = useTransition();
  const [undo, setUndo] = useState<UndoInfo | null>(null);
  const [isUndoing, startUndoTransition] = useTransition();
  const undoTimer = useRef<number | null>(null);

  // TAP TO PLACE — the two-tap alternative to dragging: tap a job to arm it,
  // then tap a date. It exists because dragging is the wrong gesture on a
  // phone (a long pointer drag across a scrolling page is fiddly at best) and
  // because dragging has never been reachable by keyboard at all. Same drop
  // prompt, same undo, same server action — only the way you aim differs.
  const [armedJob, setArmedJob] = useState<DragJob | null>(null);
  const armJob = useCallback((job: DragJob) => setArmedJob((current) => (current?.jobId === job.jobId ? null : job)), []);
  const cancelArm = useCallback(() => setArmedJob(null), []);
  // Reads armedJob from state rather than from a setState updater. The updater
  // form looked tidier and was wrong: updaters have to be pure, React
  // double-invokes them in development, and the setPendingDrop tucked inside one
  // was being discarded — tapping a date armed the job and then did nothing.
  const placeArmed = useCallback((dateKey: string) => {
    if (!armedJob) return;
    if (dateKey !== armedJob.sourceDateKey) {
      setDropTime(armedJob.time || '');
      setPendingDrop({ jobId: armedJob.jobId, jobName: armedJob.jobName, dateKey, sourceDateKey: armedJob.sourceDateKey, sourceTime: armedJob.time });
    }
    setArmedJob(null);
  }, [armedJob]);

  // Escape gets you out of an armed job, the same way it closes the drop prompt.
  useEffect(() => {
    if (!armedJob) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setArmedJob(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [armedJob]);

  const beginDrag = useCallback((job: DragJob, event: ReactPointerEvent, onTap?: () => void) => {
    if (event.button > 0) return; // ignore right/middle mouse

    const session = {
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      preview: null as HTMLDivElement | null,
    };

    const end = () => {
      if (session.preview) session.preview.remove();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDraggingJobId(null);
      setOverDateKey(null);
    };

    const cellKeyAt = (x: number, y: number): string | null =>
      document.elementFromPoint(x, y)?.closest('[data-date-key]')?.getAttribute('data-date-key') ?? null;

    const move = (moveEvent: PointerEvent) => {
      if (!session.active) {
        if (Math.hypot(moveEvent.clientX - session.startX, moveEvent.clientY - session.startY) < DRAG_THRESHOLD) return;
        session.active = true;
        setDraggingJobId(job.jobId);
        const preview = document.createElement('div');
        preview.className = 'schedule-drag-floating';
        preview.textContent = job.jobName;
        document.body.appendChild(preview);
        session.preview = preview;
      }
      if (session.preview) session.preview.style.transform = `translate(${moveEvent.clientX + 14}px, ${moveEvent.clientY + 14}px)`;
      setOverDateKey(cellKeyAt(moveEvent.clientX, moveEvent.clientY));
    };

    const up = (upEvent: PointerEvent) => {
      const wasActive = session.active;
      const dropKey = cellKeyAt(upEvent.clientX, upEvent.clientY);
      end();
      if (!wasActive) {
        onTap?.();
        return;
      }
      if (dropKey && dropKey !== job.sourceDateKey) {
        setDropTime(job.time || '');
        setPendingDrop({ jobId: job.jobId, jobName: job.jobName, dateKey: dropKey, sourceDateKey: job.sourceDateKey, sourceTime: job.time });
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  function cancelDrop() {
    setPendingDrop(null);
    setDropTime('');
  }

  function confirmDrop() {
    if (!pendingDrop || !dropTime) return;
    const drop = pendingDrop;
    const formData = new FormData();
    formData.set('scheduledFor', drop.dateKey);
    formData.set('scheduledTime', dropTime);
    startDropTransition(async () => {
      try {
        await scheduleJobAction(drop.jobId, formData);
        setPendingDrop(null);
        setDropTime('');
        if (undoTimer.current) window.clearTimeout(undoTimer.current);
        setUndo({ jobId: drop.jobId, jobName: drop.jobName, sourceDateKey: drop.sourceDateKey, sourceTime: drop.sourceTime, isMove: drop.sourceDateKey !== null });
        undoTimer.current = window.setTimeout(() => setUndo(null), 9000);
        router.refresh();
      } catch (error) {
        console.error('Failed to schedule job from drop', error);
      }
    });
  }

  function handleUndo() {
    if (!undo) return;
    const target = undo;
    startUndoTransition(async () => {
      try {
        if (target.sourceDateKey === null) {
          await removeJobScheduleAction(target.jobId);
        } else {
          const formData = new FormData();
          formData.set('scheduledFor', target.sourceDateKey);
          formData.set('scheduledTime', target.sourceTime);
          await scheduleJobAction(target.jobId, formData);
        }
        if (undoTimer.current) window.clearTimeout(undoTimer.current);
        setUndo(null);
        router.refresh();
      } catch (error) {
        console.error('Failed to undo schedule change', error);
      }
    });
  }

  return (
    <ScheduleDragContext.Provider value={{ beginDrag, overDateKey, draggingJobId, armedJob, armJob, cancelArm, placeArmed }}>
      {children}

      {pendingDrop ? (
        <div className="crew-assign-backdrop" onClick={cancelDrop}>
          <div className="crew-assign-panel schedule-drop-panel" onClick={(event) => event.stopPropagation()}>
            <div className="crew-assign-header">
              <div>
                <p className="crew-assign-title">{pendingDrop.sourceDateKey ? 'Move' : 'Schedule'} {pendingDrop.jobName}</p>
                <p className="crew-assign-sub"><span>{formatDropDate(pendingDrop.dateKey)}</span></p>
              </div>
              <button type="button" className="crew-assign-close" onClick={cancelDrop} aria-label="Cancel">×</button>
            </div>
            <div className="schedule-drop-body">
              {unavailable[pendingDrop.dateKey] ? (
                <p className="schedule-drop-warning" role="alert">⚠ {unavailable[pendingDrop.dateKey]} You can still schedule it here.</p>
              ) : null}
              <p className="schedule-drop-prompt">Pick a start time to put this job on the calendar.</p>
              <div className="schedule-drop-times" role="group" aria-label="Start time">
                {QUICK_DROP_TIMES.map((slot) => (
                  <button
                    type="button"
                    key={slot.value}
                    className={dropTime === slot.value ? 'active' : undefined}
                    onClick={() => setDropTime(slot.value)}
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
              <label className="schedule-drop-custom">
                <span>Other time</span>
                <input type="time" value={dropTime} onChange={(event) => setDropTime(event.target.value)} />
              </label>
              <div className="schedule-drop-actions">
                <button type="button" className="btn secondary" onClick={cancelDrop}>Cancel</button>
                <button type="button" className="btn primary" onClick={confirmDrop} disabled={!dropTime || isSchedulingDrop}>
                  {isSchedulingDrop ? 'Scheduling…' : 'Schedule job'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {armedJob && !pendingDrop ? (
        <div className="schedule-armed-toast" role="status" aria-live="polite">
          <span><strong>{armedJob.jobName}</strong> — pick a date on the calendar</span>
          <button type="button" onClick={cancelArm}>Cancel</button>
        </div>
      ) : null}

      {undo ? (
        <div className="schedule-undo-toast" role="status" aria-live="polite">
          <span>{undo.isMove ? 'Moved' : 'Scheduled'} {undo.jobName}</span>
          <button type="button" onClick={handleUndo} disabled={isUndoing}>{isUndoing ? 'Undoing…' : 'Undo'}</button>
        </div>
      ) : null}
    </ScheduleDragContext.Provider>
  );
}
