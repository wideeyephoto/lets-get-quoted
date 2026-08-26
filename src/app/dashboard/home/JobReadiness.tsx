import Link from 'next/link';
import type { Loadable, ReadinessSummary } from '@/lib/dashboard-types';

export default function JobReadiness({
  readiness,
}: {
  readiness: Loadable<ReadinessSummary>;
}) {
  if (readiness.kind === 'unavailable') {
    return null;
  }

  const { upcomingJobsCount, fullyReadyCount, blockedJobs } = readiness.data;

  if (upcomingJobsCount === 0) {
    return null;
  }

  return (
    <section className="panel workspace-section-card readiness-panel">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">Readiness</p>
          <h2>Job readiness check</h2>
        </div>
        <span style={{ fontSize: '0.84rem', color: blockedJobs.length === 0 ? 'var(--good, #10b981)' : 'var(--warn, #f59e0b)' }}>
          {fullyReadyCount} of {upcomingJobsCount} jobs ready
        </span>
      </div>

      {blockedJobs.length === 0 ? (
        <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <strong style={{ color: 'var(--good, #10b981)', fontSize: '0.92rem' }}>
            ✓ All upcoming jobs are fully prepared
          </strong>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            Every job in the next 7 days has an assigned start time, crew, and site address.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {blockedJobs.map((item) => (
            <Link
              key={item.jobId}
              href={item.href}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--line, rgba(255,255,255,0.08))',
                background: 'rgba(255,255,255,0.02)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                  {item.clientName}
                </strong>
                {item.scheduledDate ? (
                  <span style={{ fontSize: '0.78rem', color: 'var(--muted)', marginLeft: '0.4rem' }}>
                    ({item.scheduledDate})
                  </span>
                ) : null}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  {item.blockers.map((b) => (
                    <span
                      key={b}
                      style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        background: 'rgba(245, 158, 11, 0.15)',
                        color: 'var(--warn, #f59e0b)',
                      }}
                    >
                      ⚠ {b}
                    </span>
                  ))}
                </div>
              </div>
              <span className="btn secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.65rem' }}>
                Fix blockers
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
