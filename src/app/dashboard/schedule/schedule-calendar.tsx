'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SaveButton from '@/components/save-button';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import { removeJobScheduleAction, scheduleJobAction, textCrewJobDateAction, toggleJobCrewAction } from '../jobs/actions';
import { formatJobSchedule, formatJobTime } from '@/lib/jobs';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CalendarView = 'month' | 'week' | 'year';

export type CalendarCell = { day: number; dateKey: string } | null;

export type CalendarJob = {
  id: string;
  occurrence_key: string;
  client_name: string;
  status: string;
  scheduled_for: string;
  scheduled_time: string | null;
  crew_notified_at: string | null;
  badge_label: string;
  badge_tone: string;
  badge_title: string | null;
};

export type CrewOption = {
  id: string;
  name: string;
  role_label: string;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function hasJobOnDate(jobsByDate: Map<string, CalendarJob[]>, jobId: string, dateKey: string): boolean {
  return (jobsByDate.get(dateKey) ?? []).some((job) => job.id === jobId);
}

function getBandColorClass(jobId: string): string {
  let hash = 0;
  for (const character of jobId) {
    hash = (hash + character.charCodeAt(0)) % 6;
  }
  return `calendar-band-color-${hash}`;
}

function compareCalendarJobs(first: CalendarJob, second: CalendarJob): number {
  return `${first.scheduled_time ?? ''}${first.client_name}${first.id}`.localeCompare(`${second.scheduled_time ?? ''}${second.client_name}${second.id}`);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatCrewNotifiedAt(value: string): string {
  const date = new Date(value);
  const dateText = date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const timeText = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${timeText} on ${dateText}`;
}

export default function ScheduleCalendar({
  weeks,
  todayKey,
  jobs,
  crew,
  assignmentsByJob,
}: {
  weeks: CalendarCell[][];
  todayKey: string;
  jobs: CalendarJob[];
  crew: CrewOption[];
  assignmentsByJob: Record<string, string[]>;
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(assignmentsByJob);
  const [openOccurrenceKey, setOpenOccurrenceKey] = useState<string | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  // When true, adding a crew member to a job texts them the assignment. Toggled
  // per session from the crew popover; only affects assigns (never unassigns).
  const [notifyCrew, setNotifyCrew] = useState(true);
  const [, startTransition] = useTransition();

  // Keep local optimistic state in sync once the server revalidates this
  // route's data (e.g. after a toggle round-trips, or on manual refresh).
  useEffect(() => {
    setAssignments(assignmentsByJob);
  }, [assignmentsByJob]);

  const jobsByDate = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    for (const job of jobs) {
      const bucket = map.get(job.scheduled_for) ?? [];
      bucket.push(job);
      map.set(job.scheduled_for, bucket);
    }
    return map;
  }, [jobs]);

  const openJob = openOccurrenceKey ? jobs.find((job) => job.occurrence_key === openOccurrenceKey) ?? null : null;
  const openJobAssignedMembers = openJob
    ? (assignments[openJob.id] ?? [])
      .map((id) => crew.find((member) => member.id === id))
      .filter((member): member is CrewOption => Boolean(member))
    : [];

  const weekAtAGlance = useMemo(() => {
    return weeks.find((week) => week.some((cell) => cell?.dateKey === todayKey))
      ?? weeks.find((week) => week.some((cell) => cell && (jobsByDate.get(cell.dateKey)?.length ?? 0) > 0))
      ?? weeks.find((week) => week.some(Boolean))
      ?? [];
  }, [jobsByDate, todayKey, weeks]);

  const visibleWeeks = useMemo(() => calendarView === 'week' ? [weekAtAGlance] : weeks, [calendarView, weekAtAGlance, weeks]);

  const visibleWeekLayouts = useMemo(() => {
    return visibleWeeks.map((week) => {
      const laneByJobId = new Map<string, number>();
      const lanesByDate = new Map<string, Array<CalendarJob | null>>();

      for (const cell of week) {
        if (!cell) continue;
        const lanes: Array<CalendarJob | null> = [];
        const usedLanes = new Set<number>();
        const dayJobs = [...(jobsByDate.get(cell.dateKey) ?? [])].sort(compareCalendarJobs);

        for (const job of dayJobs) {
          let lane = laneByJobId.get(job.id);
          if (lane === undefined || usedLanes.has(lane)) {
            lane = 0;
            while (usedLanes.has(lane)) lane++;
            laneByJobId.set(job.id, lane);
          }
          lanes[lane] = job;
          usedLanes.add(lane);
        }

        lanesByDate.set(cell.dateKey, lanes);
      }

      const laneCount = Math.max(0, ...Array.from(lanesByDate.values()).map((lanes) => lanes.length));
      return { lanesByDate, laneCount };
    });
  }, [jobsByDate, visibleWeeks]);

  function openJobActions(occurrenceKey: string) {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(occurrenceKey);
  }

  function closeJobActions() {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(null);
  }

  function navigateToMonth(monthKey: string) {
    setCalendarView('month');
    router.push(`/dashboard/schedule?month=${monthKey}`);
  }

  const twelveMonthSummary = useMemo(() => {
    const firstVisibleCell = weeks.flat().find(Boolean);
    const baseDate = firstVisibleCell ? new Date(`${firstVisibleCell.dateKey}T00:00:00`) : new Date(`${todayKey}T00:00:00`);

    return Array.from({ length: 12 }, (_, index) => {
      const monthDate = addMonths(baseDate, index);
      const monthKey = toMonthKey(monthDate);
      const monthOccurrences = jobs
        .filter((job) => job.scheduled_for.startsWith(monthKey))
        .sort((a, b) => `${a.scheduled_for}${a.scheduled_time ?? ''}`.localeCompare(`${b.scheduled_for}${b.scheduled_time ?? ''}`));
      const uniqueJobs = Array.from(new Map(monthOccurrences.map((job) => [job.id, job])).values());

      return {
        monthKey,
        label: monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        uniqueJobCount: uniqueJobs.length,
        jobs: uniqueJobs.slice(0, 3),
        extraJobCount: Math.max(0, uniqueJobs.length - 3),
      };
    });
  }, [jobs, todayKey, weeks]);

  function handleToggle(jobId: string, crewId: string) {
    const key = `${jobId}:${crewId}`;
    const wasAssigned = (assignments[jobId] ?? []).includes(crewId);

    setPendingKey(key);
    setAssignments((prev) => {
      const current = prev[jobId] ?? [];
      return {
        ...prev,
        [jobId]: wasAssigned ? current.filter((id) => id !== crewId) : [...current, crewId],
      };
    });

    startTransition(async () => {
      try {
        // Only assigns text; toggling a crew member OFF never texts regardless.
        await toggleJobCrewAction(jobId, crewId, notifyCrew);
      } catch (error) {
        console.error('Failed to update crew assignment', error);
        // Revert the optimistic update if the server call failed.
        setAssignments((prev) => {
          const current = prev[jobId] ?? [];
          const stillAssigned = current.includes(crewId);
          return {
            ...prev,
            [jobId]: stillAssigned ? current.filter((id) => id !== crewId) : [...current, crewId],
          };
        });
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <>
      <div className="calendar-toolbar">
        <p className="calendar-hint">Click a job to reschedule it, remove it from the schedule, or manage crew.</p>
        <div className="calendar-view-toggle" aria-label="Calendar view">
          <button type="button" className={calendarView === 'month' ? 'active' : ''} onClick={() => setCalendarView('month')}>Month</button>
          <button type="button" className={calendarView === 'week' ? 'active' : ''} onClick={() => setCalendarView('week')}>Week</button>
          <button type="button" className={calendarView === 'year' ? 'active' : ''} onClick={() => setCalendarView('year')}>12 months</button>
        </div>
      </div>
      {calendarView === 'year' ? (
        <div className="calendar-year-grid">
          {twelveMonthSummary.map((month) => (
            <article className="calendar-year-card" key={month.monthKey}>
              <div className="calendar-year-card-header">
                <button type="button" className="calendar-year-month-link" onClick={() => navigateToMonth(month.monthKey)}>
                  {month.label}
                </button>
                <span>{month.uniqueJobCount}</span>
              </div>
              {month.jobs.length > 0 ? (
                <div className="calendar-year-jobs">
                  {month.jobs.map((job) => (
                    <button type="button" className={`calendar-year-job status-${job.status}`} key={job.occurrence_key} onClick={() => openJobActions(job.occurrence_key)}>
                      <span>{new Date(`${job.scheduled_for}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <strong>{job.client_name}</strong>
                    </button>
                  ))}
                  {month.extraJobCount > 0 ? <p className="calendar-year-more">+{month.extraJobCount} more</p> : null}
                </div>
              ) : (
                <p className="calendar-year-empty">No scheduled jobs</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="calendar-grid">
          {WEEKDAY_LABELS.map((label) => (
            <div className="calendar-weekday" key={label}>{label}</div>
          ))}
          {visibleWeeks.map((week, weekIndex) =>
            week.map((cell, cellIndex) => {
              if (!cell) {
                return <div className="calendar-cell empty" key={`${weekIndex}-${cellIndex}`} />;
              }
              const weekLayout = visibleWeekLayouts[weekIndex];
              const dayLanes = weekLayout?.lanesByDate.get(cell.dateKey) ?? [];
              const laneJobs = Array.from({ length: weekLayout?.laneCount ?? 0 }, (_, laneIndex) => dayLanes[laneIndex] ?? null);
              const previousDateKey = cellIndex > 0 ? addDaysToDateKey(cell.dateKey, -1) : null;
              const nextDateKey = cellIndex < week.length - 1 ? addDaysToDateKey(cell.dateKey, 1) : null;
              return (
                <div className={`calendar-cell${cell.dateKey === todayKey ? ' today' : ''}`} key={cell.dateKey}>
                  <span className="calendar-day-number">{cell.day}</span>
                  <div className="calendar-day-jobs">
                    {laneJobs.map((job, laneIndex) => {
                      if (!job) {
                        return <div className="calendar-job-slot empty" key={`${cell.dateKey}-lane-${laneIndex}`} aria-hidden="true" />;
                      }
                      const continuesFromPrevious = previousDateKey ? hasJobOnDate(jobsByDate, job.id, previousDateKey) : false;
                      const continuesToNext = nextDateKey ? hasJobOnDate(jobsByDate, job.id, nextDateKey) : false;
                      const bandClass = continuesFromPrevious
                        ? continuesToNext
                          ? 'calendar-band-middle'
                          : 'calendar-band-end'
                        : continuesToNext
                          ? 'calendar-band-start'
                          : 'calendar-band-single';
                      const bandColorClass = getBandColorClass(job.id);
                      const assignedIds = assignments[job.id] ?? [];
                      const assignedMembers = assignedIds
                        .map((id) => crew.find((member) => member.id === id))
                        .filter((member): member is CrewOption => Boolean(member));
                      return (
                        <div className={`calendar-job-item calendar-band ${bandClass} ${bandColorClass} status-${job.status}`} key={job.occurrence_key}>
                          <button
                            type="button"
                            className={`calendar-job-chip status-${job.status}`}
                            title={`${job.client_name} · ${job.badge_label}`}
                            onClick={() => openJobActions(job.occurrence_key)}
                          >
                            <span className="calendar-job-chip-main">
                              {formatJobTime(job.scheduled_time) ? `${formatJobTime(job.scheduled_time)} ` : ''}{job.client_name}
                            </span>
                            <span className={`calendar-job-band-badge status-${job.badge_tone}`} title={job.badge_title ?? undefined}>{job.badge_label}</span>
                          </button>
                          <button
                            type="button"
                            className={`calendar-crew-toggle${assignedMembers.length > 0 ? ' has-crew' : ''}`}
                            onClick={() => openJobActions(job.occurrence_key)}
                            title={
                              assignedMembers.length > 0
                                ? `Assigned: ${assignedMembers.map((member) => member.name).join(', ')}`
                                : 'Assign crew'
                            }
                          >
                            {assignedMembers.length > 0
                              ? assignedMembers.slice(0, 2).map((member) => initials(member.name)).join(' ')
                              : '+'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {openJob ? (
        <div className="crew-assign-backdrop" onClick={closeJobActions}>
          <div className="crew-assign-panel schedule-job-actions-panel" onClick={(event) => event.stopPropagation()}>
            <div className="crew-assign-header">
              <div>
                <p className="crew-assign-title">{openJob.client_name}</p>
                <p className="crew-assign-sub">
                  <span className={`status-badge status-${openJob.badge_tone}`} title={openJob.badge_title ?? undefined}>{openJob.badge_label}</span>
                  <span>{formatJobSchedule(openJob.scheduled_for, openJob.scheduled_time)}</span>
                </p>
              </div>
              <button type="button" className="crew-assign-close" onClick={closeJobActions} aria-label="Close">
                ×
              </button>
            </div>

            <div className="schedule-job-actions">
              <div className="schedule-job-quick-actions">
                <Link href={`/dashboard/jobs/${openJob.id}`} className="btn secondary schedule-job-open-link">Open job</Link>
                <Link href={`/dashboard/jobs/${openJob.id}?open=costs`} className="btn secondary schedule-job-open-link">Add expense</Link>
                <Link href={`/dashboard/jobs/${openJob.id}?open=payment#request-payment`} className="btn primary schedule-job-open-link">Request payment</Link>
                <div className="schedule-crew-action-wrap">
                  <div className="schedule-crew-action-group">
                    <details className="schedule-crew-quick">
                      <summary className="btn secondary">
                        Crew
                        {openJobAssignedMembers.length > 0 ? <span>{openJobAssignedMembers.map((member) => initials(member.name)).join(' ')}</span> : null}
                      </summary>
                      <div className="schedule-crew-quick-panel">
                        <div className="schedule-job-section-heading">
                          <strong>Active crew</strong>
                          <span>Check crew on or off for this job.</span>
                        </div>
                        <label className="schedule-crew-notify-toggle">
                          <input type="checkbox" checked={notifyCrew} onChange={(event) => setNotifyCrew(event.currentTarget.checked)} />
                          <span>Text crew when I add them</span>
                        </label>
                        {crew.length === 0 ? (
                          <p className="crew-assign-empty">
                            No active crew yet. <Link href="/dashboard/crew">Add your team →</Link>
                          </p>
                        ) : (
                          <div className="crew-assign-list schedule-crew-check-list">
                            {crew.map((member) => {
                              const assignedIds = assignments[openJob.id] ?? [];
                              const isAssigned = assignedIds.includes(member.id);
                              const isRowPending = pendingKey === `${openJob.id}:${member.id}`;
                              return (
                                <button
                                  type="button"
                                  key={member.id}
                                  className={`crew-assign-option schedule-crew-check-option${isAssigned ? ' assigned' : ''}${isRowPending ? ' pending' : ''}`}
                                  onClick={() => handleToggle(openJob.id, member.id)}
                                  disabled={isRowPending}
                                  aria-pressed={isAssigned}
                                >
                                  <span className="schedule-crew-checkbox" aria-hidden="true">{isAssigned ? '✓' : ''}</span>
                                  <span className="crew-assign-option-info">
                                    <span className="crew-assign-option-name">{member.name}</span>
                                    <span className="crew-assign-option-role">{member.role_label}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                    <form action={textCrewJobDateAction.bind(null, openJob.id)}>
                      <button
                        type="submit"
                        className="schedule-crew-notify-button"
                        disabled={openJobAssignedMembers.length === 0}
                        title={openJobAssignedMembers.length === 0 ? 'Assign crew before texting the date' : 'Text assigned crew the scheduled date'}
                      >
                        Notify
                      </button>
                    </form>
                  </div>
                  <p className={`schedule-crew-notify-status${openJob.crew_notified_at ? ' notified' : ''}`}>
                    {openJob.crew_notified_at
                      ? `Crew Notified ${formatCrewNotifiedAt(openJob.crew_notified_at)}`
                      : 'Crew not notified'}
                  </p>
                </div>
              </div>
              <form action={scheduleJobAction.bind(null, openJob.id)} className="schedule-job-reschedule-form" key={`reschedule-${openJob.occurrence_key}`}>
                <div className="schedule-job-section-heading">
                  <strong>Reschedule</strong>
                  <span>Choose a new start date or time for this job.</span>
                </div>
                <div className="schedule-job-reschedule-grid">
                  <ScheduledDatePicker id={`calendarScheduledFor-${openJob.occurrence_key}`} name="scheduledFor" defaultValue={openJob.scheduled_for} required />
                  <TimeSlotSelect id={`calendarScheduledTime-${openJob.occurrence_key}`} name="scheduledTime" defaultValue={openJob.scheduled_time ?? ''} />
                </div>
                <SaveButton className="btn primary schedule-job-submit" pendingLabel="Saving..." savedLabel="Saved">Save new start date</SaveButton>
              </form>

              <div className="schedule-remove-box">
                {isConfirmingRemove ? (
                  <form action={removeJobScheduleAction.bind(null, openJob.id)} className="schedule-remove-confirm">
                    <strong>Remove this job from the schedule?</strong>
                    <span>It will move back to unscheduled jobs. Crew assignments and job details stay intact.</span>
                    <div className="schedule-remove-actions">
                      <button type="button" className="btn secondary" onClick={() => setIsConfirmingRemove(false)}>Keep scheduled</button>
                      <button type="submit" className="btn danger">Yes, remove it</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" className="btn secondary schedule-remove-trigger" onClick={() => setIsConfirmingRemove(true)}>Remove from schedule</button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
