import Link from 'next/link';
import { notFound } from 'next/navigation';
import DemoNav from '@/components/demo-nav';
import { formatJobSchedule, formatMoney, formatPercent, type JobStatus } from '@/lib/jobs';
import { DEMO_JOBS, getDemoCosts, getDemoMargin, getDemoPayments } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<JobStatus, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

const COST_TYPE_LABEL: Record<string, string> = {
  material: 'Materials',
  labor: 'Labor',
  sub: 'Subcontractor',
  receipt: 'Receipt',
  other: 'Other',
};

export default function DemoJobDetailPage({ params }: { params: { id: string } }) {
  const job = DEMO_JOBS.find((j) => j.id === params.id);
  if (!job) notFound();

  const costs = getDemoCosts(job.id);
  const margin = getDemoMargin(job);
  const payments = getDemoPayments(job);

  return (
    <>
      <DemoNav active="/demo/jobs" />
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">{job.ref}</p>
            <h2>{job.client_name}</h2>
          </div>
          <div className="workspace-metric-grid compact">
            <article className="workspace-metric-card accent">
              <span className="workspace-metric-label">Status</span>
              <strong className="workspace-metric-value">{STATUS_LABEL[job.status]}</strong>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Quoted amount</span>
              <strong className="workspace-metric-value">{formatMoney(job.quoted_amount)}</strong>
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">Scheduled</span>
              <strong className="workspace-metric-value">{formatJobSchedule(job.scheduled_for, job.scheduled_time)}</strong>
            </article>
          </div>
          <p className="workspace-card-copy" style={{ marginTop: '1.1rem' }}>
            <strong>Address:</strong> {job.address || 'No address on file'}
          </p>
          <p className="workspace-card-copy">
            <strong>Scope:</strong> {job.scope || 'No scope notes yet.'}
          </p>
          <p className="workspace-card-copy">
            <strong>Client phone:</strong> {job.client_phone || 'Not on file'}
          </p>
        </section>

        {costs.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Costs &amp; margin</p>
              <h2>Job profitability</h2>
            </div>
            <div className="workspace-metric-grid compact">
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Revenue</span>
                <strong className="workspace-metric-value">{formatMoney(margin.revenue)}</strong>
              </article>
              <article className="workspace-metric-card">
                <span className="workspace-metric-label">Total cost</span>
                <strong className="workspace-metric-value">{formatMoney(margin.totalCost)}</strong>
              </article>
              <article className="workspace-metric-card accent">
                <span className="workspace-metric-label">Profit &amp; margin</span>
                <strong className="workspace-metric-value">
                  {formatMoney(margin.profit)} · {formatPercent(margin.margin)}
                </strong>
              </article>
            </div>
            <div className="job-list" style={{ marginTop: '1rem' }}>
              {costs.map((cost) => (
                <div key={cost.id} className="job-row">
                  <div className="job-row-header">
                    <span className="job-ref">{COST_TYPE_LABEL[cost.type] ?? cost.category}</span>
                    <span className="job-quoted">{formatMoney(cost.amount)}</span>
                  </div>
                  <div className="job-client">{cost.description}</div>
                  {cost.supplier ? <div className="job-meta">{cost.supplier}</div> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Invoices &amp; payments</p>
            <h2>Payment status</h2>
          </div>
          {payments.length === 0 ? (
            <p className="empty-state">No invoices sent yet — this job hasn&apos;t been scheduled.</p>
          ) : (
            <div className="job-list">
              {payments.map((payment) => (
                <div key={payment.label} className="job-row">
                  <div className="job-row-header">
                    <span className="job-ref">{payment.label}</span>
                    <span className={`status-badge ${payment.paid ? 'status-complete' : 'status-in_progress'}`}>
                      {payment.paid ? 'Paid' : 'Requested'}
                    </span>
                  </div>
                  <div className="job-client">{formatMoney(payment.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>Log costs, send invoices, request payment</h2>
          </div>
          <p className="workspace-card-copy">
            In a real account you&apos;d add costs, generate a signed invoice, and text the homeowner a
            payment link — all from this page. This demo account is read-only.
          </p>
          <div className="actions">
            <Link href="/login" className="btn primary">
              Create free account
            </Link>
            <Link href="/demo/jobs" className="btn secondary">
              ← Back to jobs
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
