import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { getClientJobDashboard } from '@/lib/job-feed';
import { formatMoney } from '@/lib/jobs';
import { formatScheduleOption } from '@/lib/scheduling';
import { approveClientJobQuoteAction, requestDifferentClientJobScheduleOptionsAction, selectClientJobScheduleOptionAction, startSubscriptionAction, authorizePaymentPlanAction, payPlanBalanceAction } from './actions';
import QuoteDocument from './QuoteDocument';

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

  // Plan-linked payments (deposit / installments / payoff) are surfaced in the
  // Payment Plan card below, not the generic "Payment requests" list.
  const openPayments = dashboard.payments.filter(
    (payment) => (payment.status === 'requested' || payment.status === 'processing') && !payment.payment_plan_id,
  );
  const depositPayment = openPayments.find((payment) => payment.kind === 'deposit');
  const plan = dashboard.paymentPlan;
  const PLAN_INST_STATUS: Record<string, string> = { paid: 'Paid', processing: 'Processing', requested: 'Scheduled', failed: 'Payment failed — retrying', refunded: 'Refunded' };
  const formatPlanDay = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const pendingSubscriptions = dashboard.job.quote_items.filter((item) => item.kind === 'subscription' && !item.signedUp);
  const FREQ_LABEL: Record<string, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };
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

      {plan ? (
        <section className={`panel workspace-section-card client-attention-card${plan.status === 'paid_off' ? ' success' : ''}`}>
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Payment plan</p>
            <h2>
              {plan.status === 'paid_off' ? 'Paid in full' : plan.status === 'active' ? 'Your payment plan' : 'Set up your payment plan'}
            </h2>
          </div>

          <div className="client-plan-stats">
            <div><span>Original total</span><strong>{formatMoney(plan.totalCents / 100)}</strong></div>
            <div><span>Paid so far</span><strong>{formatMoney(plan.paidCents / 100)}</strong></div>
            <div><span>Remaining balance</span><strong>{formatMoney(plan.remainingCents / 100)}</strong></div>
          </div>

          {plan.status === 'pending_deposit' ? (
            <>
              <p className="workspace-card-copy">
                You pay a {formatMoney(plan.depositCents / 100)} deposit now, then {plan.schedule.length} installment{plan.schedule.length === 1 ? '' : 's'}. 0% interest,
                no fees — this splits the same total, nothing more.
              </p>
              <div className="client-plan-schedule">
                <div className="client-plan-row"><span>Deposit (today)</span><strong>{formatMoney(plan.depositCents / 100)}</strong></div>
                {plan.schedule.map((entry) => (
                  <div className="client-plan-row" key={entry.seq}>
                    <span>Installment {entry.seq} · {entry.label}</span>
                    <strong>{formatMoney(entry.amount)}</strong>
                  </div>
                ))}
              </div>
              {plan.authorized ? (
                plan.deposit ? (
                  <Link href={`/pay/${plan.deposit.paymentId}`} className="btn primary client-plan-cta">Pay {formatMoney(plan.deposit.amount)} deposit</Link>
                ) : null
              ) : (
                <form action={authorizePaymentPlanAction.bind(null, params.token)} className="client-plan-authorize">
                  <input type="hidden" name="planId" value={plan.id} />
                  <label htmlFor="plan-signer">Type your full name to authorize automatic installment payments</label>
                  <input id="plan-signer" name="signerName" type="text" placeholder="Your full name" autoComplete="name" required />
                  <p className="client-plan-fineprint">
                    By typing your name you authorize {dashboard.businessName} to charge your saved card for each installment shown above on its
                    due date. You can pay the remaining balance in full at any time with no penalty.
                  </p>
                  <SaveButton pendingLabel="Starting...">Authorize &amp; pay {formatMoney(plan.depositCents / 100)} deposit</SaveButton>
                </form>
              )}
            </>
          ) : plan.status === 'active' ? (
            <>
              {plan.nextInstallment ? (
                <p className="workspace-card-copy">
                  Next payment: <strong>{formatMoney(plan.nextInstallment.amount)}</strong> on {formatPlanDay(plan.nextInstallment.dueDate)}
                  {plan.card ? ` · ${plan.card.brand ?? 'card'} ••${plan.card.last4}` : ''}.
                </p>
              ) : (
                <p className="workspace-card-copy">Every installment is settled.</p>
              )}
              <div className="client-plan-schedule">
                {plan.deposit ? (
                  <div className="client-plan-row">
                    <span>Deposit</span>
                    <span className="client-plan-status">{PLAN_INST_STATUS[plan.deposit.status] ?? plan.deposit.status}</span>
                    <strong>{formatMoney(plan.deposit.amount)}</strong>
                  </div>
                ) : null}
                {plan.installments.map((inst) => (
                  <div className={`client-plan-row${inst.status === 'failed' ? ' is-failed' : ''}`} key={inst.id}>
                    <span>Installment {inst.seq} · {formatPlanDay(inst.dueDate)}</span>
                    <span className="client-plan-status">{PLAN_INST_STATUS[inst.status] ?? inst.status}</span>
                    <strong>{formatMoney(inst.amount)}</strong>
                  </div>
                ))}
              </div>
              {plan.remainingCents > 0 ? (
                plan.payoffInFlight ? (
                  <p className="client-plan-fineprint">A payoff payment is being processed…</p>
                ) : (
                  <form action={payPlanBalanceAction.bind(null, params.token)} className="client-plan-payoff">
                    <input type="hidden" name="planId" value={plan.id} />
                    <SaveButton className="btn secondary" pendingLabel="Starting...">Pay remaining balance · {formatMoney(plan.remainingCents / 100)}</SaveButton>
                  </form>
                )
              ) : null}
            </>
          ) : (
            <p className="workspace-card-copy">This plan is paid in full — thank you! No further payments will be charged.</p>
          )}
        </section>
      ) : null}

      {plan?.status === 'pending_deposit' ? null : dashboard.scheduleRequest?.status === 'open' && dashboard.depositBlocksScheduling ? (
        <section className="panel workspace-section-card client-attention-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">One step first</p>
            <h2>Pay your deposit to unlock scheduling</h2>
          </div>
          <p className="workspace-card-copy">Your contractor requires a deposit before you can choose a start date. Once it&apos;s paid, your scheduling options appear here.</p>
          {depositPayment ? (
            <div className="cost-list">
              <Link href={`/pay/${depositPayment.id}`} className="cost-item client-attention-link">
                <div className="cost-item-main">
                  <span className="cost-item-desc">{depositPayment.label || 'Deposit'}</span>
                  <span className="cost-item-sub">Required before scheduling</span>
                </div>
                <span className="client-attention-pay-block">
                  <span className="cost-item-amount">{formatMoney(Number(depositPayment.amount))}</span>
                  <span className="client-attention-action">Pay deposit</span>
                </span>
              </Link>
            </div>
          ) : null}
        </section>
      ) : dashboard.scheduleRequest?.status === 'open' ? (
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

      {!dashboard.quoteApproved && dashboard.scheduleRequest?.status !== 'open' ? (
        <section className="panel workspace-section-card client-attention-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Ready to move forward?</p>
            <h2>Approve your quote</h2>
          </div>
          <p className="workspace-card-copy">Review the details below. When you&apos;re ready, approve the quote and your contractor will get started.</p>
          {dashboard.job.quote_items.length > 0 ? (
            <QuoteDocument items={dashboard.job.quote_items} approveAction={approveClientJobQuoteAction.bind(null, params.token)} />
          ) : (
            <form action={approveClientJobQuoteAction.bind(null, params.token)}>
              <SaveButton pendingLabel="Approving..." savedLabel="Approved ✓">Approve quote</SaveButton>
            </form>
          )}
        </section>
      ) : null}

      {dashboard.feed.some((event) => event.kind === 'quote_approved') ? (
        <section className="panel workspace-section-card client-attention-card success">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Quote approved</p>
            <h2>You&apos;re all set</h2>
          </div>
          <p className="workspace-card-copy">Thanks! Your contractor has been notified and will be in touch about next steps.</p>
        </section>
      ) : null}

      {dashboard.quoteApproved && pendingSubscriptions.length > 0 ? (
        <section className="panel workspace-section-card client-attention-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Set up your plan</p>
            <h2>Choose how to pay for your {pendingSubscriptions.length === 1 ? 'plan' : 'plans'}</h2>
          </div>
          <p className="workspace-card-copy">You approved a recurring plan. Pick how you&apos;d like to pay — it only takes a moment.</p>
          <div className="cost-list">
            {pendingSubscriptions.map((item) => {
              const term = item.termCycles && item.termCycles > 0 ? item.termCycles : 0;
              const discount = item.prepayDiscountPercent ?? 0;
              const prepaidTotal = term > 0 ? Math.round(item.amount * term * (1 - discount / 100) * 100) / 100 : 0;
              const freq = FREQ_LABEL[item.frequency ?? 'monthly'];
              return (
                <div className="cost-item client-sub-signup" key={item.id}>
                  <div className="cost-item-main">
                    <span className="cost-item-desc">{item.label}</span>
                    <span className="cost-item-sub">{formatMoney(item.amount)}{freq}{term > 0 ? ` · ${term} payments` : ''}</span>
                  </div>
                  <div className="client-sub-signup-actions">
                    <form action={startSubscriptionAction.bind(null, params.token)}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="mode" value="cycle" />
                      <SaveButton className="btn secondary" pendingLabel="Starting...">Pay {formatMoney(item.amount)}{freq}</SaveButton>
                    </form>
                    {term > 0 ? (
                      <form action={startSubscriptionAction.bind(null, params.token)}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <input type="hidden" name="mode" value="prepay" />
                        <SaveButton className="btn primary" pendingLabel="Starting...">Pay {formatMoney(prepaidTotal)} up front{discount > 0 ? ` · save ${discount}%` : ''}</SaveButton>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
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

      {dashboard.tasks.length > 0 ? (() => {
        const doneCount = dashboard.tasks.filter((task) => task.done).length;
        const pct = Math.round((doneCount / dashboard.tasks.length) * 100);
        return (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Progress</p>
              <h2>Work checklist · {doneCount}/{dashboard.tasks.length} done</h2>
            </div>
            <div className="task-progress" aria-hidden="true"><div className="task-progress-fill" style={{ width: `${pct}%` }} /></div>
            <ul className="client-task-list">
              {dashboard.tasks.map((task, index) => (
                <li key={index} className={`client-task${task.done ? ' is-done' : ''}`}>
                  <span className="client-task-check" aria-hidden="true">{task.done ? '✓' : '○'}</span>
                  <span>{task.title}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })() : null}

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