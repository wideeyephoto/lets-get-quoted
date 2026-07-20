import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { getClientJobDashboard } from '@/lib/job-feed';
import { formatMoney } from '@/lib/jobs';
import { formatScheduleOption } from '@/lib/scheduling';
import { requestDifferentClientJobScheduleOptionsAction, selectClientJobScheduleOptionAction } from './actions';

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
  const selectedScheduleOption = dashboard.scheduleRequest?.selected_index == null ? null : dashboard.scheduleRequest.options[dashboard.scheduleRequest.selected_index];

  return (
    <main className="wide-shell workspace-shell client-job-dashboard">
      {openPayments.length > 0 ? (
        <section className="panel workspace-section-card client-attention-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Needs attention</p>
            <h2>Payment requests</h2>
          </div>
          <p className="workspace-card-copy">Please review these requests to keep the job moving.</p>
          <div className="cost-list">
            {openPayments.map((payment) => (
              <Link href={`/pay/${payment.id}`} className="cost-item client-attention-link" key={payment.id}>
                <div className="cost-item-main">
                  <span className="cost-item-desc">{payment.label || 'Payment request'}</span>
                  <span className="cost-item-sub">{PAYMENT_STATUS_LABEL[payment.status]}</span>
                </div>
                <span className="client-attention-pay-block">
                  <span className="cost-item-amount">{formatMoney(Number(payment.amount))}</span>
                  <span className="client-attention-action">{payment.status === 'requested' ? 'Pay now' : 'View payment'}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {dashboard.scheduleRequest?.status === 'open' ? (
        <section className="panel workspace-section-card client-attention-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Choose your start date</p>
            <h2>Approve the quote and schedule the job</h2>
          </div>
          <p className="workspace-card-copy">Pick the start time that works best. Your contractor will see your choice immediately.</p>
          <div className="schedule-choice-grid client-schedule-choice-grid">
            {dashboard.scheduleRequest.options.map((option, index) => (
              <form action={selectClientJobScheduleOptionAction.bind(null, params.token)} className="schedule-choice-card" key={`${option.date}-${option.time ?? 'anytime'}`}>
                <input type="hidden" name="optionIndex" value={index} />
                <span className="schedule-choice-label">Option {index + 1}</span>
                <strong>{formatScheduleOption(option)}</strong>
                <textarea name="notes" rows={2} placeholder="Optional note" />
                <SaveButton pendingLabel="Scheduling..." savedLabel="Scheduled">Approve quote and schedule</SaveButton>
              </form>
            ))}
          </div>
          <form action={requestDifferentClientJobScheduleOptionsAction.bind(null, params.token)} className="form-grid client-different-schedule-form">
            <div className="field full">
              <label htmlFor="different-notes">Need a different time?</label>
              <textarea id="different-notes" name="notes" rows={3} placeholder="Share days or times that usually work better for you." />
            </div>
            <div className="field full">
              <SaveButton className="btn secondary" pendingLabel="Sending..." savedLabel="Sent">Request different dates</SaveButton>
            </div>
          </form>
        </section>
      ) : null}

      {dashboard.scheduleRequest?.status === 'selected' && selectedScheduleOption ? (
        <section className="panel workspace-section-card client-attention-card success">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Start date selected</p>
            <h2>{formatScheduleOption(selectedScheduleOption)}</h2>
          </div>
          <p className="workspace-card-copy">Your contractor has your selected start time.</p>
          {dashboard.scheduleRequest.client_notes ? <p className="workspace-card-copy">Notes: {dashboard.scheduleRequest.client_notes}</p> : null}
        </section>
      ) : null}

      {dashboard.scheduleRequest?.status === 'needs_more_options' ? (
        <section className="panel workspace-section-card client-attention-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Start date request sent</p>
            <h2>We&apos;ll send different options</h2>
          </div>
          {dashboard.scheduleRequest.client_notes ? <p className="workspace-card-copy">{dashboard.scheduleRequest.client_notes}</p> : null}
        </section>
      ) : null}

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
      </section>

      <section className="detail-grid workspace-grid-gap">
        <div>
          <div className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Job feed</p>
              <h2>Status Updates</h2>
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