import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import AddressAutocomplete from '@/components/address-autocomplete';
import { getJob, listCosts, computeMargin, formatJobQuoteSummary, formatJobSchedule, formatMoney, formatPercent, type Cost } from '@/lib/jobs';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
import { listPayments, type PaymentStatus } from '@/lib/payments';
import { listInvoices, type InvoiceStatus } from '@/lib/invoices';
import { createLinkedFeedItems, getActiveClientAccessCount, listJobFeed, sortJobFeed, type JobFeedEvent } from '@/lib/job-feed';
import { listCrew, listCrewIdsForJob } from '@/lib/crew';
import {
  createClientJobLinkAction,
  createCostAction,
  createManualJobFeedAction,
  deleteCostAction,
  deleteJobAction,
  revokeClientJobLinkAction,
  updateJobAction,
  updateJobCrewAction,
} from '../actions';
import { createDepositRequestAction, refundPaymentAction, markPaymentFailedAction, retryPaymentAction, retryPaymentTextAction } from '../payments-actions';
import { createInvoiceAction } from '../invoices-actions';
import DeleteJobButton from './DeleteJobButton';
import PaymentActionButtons from './PaymentActionButtons';
import JobExpenseFields from '@/components/job-expense-fields';
import SaveButton from '@/components/save-button';
import QuickFillButtons from '@/components/quick-fill-buttons';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  requested: 'Awaiting payment',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Void',
};

const COST_TYPE_ICON: Record<Cost['type'], string> = {
  material: '🧱',
  labor: '👷',
  sub: '🤝',
  receipt: '🧾',
  other: '📦',
};

const FEED_VISIBILITY_LABEL: Record<JobFeedEvent['visibility'], string> = {
  internal: 'Internal',
  client: 'Client visible',
  client_financial: 'Client financial',
};

const FEED_KIND_LABEL: Record<string, string> = {
  job_created: 'Job',
  job_update: 'Update',
  job_scheduled: 'Schedule',
  cost_added: 'Cost',
  payment_requested: 'Payment request',
  payment_paid: 'Payment received',
  payment_failed: 'Payment issue',
  payment_refunded: 'Refund',
  invoice_created: 'Invoice',
  invoice_signoff_link: 'Client sign-off',
  invoice_sent: 'Invoice sent',
  invoice_signed: 'Invoice signed',
  invoice_paid: 'Invoice paid',
  client_link_created: 'Client link',
  client_link_revoked: 'Client link',
};

const FEED_KIND_ICON: Record<string, string> = {
  job_created: '+',
  job_update: 'i',
  job_scheduled: 'S',
  cost_added: '$',
  payment_requested: '$',
  payment_paid: '✓',
  payment_failed: '!',
  payment_refunded: '↩',
  invoice_created: 'I',
  invoice_signoff_link: '✓',
  invoice_sent: 'I',
  invoice_signed: '✓',
  invoice_paid: '✓',
  client_link_created: '↗',
  client_link_revoked: '×',
};

function marginTier(margin: number): 'margin-good' | 'margin-ok' | 'margin-bad' {
  if (margin >= 0.35) return 'margin-good';
  if (margin >= 0.2) return 'margin-ok';
  return 'margin-bad';
}

function formatFeedTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string; clientToken?: string; edit?: string; open?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();

  const job = await getJob(supabase, accountId, params.id);

  if (!job) {
    return (
      <main className="wide-shell">
        <div className="panel">
          <p className="empty-state">Job not found.</p>
          <Link href="/dashboard/jobs" className="btn secondary">
            Back to jobs
          </Link>
        </div>
      </main>
    );
  }

  const costs = await listCosts(supabase, accountId, job.id);
  const margin = computeMargin(job, costs);
  const payments = await listPayments(supabase, accountId, job.id);
  const invoices = await listInvoices(supabase, accountId, job.id);
  const feed = await listJobFeed(supabase, accountId, job.id);
  const activeClientLinkCount = await getActiveClientAccessCount(supabase, accountId, job.id);
  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  const assignedCrewIds = await listCrewIdsForJob(supabase, accountId, job.id);
  const jobPhotoUrls = await createJobPhotoUrls(accountId, job.photo_paths || []);
  const jobPhotos = (job.photo_paths || []).map((path, index) => ({ path, url: jobPhotoUrls[index] })).filter((photo) => photo.url);
  const { data: accountRow } = await supabase
    .from('accounts')
    .select('connect_onboarded')
    .eq('id', accountId)
    .maybeSingle();
  const stripeOnboarded = accountRow?.connect_onboarded ?? false;

  const boundUpdateJob = updateJobAction.bind(null, job.id);
  const boundUpdateJobCrew = updateJobCrewAction.bind(null, job.id);
  const boundDeleteJob = deleteJobAction.bind(null, job.id);
  const boundCreateCost = createCostAction.bind(null, job.id);
  const boundCreateDepositRequest = createDepositRequestAction.bind(null, job.id);
  const boundCreateManualFeed = createManualJobFeedAction.bind(null, job.id);
  const boundCreateClientJobLink = createClientJobLinkAction.bind(null, job.id);
  const boundRevokeClientJobLink = revokeClientJobLinkAction.bind(null, job.id);
  const boundCreateInvoice = createInvoiceAction.bind(null, job.id);
  const boundRefundPayment = refundPaymentAction.bind(null, job.id);
  const boundMarkPaymentFailed = markPaymentFailedAction.bind(null, job.id);
  const boundRetryPaymentText = retryPaymentTextAction.bind(null, job.id);
  const linkedFeedItems = createLinkedFeedItems(feed, payments, invoices, accountId, job.id);
  const displayedFeed: JobFeedEvent[] = sortJobFeed([
    ...feed,
    ...linkedFeedItems,
    ...(feed.some((event) => event.kind === 'job_created')
      ? []
      : [
        {
          id: `job-created-${job.id}`,
          account_id: accountId,
          job_id: job.id,
          kind: 'job_created',
          title: `${job.ref} created`,
          body: formatJobQuoteSummary(job),
          image_url: null,
          author: null,
          meta: null,
          visibility: 'client',
          amount: null,
          source_table: 'jobs',
          source_id: job.id,
          action_url: null,
          published_at: job.created_at,
          created_at: job.created_at,
        } satisfies JobFeedEvent,
      ]),
  ]);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel job-command-hero">
        <div className="workspace-hero-copy">
          <div className="job-title-row">
            <h1 className="workspace-title">{job.client_name}</h1>
            <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`} className="job-title-edit-link">
              (edit)
            </Link>
          </div>
          <div className="workspace-inline-row">
            <span className={`status-badge status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
            <span className="workspace-inline-note">{job.address || 'No address on file yet'}</span>
          </div>
          <div className="job-command-facts" aria-label="Job facts">
            <span>
              <strong>
                <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>{formatMoney(job.quoted_amount)}</Link>
              </strong>{' '}
              quoted
            </span>
            <span>
              <strong>
                <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>
                  {job.estimated_hours ? `${job.estimated_hours} hrs` : 'Not set'}
                </Link>
              </strong>{' '}
              estimated hours
            </span>
          </div>
          <div className="actions workspace-actions">
            <Link href={`/dashboard/jobs/${job.id}?open=payment#request-payment`} className="btn primary">Request payment</Link>
            <a href="#job-costs" className="btn secondary">Add expense</a>
          </div>
        </div>

      </section>

      <section id="job-feed" className="panel workspace-section-card job-feed-command-panel">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Job feed</p>
              <h2>Job Feed</h2>
            </div>
            {displayedFeed.length === 0 ? (
              <p className="empty-state">No job feed updates yet.</p>
            ) : (
              <div className="job-feed-list workspace-list-block">
                {displayedFeed.map((event) => (
                  <article className={`job-feed-item feed-kind-${event.kind}`} key={event.id}>
                    <div className="job-feed-dot">{FEED_KIND_ICON[event.kind] ?? '•'}</div>
                    <div className="job-feed-content">
                      <div className="job-row-header">
                        <span className="cost-item-desc">{event.kind === 'job_created' ? `${job.ref} created` : event.title || event.kind}</span>
                        <div className="feed-badge-row">
                          <span className="status-badge status-new_lead">{FEED_KIND_LABEL[event.kind] ?? 'Update'}</span>
                          <span className={`status-badge ${event.visibility === 'internal' ? 'status-archived' : 'status-complete'}`}>
                            {FEED_VISIBILITY_LABEL[event.visibility]}
                          </span>
                        </div>
                      </div>
                      {event.body ? <p className="workspace-card-copy">{event.body}</p> : null}
                      <p className="job-meta">
                        {formatFeedTime(event.created_at)}
                        {event.amount ? ` · ${formatMoney(Number(event.amount))}` : ''}
                        {event.action_url ? (
                          <>
                            {' · '}
                            <Link href={event.action_url} target="_blank">Open link</Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <form action={boundCreateManualFeed} className="cost-form workspace-form-block">
              <div className="field">
                <label htmlFor="feed-title">Update title</label>
                <input id="feed-title" name="title" placeholder="Materials delivered" required />
              </div>
              <div className="field full">
                <label htmlFor="feed-body">Update</label>
                <textarea id="feed-body" name="body" placeholder="Tell the client what changed or what happened today." />
              </div>
              <label className="sms-consent-check">
                <input name="visibility" type="checkbox" value="client" />
                <span>Show this update on the client dashboard</span>
              </label>
              <label className="sms-consent-check">
                <input name="notifyClientSms" type="checkbox" />
                <span>Notify client by SMS about this job update</span>
              </label>
              <div style={{ marginTop: '0.8rem' }}>
                <SaveButton pendingLabel="Posting…" savedLabel="Posted ✓">Post update</SaveButton>
              </div>
            </form>
      </section>

      <details id="request-payment" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'payment'}>
          <summary className="workspace-details-summary job-action-summary">
            <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Payments</p>
            <h2>Request a payment from {job.client_name}</h2>
            </div>
            <span className="workspace-details-copy">Create or review payment links.</span>
          </summary>
            {!stripeOnboarded ? (
              <div className="payment-banner warning">
                <p>
                  <strong>Stripe isn&apos;t connected yet.</strong> Homeowners won&apos;t be able to pay
                  until you finish onboarding.
                </p>
                <p>
                  <Link href="/dashboard/settings">Connect Stripe in Account settings →</Link>
                </p>
              </div>
            ) : null}
            <form action={boundCreateDepositRequest} className="cost-form workspace-form-block">
              <div className="cost-form-row">
                <div className="field">
                  <label htmlFor="pay-kind">Type</label>
                  <select id="pay-kind" name="kind" defaultValue="deposit">
                    <option value="deposit">Deposit</option>
                    <option value="stage">Stage payment</option>
                    <option value="final">Final payment</option>
                    <option value="plan_installment">Additional payment</option>
                  </select>
                  <QuickFillButtons
                    label="Quick add:"
                    targetId="pay-kind"
                    values={[
                      { label: 'Deposit', value: 'deposit' },
                      { label: 'Stage', value: 'stage' },
                      { label: 'Final', value: 'final' },
                      { label: 'Additional payment', value: 'plan_installment' },
                    ]}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pay-amount">Amount ($)</label>
                  <input id="pay-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="2500" />
                </div>
                <div className="field">
                  <label htmlFor="invoiceId">Link invoice</label>
                  <select id="invoiceId" name="invoiceId" defaultValue="">
                    <option value="">No invoice</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.ref} — {formatMoney(invoice.total)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pay-label">Notes (optional)</label>
                  <input id="pay-label" name="label" placeholder="Optional payment note" />
                </div>
              </div>
              <div className="payment-sms-options">
                <label className="field" htmlFor="homeowner-phone">
                  <span>Homeowner mobile</span>
                  <input id="homeowner-phone" name="homeownerPhone" type="tel" defaultValue={job.client_phone ?? ''} placeholder="(248) 555-0117" />
                </label>
                <label className="sms-consent-check">
                  <input name="sendSms" type="checkbox" />
                  <span>Text the secure payment link and automatic payment updates. The homeowner agreed to transactional texts; message and data rates may apply. Reply STOP to opt out.</span>
                </label>
              </div>
              <div style={{ marginTop: '0.8rem' }}>
                <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Create payment request &amp; notify</SaveButton>
              </div>
            </form>

            {payments.length === 0 ? (
              <p className="empty-state">No payment requests yet.</p>
            ) : (
              <div className="cost-list workspace-list-block">
                {payments.map((payment) => (
                  <div key={payment.id} className="cost-item">
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{payment.label || payment.kind}</span>
                      <span className="cost-item-sub">
                        {PAYMENT_STATUS_LABEL[payment.status]}
                        {payment.status === 'paid' && payment.platform_fee != null
                          ? ` · platform fee ${formatMoney(payment.platform_fee)} (${((payment.fee_rate ?? 0) * 100).toFixed(2)}%)`
                          : null}
                        {payment.sms_events?.find((event) => event.event_type === 'payment_requested') ? ` · SMS ${payment.sms_events.find((event) => event.event_type === 'payment_requested')?.status}` : null}
                        {payment.status === 'requested' || payment.status === 'processing' ? (
                          <>
                            {' · '}
                            <a href={`/pay/${payment.id}`} target="_blank" rel="noreferrer">
                              /pay/{payment.id}
                            </a>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span className="cost-item-amount">{formatMoney(payment.amount)}</span>
                      <PaymentActionButtons
                        jobId={job.id}
                        paymentId={payment.id}
                        status={payment.status}
                        onRefund={boundRefundPayment}
                        onMarkFailed={boundMarkPaymentFailed}
                        onRetry={retryPaymentAction}
                      />
                      {payment.sms_events?.some((event) => event.event_type === 'payment_requested' && event.status === 'failed') && (
                        <form action={boundRetryPaymentText.bind(null, payment.id)}>
                          <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Sent ✓">
                            Retry SMS
                          </SaveButton>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </details>

      <details id="job-details" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.edit === 'client'}>
          <summary className="workspace-details-summary job-action-summary">
            <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Overview</p>
            <h2>Job details</h2>
            </div>
            <span className="workspace-details-copy">Edit client info, schedule, crew, photos, and job settings.</span>
          </summary>
            <form action={boundUpdateJob} className="form-grid">
              <div className="field">
                <label htmlFor="clientName">Client name</label>
                <input id="clientName" name="clientName" defaultValue={job.client_name} required />
              </div>
              <div className="field">
                <label htmlFor="clientPhone">Client phone</label>
                <input id="clientPhone" name="clientPhone" defaultValue={job.client_phone ?? ''} />
              </div>
              <div className="field full">
                <label htmlFor="address">Address</label>
                <AddressAutocomplete id="address" name="address" defaultValue={job.address ?? ''} />
              </div>
              <div className="field full">
                <label htmlFor="scope">Job Description</label>
                <textarea id="scope" name="scope" defaultValue={job.scope ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={job.status}>
                  <option value="new_lead">New request</option>
                  <option value="in_progress">In progress</option>
                  <option value="complete">Complete</option>
                  <option value="archived">Archived</option>
                </select>
                <QuickFillButtons
                  label="Quick add:"
                  targetId="status"
                  values={[
                    { label: 'New request', value: 'new_lead' },
                    { label: 'In progress', value: 'in_progress' },
                    { label: 'Complete', value: 'complete' },
                    { label: 'Archived', value: 'archived' },
                  ]}
                />
              </div>
              <div className="field">
                <label htmlFor="scheduledFor">Scheduled for</label>
                <ScheduledDatePicker id="scheduledFor" name="scheduledFor" defaultValue={job.scheduled_for ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="scheduledTime">Time of day</label>
                <TimeSlotSelect id="scheduledTime" name="scheduledTime" defaultValue={job.scheduled_time?.slice(0, 5) ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="estimatedHours">Estimated hours</label>
                <input id="estimatedHours" name="estimatedHours" type="number" min="0" step="0.25" defaultValue={job.estimated_hours ?? ''} />
                <QuickFillButtons
                  label="Quick add:"
                  targetId="estimatedHours"
                  values={[
                    { label: '4 hrs', value: '4' },
                    { label: '8 hrs', value: '8' },
                    { label: '16 hrs', value: '16' },
                    { label: '24 hrs', value: '24' },
                    { label: '40 hrs', value: '40' },
                  ]}
                />
              </div>
              <div className="field">
                <label htmlFor="quotedAmount">Quoted amount ($)</label>
                <input
                  id="quotedAmount"
                  name="quotedAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={job.quoted_amount}
                />
              </div>
              <div className="field full">
                <p className="workspace-card-copy">Current schedule: {formatJobSchedule(job.scheduled_for, job.scheduled_time)}</p>
              </div>
              <div className="field full">
                <SaveButton>Save changes</SaveButton>
              </div>
            </form>

            <div className="workspace-section-divider">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Crew</p>
                <h2>Assigned crew members</h2>
              </div>
              {crew.length === 0 ? (
                <p className="empty-state">
                  No crew members yet. <Link href="/dashboard/crew">Add your crew →</Link>
                </p>
              ) : (
                <form action={boundUpdateJobCrew} className="form-grid">
                  <div className="field full">
                    {crew.map((member) => (
                      <label key={member.id} className="sms-consent-check" style={{ marginBottom: '0.5rem' }}>
                        <input
                          type="checkbox"
                          name="crewIds"
                          value={member.id}
                          defaultChecked={assignedCrewIds.includes(member.id)}
                        />
                        <span>
                          <strong>{member.name}</strong> — {member.role_label} · {member.phone}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="field full">
                    <SaveButton>Save crew assignment</SaveButton>
                  </div>
                </form>
              )}
            </div>

            <div className="workspace-section-divider">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Attachments</p>
                <h2>Job photos</h2>
              </div>
              <PhotoGallery
                entityId={job.id}
                entityField="jobId"
                uploadUrl="/api/job-photos"
                initialPhotos={jobPhotos}
                emptyLabel="No photos yet. Add progress shots or before/after photos."
              />
            </div>

            <div className="workspace-danger-zone">
              <p className="eyebrow danger-eyebrow">
                Danger zone
              </p>
              <p className="job-meta workspace-danger-copy">
                Deleting a job permanently removes it and all of its logged costs.
              </p>
              <DeleteJobButton action={boundDeleteJob} />
            </div>
        </details>

      <section id="job-costs" className="detail-grid workspace-grid-gap">
          <div>
            <div className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Expenses</p>
                <h2>Job Expenses</h2>
              </div>

              <form action={boundCreateCost} className="cost-form">
                <JobExpenseFields crew={crew} />
                <div style={{ marginTop: '0.8rem' }}>
                  <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                </div>
              </form>

              {costs.length === 0 ? (
                <p className="empty-state">No expenses logged yet.</p>
              ) : (
                <div className="cost-list">
                  {costs.map((cost) => (
                    <div key={cost.id} className="cost-item">
                      <div className="cost-item-main">
                        <span className="cost-item-desc">
                          {COST_TYPE_ICON[cost.type]} {cost.description}
                        </span>
                        <span className="cost-item-sub">
                          {cost.type === 'labor'
                            ? `${cost.hours} hrs × ${formatMoney(Number(cost.rate))}/hr${cost.crew_name ? ` · ${cost.crew_name}` : ''}${cost.supplier ? ` · ${cost.supplier}` : ''}`
                            : cost.supplier || cost.category}
                        </span>
                      </div>
                      <div className="cost-item-actions">
                        <span className="cost-item-amount">−{formatMoney(Number(cost.amount))}</span>
                        <form action={deleteCostAction.bind(null, job.id, cost.id)}>
                          <button type="submit" className="icon-btn">
                            ✕
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="panel workspace-section-card sticky-card">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Margin</p>
                <h2>Job margin</h2>
              </div>
              <div className="margin-card">
                <div className="margin-row">
                  <span>Revenue</span>
                  <span>{formatMoney(margin.revenue)}</span>
                </div>
                <div className="margin-row sub">
                  <span>Materials</span>
                  <span>−{formatMoney(margin.materialsCost)}</span>
                </div>
                <div className="margin-row sub">
                  <span>Labor</span>
                  <span>−{formatMoney(margin.laborCost)}</span>
                </div>
                <div className="margin-row sub">
                  <span>Other</span>
                  <span>−{formatMoney(margin.otherCost)}</span>
                </div>
                <div className="margin-row bold">
                  <span>Profit</span>
                  <span>{formatMoney(margin.profit)}</span>
                </div>
                <div className={`margin-badge ${marginTier(margin.margin)}`}>
                  <div className="label">Margin</div>
                  <div className="value">{formatPercent(margin.margin)}</div>
                </div>
              </div>
              <p className="margin-note">
                Revenue is the job&apos;s quoted amount. Margin updates live as you log costs.
              </p>
            </div>
          </div>
        </section>

      <details className="panel workspace-section-card workspace-details job-action-details">
            <summary className="workspace-details-summary job-action-summary">
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Invoices
                </p>
                <h2>Invoice records</h2>
              </div>
              <span className="workspace-details-copy">{invoices.length} invoice{invoices.length === 1 ? '' : 's'} tied to this job.</span>
            </summary>
            <div className="toolbar" style={{ marginBottom: '1rem' }}>
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Invoices
                </p>
                <h2>Invoice records</h2>
              </div>
              <form action={boundCreateInvoice}>
                <select name="status" defaultValue="draft" className="btn secondary" style={{ marginRight: '0.5rem' }}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                </select>
                <button type="submit" className="btn primary">
                  + New invoice
                </button>
              </form>
            </div>

            {!stripeOnboarded ? (
              <div className="payment-banner warning">
                <p>
                  <strong>Stripe isn&apos;t connected yet.</strong> Clients won&apos;t be able to pay
                  invoices you send until you finish onboarding.
                </p>
                <p>
                  <Link href="/dashboard/settings">Connect Stripe in Account settings →</Link>
                </p>
              </div>
            ) : null}

            {invoices.length === 0 ? (
              <p className="empty-state">No invoices yet.</p>
            ) : (
              <div className="cost-list workspace-list-block">
                {invoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    href={`/dashboard/jobs/${job.id}/invoices/${invoice.id}`}
                    className="cost-item"
                    style={{ display: 'flex' }}
                  >
                    <div className="cost-item-main">
                      <span className="cost-item-desc">{invoice.ref}</span>
                      <span className="cost-item-sub">
                        {INVOICE_STATUS_LABEL[invoice.status]} · {new Date(invoice.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <span className="cost-item-amount">{formatMoney(invoice.total)}</span>
                  </Link>
                ))}
              </div>
            )}
        </details>

      <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading">
              <p className="eyebrow">Client dashboard</p>
              <h2>Shareable job view</h2>
            </div>
            <p className="workspace-card-copy">
              Give the client one link for visible updates, payment requests, invoices, and job status.
            </p>
            {searchParams.clientToken ? (
              <div className="payment-banner success">
                <p><strong>New client link ready.</strong></p>
                <p><a href={`/client/jobs/${searchParams.clientToken}`} target="_blank" rel="noreferrer">/client/jobs/{searchParams.clientToken}</a></p>
              </div>
            ) : (
              <p className="job-meta">Active dashboard links: {activeClientLinkCount}</p>
            )}
            <div className="actions" style={{ marginTop: '1rem' }}>
              <form action={boundCreateClientJobLink}>
                <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Create client dashboard link</SaveButton>
              </form>
              <form action={boundRevokeClientJobLink}>
                <SaveButton className="btn secondary" pendingLabel="Revoking…" savedLabel="Revoked ✓">Revoke active links</SaveButton>
              </form>
            </div>
        </section>
    </main>
  );
}


