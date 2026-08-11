import type { CSSProperties } from 'react';
import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { getClientJobDashboard } from '@/lib/job-feed';
// Every number on this page is one the homeowner is asked to pay, authorize, or
// add up against the total they were quoted. To the cent, all of it.
import { formatMoneyExact as formatMoney } from '@/lib/jobs';
import { clientJobStatus } from '@/lib/client-feed';
import { brandPaint } from '@/lib/contractor-brand';
import { formatScheduleOption } from '@/lib/scheduling';
import {
  approveClientJobQuoteAction,
  askQuoteQuestionAction,
  requestDifferentClientJobScheduleOptionsAction,
  selectClientJobScheduleOptionAction,
  startSubscriptionAction,
  authorizePaymentPlanAction,
  payPlanBalanceAction,
} from './actions';
import QuoteDocument from './QuoteDocument';
import ChangeOrders from './ChangeOrders';
import { createAdminClient } from '@/lib/auth';
import { loadClientChangeOrders } from '@/lib/change-orders-data';
import { toClientChangeOrders } from '@/lib/change-orders';
import { resolveJobAccess } from '@/lib/change-order-client';
import { clientInsuranceFor } from '@/lib/insurance-client';
import Warranties from './Warranties';
import { listWarranties } from '@/lib/warranties-data';
import { toClientWarranties } from '@/lib/warranties';
import Selections from './Selections';
import { loadClientSelections, toSignedClientSelections } from '@/lib/selections-data';
import { ContractorBrandBar, ContractorBrandFoot } from '@/components/contractor-brand';

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

/**
 * Who this is for, said the way a person would say it. The page used to headline
 * the customer's full name in display type — "DANA WHITFIELD" — which is how a
 * record refers to somebody, not how you greet them.
 */
function firstNameOf(fullName: string): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || 'you';
}

