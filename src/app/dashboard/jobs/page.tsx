import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listJobs, formatMoney, type JobStatus } from '@/lib/jobs';
import { createJobAction } from './actions';

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

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const statusParam = searchParams.status as JobStatus | undefined;
  const jobs = await listJobs(supabase, accountId, statusParam);
  const totalQuoted = jobs.reduce((sum, job) => sum + job.quoted_amount, 0);
  const activeJobs = jobs.filter((job) => job.status === 'in_progress').length;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Jobs</p>
          <h1 className="workspace-title">Job pipeline</h1>
          <p className="workspace-lead">
            Create and track the signed work that feeds cost control, invoices, and homeowner
            payments.
          </p>
          <div className="actions workspace-actions">
            <a href="/api/export/quickbooks" className="btn qb">
              ⬇ Export to QuickBooks (CSV)
            </a>
            <Link href="/dashboard" className="btn secondary">
              Dashboard
            </Link>
          </div>
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Visible jobs</span>
            <strong className="workspace-metric-value">{jobs.length}</strong>
            <p className="workspace-metric-note">Filtered by the current status view.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">In progress</span>
            <strong className="workspace-metric-value">{activeJobs}</strong>
            <p className="workspace-metric-note">Jobs currently moving through production.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Quoted value</span>
            <strong className="workspace-metric-value">{formatMoney(totalQuoted)}</strong>
            <p className="workspace-metric-note">Total quoted amount across this filtered list.</p>
          </article>
        </div>
      </section>

      <section className="workspace-grid two-up">
        <details className="panel workspace-section-card workspace-details" open={jobs.length === 0}>
          <summary className="workspace-details-summary">
            <span className="btn primary">+ New job</span>
            <span className="workspace-details-copy">Capture the next signed opportunity.</span>
          </summary>
          <form action={createJobAction} className="form-grid">
            <div className="field">
              <label htmlFor="clientName">Client name</label>
              <input id="clientName" name="clientName" required placeholder="Sarah Whitfield" />
            </div>
            <div className="field">
              <label htmlFor="clientPhone">Client phone</label>
              <input id="clientPhone" name="clientPhone" placeholder="(248) 555-0117" />
            </div>
            <div className="field full">
              <label htmlFor="address">Address</label>
              <input id="address" name="address" placeholder="1418 Maplewood Ave, Royal Oak, MI" />
            </div>
            <div className="field full">
              <label htmlFor="scope">Scope</label>
              <textarea id="scope" name="scope" placeholder="Full roof tear-off & re-shingle…" />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue="new_lead">
                <option value="new_lead">New lead</option>
                <option value="in_progress">In progress</option>
                <option value="complete">Complete</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="scheduledFor">Scheduled for</label>
              <input id="scheduledFor" name="scheduledFor" type="date" />
            </div>
            <div className="field">
              <label htmlFor="quotedAmount">Quoted amount ($)</label>
              <input id="quotedAmount" name="quotedAmount" type="number" min="0" step="0.01" placeholder="12840" />
            </div>
            <div className="field full">
              <label htmlFor="photos">Photos</label>
              <input id="photos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple />
            </div>
            <div className="field full">
              <button type="submit" className="btn primary">
                Create job
              </button>
            </div>
          </form>
        </details>

        <div className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Filter</p>
            <h2>Status view</h2>
          </div>
          <div className="status-tabs workspace-status-tabs">
            {STATUS_FILTERS.map((filter) => {
              const isActive = (filter.value === 'all' && !statusParam) || filter.value === statusParam;
              const href = filter.value === 'all' ? '/dashboard/jobs' : `/dashboard/jobs?status=${filter.value}`;
              return (
                <Link key={filter.value} href={href} className={`status-tab${isActive ? ' active' : ''}`}>
                  {filter.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Pipeline</p>
          <h2>Current jobs</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="empty-state">No jobs yet. Create your first job above.</p>
        ) : (
          <div className="job-list">
            {jobs.map((job) => (
              <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className="job-row">
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
    </main>
  );
}
