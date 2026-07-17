import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import PhotoGallery from '@/components/photo-gallery';
import AddressAutocomplete from '@/components/address-autocomplete';
import { getJob, listCosts, computeMargin, formatMoney, formatPercent, type Cost } from '@/lib/jobs';
import { createJobPhotoUrls } from '@/lib/job-photo-storage';
import { listPayments, type PaymentStatus } from '@/lib/payments';
import { listInvoices, type InvoiceStatus } from '@/lib/invoices';
import { listCrew, listCrewIdsForJob } from '@/lib/crew';
import { createCostAction, deleteCostAction, deleteJobAction, updateJobAction, updateJobCrewAction } from '../actions';
import { createDepositRequestAction, refundPaymentAction, markPaymentFailedAction, retryPaymentAction, retryPaymentTextAction } from '../payments-actions';
import { createInvoiceAction } from '../invoices-actions';
import DeleteJobButton from './DeleteJobButton';
import PaymentActionButtons from './PaymentActionButtons';
import SaveButton from '@/components/save-button';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New lead',
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

function marginTier(margin: number): 'margin-good' | 'margin-ok' | 'margin-bad' {
  if (margin >= 0.35) return 'margin-good';
  if (margin >= 0.2) return 'margin-ok';
  return 'margin-bad';
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
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
  const tab =
    searchParams.tab === 'costs'
      ? 'costs'
      : searchParams.tab === 'payments'
        ? 'payments'
        : searchParams.tab === 'invoices'
          ? 'invoices'
          : 'overview';

  const boundUpdateJob = updateJobAction.bind(null, job.id);
  const boundUpdateJobCrew = updateJobCrewAction.bind(null, job.id);
  const boundDeleteJob = deleteJobAction.bind(null, job.id);
  const boundCreateCost = createCostAction.bind(null, job.id);
  const boundCreateDepositRequest = createDepositRequestAction.bind(null, job.id);
  const boundCreateInvoice = createInvoiceAction.bind(null, job.id);
  const boundRefundPayment = refundPaymentAction.bind(null, job.id);
  const boundMarkPaymentFailed = markPaymentFailedAction.bind(null, job.id);
  const boundRetryPaymentText = retryPaymentTextAction.bind(null, job.id);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="job-ref">{job.ref}</p>
          <h1 className="workspace-title">{job.client_name}</h1>
          <div className="workspace-inline-row">
            <span className={`status-badge status-${job.status}`}>{STATUS_LABEL[job.status]}</span>
            <span className="workspace-inline-note">{job.address || 'No address on file yet'}</span>
          </div>
          <div className="actions workspace-actions">
            <Link href="/dashboard/jobs" className="btn secondary">
              Back to jobs
            </Link>
          </div>
        </div>

        <div className="workspace-metric-grid compact">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Quoted amount</span>
            <strong className="workspace-metric-value">{formatMoney(job.quoted_amount)}</strong>
            <p className="workspace-metric-note">Current revenue basis used for live margin tracking.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Margin</span>
            <strong className="workspace-metric-value">{formatPercent(margin.margin)}</strong>
            <p className="workspace-metric-note">Profit currently at {formatMoney(margin.profit)}.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Payments / invoices</span>
            <strong className="workspace-metric-value">{payments.length} / {invoices.length}</strong>
            <p className="workspace-metric-note">Requests and invoices tied to this job.</p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="tabs">
          <Link href={`/dashboard/jobs/${job.id}?tab=overview`} className={`tab${tab === 'overview' ? ' active' : ''}`}>
            Overview
          </Link>
          <Link href={`/dashboard/jobs/${job.id}?tab=costs`} className={`tab${tab === 'costs' ? ' active' : ''}`}>
            📊 Costs &amp; Margin
          </Link>
          <Link href={`/dashboard/jobs/${job.id}?tab=payments`} className={`tab${tab === 'payments' ? ' active' : ''}`}>
            💳 Payments
          </Link>
          <Link href={`/dashboard/jobs/${job.id}?tab=invoices`} className={`tab${tab === 'invoices' ? ' active' : ''}`}>
            🧾 Invoices
          </Link>
        </div>
      </section>

      {tab === 'overview' ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Overview</p>
            <h2>Job details</h2>
          </div>
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
                <label htmlFor="scope">Scope</label>
                <textarea id="scope" name="scope" defaultValue={job.scope ?? ''} />
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={job.status}>
                  <option value="new_lead">New lead</option>
                  <option value="in_progress">In progress</option>
                  <option value="complete">Complete</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="scheduledFor">Scheduled for</label>
                <input id="scheduledFor" name="scheduledFor" type="date" defaultValue={job.scheduled_for ?? ''} />
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
        </section>
      ) : tab === 'costs' ? (
        <section className="detail-grid workspace-grid-gap">
          <div>
            <div className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading">
                <p className="eyebrow">Costs</p>
                <h2>Cost line items</h2>
              </div>

              <form action={boundCreateCost} className="cost-form">
                <div className="field">
                  <label htmlFor="description">Description</label>
                  <input
                    id="description"
                    name="description"
                    required
                    placeholder="Architectural shingles — Owens Corning Duration"
                  />
                </div>
                <div className="cost-form-row">
                  <div className="field">
                    <label htmlFor="type">Type</label>
                    <select id="type" name="type" defaultValue="material">
                      <option value="material">🧱 Material</option>
                      <option value="labor">👷 Labor</option>
                      <option value="sub">🤝 Subcontractor</option>
                      <option value="receipt">🧾 Receipt</option>
                      <option value="other">📦 Other</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="amount">Amount ($)</label>
                    <input
                      id="amount"
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Material / sub / receipt / other"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="supplier">Supplier</label>
                    <input id="supplier" name="supplier" placeholder="Optional" />
                  </div>
                </div>
                <div className="cost-form-row">
                  <div className="field">
                    <label htmlFor="hours">Hours (labor only)</label>
                    <input id="hours" name="hours" type="number" min="0" step="0.25" placeholder="32" />
                  </div>
                  <div className="field">
                    <label htmlFor="rate">Rate $/hr (labor only)</label>
                    <input id="rate" name="rate" type="number" min="0" step="0.01" placeholder="45" />
                  </div>
                  <div className="field">
                    <label htmlFor="crewId">Crew member (labor only)</label>
                    <select id="crewId" name="crewId" defaultValue="">
                      <option value="">— Unassigned —</option>
                      {crew.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: '0.8rem' }}>
                  <button type="submit" className="btn primary">
                    + Add cost
                  </button>
                </div>
              </form>

              {costs.length === 0 ? (
                <p className="empty-state">No costs logged yet.</p>
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
                            ? `${cost.hours} hrs × ${formatMoney(Number(cost.rate))}/hr`
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
      ) : tab === 'payments' ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Payments</p>
            <h2>Request a payment</h2>
          </div>
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
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pay-label">Label</label>
                  <input id="pay-label" name="label" placeholder="Deposit — 50% down" />
                </div>
                <div className="field">
                  <label htmlFor="pay-amount">Amount ($)</label>
                  <input id="pay-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="2500" />
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
                <button type="submit" className="btn primary">
                  Create payment request
                </button>
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
        </section>
      ) : (
        <section className="panel workspace-section-card">
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
        </section>
      )}
    </main>
  );
}


