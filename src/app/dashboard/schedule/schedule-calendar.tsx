'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { toggleJobCrewAction } from '../jobs/actions';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export type CalendarCell = { day: number; dateKey: string } | null;

export type CalendarJob = {
  id: string;
  client_name: string;
  status: string;
  scheduled_for: string;
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
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
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

  const openJob = openJobId ? jobs.find((job) => job.id === openJobId) ?? null : null;

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
      <p className="calendar-hint">Click the crew badge on any job to assign or remove your team.</p>
      <div className="calendar-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div className="calendar-weekday" key={label}>{label}</div>
        ))}
        {weeks.map((week, weekIndex) =>
          week.map((cell, cellIndex) => {
            if (!cell) {
              return <div className="calendar-cell empty" key={`${weekIndex}-${cellIndex}`} />;
            }
            const dayJobs = jobsByDate.get(cell.dateKey) ?? [];
            return (
              <div className={`calendar-cell${cell.dateKey === todayKey ? ' today' : ''}`} key={cell.dateKey}>
                <span className="calendar-day-number">{cell.day}</span>
                <div className="calendar-day-jobs">
                  {dayJobs.map((job) => {
                    const assignedIds = assignments[job.id] ?? [];
                    const assignedMembers = assignedIds
                      .map((id) => crew.find((member) => member.id === id))
                      .filter((member): member is CrewOption => Boolean(member));
                    return (
                      <div className="calendar-job-item" key={job.id}>
                        <Link
                          href={`/dashboard/jobs/${job.id}`}
                          className={`calendar-job-chip status-${job.status}`}
                          title={job.client_name}
                        >
                          {job.client_name}
                        </Link>
                        <button
                          type="button"
                          className={`calendar-crew-toggle${assignedMembers.length > 0 ? ' has-crew' : ''}`}
                          onClick={() => setOpenJobId(job.id)}
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
        <div className="crew-assign-backdrop" onClick={() => setOpenJobId(null)}>
          <div className="crew-assign-panel" onClick={(event) => event.stopPropagation()}>
            <div className="crew-assign-header">
              <div>
                <p className="crew-assign-title">{openJob.client_name}</p>
                <p className="crew-assign-sub">
                  {STATUS_LABEL[openJob.status] ?? openJob.status} · {openJob.scheduled_for}
                </p>
              </div>
              <button type="button" className="crew-assign-close" onClick={() => setOpenJobId(null)} aria-label="Close">
                ×
              </button>
            </div>

            {crew.length === 0 ? (
              <p className="crew-assign-empty">
                No active crew yet. <Link href="/dashboard/crew">Add your team →</Link>
              </p>
            ) : (
              <div className="crew-assign-list">
                {crew.map((member) => {
                  const assignedIds = assignments[openJob.id] ?? [];
                  const isAssigned = assignedIds.includes(member.id);
                  const isRowPending = pendingKey === `${openJob.id}:${member.id}`;
                  return (
                    <button
                      type="button"
                      key={member.id}
                      className={`crew-assign-option${isAssigned ? ' assigned' : ''}${isRowPending ? ' pending' : ''}`}
                      onClick={() => handleToggle(openJob.id, member.id)}
                      disabled={isRowPending}
                    >
                      <span className="crew-assign-option-info">
                        <span className="crew-assign-option-name">{member.name}</span>
                        <span className="crew-assign-option-role">{member.role_label}</span>
                      </span>
                      <span className="crew-assign-check">{isAssigned ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
