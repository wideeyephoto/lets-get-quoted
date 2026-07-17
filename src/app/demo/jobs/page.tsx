import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import { formatMoney, sortJobsByStatus, type JobStatus } from '@/lib/jobs';
import { DEMO_JOBS } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: { value: JobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new_lead', label: 'New lead' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New lead',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

export default function DemoJobsPage({ searchParams }: { searchParams: { status?: string } }) {
  const statusParam = searchParams.status as JobStatus | undefined;
  const jobs = sortJobsByStatus(statusParam ? DEMO_JOBS.filter((job) => job.status === statusParam) : DEMO_JOBS);
  const totalQuoted = jobs.reduce((sum, job) => sum + job.quoted_amount, 0);
  const activeJobs = jobs.filter((job) => job.status === 'in_progress').length;

  return (
    <>
      <DemoNav active="/demo/jobs" />
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Pipeline</p>
            <h2>Current jobs</h2>
          </div>
          <div className="status-tabs workspace-status-tabs">
            {STATUS_FILTERS.map((filter) => {
              const isActive = (filter.value === 'all' && !statusParam) || filter.value === statusParam;
              const href = filter.value === 'all' ? '/demo/jobs' : `/demo/jobs?status=${filter.value}`;
              return (
                <Link key={filter.value} href={href} className={`status-tab${isActive ? ' active' : ''}`}>
                  {filter.label}
                </Link>
              );
            })}
          </div>
          {jobs.length === 0 ? (
            <p className="empty-state">No jobs with this status.</p>
          ) : (
            <div className="job-list">
              {jobs.map((job) => (
                <Link key={job.id} href={`/demo/jobs/${job.id}`} className="job-row">
                  <div className="job-row-header">
                    <span className="job-ref">{job.ref}</span>
                    <span className={`status-badge status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
                  </div>
                  <div className="job-client">{job.client_name}</div>
                  <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
                    <span className="job-meta">{job.address || 'No address on file'}</span>
                    {job.quoted_amount > 0 ? (
                      <span className="job-quoted">{formatMoney(job.quoted_amount)}</span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="stat-ticker panel">
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{jobs.length}</span>
            <span className="stat-ticker-label">Visible jobs</span>
          </div>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{activeJobs}</span>
            <span className="stat-ticker-label">In progress</span>
          </div>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{formatMoney(totalQuoted)}</span>
            <span className="stat-ticker-label">Quoted value</span>
          </div>
        </div>

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>+ New job</h2>
          </div>
          <p className="workspace-card-copy">
            Creating jobs, logging costs, and tracking margin is instant once you&apos;re signed in — this
            demo account is read-only.
          </p>
          <Link href="/login" className="btn primary">
            Create free account
          </Link>
        </section>
      </main>
    </>
  );
}
