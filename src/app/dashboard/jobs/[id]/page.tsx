import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import AddressAutocomplete from '@/components/address-autocomplete';
import { deriveJobListBadge } from '@/lib/job-badges';
import { getJob, listCosts, computeMargin, formatJobQuoteSummary, formatJobSchedule, formatMoney, formatPercent, type Cost, type Job } from '@/lib/jobs';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
import { listPayments, type Payment, type PaymentStatus } from '@/lib/payments';
import { listInvoices, selectPrimaryInvoice, type Invoice, type InvoiceStatus } from '@/lib/invoices';
import { createLinkedFeedItems, getActiveClientAccessCount, listJobFeed, sortJobFeed, type JobFeedEvent } from '@/lib/job-feed';
import { listCrew, listCrewIdsForJob } from '@/lib/crew';
import { getLeadByConvertedJob } from '@/lib/leads';
import { formatPhoneDashes } from '@/lib/phone';
import {
  createClientJobLinkAction,
  createCostAction,
  deleteCostAction,
  deleteJobAction,
  markJobCompleteAction,
  sendClientScheduleOptionsAction,
  undoJobCompleteAction,
  updateJobAction,
  updateJobCrewAction,
} from '../actions';
import { createDepositRequestAction, refundPaymentAction, markPaymentFailedAction, retryPaymentAction, retryPaymentTextAction, cancelPaymentRequestAction } from '../payments-actions';
import { cancelInvoiceAction } from '../invoices-actions';
import DeleteJobButton from './DeleteJobButton';
import PaymentActionButtons from './PaymentActionButtons';
import ConfirmActionButton from './ConfirmActionButton';
import JobExpenseFields from '@/components/job-expense-fields';
import SaveButton from '@/components/save-button';
import QuickFillButtons from '@/components/quick-fill-buttons';
import ScheduledDatePicker from '@/components/scheduled-date-picker';
import TimeSlotSelect from '@/components/time-slot-select';
import AddExpenseModal, { CloseOnSuccess } from './AddExpenseModal';

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  requested: 'Awaiting payment',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  disputed: 'Disputed',
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
  job_completed: 'Completed',
  cost_added: 'Cost',
  payment_requested: 'Payment request',
  payment_paid: 'Payment received',
  payment_failed: 'Payment issue',
  payment_refunded: 'Refund',
  payment_disputed: 'Chargeback',
  dispute_won: 'Chargeback won',
  dispute_lost: 'Chargeback lost',
  invoice_created: 'Invoice',
  invoice_signoff_link: 'Client sign-off',
  invoice_sent: 'Invoice sent',
  invoice_signed: 'Invoice signed',
  invoice_paid: 'Invoice paid',
  payment_cancelled: 'Payment cancelled',
  invoice_voided: 'Invoice cancelled',
  client_link_created: 'Client link',
  client_link_revoked: 'Client link',
};