export default async function ClientJobDashboardPage({ params }: { params: { token: string } }) {
  const dashboard = await getClientJobDashboard(params.token);

  // Loaded from the token independently of the dashboard so an un-migrated
  // database (no change_orders table) shows the job as it always did rather
  // than blanking the whole page.
  const access = await resolveJobAccess(params.token);
  const admin = createAdminClient();
  const clientChangeOrders = access
    ? toClientChangeOrders(await loadClientChangeOrders(admin, access.accountId, access.jobId))
    : [];
  const clientWarranties = access
    ? toClientWarranties(await listWarranties(admin, access.accountId, access.jobId))
    : [];
  const clientSelections = access
    ? await toSignedClientSelections(admin, access.accountId, await loadClientSelections(admin, access.accountId, access.jobId))
    : [];

  // Proof of insurance, for the quote. Everything about whether this appears at
  // all is decided by showsToClient — in particular, an EXPIRED certificate is
  // never shown. It isn't a stale asset, it's a false assurance somebody would
  // be relying on when they approve.
  const clientInsurance = access ? await clientInsuranceFor(admin, access.accountId) : null;

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
  // Today, in the viewer's own terms. A plan can start today but never earlier —
  // a back-dated first visit would generate visits that are already overdue.
  const earliestStart = new Date().toISOString().slice(0, 10);
  const selectedScheduleOption = dashboard.scheduleRequest?.selected_index == null ? null : dashboard.scheduleRequest.options[dashboard.scheduleRequest.selected_index];

  const scheduleOpen = dashboard.scheduleRequest?.status === 'open';
  const awaitingApproval = !dashboard.quoteApproved;
  const depositDue = Boolean(depositPayment) || plan?.status === 'pending_deposit';

  /**
   * ONE STATUS, AND IT AGREES WITH THE PAGE.
   *
   * The badge read "New request" — the raw job_status enum — on a screen that
   * was at the same time asking for a $1,750 deposit. See clientJobStatus.
   */
  const status = clientJobStatus({
    quoteApproved: dashboard.quoteApproved,
    depositDue,
    paymentDue: openPayments.length > 0,
    scheduleOpen,
    scheduledLabel: dashboard.job.scheduled_for ? dashboard.job.schedule_label : null,
    jobStatus: dashboard.job.status,
  });

  /**
   * The contractor's color, on the page and not only on the bar above it.
   * Only the button's own label is a contrast decision, and brandPaint computes
   * it rather than hoping. Null for an unreadable hex, and the CSS falls back to
   * the platform palette — see the var() defaults in globals.
   */
  const paint = brandPaint(dashboard.brand.accent);
  const brandStyle = paint
    ? ({ '--cbrand': paint.accent, '--cbrand-on': paint.onAccent, '--cbrand-soft': paint.soft, '--cbrand-edge': paint.edge } as CSSProperties)
    : undefined;

  /* --- the sections, in the order somebody decides things ------------------
     Review the quote → make the choices in it → approve and sign → pick a start
     date → pay. The page used to open on "authorize automatic charges and pay a
     $1,750 deposit", above any statement of what the work was or what it cost
     line by line. Nobody should be asked for a card before they have been shown
     a quote. */

  const quoteSection = awaitingApproval ? (
    <section className="panel workspace-section-card client-quote-card" id="quote">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Your quote</p>
        <h2>Review and approve</h2>
      </div>
      {dashboard.job.quote_items.length > 0 ? (
        <QuoteDocument
          items={dashboard.job.quote_items}
          approveAction={approveClientJobQuoteAction.bind(null, params.token)}
          insurance={clientInsurance}
          businessName={dashboard.businessName}
          header={{ ref: dashboard.job.ref, address: dashboard.job.address, scope: dashboard.job.scope }}
        />
      ) : (
        <form action={approveClientJobQuoteAction.bind(null, params.token)} className="quote-document">
          {dashboard.job.scope ? <p className="quote-doc-scope">{dashboard.job.scope}</p> : null}
          <div className="quote-doc-sign">
            <label htmlFor="quote-signer">Type your full name to accept this quote</label>
            <input id="quote-signer" name="signerName" type="text" placeholder="Your full name" autoComplete="name" required />
          </div>
          <SaveButton pendingLabel="Approving..." savedLabel="Approved ✓">Approve quote</SaveButton>
        </form>
      )}

      {/* THE OTHER THING A PERSON CAN WANT TO DO. A quote whose only control is
          "Approve" leaves somebody who wants one line explained choosing between
          agreeing to something they don't understand and closing the tab. It is
          a <details> so it costs nothing until it's wanted, and a separate form
          because it cannot be nested inside the approval one. */}
      <details className="client-ask">
        <summary>Not ready to approve? Ask a question</summary>
        <form action={askQuoteQuestionAction.bind(null, params.token)} className="client-ask-form">
          <label htmlFor="quote-question">What would you like to know?</label>
          <textarea id="quote-question" name="question" rows={3} required placeholder="Does the price include hauling away the old material?" />
          <SaveButton className="btn secondary" pendingLabel="Sending..." savedLabel="Sent">Send to {dashboard.businessName}</SaveButton>
          <p className="client-ask-note">This doesn&apos;t decline the quote — it stays open while they get back to you.</p>
        </form>
      </details>
    </section>
  ) : null;

  const approvedSection = dashboard.quoteApprovedByClient ? (
    <section className="panel workspace-section-card client-attention-card success">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Quote approved</p>
        <h2>You&apos;re all set</h2>
      </div>
      <p className="workspace-card-copy">Thanks! Your contractor has been notified and will be in touch about next steps.</p>
    </section>
  ) : null;

  const scheduleSection = plan?.status === 'pending_deposit' ? null : scheduleOpen && dashboard.depositBlocksScheduling ? (
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
  ) : scheduleOpen ? (
    <section className="panel workspace-section-card client-attention-card" id="dates">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Choose your start date</p>
        <h2>{awaitingApproval ? 'Approve the quote and schedule the job' : 'Pick a start date'}</h2>
      </div>
      <p className="workspace-card-copy">Pick the start time that works best. Your contractor will see your choice immediately.</p>
      <div className="schedule-choice-grid client-schedule-choice-grid">
        {dashboard.scheduleRequest!.options.map((option, index) => (
          <form action={selectClientJobScheduleOptionAction.bind(null, params.token)} className="schedule-choice-card" key={`${option.date}-${option.time ?? 'anytime'}`}>
            <input type="hidden" name="optionIndex" value={index} />
            <span className="schedule-choice-label">Option {index + 1}</span>
            <strong>{formatScheduleOption(option)}</strong>
            <textarea name="notes" rows={2} placeholder="Optional note" />
            <SaveButton pendingLabel="Scheduling..." savedLabel="Scheduled">{awaitingApproval ? 'Approve quote and schedule' : 'Choose this date'}</SaveButton>
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
  ) : null;

  const scheduledSection = dashboard.scheduleRequest?.status === 'selected' && selectedScheduleOption ? (
    <section className="panel workspace-section-card client-attention-card success">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Start date selected</p>
        <h2>{formatScheduleOption(selectedScheduleOption)}</h2>
      </div>
      <p className="workspace-card-copy">Your contractor has your selected start time.</p>
      {dashboard.scheduleRequest.client_notes ? <p className="workspace-card-copy">Notes: {dashboard.scheduleRequest.client_notes}</p> : null}
    </section>
  ) : dashboard.scheduleRequest?.status === 'needs_more_options' ? (
    <section className="panel workspace-section-card client-attention-card">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Start date request sent</p>
        <h2>We&apos;ll send different options</h2>
      </div>
      {dashboard.scheduleRequest.client_notes ? <p className="workspace-card-copy">{dashboard.scheduleRequest.client_notes}</p> : null}
    </section>
  ) : null;

  const paymentsSection = openPayments.length > 0 ? (
    <section className="panel workspace-section-card client-attention-card" id="pay">
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
      <SecureNote />
    </section>
  ) : null;

  const planSection = plan ? (
    <section className={`panel workspace-section-card client-attention-card${plan.status === 'paid_off' ? ' success' : ''}`} id="plan">
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
          {/* A PLAN IS AN OFFER, NOT A REQUIREMENT.
              The contractor's payment terms are mutually exclusive radios, so
              choosing "Payment Plan" removed paying in full — for the
              homeowner, not just for the contractor. Somebody who would happily
              have settled the whole thing was shown a deposit, four dated
              installments and a card authorization, with no way to say "I'll
              just pay it". Both amounts are named here, at the moment the
              choice is actually made. */}
          {plan.allowPayInFull && !plan.payInFullInFlight ? (
            <div className="plan-choice">
              <p className="plan-choice-label">Two ways to pay this</p>
              <div className="plan-choice-grid">
                <form action={payPlanBalanceAction.bind(null, params.token)} className="plan-choice-card">
                  <input type="hidden" name="planId" value={plan.id} />
                  <strong>Pay in full</strong>
                  <span className="plan-choice-amount">{formatMoney(plan.totalCents / 100)}</span>
                  <small>One payment, and you&apos;re done. Nothing is scheduled and no card is saved for later.</small>
                  <SaveButton className="btn secondary" pendingLabel="Starting...">Pay {formatMoney(plan.totalCents / 100)} now</SaveButton>
                </form>
                <div className="plan-choice-card is-plan">
                  <strong>Pay over time</strong>
                  <span className="plan-choice-amount">{formatMoney(plan.depositCents / 100)} today</span>
                  <small>
                    then {plan.schedule.length} payment{plan.schedule.length === 1 ? '' : 's'} of{' '}
                    {formatMoney(plan.schedule[0]?.amount ?? 0)}. 0% interest, no fees.
                  </small>
                  <span className="plan-choice-note">Set it up below ↓</span>
                </div>
              </div>
            </div>
          ) : null}

          {plan.payInFullInFlight ? (
            <p className="client-plan-fineprint">A full payment is being processed…</p>
          ) : null}

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
            {/* The sum, stated. The schedule above claims to split the total and
                nothing more, and a claim about arithmetic should be checkable
                without arithmetic. */}
            <div className="client-plan-row client-plan-sum">
              <span>Total</span>
              <strong>{formatMoney(plan.totalCents / 100)}</strong>
            </div>
          </div>
          {awaitingApproval ? (
            /* TWO AGREEMENTS, IN ORDER. Authorizing a card schedule is not
               accepting a quote, and this form used to be the first thing on the
               page — asked for before the work, the prices or the total had been
               shown once. It waits its turn now. */
            <p className="client-plan-later">
              This is how the total would be split. You&apos;ll set it up — and authorize the card — after you approve the
              quote above. Nothing is charged before then.
            </p>
          ) : plan.authorized ? (
            plan.deposit ? (
              <>
                <Link href={`/pay/${plan.deposit.paymentId}`} className="btn primary client-plan-cta">Pay {formatMoney(plan.deposit.amount)} deposit</Link>
                <SecureNote />
              </>
            ) : null
          ) : (
            <form action={authorizePaymentPlanAction.bind(null, params.token)} className="client-plan-authorize">
              <input type="hidden" name="planId" value={plan.id} />
              {plan.allowPayInFull ? <p className="client-plan-option-head">Pay over time</p> : null}
              <label htmlFor="plan-signer">Type your full name to authorize automatic installment payments</label>
              <input id="plan-signer" name="signerName" type="text" placeholder="Your full name" autoComplete="name" required />
              <p className="client-plan-fineprint">
                By typing your name you authorize {dashboard.businessName} to charge your saved card for each installment shown above on its
                due date. You can pay the remaining balance in full at any time with no penalty. This is separate from your
                approval of the quote.
              </p>
              <SaveButton pendingLabel="Starting...">Authorize &amp; pay {formatMoney(plan.depositCents / 100)} deposit</SaveButton>
              <SecureNote />
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
  ) : null;

  const subscriptionsSection = dashboard.quoteApproved && pendingSubscriptions.length > 0 ? (
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
              {/* ONE form, two submit buttons. The date has to be shared:
                  split across two forms, whichever button they didn't use
                  would submit its own stale copy, and paying up front would
                  quietly start the plan on a different day than paying per
                  cycle. The pressed button carries `mode`. */}
              <form className="client-sub-signup-actions" action={startSubscriptionAction.bind(null, params.token)}>
                <input type="hidden" name="itemId" value={item.id} />
                <label className="client-sub-start">
                  <span>First visit</span>
                  <input type="date" name="startDate" defaultValue={earliestStart} min={earliestStart} required />
                </label>
                <SaveButton className="btn secondary" pendingLabel="Starting..." name="mode" value="cycle">Pay {formatMoney(item.amount)}{freq}</SaveButton>
                {term > 0 ? (
                  <SaveButton className="btn primary" pendingLabel="Starting..." name="mode" value="prepay">Pay {formatMoney(prepaidTotal)} up front{discount > 0 ? ` · save ${discount}%` : ''}</SaveButton>
                ) : null}
              </form>
            </div>
          );
        })}
      </div>
      <SecureNote />
    </section>
  ) : null;

  return (
    <>
      {/* The contractor's mark and name, not ours. This is the page a homeowner
          opens from a text to approve a quote — the one place it matters most
          that the business they hired is the business on the page. */}
      <ContractorBrandBar brand={dashboard.brand} context={`Job ${dashboard.job.ref ?? ''}`.trim()} />
      <main className="wide-shell workspace-shell client-job-dashboard" style={brandStyle}>
        <section className="workspace-hero panel client-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">{dashboard.businessName}</p>
            <h1 className="workspace-title client-hero-title">{awaitingApproval ? 'Your quote' : 'Your job'}</h1>
            <p className="client-hero-for">
              Prepared for {firstNameOf(dashboard.job.client_name)}
              {dashboard.job.address ? <> · {dashboard.job.address}</> : null}
            </p>
            <div className="workspace-inline-row">
              <span className={`status-badge client-status client-status-${status.tone}`}>{status.label}</span>
              <span className="workspace-inline-note">{dashboard.job.ref}</span>
            </div>
            {dashboard.job.scheduled_for ? <p className="workspace-lead">Schedule: {dashboard.job.schedule_label}</p> : null}
          </div>
        </section>

        {quoteSection}
        {approvedSection}

        {/* Above the schedule: a choice inside the quote changes what is being
            scheduled and what it costs. */}
        <Selections token={params.token} selections={clientSelections} businessName={dashboard.businessName} />
        <ChangeOrders token={params.token} orders={clientChangeOrders} />

        {scheduleSection}
        {scheduledSection}

        {paymentsSection}
        {planSection}
        {subscriptionsSection}

        {/* Cover, and the way back to the contractor. Placed with the rest of the
            job rather than in a separate portal, because this page is the link a
            homeowner still has in their inbox two years later. */}
        <Warranties token={params.token} warranties={clientWarranties} />

        {/* Proof-to-Pay stages. Above the general checklist because a stage
            carries its own evidence AND the amount attached to it — this is the
            part a homeowner opens the page to see. */}
        {dashboard.milestones.length > 0 ? (
          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <p className="eyebrow">Your job, stage by stage</p>
              <h2>What&rsquo;s been done</h2>
            </div>
            <div className="client-milestones">
              {dashboard.milestones.map((milestone) => (
                <article key={milestone.id} className={`client-milestone status-${milestone.status}`}>
                  <div className="client-milestone-head">
                    <div>
                      <h3>{milestone.title}</h3>
                      {milestone.scope ? <p className="client-milestone-scope">{milestone.scope}</p> : null}
                    </div>
                    <div className="client-milestone-money">
                      <span className="client-milestone-amount">{formatMoney(milestone.amount)}</span>
                      <span className={`client-milestone-status status-${milestone.status}`}>{milestone.statusLabel}</span>
                    </div>
                  </div>

                  {milestone.status !== 'paid' ? (
                    <div className="task-progress" aria-hidden="true">
                      <div className="task-progress-fill" style={{ width: `${milestone.progressPct}%` }} />
                    </div>
                  ) : null}

                  {milestone.tasks.length > 0 ? (
                    <ul className="client-task-list client-milestone-tasks">
                      {milestone.tasks.map((task, index) => (
                        <li key={index} className={`client-task${task.done ? ' is-done' : ''}`}>
                          <span className="client-task-check" aria-hidden="true">{task.done ? '✓' : '○'}</span>
                          <span>{task.title}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {milestone.photos.length > 0 ? (
                    <div className="client-milestone-photos">
                      {(['before', 'after'] as const).map((phase) => {
                        const shots = milestone.photos.filter((photo) => photo.phase === phase);
                        if (shots.length === 0) return null;
                        return (
                          <div key={phase}>
                            <p className="client-milestone-phase">{phase === 'before' ? 'Before' : 'After'}</p>
                            <div className="client-milestone-grid">
                              {shots.map((photo) => (
                                <figure key={photo.id}>
                                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, one-hour life */}
                                  <img src={photo.url} alt={photo.caption || `${phase} photo`} loading="lazy" />
                                  {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
                                </figure>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {milestone.payHref ? (
                    <a className="btn primary client-milestone-pay" href={milestone.payHref}>
                      Pay {formatMoney(milestone.amount)}
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
                <h2>Status updates</h2>
              </div>
              {dashboard.feed.length === 0 ? (
                <p className="empty-state">No updates yet.</p>
              ) : (
                <div className="job-feed-list">
                  {/* Curated upstream by toClientFeed, not filtered — this used
                      to print whatever title and body the row held, which is
                      how the contractor's intake notes ended up here. */}
                  {dashboard.feed.map((event) => (
                    <article className="job-feed-item" key={event.id}>
                      <div className="job-feed-dot" />
                      <div className="job-feed-content">
                        <div className="job-row-header">
                          <span className="cost-item-desc">{event.title}</span>
                          {event.amount ? <span className="cost-item-amount">{formatMoney(Number(event.amount))}</span> : null}
                        </div>
                        {event.body ? <p className="workspace-card-copy">{event.body}</p> : null}
                        <p className="job-meta">
                          {formatFeedTime(event.at)}
                          {event.actionUrl ? (
                            <>
                              {' · '}
                              <Link href={event.actionUrl}>Open</Link>
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
                <p className="eyebrow">Documents</p>
                <h2>Your paperwork</h2>
              </div>
              {dashboard.invoices.length === 0 ? (
                /* "No invoices have been shared yet" read as an absence of
                   paperwork on a page that was asking for money. The quote IS
                   the paperwork at this stage, and it can be saved. */
                <p className="empty-state">
                  Your quote is above — use <strong>Print or save as PDF</strong> to keep a copy. An invoice appears here once
                  the work is billed.
                </p>
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
        <ContractorBrandFoot businessName={dashboard.businessName} />
      </main>
    </>
  );
}

/**
 * Who is holding the card details, said where the card details are asked for.
 *
 * The contractor's name is on this page and ours is in the footer, which is
 * right — but it leaves a homeowner typing a card number into a page branded by
 * a landscaper with no indication of what is processing it.
 */
function SecureNote() {
  return (
    <p className="client-secure-note">
      <span aria-hidden="true">🔒</span> Payments are processed securely by Stripe. Card details are never seen or stored by
      your contractor or by Let&apos;s Get Quoted.
    </p>
  );
}
