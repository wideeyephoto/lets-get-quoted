import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { expandScheduledJobs, listJobs, type Job } from '@/lib/jobs';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { scheduleJobAction } from '../jobs/actions';
import ScheduleCalendar from './schedule-calendar';

const STATUS_LABEL: Record<Job['status'], string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function parseMonthParam(month?: string): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    if (m >= 1 && m <= 12) return { year: y, monthIndex: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthParam(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const [{ data: account }, jobs] = await Promise.all([
    supabase.from('accounts').select('schedule_day_hours').eq('id', accountId).single(),
    listJobs(supabase, accountId),
  ]);
  const scheduleDayHours = Number(account?.schedule_day_hours) || 8;

  const activeJobs = jobs.filter((job) => job.status !== 'archived');
  const scheduledJobs = activeJobs.filter((job) => job.scheduled_for);
  const scheduledJobOccurrences = expandScheduledJobs(scheduledJobs, scheduleDayHours);
  const unscheduledJobs = activeJobs.filter((job) => !job.scheduled_for);

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const assignmentsByJob = await listCrewAssignmentsForJobs(
    supabase,
    accountId,
    scheduledJobs.map((job) => job.id)
  );

  const { year, monthIndex } = parseMonthParam(searchParams.month);
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: Array<{ day: number; dateKey: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push({ day, dateKey: toDateKey(year, monthIndex, day) });
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const now = new Date();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const monthLabel = new Date(year, monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const prevMonth = monthParam(year, monthIndex - 1);
  const nextMonth = monthParam(year, monthIndex + 1);
  const currentMonth = monthParam(now.getFullYear(), now.getMonth());

  const in30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const next30Key = toDateKey(in30Days.getFullYear(), in30Days.getMonth(), in30Days.getDate());
  const scheduledNext30Days = scheduledJobs.filter((job) => {
    const dateKey = job.scheduled_for as string;
    return dateKey >= todayKey && dateKey <= next30Key;
  }).length;

  const calendarJobs = scheduledJobOccurrences.map((job) => ({
    id: job.id,
    occurrence_key: `${job.id}:${job.scheduled_for}`,
    client_name: job.client_name,
    status: job.status,
    scheduled_for: job.scheduled_for,
    scheduled_time: job.scheduled_time,
  }));

  const crewOptions = crew.map((member) => ({
    id: member.id,
    name: member.name,
    role_label: member.role_label,
  }));

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Schedule</p>
          <h1 className="workspace-title">Job calendar</h1>
          <p className="workspace-lead">
            See what&apos;s on the books this month and get unscheduled jobs onto a date.
          </p>
        </div>
        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Next 30 days</span>
            <strong className="workspace-metric-value">{scheduledNext30Days}</strong>
            <p className="workspace-metric-note">Jobs scheduled within the next 30 days.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Needs a date</span>
            <strong className="workspace-metric-value">{unscheduledJobs.length}</strong>
            <p className="workspace-metric-note">Active jobs without a scheduled date.</p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading calendar-heading">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>{monthLabel}</h2>
          </div>
          <div className="actions">
            <Link href={`/dashboard/schedule?month=${prevMonth}`} className="btn secondary">← Prev</Link>
            <Link href={`/dashboard/schedule?month=${currentMonth}`} className="btn secondary">Today</Link>
            <Link href={`/dashboard/schedule?month=${nextMonth}`} className="btn secondary">Next →</Link>
          </div>
        </div>

        <ScheduleCalendar
          weeks={weeks}
          todayKey={todayKey}
          jobs={calendarJobs}
          crew={crewOptions}
          assignmentsByJob={assignmentsByJob}
        />
      </section>

      {unscheduledJobs.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Needs a date</p>
            <h2>Unscheduled jobs</h2>
          </div>
          <div className="sign-in-methods-list">
            {unscheduledJobs.map((job) => {
              const boundSchedule = scheduleJobAction.bind(null, job.id);
              return (
                <div className="sign-in-method-row" key={job.id}>
                  <div className="method-info">
                    <div>
                      <span className="method-name">{job.client_name}</span>
                      <span className="method-detail">{STATUS_LABEL[job.status]} · {job.address || 'No address on file'}</span>
                    </div>
                  </div>
                  <form action={boundSchedule} className="actions">
                    <input type="date" name="scheduledFor" required aria-label={`Schedule date for ${job.client_name}`} />
                    <input type="time" name="scheduledTime" aria-label={`Schedule time for ${job.client_name}`} />
                    <button type="submit" className="btn secondary">Set schedule</button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
