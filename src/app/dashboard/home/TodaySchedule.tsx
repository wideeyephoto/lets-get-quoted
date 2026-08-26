import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { Loadable, TodayScheduleSummary } from '@/lib/dashboard-types';

export default function TodaySchedule({
  schedule,
  basePath = '/dashboard',
}: {
  schedule: Loadable<TodayScheduleSummary>;
  basePath?: string;
}) {
  if (schedule.kind === 'unavailable') {
    return (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Operations</p>
          <h2>Today&apos;s schedule</h2>
        </div>
        <p className="workspace-card-copy" style={{ color: 'var(--muted)' }}>
          Schedule data is temporarily unavailable.
        </p>
      </section>
    );
  }

  const { items, totalWorkValue } = schedule.data;

  return (
    <section className="panel workspace-section-card today-schedule-panel">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">Operations · Today</p>
          <h2>Today&apos;s schedule</h2>
        </div>
        {items.length > 0 ? (
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'block' }}>
              Today&apos;s work value (not revenue)
            </span>
            <strong style={{ fontSize: '1.15rem', color: 'var(--text)' }}>
              {formatMoney(totalWorkValue)}
            </strong>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="priority-empty" style={{ margin: '0.5rem 0' }}>
          <strong>No jobs scheduled today.</strong>
          <span>Use the schedule board to place upcoming approved jobs or send booking requests.</span>
          <div style={{ marginTop: '0.75rem' }}>
            <Link href={`${basePath}/schedule`} className="btn secondary">
              Open schedule board
            </Link>
          </div>
        </div>
      ) : (
        <div className="today-timeline" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
          {items.map((item) => {
            const isDone = item.status === 'complete';
            const inProgress = item.status === 'in_progress';

            return (
              <Link
                key={item.jobId}
                href={item.href}
                className="today-job-card"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px minmax(0, 1fr) auto',
                  gap: '0.75rem',
                  alignItems: 'center',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--line, rgba(255,255,255,0.08))',
                  background: 'rgba(255,255,255,0.02)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
              >
                {/* Time column */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                    {item.formattedTime}
                  </strong>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                    {item.readiness === 'needs_time' ? 'Time TBD' : 'Arrival'}
                  </span>
                </div>

                {/* Job details column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.98rem', color: 'var(--text)' }}>
                      {item.clientName}
                    </strong>
                    {item.quotedAmount > 0 ? (
                      <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                        · {formatMoney(item.quotedAmount)}
                      </span>
                    ) : null}
                    {item.assignedCrew.length > 0 ? (
                      <span
                        className="week-glance-crew"
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '999px',
                          background: 'rgba(139, 92, 246, 0.18)',
                          color: 'var(--cedge-violet-4, #c4b5fd)',
                        }}
                        title={`Assigned: ${item.assignedCrew.map((c) => c.name).join(', ')}`}
                      >
                        {item.assignedCrew.map((c) => c.initials).join(' ')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: 'var(--warn, #f59e0b)' }}>
                        ⚠ Unassigned
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {[item.jobType, item.city].filter(Boolean).join(' · ')}
                  </span>
                </div>

                {/* Status Badge */}
                <div>
                  <span
                    className={`status-badge ${
                      isDone ? 'status-complete' : inProgress ? 'status-active' : 'status-pending'
                    }`}
                    style={{ fontSize: '0.76rem', minWidth: '70px', textAlign: 'center' }}
                  >
                    {isDone ? 'Completed' : inProgress ? 'In Progress' : 'Upcoming'}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
