import type { CSSProperties } from 'react';
import Link from 'next/link';
import SaveButton from '@/components/save-button';
import { getClientJobDashboard } from '@/lib/job-feed';
// Every number on this page is one the homeowner is asked to pay, authorize, or
// add up against the total they were quoted. To the cent, all of it.
import { formatMoneyExact as formatMoney, computeQuoteTotal } from '@/lib/jobs';
import { clientNextStep } from '@/lib/client-next-step';
import { clientJobStatus } from '@/lib/client-feed';
import { brandPaint } from '@/lib/contractor-brand';
import { firstNameOf, projectTypeOf, quoteHeadline } from '@/lib/quote-hero';
import { isSignatureMethod, safeSignaturePath } from '@/lib/signature';
import { optionsClosedCopy, quoteOptionsWindow, todayIn } from '@/lib/quote-options';
import { formatScheduleOption } from '@/lib/scheduling';
import {
  approveClientJobQuoteAction,
  askQuoteQuestionAction,
  requestDifferentClientJobScheduleOptionsAction,
  selectClientJobScheduleOptionAction,
  startSubscriptionAction,
  updateQuoteOptionsAction,
  authorizePaymentPlanAction,
  payPlanBalanceAction,
} from './actions';
import QuoteDocument from './QuoteDocument';
import QuoteAcceptance, { QuoteApproved, QuoteOptionsUpdate } from './QuoteAcceptance';
import { QuoteBottomBar, QuoteDeckProvider, type PayMode } from './QuoteDeck';
import ScheduleChoice from './ScheduleChoice';
import ScheduleLockedOptions from './ScheduleLockedOptions';
import PayChoice from './PayChoice';
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

