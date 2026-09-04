'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from './ScheduleResourceTimeline.module.css';
import {
  formatAxisHour,
  formatClockMinutes,
  parseClockMinutes,
  DEFAULT_JOB_MINUTES,
} from '@/lib/schedule-timeline';
import { longDateLabel, weekdayShort, dayOfMonth } from '@/lib/schedule-agenda';
import { dispatchJobScheduleAction } from '../jobs/actions';
import { STATUS_MARK } from './CalendarLegend';
import type { CalendarJob, CrewOption } from './schedule-calendar';

const UNASSIGNED_ID = '__unassigned__';
const DEFAULT_START_HOUR = 8; // 8 AM
const DEFAULT_END_HOUR = 18; // 6 PM
const SNAP_MINUTES = 15;

function minutesToClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function snapMinutes(minutes: number, step = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

function getCardColorClass(job: CalendarJob, isUnassigned: boolean): string {
  if (isUnassigned) return styles.cardSlate;
  if (job.status === 'new_lead') return styles.cardAmber;
  if (job.status === 'complete') return styles.cardEmerald;
  if (job.status === 'archived') return styles.cardSlate;
  const hash = Math.abs(job.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % 4;
  if (hash === 0) return styles.cardBlue;
  if (hash === 1) return styles.cardOrange;
  if (hash === 2) return styles.cardRose;
  return styles.cardPurple;
}

function crewInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export type ScheduleResourceTimelineProps = {
  mode?: 'day' | 'week';
  dayKey: string;
  weekDayKeys?: string[];
  todayKey: string;
  jobs: CalendarJob[];
  crew: CrewOption[];
  assignments: Record<string, string[]>;
  workdayStart?: string | null;
  workdayEnd?: string | null;
  onOpenJob: (occurrenceKey: string) => void;
  onStepDay?: (deltaDays: number) => void;
  onSelectDate?: (dateKey: string) => void;
};

type DragVisualState = {
  jobId: string;
  jobTitle: string;
  jobRef?: string | null;
  jobAddress?: string | null;
  targetLaneId: string;
  targetMinutes: number;
  targetDateKey: string;
  durationMinutes: number;
  cursorX: number;
  cursorY: number;
};

type ResizeVisualState = {
  jobId: string;
  durationMinutes: number;
};

type UndoState = {
  jobId: string;
  title: string;
  prevDateKey: string;
  prevTime: string | null;
  prevCrewId: string;
  newDateKey: string;
  newTime: string | null;
  newCrewId: string;
};

export default function ScheduleResourceTimeline({
  mode = 'day',
  dayKey,
  weekDayKeys = [],
  todayKey,
  jobs,
  crew,
  assignments,
  workdayStart,
  workdayEnd,
  onOpenJob,
  onStepDay,
  onSelectDate,
}: ScheduleResourceTimelineProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Optimistic job overrides so drops & resizes feel instantaneous
  const [jobOverrides, setJobOverrides] = useState<
    Record<
      string,
      {
        scheduled_for?: string;
        scheduled_time?: string | null;
        estimated_hours?: number | null;
        crewId?: string | null;
      }
    >
  >({});

  const [dragVisual, setDragVisual] = useState<DragVisualState | null>(null);
  const [resizeVisual, setResizeVisual] = useState<ResizeVisualState | null>(null);

  const [undo, setUndo] = useState<UndoState | null>(null);
  const undoTimer = useRef<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Determine time axis range
  const { startHour, endHour, totalHours, startMinutes, totalMinutes } = useMemo(() => {
    const parsedStart = workdayStart ? parseClockMinutes(workdayStart) : null;
    const parsedEnd = workdayEnd ? parseClockMinutes(workdayEnd) : null;

    const sHour = parsedStart !== null ? Math.floor(parsedStart / 60) : DEFAULT_START_HOUR;
    const eHour = parsedEnd !== null ? Math.ceil(parsedEnd / 60) : DEFAULT_END_HOUR;

    const finalStart = Math.min(sHour, 8);
    const finalEnd = Math.max(eHour, 18);
    const hoursCount = finalEnd - finalStart;

    return {
      startHour: finalStart,
      endHour: finalEnd,
      totalHours: hoursCount,
      startMinutes: finalStart * 60,
      totalMinutes: hoursCount * 60,
    };
  }, [workdayStart, workdayEnd]);

  // Hourly slots for header
  const hourSlots = useMemo(() => {
    const slots: number[] = [];
    for (let h = startHour; h < endHour; h++) {
      slots.push(h * 60);
    }
    return slots;
  }, [startHour, endHour]);

  // Merge server jobs with optimistic overrides
  const effectiveJobs = useMemo(() => {
    return jobs.map((job) => {
      const override = jobOverrides[job.id];
      if (!override) return job;

      return {
        ...job,
        scheduled_for: override.scheduled_for ?? job.scheduled_for,
        scheduled_time: override.scheduled_time !== undefined ? override.scheduled_time : job.scheduled_time,
        estimated_hours: override.estimated_hours !== undefined ? override.estimated_hours : job.estimated_hours,
      };
    });
  }, [jobs, jobOverrides]);

  // Merge crew assignments with optimistic overrides
  const effectiveAssignments = useMemo(() => {
    const map = { ...assignments };
    for (const [jobId, override] of Object.entries(jobOverrides)) {
      if (override.crewId !== undefined) {
        map[jobId] = override.crewId ? [override.crewId] : [];
      }
    }
    return map;
  }, [assignments, jobOverrides]);

  // Group jobs by date and crew lane
  const { unassignedJobs, jobsByCrew } = useMemo(() => {
    const unassigned: CalendarJob[] = [];
    const byCrew = new Map<string, CalendarJob[]>();

    for (const member of crew) {
      byCrew.set(member.id, []);
    }

    const relevantDateKeys = mode === 'week' ? new Set(weekDayKeys) : new Set([dayKey]);

    for (const job of effectiveJobs) {
      if (!relevantDateKeys.has(job.scheduled_for)) continue;

      const assignedCrew = effectiveAssignments[job.id] ?? [];
      if (assignedCrew.length === 0) {
        unassigned.push(job);
      } else {
        for (const crewId of assignedCrew) {
          if (byCrew.has(crewId)) {
            byCrew.get(crewId)!.push(job);
          } else {
            unassigned.push(job);
          }
        }
      }
    }

    return { unassignedJobs: unassigned, jobsByCrew: byCrew };
  }, [crew, effectiveJobs, effectiveAssignments, mode, weekDayKeys, dayKey]);

  // Direct 2D Pointer Drag Handler
  const handleCardPointerDown = useCallback(
    (
      job: CalendarJob,
      laneId: string,
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (event.button !== 0) return; // Left click only

      // Do not drag if clicking resize handle
      if ((event.target as HTMLElement).closest(`.${styles.resizeHandle}`)) return;

      event.preventDefault();

      const startX = event.clientX;
      const startY = event.clientY;

      const durationMinutes = job.estimated_hours
        ? Math.round(job.estimated_hours * 60)
        : DEFAULT_JOB_MINUTES;
      const parsedTime = parseClockMinutes(job.scheduled_time);
      const initialMinutes = parsedTime !== null ? parsedTime : startMinutes;

      const session = {
        job,
        sourceCrewId: laneId,
        sourceDateKey: job.scheduled_for,
        sourceTime: job.scheduled_time,
        durationMinutes,
        startX,
        startY,
        currentX: startX,
        currentY: startY,
        targetLaneId: laneId,
        targetMinutes: initialMinutes,
        targetDateKey: job.scheduled_for,
        active: false,
      };

      const onPointerMove = (e: PointerEvent) => {
        const delta = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
        if (!session.active) {
          if (delta < 5) return;
          session.active = true;
        }

        session.currentX = e.clientX;
        session.currentY = e.clientY;

        // Detect target lane using data-lane-id
        const elemUnder = document.elementFromPoint(e.clientX, e.clientY);
        const laneRow = elemUnder?.closest('[data-lane-id]');
        const foundLaneId = laneRow?.getAttribute('data-lane-id') ?? session.targetLaneId;
        session.targetLaneId = foundLaneId;

        // Calculate time/date snap relative to target track
        const targetTrack = trackRefs.current.get(foundLaneId) || trackRefs.current.get(UNASSIGNED_ID);
        if (targetTrack) {
          const trackRect = targetTrack.getBoundingClientRect();
          const relX = Math.max(0, Math.min(e.clientX - trackRect.left, trackRect.width));
          const pct = relX / Math.max(1, trackRect.width);

          if (mode === 'day') {
            const rawMinutes = startMinutes + pct * totalMinutes;
            let snapped = snapMinutes(rawMinutes, SNAP_MINUTES);
            snapped = Math.max(startMinutes, Math.min(snapped, startMinutes + totalMinutes - 30));
            session.targetMinutes = snapped;
          } else {
            const colWidth = trackRect.width / Math.max(1, weekDayKeys.length);
            const colIndex = Math.min(weekDayKeys.length - 1, Math.max(0, Math.floor(relX / colWidth)));
            session.targetDateKey = weekDayKeys[colIndex] ?? session.sourceDateKey;
          }
        }

        // Live visual update
        setDragVisual({
          jobId: job.id,
          jobTitle: job.client_name,
          jobRef: job.ref,
          jobAddress: job.address || job.city_label,
          targetLaneId: session.targetLaneId,
          targetMinutes: session.targetMinutes,
          targetDateKey: session.targetDateKey,
          durationMinutes: session.durationMinutes,
          cursorX: e.clientX,
          cursorY: e.clientY,
        });
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        setDragVisual(null);

        if (!session.active) {
          onOpenJob(job.occurrence_key);
          return;
        }

        const newTime = mode === 'day' ? minutesToClock(session.targetMinutes) : session.sourceTime;
        const newCrewId = session.targetLaneId === UNASSIGNED_ID ? null : session.targetLaneId;
        const newDate = session.targetDateKey;

        const timeChanged = mode === 'day' && newTime !== session.sourceTime;
        const laneChanged = session.targetLaneId !== session.sourceCrewId;
        const dateChanged = mode === 'week' && newDate !== session.sourceDateKey;

        if (!timeChanged && !laneChanged && !dateChanged) return;

        // Apply optimistic update immediately
        setJobOverrides((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            scheduled_for: newDate,
            scheduled_time: newTime,
            crewId: newCrewId,
          },
        }));

        // Set undo toast
        setUndo({
          jobId: job.id,
          title: job.client_name,
          prevDateKey: session.sourceDateKey,
          prevTime: session.sourceTime,
          prevCrewId: session.sourceCrewId,
          newDateKey: newDate,
          newTime,
          newCrewId: session.targetLaneId,
        });

        if (undoTimer.current) window.clearTimeout(undoTimer.current);
        undoTimer.current = window.setTimeout(() => setUndo(null), 8000);

        // Server action
        startTransition(async () => {
          try {
            await dispatchJobScheduleAction({
              jobId: job.id,
              dateKey: newDate,
              scheduledTime: newTime,
              crewId: newCrewId,
            });
            router.refresh();
          } catch (err) {
            console.error('Failed to dispatch job schedule', err);
          }
        });
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [startMinutes, totalMinutes, mode, weekDayKeys, onOpenJob, router],
  );

  // Direct Duration Resize Handler (Elongate / Shorten)
  const handleResizePointerDown = useCallback(
    (
      job: CalendarJob,
      laneId: string,
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startDurationMinutes = job.estimated_hours
        ? Math.round(job.estimated_hours * 60)
        : DEFAULT_JOB_MINUTES;

      const trackEl = trackRefs.current.get(laneId) || trackRefs.current.values().next().value;
      const trackWidth = trackEl ? trackEl.getBoundingClientRect().width : 800;
      const minutesPerPixel = totalMinutes / Math.max(1, trackWidth);

      let currentDuration = startDurationMinutes;

      const onPointerMove = (e: PointerEvent) => {
        const deltaX = e.clientX - startX;
        const deltaMinutes = deltaX * minutesPerPixel;
        const rawDuration = startDurationMinutes + deltaMinutes;
        const snapped = Math.max(30, snapMinutes(rawDuration, 15));
        currentDuration = snapped;

        setResizeVisual({
          jobId: job.id,
          durationMinutes: snapped,
        });
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        setResizeVisual(null);

        if (currentDuration === startDurationMinutes) return;

        const newHours = Math.round((currentDuration / 60) * 10) / 10;

        // Apply optimistic update immediately
        setJobOverrides((prev) => ({
          ...prev,
          [job.id]: {
            ...prev[job.id],
            estimated_hours: newHours,
          },
        }));

        startTransition(async () => {
          try {
            await dispatchJobScheduleAction({
              jobId: job.id,
              estimatedHours: newHours,
            });
            router.refresh();
          } catch (err) {
            console.error('Failed to update duration', err);
          }
        });
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    },
    [totalMinutes, router],
  );

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (!undo) return;
    const target = undo;
    setUndo(null);

    setJobOverrides((prev) => ({
      ...prev,
      [target.jobId]: {
        ...prev[target.jobId],
        scheduled_for: target.prevDateKey,
        scheduled_time: target.prevTime,
        crewId: target.prevCrewId === UNASSIGNED_ID ? null : target.prevCrewId,
      },
    }));

    startTransition(async () => {
      try {
        await dispatchJobScheduleAction({
          jobId: target.jobId,
          dateKey: target.prevDateKey,
          scheduledTime: target.prevTime,
          crewId: target.prevCrewId === UNASSIGNED_ID ? null : target.prevCrewId,
        });
        router.refresh();
      } catch (err) {
        console.error('Failed to undo job move', err);
      }
    });
  }, [undo, router]);

  // Render Job Card
  const renderJobCard = (job: CalendarJob, laneId: string) => {
    const isUnassigned = laneId === UNASSIGNED_ID;
    const isBeingDragged = dragVisual?.jobId === job.id;

    // Start time calculations
    const parsedMinutes = parseClockMinutes(job.scheduled_time);
    const jobStartMinutes = parsedMinutes !== null ? parsedMinutes : startMinutes;

    // Duration calculation with live resize visual feedback
    let durationMinutes = job.estimated_hours
      ? Math.round(job.estimated_hours * 60)
      : DEFAULT_JOB_MINUTES;
    if (resizeVisual?.jobId === job.id) {
      durationMinutes = resizeVisual.durationMinutes;
    }

    // Coordinates in Day mode
    const leftPct = Math.max(0, ((jobStartMinutes - startMinutes) / totalMinutes) * 100);
    const widthPct = Math.max(6, (durationMinutes / totalMinutes) * 100);

    // Coordinates in Week mode
    let weekLeftPct = 0;
    const weekWidthPct = 100 / Math.max(1, weekDayKeys.length);
    if (mode === 'week') {
      const dayIndex = weekDayKeys.indexOf(job.scheduled_for);
      if (dayIndex >= 0) {
        weekLeftPct = (dayIndex / weekDayKeys.length) * 100;
      }
    }

    const colorClass = getCardColorClass(job, isUnassigned);

    return (
      <div
        key={job.occurrence_key}
        className={[
          styles.jobCard,
          colorClass,
          isBeingDragged ? styles.cardPlaceholder : '',
        ].filter(Boolean).join(' ')}
        style={{
          left: mode === 'day' ? `${leftPct}%` : `${weekLeftPct}%`,
          width: mode === 'day' ? `${widthPct}%` : `${weekWidthPct}%`,
        }}
        onPointerDown={(e) => handleCardPointerDown(job, laneId, e)}
        title={`${job.client_name} (${formatClockMinutes(jobStartMinutes)} - ${formatClockMinutes(jobStartMinutes + durationMinutes)})`}
      >
        <div className={styles.cardTitleRow}>
          <span className={styles.statusMark} aria-hidden="true">
            {STATUS_MARK[job.status] ?? '◆'}
          </span>
          <span className={styles.cardTitle}>
            {job.ref ? `Job #${job.ref}` : `Job #${job.id.slice(0, 4)}`}
          </span>
        </div>
        <div className={styles.cardDetails}>
          {job.client_name} {job.address ? `— ${job.address}` : job.city_label ? `— ${job.city_label}` : ''}
        </div>

        {/* Right edge resize handle (Day mode only) */}
        {mode === 'day' && (
          <div
            className={styles.resizeHandle}
            onPointerDown={(e) => handleResizePointerDown(job, laneId, e)}
            title="Drag right edge to elongate/shorten duration"
          >
            <div className={styles.resizeBar} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.timelineContainer} ref={containerRef}>
      {/* Top Toolbar */}
      <div className={styles.timelineHeader}>
        <div className={styles.timelineDateNav}>
          <button
            type="button"
            className={styles.timelineNavBtn}
            onClick={() => onStepDay?.(-1)}
            aria-label="Previous day"
          >
            ←
          </button>
          <h3 className={styles.timelineDateLabel}>
            {mode === 'day' ? longDateLabel(dayKey) : `Week of ${longDateLabel(weekDayKeys[0] || dayKey)}`}
          </h3>
          <button
            type="button"
            className={styles.timelineNavBtn}
            onClick={() => onStepDay?.(1)}
            aria-label="Next day"
          >
            →
          </button>
          {dayKey !== todayKey && (
            <button
              type="button"
              className={styles.timelineNavBtn}
              onClick={() => onSelectDate?.(todayKey)}
            >
              Today
            </button>
          )}
        </div>

        <div className={styles.timelineHeaderMeta}>
          <span>{crew.length} Technicians</span>
          <span>{unassignedJobs.length} Unassigned</span>
        </div>
      </div>

      {/* Main Grid Area */}
      <div className={styles.timelineGridWrapper}>
        {/* Column Headers */}
        <div className={styles.timelineHeadRow}>
          <div className={styles.resourceCorner}>Team & Dispatch</div>
          <div className={styles.axisHeader}>
            {mode === 'day' ? (
              hourSlots.map((minutes) => (
                <div key={minutes} className={styles.axisSlot}>
                  {formatAxisHour(minutes)}
                </div>
              ))
            ) : (
              weekDayKeys.map((wkDateKey) => (
                <div
                  key={wkDateKey}
                  className={[
                    styles.axisSlot,
                    wkDateKey === todayKey ? styles.todaySlot : '',
                  ].filter(Boolean).join(' ')}
                >
                  <strong>{weekdayShort(wkDateKey)}</strong>&nbsp;{dayOfMonth(wkDateKey)}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rows */}
        <div className={styles.timelineBody}>
          {/* Row 0: Unassigned Lane */}
          <div
            data-lane-id={UNASSIGNED_ID}
            className={[
              styles.timelineRow,
              styles.unassignedRow,
              dragVisual?.targetLaneId === UNASSIGNED_ID ? styles.targetLane : '',
            ].filter(Boolean).join(' ')}
          >
            <div className={[styles.resourceCell, styles.unassignedCell].join(' ')}>
              <div className={styles.unassignedIcon}>?</div>
              <div className={styles.resourceInfo}>
                <span className={styles.resourceName}>Unassigned</span>
                <span className={styles.resourceRole}>
                  {unassignedJobs.length} {unassignedJobs.length === 1 ? 'item' : 'items'}
                </span>
              </div>
            </div>

            <div
              className={styles.trackCell}
              ref={(el) => {
                if (el) trackRefs.current.set(UNASSIGNED_ID, el);
                else trackRefs.current.delete(UNASSIGNED_ID);
              }}
              style={{ '--slot-pct': `${100 / (mode === 'day' ? totalHours : weekDayKeys.length)}%` } as React.CSSProperties}
            >
              {unassignedJobs.length === 0 && (
                <div className={styles.emptyLaneNotice}>Drag work here to unassign</div>
              )}

              {/* Snapping drop ghost */}
              {dragVisual && dragVisual.targetLaneId === UNASSIGNED_ID && (
                <div
                  className={styles.dropGhost}
                  style={{
                    left:
                      mode === 'day'
                        ? `${Math.max(0, ((dragVisual.targetMinutes - startMinutes) / totalMinutes) * 100)}%`
                        : `${(Math.max(0, weekDayKeys.indexOf(dragVisual.targetDateKey)) / Math.max(1, weekDayKeys.length)) * 100}%`,
                    width:
                      mode === 'day'
                        ? `${Math.max(6, (dragVisual.durationMinutes / totalMinutes) * 100)}%`
                        : `${100 / Math.max(1, weekDayKeys.length)}%`,
                  }}
                />
              )}

              {unassignedJobs.map((job) => renderJobCard(job, UNASSIGNED_ID))}
            </div>
          </div>

          {/* Technician Rows */}
          {crew.map((member) => {
            const memberJobs = jobsByCrew.get(member.id) ?? [];
            const isTarget = dragVisual?.targetLaneId === member.id;

            return (
              <div
                key={member.id}
                data-lane-id={member.id}
                className={[styles.timelineRow, isTarget ? styles.targetLane : ''].filter(Boolean).join(' ')}
              >
                <div className={styles.resourceCell}>
                  {member.photo_path ? (
                    <img src={member.photo_path} alt={member.name} className={styles.avatar} />
                  ) : (
                    <div className={styles.initialsAvatar}>{crewInitials(member.name)}</div>
                  )}
                  <div className={styles.resourceInfo}>
                    <span className={styles.resourceName}>{member.name}</span>
                    <span className={styles.resourceRole}>{member.role_label || 'Technician'}</span>
                  </div>
                </div>

                <div
                  className={styles.trackCell}
                  ref={(el) => {
                    if (el) trackRefs.current.set(member.id, el);
                    else trackRefs.current.delete(member.id);
                  }}
                  style={{ '--slot-pct': `${100 / (mode === 'day' ? totalHours : weekDayKeys.length)}%` } as React.CSSProperties}
                >
                  {memberJobs.length === 0 && (
                    <div className={styles.emptyLaneNotice}>Free all day</div>
                  )}

                  {/* Snapping drop ghost */}
                  {dragVisual && dragVisual.targetLaneId === member.id && (
                    <div
                      className={styles.dropGhost}
                      style={{
                        left:
                          mode === 'day'
                            ? `${Math.max(0, ((dragVisual.targetMinutes - startMinutes) / totalMinutes) * 100)}%`
                            : `${(Math.max(0, weekDayKeys.indexOf(dragVisual.targetDateKey)) / Math.max(1, weekDayKeys.length)) * 100}%`,
                        width:
                          mode === 'day'
                            ? `${Math.max(6, (dragVisual.durationMinutes / totalMinutes) * 100)}%`
                            : `${100 / Math.max(1, weekDayKeys.length)}%`,
                      }}
                    />
                  )}

                  {memberJobs.map((job) => renderJobCard(job, member.id))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Card Following Pointer During Drag */}
      {dragVisual && (
        <div
          className={styles.floatingCard}
          style={{
            left: dragVisual.cursorX,
            top: dragVisual.cursorY,
          }}
        >
          <div className={styles.cardTitleRow}>
            <span className={styles.cardTitle}>
              {dragVisual.jobRef ? `Job #${dragVisual.jobRef}` : `Job #${dragVisual.jobId.slice(0, 4)}`}
            </span>
          </div>
          <div className={styles.cardDetails}>
            {dragVisual.jobTitle}
            {mode === 'day' ? ` (${formatClockMinutes(dragVisual.targetMinutes)})` : ''}
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undo && (
        <div className={styles.undoToast} role="alert">
          <span>
            Moved <strong>{undo.title}</strong>
          </span>
          <button type="button" className={styles.undoBtn} onClick={handleUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
