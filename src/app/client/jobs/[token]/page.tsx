import Link from 'next/link';
import { getClientJobDashboard } from '@/lib/job-feed';
import { formatMoney } from '@/lib/jobs';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  requested: 'Awaiting payment',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Void',
};

function formatFeedTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function ClientJobDashboardPage({ params }: { params: { token: string } }) {
  const dashboard = await getClientJobDashboard(params.token);

  if (!dashboard) {
    return (
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <p className="eyebrow">Client view</p>
          <h1 className="workspace-title">This job link is no longer available</h1>
          <p className="workspace-lead">Ask your contractor for a fresh client view link.</p>
        </section>
      </main>
    );
  }

  const openPayments = dashboard.payments.filter((payment) => payment.status === 'requested' || payment.status === 'processing');

  return (
    <main className="wide-shell workspace-shell client-job-dashboard">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">{dashboard.businessName}</p>
          <h1 className="workspace-title">{dashboard.job.client_name}</h1>
          <div className="workspace-inline-row">
            <span className={`status-badge status-${dashboard.job.status}`}>{STATUS_LABEL[dashboard.job.status] ?? dashboard.job.status}</span>
            <span className="workspace-inline-note">{dashboard.job.ref} · {dashboard.job.address || 'Address not listed'}</span>
          </div>
          <p className="workspace-lead">Schedule: {dashboard.job.schedule_label}</p>
        </div>
        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Open payments</span>
            <strong className="workspace-metric-value">{openPayments.length}</strong>
            <p className="workspace-metric-note">Secure payment requests from your contractor.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Invoices</span>
            <strong className="workspace-metric-value">{dashboard.invoices.length}</strong>
            <p className="workspace-metric-note">Documents tied to this job.</p>
          </article>
        </div>
      </section>

      {openPayments.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Payments</p>
            <h2>Requests needing attention</h2>
          </div>
          <div className="cost-list">
            {openPayments.map((payment) => (
              <Link href={`/pay/${payment.id}`} className="cost-item" key={payment.id}>
                <div className="cost-item-main">
                  <span className="cost-item-desc">{payment.label || 'Payment request'}</span>
                  <span className="cost-item-sub">{PAYMENT_STATUS_LABEL[payment.status]}</span>
                </div>
                <span className="cost-item-amount">{formatMoney(Number(payment.amount))}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="detail-grid workspace-grid-gap">
        <div>
          <div className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Job feed</p>
              <h2>What happened</h2>
            </div>
            {dashboard.feed.length === 0 ? (
              <p className="empty-state">No client-visible updates yet.</p>
            ) : (
              <div className="job-feed-list">
                {dashboard.feed.map((event) => (
                  <article className="job-feed-item" key={event.id}>
                    <div className="job-feed-dot" />
                    <div className="job-feed-content">
                      <div className="job-row-header">
                        <span className="cost-item-desc">{event.title || event.kind}</span>
                        {event.amount ? <span className="cost-item-amount">{formatMoney(Number(event.amount))}</span> : null}
                      </div>
                      {event.body ? <p className="workspace-card-copy">{event.body}</p> : null}
                      <p className="job-meta">
                        {formatFeedTime(event.created_at)}
                        {event.action_url ? (
                          <>
                            {' · '}
                            <Link href={event.action_url}>Open</Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="panel workspace-section-card sticky-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Invoices</p>
              <h2>Documents</h2>
            </div>
            {dashboard.invoices.length === 0 ? (
              <p className="empty-state">No invoices have been shared yet.</p>
            ) : (
              <div className="cost-list">
                {dashboard.invoices.map((invoice) => (
                  <Link href={`/invoice/${invoice.id}`} className="cost-item" key={invoice.id}>
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{invoice.ref}</span>
                      <span className="cost-item-sub">{INVOICE_STATUS_LABEL[invoice.status]}</span>
                    </div>
                    <span className="cost-item-amount">{formatMoney(Number(invoice.total))}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}