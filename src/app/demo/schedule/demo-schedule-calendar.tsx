'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatJobSchedule, formatJobTime } from '@/lib/jobs';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CalendarView = 'month' | 'week';

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

// Read-only-ish demo version of the real ScheduleCalendar — crew assignment
// toggles only ever update local component state (no server action, no
// persistence), since this whole page is a fictional, logged-out sample.
export default function DemoScheduleCalendar({
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
  const [calendarView, setCalendarView] = useState<CalendarView>('month');

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

  const weekAtAGlance = useMemo(() => {
    return weeks.find((week) => week.some((cell) => cell?.dateKey === todayKey))
      ?? weeks.find((week) => week.some((cell) => cell && (jobsByDate.get(cell.dateKey)?.length ?? 0) > 0))
      ?? weeks.find((week) => week.some(Boolean))
      ?? [];
  }, [jobsByDate, todayKey, weeks]);

  const visibleWeeks = calendarView === 'week' ? [weekAtAGlance] : weeks;

  function handleToggle(jobId: string, crewId: string) {
    setAssignments((prev) => {
      const current = prev[jobId] ?? [];
      const wasAssigned = current.includes(crewId);
      return {
        ...prev,
        [jobId]: wasAssigned ? current.filter((id) => id !== crewId) : [...current, crewId],
      };
    });
  }

  return (
    <>
      <div className="calendar-toolbar">
        <p className="calendar-hint">Click the crew badge on any job to assign or remove your team.</p>
        <div className="calendar-view-toggle" aria-label="Calendar view">
          <button type="button" className={calendarView === 'month' ? 'active' : ''} onClick={() => setCalendarView('month')}>Month</button>
          <button type="button" className={calendarView === 'week' ? 'active' : ''} onClick={() => setCalendarView('week')}>Week</button>
        </div>
      </div>
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
                        <Link
                          href={`/demo/jobs/${job.id}`}
                          className={`calendar-job-chip status-${job.status}`}
                          title={job.client_name}
                        >
                          {formatJobTime(job.scheduled_time) ? `${formatJobTime(job.scheduled_time)} ` : ''}{job.client_name}
                        </Link>
                        <button
                          type="button"
                          className={`calendar-crew-toggle${assignedMembers.length > 0 ? ' has-crew' : ''}`}
                          onClick={() => setOpenOccurrenceKey(job.occurrence_key)}
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

      {openJob ? (
        <div className="crew-assign-backdrop" onClick={() => setOpenOccurrenceKey(null)}>
          <div className="crew-assign-panel" onClick={(event) => event.stopPropagation()}>
            <div className="crew-assign-header">
              <div>
                <p className="crew-assign-title">{openJob.client_name}</p>
                <p className="crew-assign-sub">{formatJobSchedule(openJob.scheduled_for, openJob.scheduled_time)}</p>
              </div>
              <button type="button" className="crew-assign-close" onClick={() => setOpenOccurrenceKey(null)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="crew-assign-list">
              {crew.map((member) => {
                const assignedIds = assignments[openJob.id] ?? [];
                const isAssigned = assignedIds.includes(member.id);
                return (
                  <button
                    type="button"
                    key={member.id}
                    className={`crew-assign-option${isAssigned ? ' assigned' : ''}`}
                    onClick={() => handleToggle(openJob.id, member.id)}
                  >
                    <span>{member.name}</span>
                    <span className="crew-assign-role">{member.role_label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
