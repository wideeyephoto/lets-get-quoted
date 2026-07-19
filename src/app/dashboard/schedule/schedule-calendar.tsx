'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import { removeJobScheduleAction, scheduleJobAction, toggleJobCrewAction } from '../jobs/actions';
import { formatJobSchedule, formatJobTime } from '@/lib/jobs';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CalendarView = 'month' | 'week' | 'year';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export type CalendarCell = { day: number; dateKey: string } | null;

export type CalendarJob = {
  id: string;
  occurrence_key: string;
  client_name: string;
  status: string;
  scheduled_for: string;
  scheduled_time: string | null;
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

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
  const [assignments, setAssignments] = useState(assignmentsByJob);
  const [openOccurrenceKey, setOpenOccurrenceKey] = useState<string | null>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
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

  const visibleWeeks = calendarView === 'week' ? [weekAtAGlance] : weeks;

  function openJobActions(occurrenceKey: string) {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(occurrenceKey);
  }

  function closeJobActions() {
    setIsConfirmingRemove(false);
    setOpenOccurrenceKey(null);
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
        await toggleJobCrewAction(jobId, crewId);
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
                <strong>{month.label}</strong>
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
              const dayJobs = jobsByDate.get(cell.dateKey) ?? [];
              const previousDateKey = cellIndex > 0 ? addDaysToDateKey(cell.dateKey, -1) : null;
              const nextDateKey = cellIndex < week.length - 1 ? addDaysToDateKey(cell.dateKey, 1) : null;
              return (
                <div className={`calendar-cell${cell.dateKey === todayKey ? ' today' : ''}`} key={cell.dateKey}>
                  <span className="calendar-day-number">{cell.day}</span>
                  <div className="calendar-day-jobs">
                    {dayJobs.map((job) => {
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
                            title={job.client_name}
                            onClick={() => openJobActions(job.occurrence_key)}
                          >
                            {formatJobTime(job.scheduled_time) ? `${formatJobTime(job.scheduled_time)} ` : ''}{job.client_name}
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
                  {STATUS_LABEL[openJob.status] ?? openJob.status} · {formatJobSchedule(openJob.scheduled_for, openJob.scheduled_time)}
                </p>
              </div>
              <button type="button" className="crew-assign-close" onClick={closeJobActions} aria-label="Close">
                ×
              </button>
            </div>

            <div className="schedule-job-actions">
              <div className="schedule-job-quick-actions">
                <Link href={`/dashboard/jobs/${openJob.id}`} className="btn secondary schedule-job-open-link">Open job</Link>
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
                <button type="submit" className="btn primary schedule-job-submit">Save new start date</button>
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
