import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listJobs, type Job } from '@/lib/jobs';
import { scheduleJobAction } from '../jobs/actions';

const STATUS_LABEL: Record<Job['status'], string> = {
  new_lead: 'New lead',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const jobs = await listJobs(supabase, accountId);

  const activeJobs = jobs.filter((job) => job.status !== 'archived');
  const scheduledJobs = activeJobs.filter((job) => job.scheduled_for);
  const unscheduledJobs = activeJobs.filter((job) => !job.scheduled_for);

  const jobsByDate = new Map<string, Job[]>();
  for (const job of scheduledJobs) {
    const key = job.scheduled_for as string;
    const bucket = jobsByDate.get(key) ?? [];
    bucket.push(job);
    jobsByDate.set(key, bucket);
  }

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
            <span className="workspace-metric-label">Scheduled this month</span>
            <strong className="workspace-metric-value">
              {scheduledJobs.filter((job) => (job.scheduled_for as string).startsWith(monthParam(year, monthIndex))).length}
            </strong>
            <p className="workspace-metric-note">Jobs with a date landing in {monthLabel}.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Needs a date</span>
            <strong className="workspace-metric-value">{unscheduledJobs.length}</strong>
            <p className="workspace-metric-note">Active jobs without a scheduled date.</p>
          </article>
        </div>
      </section>

      <section className="workspace-grid two-up">
        <div className="panel workspace-section-card">
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
                      {dayJobs.map((job) => (
                        <Link
                          key={job.id}
                          href={`/dashboard/jobs/${job.id}`}
                          className={`calendar-job-chip status-${job.status}`}
                          title={job.client_name}
                        >
                          {job.client_name}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Needs a date</p>
            <h2>Unscheduled jobs</h2>
          </div>
          {unscheduledJobs.length === 0 ? (
            <p className="empty-state">Every active job has a date on the calendar.</p>
          ) : (
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
                      <button type="submit" className="btn secondary">Set date</button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