const FREQ_LABEL: Record<string, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };
const FREQ_WORD: Record<string, string> = { weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly' };

function formatFeedTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDay(value: string | null): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * What just happened, said once at the top.
 *
 * Every action on this page redirects back to it with a flag — ?approved=1,
 * ?asked=1, ?ask-failed=1 — and nothing read them. So a homeowner who sent a
 * question got a page that looked exactly like the one they had just submitted
 * from, with no acknowledgement anywhere, and a question that FAILED to send
 * looked identical to one that had.
 */
const FLASH: Record<string, { tone: 'good' | 'bad'; text: string }> = {
  approved: { tone: 'good', text: 'Thanks — your approval is recorded and your contractor has been notified.' },
  scheduled: { tone: 'good', text: 'Your start date is confirmed. Your contractor can see it now.' },
  'schedule-requested': { tone: 'good', text: 'Sent. Your contractor will send different dates to choose from.' },
  asked: { tone: 'good', text: 'Your question is on its way. The quote stays open while they reply.' },
  'ask-failed': { tone: 'bad', text: 'That question did not send. Please try again, or call the number at the top of this page.' },
  'options-updated': { tone: 'good', text: 'Your options are updated and your contractor has been told. Your new total is below.' },
  'options-failed': { tone: 'bad', text: 'We could not change those options. Your quote is unchanged — please call your contractor.' },
};

export default async function ClientJobDashboardPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
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

  // The signature on the quote, for the receipt and for the executed document.
  // Read on its own and behind a fallback because the mark columns ship behind
  // their own migration: naming a column that isn't there fails the whole
  // query, and a receipt with no name is a worse answer than a receipt with no
  // mark. quoted_amount rides along because a legacy single-amount quote has no
  // line items to total and the receipt still has to name a figure.
  const readSignature = async (columns: string) =>
    access
      ? admin.from('jobs').select(columns).eq('account_id', access.accountId).eq('id', access.jobId).maybeSingle()
      : { data: null, error: null };
  const wide = await readSignature('quote_signer_name, quote_signed_at, quoted_amount, quote_signature_path, quote_signature_method');
  const signatureRow = (wide.error ? (await readSignature('quote_signer_name, quote_signed_at, quoted_amount')).data : wide.data) as
    | {
        quote_signer_name?: string | null;
        quote_signed_at?: string | null;
        quoted_amount?: number | null;
        quote_signature_path?: string | null;
        quote_signature_method?: string | null;
      }
    | null;

  /* --- the link itself is the first thing that can be wrong ----------------
     A revoked, expired or mistyped token is not an error — it is the ordinary
     end of a link's life, and it deserves an answer a person can act on rather
     than one sentence and a dead end. */
  if (!dashboard) {
    return (
      <main className="wide-shell workspace-shell client-job-dashboard">
        <section className="panel workspace-section-card quote-dead-link">
          <p className="eyebrow">This link has closed</p>
          <h1 className="workspace-title">This quote link is no longer active</h1>
          <p className="workspace-lead">
            Links expire, and a contractor can close one at any time — usually because the quote was replaced with a newer
            one, or the job is finished.
          </p>
          <p className="workspace-lead">
            Nothing is lost. Reply to the text or email you received it in and ask for a fresh link, and it will open right
            where this one did.
          </p>
        </section>
      </main>
    );
  }

  const flashKey = Object.keys(FLASH).find((key) => searchParams?.[key] === '1');
  const flash = flashKey ? FLASH[flashKey] : null;

  // Plan-linked payments (deposit / installments / payoff) are surfaced in the
  // Payment Plan card below, not the generic "Payment requests" list.
  const openPayments = dashboard.payments.filter(
    (payment) => (payment.status === 'requested' || payment.status === 'processing') && !payment.payment_plan_id,
  );
  const settledPayments = dashboard.payments.filter((payment) => payment.status === 'paid' && !payment.payment_plan_id);
  const depositPayment = openPayments.find((payment) => payment.kind === 'deposit');
  const plan = dashboard.paymentPlan;
  const PLAN_INST_STATUS: Record<string, string> = { paid: 'Paid', processing: 'Processing', requested: 'Scheduled', failed: 'Payment failed — retrying', refunded: 'Refunded' };
  const pendingSubscriptions = dashboard.job.quote_items.filter((item) => item.kind === 'subscription' && !item.signedUp);
  // Today, in the viewer's own terms. A plan can start today but never earlier —
  // a back-dated first visit would generate visits that are already overdue.
  const earliestStart = new Date().toISOString().slice(0, 10);
  const selectedScheduleOption = dashboard.scheduleRequest?.selected_index == null ? null : dashboard.scheduleRequest.options[dashboard.scheduleRequest.selected_index];

  const scheduleOpen = dashboard.scheduleRequest?.status === 'open';
  const awaitingApproval = !dashboard.quoteApproved;
  const depositDue = Boolean(depositPayment) || plan?.status === 'pending_deposit';
  const scheduledLabel = selectedScheduleOption
    ? formatScheduleOption(selectedScheduleOption)
    : dashboard.job.scheduled_for
      ? dashboard.job.schedule_label
      : null;

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

  /* --- the quote, as numbers ----------------------------------------------- */
  const items = dashboard.job.quote_items;
  const baseTotal = items.filter((item) => item.kind === 'base').reduce((sum, item) => sum + item.amount, 0);
  const deckAddons = items
    .filter((item) => item.kind === 'addon')
    .map((item) => ({ id: item.id, label: item.label, amount: item.amount, recommended: item.recommended, selected: item.selected }));
  // Post-approval the stored `selected` flags ARE the agreement, so this is the
  // number that was actually agreed rather than a live preview of one. A quote
  // with no lines falls back to the single amount it was written as.
  const agreedTotal = items.length > 0 ? computeQuoteTotal(items) : Number(signatureRow?.quoted_amount ?? 0) || 0;
  const chosenAddonLabels = items.filter((item) => item.kind === 'addon' && item.selected).map((item) => item.label);

  /* What was signed, and how. Put through the same allowlist the writer used,
     because a value that reached the column before the check existed — or by
     any other route — is not one to hand to a renderer on trust. */
  const signedName = signatureRow?.quote_signer_name ?? null;
  const signedPath = safeSignaturePath(signatureRow?.quote_signature_path);
  const signedMethod = isSignatureMethod(signatureRow?.quote_signature_method)
    ? signatureRow.quote_signature_method
    : signedName
      ? 'typed'
      : null;
  const signedOn = formatDay(signatureRow?.quote_signed_at ?? null) || null;

  /* Whether the extras are still theirs to change. Decided here for what to
     render, and decided AGAIN inside the action for what to write — the form
     being hidden is not a check. */
  const optionsWindow = quoteOptionsWindow({
    approved: dashboard.quoteApproved,
    allowed: dashboard.allowOptionChanges,
    hasAddons: deckAddons.length > 0,
    jobStatus: dashboard.job.status,
    startedAt: dashboard.job.started_at ?? null,
    scheduledFor: dashboard.job.scheduled_for,
    today: todayIn(dashboard.timezone),
    planStatus: plan?.status ?? null,
    planAuthorized: Boolean(plan?.authorized),
    paidToDate: dashboard.payments
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
  });
  const optionsClosedNote = optionsWindow.open ? null : optionsClosedCopy(optionsWindow.reason, dashboard.businessName);

  const projectType = projectTypeOf(items, dashboard.job.scope);
  const firstName = firstNameOf(dashboard.job.client_name);
  const headline = quoteHeadline({ firstName, projectType, approved: !awaitingApproval });

  /* --- what happens next, once the answer is yes ----------------------------
     The sentence, the link and the button's words come from ONE ordered list
     now (see lib/client-next-step). They were three ternaries over the same
     conditions in two different orders, which is how the rail came to say "set
     up how you would like to pay" above a button labelled "Choose a start date"
     pointing at #dates — a section this page renders as null in exactly that
     state, so the button did nothing when it was pressed. */
  const next = clientNextStep({
    businessName: dashboard.businessName,
    depositPayment: depositPayment ? { id: depositPayment.id, amount: Number(depositPayment.amount) } : null,
    planStatus: plan?.status ?? null,
    scheduleOpen,
    scheduledLabel,
    openPayment: openPayments[0] ? { id: openPayments[0].id, amount: Number(openPayments[0].amount) } : null,
  });
  const { copy: nextStep, href: nextHref, label: nextLabel } = next;

  /* --- how they will pay, in one line for the rail -------------------------- */
  const planInstallmentLabel = plan
    ? `${plan.schedule.length} payment${plan.schedule.length === 1 ? '' : 's'} of ${formatMoney(plan.schedule[0]?.amount ?? 0)}, ${FREQ_WORD[plan.frequency] ?? 'monthly'}`
    : '';
  const paymentSummary = {
    full: plan ? formatMoney(plan.totalCents / 100) : null,
    plan: plan ? `${formatMoney(plan.depositCents / 100)} today, then ${planInstallmentLabel}` : null,
    fallback: plan
      ? plan.allowPayInFull
        ? 'In full or over time — your choice, after you approve'
        : `${formatMoney(plan.depositCents / 100)} today, then ${planInstallmentLabel}`
      : depositPayment
        ? `${formatMoney(Number(depositPayment.amount))} deposit, then the balance`
        : openPayments.length > 0
          ? 'See the payment request below'
          : 'Invoiced when the work is done',
  };
  // Pre-selected only when there is genuinely nothing to choose between.
  const initialPayMode: PayMode | null = plan && !plan.allowPayInFull ? 'plan' : null;

  /* --- the sections, in the order somebody decides things ------------------
     Review the quote → make the choices in it → approve and sign → pick a start
     date → pay. The page used to open on "authorize automatic charges and pay a
     $1,750 deposit", above any statement of what the work was or what it cost
     line by line. Nobody should be asked for a card before they have been shown
     a quote. */

  const quoteSection = (
    <section className="panel workspace-section-card client-quote-card" id="quote">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">{awaitingApproval ? 'Your quote' : 'What you approved'}</p>
        <h2>{awaitingApproval ? 'Scope and pricing' : 'Scope and pricing'}</h2>
      </div>
      {items.length > 0 || dashboard.job.scope ? (
        <QuoteDocument
          items={items}
          insurance={clientInsurance}
          header={{ ref: dashboard.job.ref, address: dashboard.job.address, scope: dashboard.job.scope }}
          signature={awaitingApproval ? null : { name: signedName, at: signedOn, path: signedPath, method: signedMethod }}
        />
      ) : (
        /* A quote with no lines and no scope is not a bug on this page — it is
           a quote that has not been written yet, and saying so beats an empty
           card that looks broken. */
        <p className="empty-state">
          {dashboard.businessName} hasn&rsquo;t added the details to this quote yet. They will appear here as soon as they do,
          on this same link.
        </p>
      )}

      {awaitingApproval ? (
        /* THE OTHER THING A PERSON CAN WANT TO DO. A quote whose only control is
           "Approve" leaves somebody who wants one line explained choosing between
           agreeing to something they don't understand and closing the tab. It is
           a <details> so it costs nothing until it's wanted. */
        <details className="client-ask">
          <summary>Not ready to approve? Ask a question</summary>
          <form action={askQuoteQuestionAction.bind(null, params.token)} className="client-ask-form">
            <label htmlFor="quote-question">What would you like to know?</label>
            <textarea id="quote-question" name="question" rows={3} required placeholder="Does the price include hauling away the old material?" />
            <SaveButton className="btn secondary" pendingLabel="Sending…" savedLabel="Sent">Send to {dashboard.businessName}</SaveButton>
            <p className="client-ask-note">This doesn&apos;t decline the quote — it stays open while they get back to you.</p>
          </form>
        </details>
      ) : null}
    </section>
  );

  // The dates the contractor offered, whether or not they can be picked yet.
  const scheduleOptions = (dashboard.scheduleRequest?.options ?? []).map((option, index) => ({
    label: formatScheduleOption(option),
    index,
  }));

  /* THE DATES ARE ALWAYS SHOWN. WHETHER THEY CAN BE PICKED IS A SEPARATE THING.
     ------------------------------------------------------------------------
     Two states stand between a customer and a start date: a deposit their
     contractor requires before scheduling, and a payment plan still waiting on
     its first payment. The second used to render NOTHING AT ALL — a homeowner
     who had been texted "here are three dates" opened the page, found no dates
     and no explanation, and had no way to tell whether the offer was real.

     Both now show the offer and name the one thing in the way. Seeing "Aug 18"
     behind a lock is what makes "set up payment" worth doing; an empty space
     where dates should be just reads as broken.

     Selection before approval is NOT one of these states, deliberately: picking
     a date on an unapproved quote approves it and books it in one step, which
     is a step saved, not a gate skipped. */
  const scheduleSection = scheduleOpen && plan?.status === 'pending_deposit' ? (
    <section className="panel workspace-section-card client-attention-card" id="dates">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Your start dates</p>
        <h2>Set up payment to pick your date</h2>
      </div>
      <p className="workspace-card-copy">
        {dashboard.businessName} has offered these start times. Choose how you&apos;d like to pay and they unlock —
        nothing is booked until you pick one.
      </p>
      <ScheduleLockedOptions options={scheduleOptions} />
      <Link href="#plan" className="btn primary client-attention-cta">Set up payment</Link>
    </section>
  ) : plan?.status === 'pending_deposit' ? null : scheduleOpen && dashboard.depositBlocksScheduling ? (
    <section className="panel workspace-section-card client-attention-card" id="dates">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">One step first</p>
        <h2>Pay your deposit to unlock scheduling</h2>
      </div>
      <p className="workspace-card-copy">
        Your contractor requires a deposit before you can choose a start date. These are the times they&apos;ve
        offered — once the deposit is paid, you can pick one.
      </p>
      {/* Shown here too. The old copy promised the options "appear here" once
          paid, which meant the page was describing something it could have been
          showing all along. */}
      <ScheduleLockedOptions options={scheduleOptions} />
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
        <h2>{awaitingApproval ? 'Approve and book a date' : 'Pick a start date'}</h2>
      </div>
      <p className="workspace-card-copy">
        {awaitingApproval
          ? 'Picking a date here approves the quote and books it in one step. Your contractor sees your choice immediately.'
          : 'Pick the start time that works best. Your contractor will see your choice immediately.'}
      </p>
      <ScheduleChoice
        options={scheduleOptions}
        selectAction={selectClientJobScheduleOptionAction.bind(null, params.token)}
        differentAction={requestDifferentClientJobScheduleOptionsAction.bind(null, params.token)}
        awaitingApproval={awaitingApproval}
      />
    </section>
  ) : null;

  const scheduledSection = dashboard.scheduleRequest?.status === 'selected' && selectedScheduleOption ? (
    <section className="panel workspace-section-card client-attention-card success">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Start date confirmed</p>
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
        <h2>{openPayments.length === 1 ? 'One payment to make' : 'Payments to make'}</h2>
      </div>
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

  /* Money already taken, said back. A page that only ever shows what is owed
     reads like a demand; the same page showing what has been received reads
     like a record. */
  const settledSection = settledPayments.length > 0 ? (
    <section className="panel workspace-section-card client-settled-card">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Received</p>
        <h2>Payments made</h2>
      </div>
      <div className="cost-list">
        {settledPayments.map((payment) => (
          <div className="cost-item" key={payment.id}>
            <div className="cost-item-main">
              <span className="cost-item-desc">{payment.label || 'Payment'}</span>
              <span className="cost-item-sub">Paid{payment.paid_at ? ` · ${formatDay(payment.paid_at)}` : ''}</span>
            </div>
            <span className="cost-item-amount">{formatMoney(Number(payment.amount))}</span>
          </div>
        ))}
      </div>
    </section>
  ) : null;

  const planSection = plan ? (
    <section className={`panel workspace-section-card client-attention-card${plan.status === 'paid_off' ? ' success' : ''}`} id="plan">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Payment plan</p>
        <h2>
          {plan.status === 'paid_off' ? 'Paid in full' : plan.status === 'active' ? 'Your payment plan' : 'How you’d like to pay'}
        </h2>
      </div>

      <div className="client-plan-stats">
        <div><span>Original total</span><strong>{formatMoney(plan.totalCents / 100)}</strong></div>
        <div><span>Paid so far</span><strong>{formatMoney(plan.paidCents / 100)}</strong></div>
        <div><span>Remaining balance</span><strong>{formatMoney(plan.remainingCents / 100)}</strong></div>
      </div>

      {plan.status === 'pending_deposit' ? (
        <PayChoice
          planId={plan.id}
          totalLabel={formatMoney(plan.totalCents / 100)}
          depositLabel={formatMoney(plan.depositCents / 100)}
          installments={plan.schedule.map((entry) => ({ seq: entry.seq, label: entry.label, amount: formatMoney(entry.amount) }))}
          installmentLabel={planInstallmentLabel}
          allowPayInFull={plan.allowPayInFull}
          payInFullInFlight={plan.payInFullInFlight}
          awaitingApproval={awaitingApproval}
          authorized={plan.authorized}
          businessName={dashboard.businessName}
          payInFullAction={payPlanBalanceAction.bind(null, params.token)}
          authorizeAction={authorizePaymentPlanAction.bind(null, params.token)}
          depositHref={plan.deposit ? `/pay/${plan.deposit.paymentId}` : null}
          secureNote={<SecureNote />}
        />
      ) : plan.status === 'active' ? (
        <>
          {plan.nextInstallment ? (
            <p className="workspace-card-copy">
              Next payment: <strong>{formatMoney(plan.nextInstallment.amount)}</strong> on {formatDay(plan.nextInstallment.dueDate)}
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
                <span>Installment {inst.seq} · {formatDay(inst.dueDate)}</span>
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
                <SaveButton className="btn secondary" pendingLabel="Starting…">Pay remaining balance · {formatMoney(plan.remainingCents / 100)}</SaveButton>
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
                <SaveButton className="btn secondary" pendingLabel="Starting…" name="mode" value="cycle">Pay {formatMoney(item.amount)}{freq}</SaveButton>
                {term > 0 ? (
                  <SaveButton className="btn primary" pendingLabel="Starting…" name="mode" value="prepay">Pay {formatMoney(prepaidTotal)} up front{discount > 0 ? ` · save ${discount}%` : ''}</SaveButton>
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
      <ContractorBrandBar brand={dashboard.brand} context={`Quote ${dashboard.job.ref ?? ''}`.trim()} />
      <main className="wide-shell workspace-shell client-job-dashboard" style={brandStyle}>
        <QuoteDeckProvider
          addons={deckAddons}
          baseTotal={baseTotal}
          awaitingApproval={awaitingApproval}
          initialPayMode={initialPayMode}
          /* Signing with a finger should be one gesture, not a name typed
             first — and the job already knows whose quote this is. Editable,
             because the person at the table is sometimes the other half of the
             household and the record should say who actually accepted. */
          initialSigner={dashboard.job.client_name ?? ''}
          optionsOpen={optionsWindow.open}
        >
          {flash ? (
            <p className={`quote-flash is-${flash.tone}`} role="status">
              {flash.text}
            </p>
          ) : null}

          {/* --- the hero -------------------------------------------------------
              Who it is from, who it is for, what the work is, where it is, and
              where it stands. Five facts the contractor already filled in, none
              of them invented, each one degrading to nothing rather than to a
              placeholder. */}
          <header className="quote-hero">
            <p className="quote-hero-eyebrow">
              {dashboard.businessName}
              <span className="quote-hero-sep" aria-hidden="true">·</span>
              <span className="quote-hero-ref">Quote {dashboard.job.ref}</span>
            </p>
            <h1 className="quote-hero-title client-hero-title">{headline}</h1>
            <p className="quote-hero-meta client-hero-for">
              {dashboard.job.address ? <span className="quote-hero-where">{dashboard.job.address}</span> : null}
              {firstName && dashboard.job.address ? <span className="quote-hero-sep" aria-hidden="true">·</span> : null}
              {firstName ? <span>Prepared for {dashboard.job.client_name}</span> : null}
            </p>
            <div className="quote-hero-status">
              <span className={`status-badge client-status client-status-${status.tone}`}>{status.label}</span>
              {scheduledLabel ? <span className="quote-hero-when">{scheduledLabel}</span> : null}
            </div>
          </header>

          <div className="quote-deck">
            <div className="quote-deck-main">
              {quoteSection}

              {/* Above the schedule: a choice inside the quote changes what is
                  being scheduled and what it costs. */}
              <Selections token={params.token} selections={clientSelections} businessName={dashboard.businessName} />
              <ChangeOrders token={params.token} orders={clientChangeOrders} />

              {scheduleSection}
              {scheduledSection}

              {paymentsSection}
              {planSection}
              {subscriptionsSection}
              {settledSection}

              {/* Cover, and the way back to the contractor. Placed with the rest
                  of the job rather than in a separate portal, because this page
                  is the link a homeowner still has in their inbox two years
                  later. */}
              <Warranties token={params.token} warranties={clientWarranties} />

              {/* Proof-to-Pay stages. Above the general checklist because a stage
                  carries its own evidence AND the amount attached to it — this is
                  the part a homeowner opens the page to see. */}
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

              {/* The record, last. It is the thing somebody comes back for, not
                  the thing they arrived for — and it used to sit in a second
                  column beside the documents, which put the activity log level
                  with the quote itself. */}
              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading compact-heading">
                  <p className="eyebrow">Job feed</p>
                  <h2>Updates</h2>
                </div>
                {dashboard.feed.length === 0 ? (
                  <p className="empty-state">Nothing has happened yet. Updates from {dashboard.businessName} will appear here.</p>
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
                            {/* Shown to the customer, not only to the person
                                who changed it. Somebody who read "we'll be
                                there Tuesday" and now sees Thursday is the one
                                who planned their week around it. */}
                            {event.editedAt ? <span className="feed-edited"> · edited {formatFeedTime(event.editedAt)}</span> : null}
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
              </section>

              <section className="panel workspace-section-card">
                <div className="section-heading workspace-section-heading compact-heading">
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
              </section>
            </div>

            {/* The decision, beside the number it is about — and still on screen
                while the rest of the page is read. */}
            <aside className="quote-deck-rail" aria-label="Your quote summary">
              <div className="quote-rail-sticky">
                {awaitingApproval ? (
                  <QuoteAcceptance
                    approveAction={approveClientJobQuoteAction.bind(null, params.token)}
                    businessName={dashboard.businessName}
                    scheduleOffered={scheduleOpen}
                    scheduledLabel={scheduledLabel}
                    payment={paymentSummary}
                    planTotal={plan ? plan.totalCents / 100 : null}
                  />
                ) : (
                  <>
                    <QuoteApproved
                      total={formatMoney(agreedTotal)}
                      addons={chosenAddonLabels}
                      scheduledLabel={scheduledLabel}
                      signerName={signedName}
                      signedAt={signedOn}
                      signaturePath={signedPath}
                      signatureMethod={signedMethod}
                      nextStep={nextStep}
                      nextHref={nextHref}
                      nextLabel={nextLabel}
                    />
                    {/* Changing your mind about the extras, under the receipt
                        rather than instead of it: what was agreed stays on
                        screen while it is being changed. */}
                    {optionsWindow.open ? (
                      <QuoteOptionsUpdate
                        updateAction={updateQuoteOptionsAction.bind(null, params.token)}
                        until={optionsWindow.until ? formatDay(optionsWindow.until) : null}
                        businessName={dashboard.businessName}
                      />
                    ) : optionsClosedNote ? (
                      <p className="quote-options-closed">{optionsClosedNote}</p>
                    ) : null}
                  </>
                )}
              </div>
            </aside>
          </div>

          <QuoteBottomBar />
        </QuoteDeckProvider>
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