const FEED_KIND_ICON: Record<string, string> = {
  job_created: '+',
  job_update: 'i',
  job_scheduled: 'S',
  job_completed: '✓',
  cost_added: '$',
  payment_requested: '$',
  payment_paid: '✓',
  payment_failed: '!',
  payment_refunded: '↩',
  payment_disputed: '⚠',
  dispute_won: '✓',
  dispute_lost: '⚠',
  invoice_created: 'I',
  invoice_signoff_link: '✓',
  invoice_sent: 'I',
  invoice_signed: '✓',
  invoice_paid: '✓',
  payment_cancelled: '×',
  invoice_voided: '×',
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

function getFeedDisplayTitle(event: JobFeedEvent): string {
  if (event.kind === 'job_created') return 'Quote shared';
  if (event.kind === 'client_link_created') return 'Client view link created';
  if (event.kind === 'client_link_revoked') return 'Client view links revoked';
  return event.title || event.kind;
}

function getFeedDisplayBody(event: JobFeedEvent): string | null {
  if (event.kind === 'client_link_created') return 'A client view link was created for this job.';
  if (event.kind === 'client_link_revoked') return 'Active client view links for this job were revoked.';
  return event.body;
}

type PipelineChecklistItem = {
  label: string;
  detail: string;
  complete: boolean;
  href: string;
};

function buildPipelineChecklist(job: Job, payments: Payment[], invoices: Invoice[], activeClientLinkCount: number, originatingLeadId: string | null): PipelineChecklistItem[] {
  const hasPaymentRequest = payments.some((payment) => payment.status === 'requested' || payment.status === 'processing' || payment.status === 'paid');
  const paidTotal = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount), 0);
  const hasSignedInvoice = invoices.some((invoice) => invoice.status === 'signed' || invoice.status === 'paid');
  const hasPaidInvoice = invoices.some((invoice) => invoice.status === 'paid');
  const isComplete = job.status === 'complete' || job.status === 'archived';
  const quoteAccepted = job.status === 'in_progress' || isComplete || Boolean(job.scheduled_for) || hasPaymentRequest || invoices.length > 0;
  const quoteDetail = job.quoted_amount > 0 ? `${formatMoney(job.quoted_amount)} quoted` : 'Add quote amount';
  const feedDetail = activeClientLinkCount > 0 ? 'Job Feed shared' : 'Share Job Feed link';

  return [
    {
      label: 'Quote shared',
      detail: `${quoteDetail} · ${feedDetail}`,
      complete: job.quoted_amount > 0 && activeClientLinkCount > 0,
      href: originatingLeadId ? `/dashboard/leads/${originatingLeadId}` : `/dashboard/jobs/${job.id}#job-feed`,
    },
    {
      label: 'Quote accepted',
      detail: quoteAccepted ? 'Approved for work' : 'Awaiting client approval',
      complete: quoteAccepted,
      href: `/dashboard/jobs/${job.id}?edit=client#job-details`,
    },
    {
      label: 'Scheduled / underway',
      detail: job.scheduled_for ? formatJobSchedule(job.scheduled_for, job.scheduled_time) : 'Schedule the work',
      complete: Boolean(job.scheduled_for) || job.status === 'in_progress' || isComplete,
      href: `/dashboard/jobs/${job.id}?open=scheduling#job-scheduling`,
    },
    {
      label: 'Invoice / payment requested',
      detail: hasPaymentRequest ? `${payments.length} payment link${payments.length === 1 ? '' : 's'} created` : 'Send invoice or payment link',
      complete: hasPaymentRequest,
      href: `/dashboard/jobs/${job.id}?open=payment#request-payment`,
    },
    {
      label: 'Paid / signed off',
      detail: paidTotal > 0 ? `${formatMoney(paidTotal)} paid` : hasSignedInvoice ? 'Client signed invoice' : 'Awaiting payment or sign-off',
      complete: paidTotal > 0 || hasPaidInvoice || hasSignedInvoice || isComplete,
      href: `/dashboard/jobs/${job.id}?open=payment#request-payment`,
    },
  ];
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
  const jobInvoice = selectPrimaryInvoice(invoices);
  const invoicePaidTotal = jobInvoice
    ? payments.filter((payment) => payment.invoice_id === jobInvoice.id && payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount), 0)
    : 0;
  const invoiceDisplayTotal = jobInvoice ? Math.max(Number(jobInvoice.total), Number(job.quoted_amount)) : Number(job.quoted_amount);
  const invoiceBalance = jobInvoice ? Math.max(0, invoiceDisplayTotal - invoicePaidTotal) : null;
  const jobPhotoUrls = await createJobPhotoUrls(accountId, job.photo_paths || []);
  const jobPhotos = (job.photo_paths || []).map((path, index) => ({ path, url: jobPhotoUrls[index] })).filter((photo) => photo.url);
  const { data: accountRow } = await supabase
    .from('accounts')
    .select('connect_onboarded')
    .eq('id', accountId)
    .maybeSingle();
  const stripeOnboarded = accountRow?.connect_onboarded ?? false;
  const originatingLead = await getLeadByConvertedJob(supabase, accountId, job.id);

  const boundUpdateJob = updateJobAction.bind(null, job.id);
  const boundUpdateJobCrew = updateJobCrewAction.bind(null, job.id);
  const boundDeleteJob = deleteJobAction.bind(null, job.id);
  const boundCreateCost = createCostAction.bind(null, job.id);
  const boundCreateDepositRequest = createDepositRequestAction.bind(null, job.id);
  const boundMarkJobComplete = markJobCompleteAction.bind(null, job.id);
  const boundSendScheduleOptions = sendClientScheduleOptionsAction.bind(null, job.id);
  const boundCreateClientJobLink = createClientJobLinkAction.bind(null, job.id);
  const boundRefundPayment = refundPaymentAction.bind(null, job.id);
  const boundMarkPaymentFailed = markPaymentFailedAction.bind(null, job.id);
  const boundRetryPaymentText = retryPaymentTextAction.bind(null, job.id);
  const linkedFeedItems = createLinkedFeedItems(feed, payments, invoices, accountId, job.id);
  const hasActiveClientView = activeClientLinkCount > 0 || Boolean(searchParams.clientToken);
  const clientViewHref = searchParams.clientToken ? `/client/jobs/${searchParams.clientToken}` : null;
  const pipelineChecklist = buildPipelineChecklist(job, payments, invoices, activeClientLinkCount, originatingLead?.id ?? null);
  const heroStatus = deriveJobListBadge(job, payments, invoices, activeClientLinkCount);
  const nextPipelineIndex = pipelineChecklist.findIndex((item) => !item.complete);
  const currentPipelineIndex = nextPipelineIndex === -1 ? pipelineChecklist.length - 1 : nextPipelineIndex;
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
  ]).filter((event) => event.visibility !== 'internal');

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
            <span className={`status-badge status-${heroStatus.tone}`} title={heroStatus.title}>{heroStatus.label}</span>
            <span className="workspace-inline-note">{job.address || 'No address on file yet'}</span>
          </div>
          {job.client_phone || job.client_email ? (
            <div className="job-hero-contact">
              {job.client_phone ? (
                <a href={`tel:${job.client_phone}`} className="hero-phone-link" aria-label={`Call ${job.client_phone}`}>
                  <span aria-hidden="true">📞</span> {formatPhoneDashes(job.client_phone)}
                </a>
              ) : null}
              {job.client_email ? (
                <a href={`mailto:${job.client_email}`} className="hero-email-link" aria-label={`Email ${job.client_email}`}>
                  <span aria-hidden="true">📧</span> {job.client_email}
                </a>
              ) : null}
            </div>
          ) : null}
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
            {job.scheduled_for ? (
              <span>
                <strong>
                  <Link href={`/dashboard/jobs/${job.id}?edit=client#job-details`}>
                    {formatJobSchedule(job.scheduled_for, job.scheduled_time)}
                  </Link>
                </strong>{' '}
                Date(s) of Service
              </span>
            ) : null}
          </div>
          <div className="actions workspace-actions">
            <Link href={`/dashboard/jobs/${job.id}?open=payment#request-payment`} className="btn primary">Request payment</Link>
            <AddExpenseModal triggerClassName="btn secondary" triggerLabel="Add expense" title="Add expense" defaultOpen={searchParams.open === 'costs'}>
              <form action={boundCreateCost} className="cost-form">
                <JobExpenseFields crew={crew} />
                <div style={{ marginTop: '0.8rem' }}>
                  <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                </div>
                <CloseOnSuccess />
              </form>
            </AddExpenseModal>
            {job.status !== 'complete' && job.status !== 'archived' ? (
              <form action={boundMarkJobComplete}>
                <SaveButton className="btn secondary" pendingLabel="Completing…" savedLabel="Completed ✓">Mark complete</SaveButton>
              </form>
            ) : null}
          </div>
        </div>

        <aside className="pipeline-checklist" aria-label="Client pipeline checklist">
          <ol>
            {pipelineChecklist.map((item, index) => {
              const state = item.complete ? 'complete' : index === currentPipelineIndex ? 'current' : 'upcoming';
              return (
                <li key={item.label}>
                  <Link className={`pipeline-step pipeline-step-${state}`} href={item.href}>
                    <span className="pipeline-step-marker">{item.complete ? '✓' : ''}</span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </aside>

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
                {displayedFeed.map((event) => {
                  const linkedPayment = event.source_table === 'payments' ? payments.find((payment) => payment.id === event.source_id) : undefined;
                  const linkedInvoice = event.source_table === 'invoices' ? invoices.find((invoice) => invoice.id === event.source_id) : undefined;
                  const canCancelPayment = event.kind === 'payment_requested' && linkedPayment?.status === 'requested';
                  const canCancelInvoice =
                    (event.kind === 'invoice_created' || event.kind === 'invoice_sent' || event.kind === 'invoice_signoff_link') &&
                    (linkedInvoice?.status === 'draft' || linkedInvoice?.status === 'sent');

                  return (
                    <article className={`job-feed-item feed-kind-${event.kind}`} key={event.id}>
                      <div className="job-feed-dot">{FEED_KIND_ICON[event.kind] ?? '•'}</div>
                      <div className="job-feed-content">
                        <div className="job-row-header">
                          <span className="cost-item-desc">{getFeedDisplayTitle(event)}</span>
                          <div className="feed-badge-row">
                            {event.kind === 'job_created' && originatingLead ? (
                              <Link className="feed-undo-btn" href={`/dashboard/leads/${originatingLead.id}`}>
                                Undo
                              </Link>
                            ) : null}
                            {event.kind === 'job_completed' && job.status === 'complete' ? (
                              <form action={undoJobCompleteAction.bind(null, job.id, event.id)}>
                                <SaveButton className="feed-undo-btn" pendingLabel="Undoing…" savedLabel="Undone ✓">Undo</SaveButton>
                              </form>
                            ) : null}
                            {canCancelPayment && linkedPayment ? (
                              <ConfirmActionButton
                                action={cancelPaymentRequestAction.bind(null, job.id, linkedPayment.id)}
                                confirmMessage="Cancel this payment request? The payment link will stop working."
                                pendingLabel="Cancelling…"
                                savedLabel="Cancelled ✓"
                              >
                                Cancel
                              </ConfirmActionButton>
                            ) : null}
                            {canCancelInvoice && linkedInvoice ? (
                              <ConfirmActionButton
                                action={cancelInvoiceAction.bind(null, job.id, linkedInvoice.id)}
                                confirmMessage={`Cancel invoice ${linkedInvoice.ref}? This voids it so it can no longer be paid or signed.`}
                                pendingLabel="Cancelling…"
                                savedLabel="Cancelled ✓"
                              >
                                Cancel
                              </ConfirmActionButton>
                            ) : null}
                            <span className="status-badge status-new_lead">{FEED_KIND_LABEL[event.kind] ?? 'Update'}</span>
                            <span className={`status-badge ${event.visibility === 'internal' ? 'status-archived' : 'status-complete'}`}>
                              {FEED_VISIBILITY_LABEL[event.visibility]}
                            </span>
                          </div>
                        </div>
                        {getFeedDisplayBody(event) ? <p className="workspace-card-copy">{getFeedDisplayBody(event)}</p> : null}
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
                  );
                })}
              </div>
            )}
            <div className="job-feed-share-strip">
              <div>
                <strong>{hasActiveClientView ? 'Client view shared' : 'Client view not shared'}</strong>
                <p>{hasActiveClientView ? 'The quote, payment links, invoices, and job updates live in one client feed.' : 'Create a client view link before sending job updates or payment links.'}</p>
                {hasActiveClientView ? (
                  <span>Shared client access is active</span>
                ) : (
                  <span>No active client view link</span>
                )}
              </div>
              <div className="job-feed-share-actions">
                {clientViewHref ? (
                  <a className="btn secondary" href={clientViewHref} target="_blank" rel="noreferrer">Client View</a>
                ) : hasActiveClientView ? (
                  <form action={boundCreateClientJobLink}>
                    <SaveButton className="btn secondary" pendingLabel="Creating…" savedLabel="Created ✓">Client View</SaveButton>
                  </form>
                ) : (
                  <form action={boundCreateClientJobLink}>
                    <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Create client view link</SaveButton>
                  </form>
                )}
              </div>
            </div>

      </section>

      <details id="request-payment" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'payment'}>
          <summary className="workspace-details-summary job-action-summary">
            <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Invoice &amp; payment</p>
            <h2>Send an invoice or payment link to {job.client_name}</h2>
            </div>
            <span className="workspace-details-copy">Payment links are tied to this job&apos;s invoice.</span>
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
            <div className="toolbar" style={{ marginBottom: '1rem' }}>
              <div className="section-heading workspace-section-heading compact-heading">
                <p className="eyebrow" style={{ margin: 0 }}>
                  Invoice
                </p>
                <h2>Job invoice</h2>
              </div>
              {jobInvoice ? (
                <Link href={`/dashboard/jobs/${job.id}/invoices/${jobInvoice.id}`} className="btn secondary">Open invoice</Link>
              ) : (
                <span className="workspace-details-copy">Created automatically when you send a payment link.</span>
              )}
            </div>

            {invoices.length === 0 ? (
              <p className="empty-state">No invoice yet. Sending a payment link will create the job invoice automatically.</p>
            ) : (
              <div className="cost-list workspace-list-block">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="cost-item">
                    <Link href={`/dashboard/jobs/${job.id}/invoices/${invoice.id}`} className="cost-item-main">
                      <span className="cost-item-desc">{invoice.ref}</span>
                      <span className="cost-item-sub">
                        {INVOICE_STATUS_LABEL[invoice.status]} · {new Date(invoice.created_at).toLocaleDateString()}
                      </span>
                    </Link>
                    <div className="cost-item-actions">
                      <span className="cost-item-amount">{formatMoney(invoice.total)}</span>
                      {invoice.status === 'draft' || invoice.status === 'sent' ? (
                        <ConfirmActionButton
                          action={cancelInvoiceAction.bind(null, job.id, invoice.id)}
                          confirmMessage={`Cancel invoice ${invoice.ref}? This voids it so it can no longer be paid or signed.`}
                          className="btn secondary compact"
                          pendingLabel="Cancelling…"
                          savedLabel="Cancelled ✓"
                        >
                          Cancel
                        </ConfirmActionButton>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form action={boundCreateDepositRequest} className="cost-form workspace-form-block">
              <div className="invoice-context-pill">
                <span>Job invoice</span>
                <strong>{jobInvoice ? `${jobInvoice.ref} · Balance ${formatMoney(invoiceBalance ?? 0)}` : 'Draft invoice will be created automatically'}</strong>
              </div>
              <div className="cost-form-row">
                <div className="field">
                  <label htmlFor="pay-kind">Payment type</label>
                  <select id="pay-kind" name="kind" defaultValue="deposit">
                    <option value="deposit">Deposit request</option>
                    <option value="stage">Progress payment</option>
                    <option value="final">Final balance</option>
                    <option value="plan_installment">Custom payment</option>
                  </select>
                  <QuickFillButtons
                    label="Quick add:"
                    targetId="pay-kind"
                    values={[
                      { label: 'Deposit', value: 'deposit' },
                      { label: 'Progress', value: 'stage' },
                      { label: 'Final balance', value: 'final' },
                      { label: 'Custom', value: 'plan_installment' },
                    ]}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pay-amount">Amount ($)</label>
                  <input id="pay-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="2500" />
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
                <SaveButton pendingLabel="Creating…" savedLabel="Created ✓">Send invoice/payment link</SaveButton>
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
                        onCancel={cancelPaymentRequestAction}
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
              <div className="field">
                <label htmlFor="clientEmail">Client email</label>
                <input id="clientEmail" name="clientEmail" type="email" defaultValue={job.client_email ?? ''} placeholder="client@example.com" />
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
                <label className="sms-consent-check">
                  <input name="clientFeedAccess" type="checkbox" defaultChecked={hasActiveClientView} />
                  <span>Client has access to the Job Feed</span>
                </label>
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
                uploadLabel="+ Add job photos"
                helperText="The first photo is the default image. Drag photos to reorder them."
                coverMode
                reorderEnabled
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

      <details id="job-scheduling" className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'scheduling'}>
        <summary className="workspace-details-summary job-action-summary">
          <div className="section-heading workspace-section-heading compact-heading">
            <p className="eyebrow">Client scheduling</p>
            <h2>Send 3 Start Dates</h2>
          </div>
          <span className="workspace-details-copy">Text the client three dates that work for your crew.</span>
        </summary>
        <p className="workspace-card-copy">They can choose one or request different times with a note.</p>
        <form action={boundSendScheduleOptions} className="form-grid">
          <div className="field full">
            <label htmlFor="scheduleClientPhone">Client mobile</label>
            <input id="scheduleClientPhone" name="scheduleClientPhone" type="tel" defaultValue={job.client_phone ?? ''} placeholder="(248) 555-0117" />
          </div>
          {[1, 2, 3].map((optionNumber) => (
            <div className="schedule-option-grid field full" key={optionNumber}>
              <div>
                <label htmlFor={`scheduleDate${optionNumber}`}>Option {optionNumber} date</label>
                <ScheduledDatePicker id={`scheduleDate${optionNumber}`} name={`scheduleDate${optionNumber}`} />
              </div>
              <div>
                <label htmlFor={`scheduleTime${optionNumber}`}>Option {optionNumber} time</label>
                <TimeSlotSelect id={`scheduleTime${optionNumber}`} name={`scheduleTime${optionNumber}`} />
              </div>
            </div>
          ))}
          <div className="field full">
            <label className="sms-consent-check">
              <input name="scheduleSmsConsent" type="checkbox" required />
              <span>The client agreed to receive transactional scheduling texts. Message and data rates may apply. Reply STOP to opt out.</span>
            </label>
          </div>
          <div className="field full">
            <SaveButton pendingLabel="Sending..." savedLabel="Sent">Text 3 start dates</SaveButton>
          </div>
        </form>
      </details>

      <section id="job-costs" className="detail-grid workspace-grid-gap">
          <div>
            <details className="panel workspace-section-card workspace-details job-action-details" open={searchParams.open === 'costs'}>
              <summary className="workspace-details-summary job-action-summary">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">Expenses</p>
                  <h2>Job expenses</h2>
                </div>
                <span className="workspace-details-copy">Log materials, labor, subcontractors, receipts, and other costs.</span>
              </summary>

              <div className="cost-add-row" style={{ marginBottom: '0.9rem' }}>
                <AddExpenseModal triggerClassName="btn secondary" triggerLabel="+ Add expense" title="Add expense">
                  <form action={boundCreateCost} className="cost-form">
                    <JobExpenseFields crew={crew} />
                    <div style={{ marginTop: '0.8rem' }}>
                      <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">+ Add expense</SaveButton>
                    </div>
                    <CloseOnSuccess />
                  </form>
                </AddExpenseModal>
              </div>

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
            </details>
          </div>

          <div>
            <details className="panel workspace-section-card workspace-details job-action-details sticky-card">
              <summary className="workspace-details-summary job-action-summary">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">Profitability</p>
                  <h2>ROI</h2>
                </div>
                <span className="workspace-details-copy">Track profit against the quoted job amount as costs come in.</span>
              </summary>
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
                  <div className="label">ROI</div>
                  <div className="value">{formatPercent(margin.margin)}</div>
                </div>
              </div>
              <p className="margin-note">
                Revenue is the job&apos;s quoted amount. ROI updates live as you log costs.
              </p>
            </details>
          </div>
        </section>

    </main>
  );
}


