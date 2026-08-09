import type { Invoice } from '@/lib/invoices';
import { formatJobSchedule, formatMoney, type Job, type JobStatus } from '@/lib/jobs';
import type { Payment } from '@/lib/payments';
import { WORKFLOW_STAGE_LABEL } from '@/lib/workflow-stages';

export type JobListBadgeTone = JobStatus | 'flag';

export type JobListBadge = {
  label: string;
  tone: JobListBadgeTone;
  title?: string;
};

function moneyCents(value: number): number {
  return Math.round(Number(value || 0) * 100);
}

/** "Started Sat, Aug 1" — null when nobody pressed the button. */
export function formatStartedOn(startedAt: string | null | undefined): string | null {
  if (!startedAt) return null;
  const at = new Date(startedAt);
  if (Number.isNaN(at.getTime())) return null;
  // A timestamptz, so it's read in the reader's own zone rather than built from
  // parts the way a bare date key has to be.
  return `Started ${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

function hasQuoteRevision(job: Job, invoices: Invoice[]): boolean {
  const currentQuoteCents = moneyCents(job.quoted_amount);
  if (currentQuoteCents <= 0) return false;

  return invoices.some((invoice) => {
    if (invoice.status === 'void') return false;
    const invoiceTotalCents = moneyCents(invoice.total);
    return invoiceTotalCents > 0 && invoiceTotalCents !== currentQuoteCents;
  });
}

export type JobMilestones = {
  quoteShared: boolean;
  quoteAccepted: boolean;
  scheduled: boolean;
  paymentRequested: boolean;
  paidOrSignedOff: boolean;
  isComplete: boolean;
  paidTotal: number;
  paymentLinkCount: number;
  hasSignedInvoice: boolean;
};

// Canonical pipeline-milestone flags for a job. Centralized so the job-detail
// checklist derives "where is this job" from ONE place instead of recomputing
// slightly different booleans — keeping the checklist internally consistent.
export function computeJobMilestones(
  job: Job,
  payments: Payment[],
  invoices: Invoice[],
  activeClientLinkCount: number
): JobMilestones {
  const hasPaymentRequest = payments.some((payment) => payment.status === 'requested' || payment.status === 'processing' || payment.status === 'paid');
  const paidTotal = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + Number(payment.amount), 0);
  const hasSignedInvoice = invoices.some((invoice) => invoice.status === 'signed' || invoice.status === 'paid');
  const hasPaidInvoice = invoices.some((invoice) => invoice.status === 'paid');
  const isComplete = job.status === 'complete' || job.status === 'archived';

  return {
    quoteShared: job.quoted_amount > 0 && activeClientLinkCount > 0,
    quoteAccepted: job.status === 'in_progress' || isComplete || Boolean(job.scheduled_for) || hasPaymentRequest || invoices.length > 0,
    scheduled: Boolean(job.scheduled_for) || job.status === 'in_progress' || isComplete,
    paymentRequested: hasPaymentRequest,
    paidOrSignedOff: paidTotal > 0 || hasPaidInvoice || hasSignedInvoice || isComplete,
    isComplete,
    paidTotal,
    paymentLinkCount: payments.length,
    hasSignedInvoice,
  };
}

export function deriveJobListBadge(
  job: Job,
  payments: Payment[],
  invoices: Invoice[],
  activeClientLinkCount: number
): JobListBadge {
  const failedPayment = payments.find((payment) => payment.status === 'failed');
  const requestedPayment = payments.find((payment) => payment.status === 'requested');
  const processingPayment = payments.find((payment) => payment.status === 'processing');
  const paidPayment = payments.find((payment) => payment.status === 'paid');
  const sentInvoice = invoices.find((invoice) => invoice.status === 'sent');
  const signedInvoice = invoices.find((invoice) => invoice.status === 'signed' || invoice.status === 'paid');
  const quoteNeedsRevision = hasQuoteRevision(job, invoices);

  if (job.status === 'archived') return { label: 'Archived', tone: 'archived' };
  if (job.status === 'complete') return { label: 'Complete', tone: 'complete' };
  if (failedPayment) return { label: 'Payment issue', tone: 'flag', title: 'A payment attempt failed.' };
  if (requestedPayment) return { label: WORKFLOW_STAGE_LABEL.invoice_sent, tone: 'in_progress' };
  if (processingPayment) return { label: 'Payment processing', tone: 'in_progress' };
  if (quoteNeedsRevision) return { label: 'Send revised quote', tone: 'flag', title: 'Current job quote differs from an existing quote/invoice total.' };
  if (signedInvoice && !paidPayment) return { label: 'Client signed invoice', tone: 'in_progress' };
  // Not the canonical "Invoice sent — awaiting payment": this one is waiting on
  // a signature, which is a different wait with a different fix.
  if (sentInvoice) return { label: 'Invoice sent — awaiting signature', tone: 'in_progress' };
  if (paidPayment && !job.scheduled_for) return { label: 'Paid · Schedule work', tone: 'in_progress' };
  // Pressing "Job started" has to move this badge. It sat below the
  // scheduled_for branch and so kept reading "Scheduled" with a crew already on
  // site — the exact ambiguity the start button exists to remove. Same wording
  // as the pipeline's schedule step, which also commits to "Work in progress"
  // once there's a start time, so the two can't disagree.
  if (job.started_at) return { label: WORKFLOW_STAGE_LABEL.in_progress, tone: 'in_progress', title: formatStartedOn(job.started_at) ?? undefined };
  if (job.scheduled_for) return { label: WORKFLOW_STAGE_LABEL.scheduled, tone: 'in_progress' };
  // An accepted job with no date on it is APPROVED, not ready to invoice.
  //
  // This branch is reached with no scheduled_for and no started_at, so nothing
  // has been done yet — "Ready to invoice" was telling the owner to bill for
  // work nobody has started. It was hard to hit while the only routes to
  // in_progress went through a client who had also picked a date; recording a
  // verbal acceptance from the lead page reaches it every time, which is what
  // made the wrong label worth naming. 'approved' is the stage word this
  // product already defines for exactly this moment.
  if (job.status === 'in_progress') {
    return { label: WORKFLOW_STAGE_LABEL.approved, tone: 'in_progress', title: 'Accepted — it still needs a date.' };
  }
  // Three consecutive states, named for the thing that's actually missing.
  // They used to read "Send quote" and "Add quote" — three characters apart,
  // both parsing as "quote stuff to do", so nobody could tell which step a job
  // was on. No two of these share a word now.
  if (job.quoted_amount > 0 && activeClientLinkCount === 0) return { label: 'Send to client', tone: 'new_lead', title: 'Priced, but the customer has no link to view it yet.' };
  if (job.quoted_amount > 0) return { label: 'Awaiting approval', tone: 'new_lead', title: 'The customer can see the quote — waiting on them.' };
  return { label: 'Quote needed', tone: 'new_lead', title: 'No amount on this job yet.' };
}

export type CompletionBlockerInput = {
  /** Client choices still waiting on the customer. */
  openSelections?: number;
  /** Punch-list / checklist items nobody has ticked off. */
  openTasks?: number;
  /** Money invoiced and not yet paid. */
  outstandingBalance?: number;
  /** True when no payment or invoice has been raised at all. */
  nothingBilled?: boolean;
};

/**
 * What is still outstanding on a job about to be closed.
 *
 * NOT A BLOCK, and deliberately so. Every item here is something a contractor
 * can legitimately close a job over: the customer pays by cheque next week, the
 * two punch-list items got done and nobody ticked them, the tile choice stopped
 * mattering once they picked one in person. A hard refusal would trap real work
 * behind a checkbox and teach people to leave jobs open, which is worse than the
 * problem — an open job is invisible in every "what's left" count in the app.
 *
 * So this NAMES them, in the confirm the button already shows. The failure it
 * addresses is not "the owner completed a job they shouldn't have"; it is
 * "nobody told them $4,200 was still unpaid and the job disappeared off the
 * list that would have reminded them".
 *
 * Ordered by cost of being wrong: money first, then the customer waiting on us,
 * then our own list.
 */
export function completionBlockers(input: CompletionBlockerInput): string[] {
  const blockers: string[] = [];
  const outstanding = Number(input.outstandingBalance) || 0;

  if (outstanding > 0) blockers.push(`${formatMoney(outstanding)} is still unpaid`);
  else if (input.nothingBilled) blockers.push('nothing has been invoiced or charged yet');

  const selections = Math.max(0, Math.trunc(Number(input.openSelections) || 0));
  if (selections > 0) blockers.push(`${selections} client ${selections === 1 ? 'choice is' : 'choices are'} still waiting`);

  const tasks = Math.max(0, Math.trunc(Number(input.openTasks) || 0));
  if (tasks > 0) blockers.push(`${tasks} checklist ${tasks === 1 ? 'item is' : 'items are'} unticked`);

  return blockers;
}

export type PipelineChecklistItem = {
  key: string;
  label: string;
  detail: string;
  complete: boolean;
  href: string;
};

/**
 * The five-step pipeline checklist on the job header.
 *
 * Lives beside deriveJobListBadge because the two describe the same job state
 * and sat next to each other on screen saying different things: the badge named
 * the next action while the checklist row named the milestone ("Quote sent"),
 * which reads as a claim about a quote that was never sent.
 *
 * So every step is named for what it actually IS — the outstanding action while
 * it's open, the thing that happened once it's closed — and the first step
 * splits on exactly the condition the badge splits on.
 */
export function buildPipelineChecklist(
  job: Job,
  payments: Payment[],
  invoices: Invoice[],
  activeClientLinkCount: number,
  originatingLeadId: string | null
): PipelineChecklistItem[] {
  const milestones = computeJobMilestones(job, payments, invoices, activeClientLinkCount);
  const feedDetail = activeClientLinkCount > 0 ? 'Job Feed shared' : 'Share Job Feed link';
  const startedLabel = formatStartedOn(job.started_at ?? null);

  return [
    {
      key: 'quote',
      // Same split deriveJobListBadge uses, so the badge and this row never
      // disagree about whether the quote has gone out.
      label: milestones.quoteShared ? 'Sent to client' : job.quoted_amount > 0 ? 'Send to client' : 'Quote needed',
      detail:
        job.quoted_amount > 0
          ? `${formatMoney(job.quoted_amount)} quoted · ${feedDetail}`
          : // Nothing to say about sharing a link for a job with no price on it.
            'Price the work before you send it',
      complete: milestones.quoteShared,
      href: originatingLeadId ? `/dashboard/leads/${originatingLeadId}` : `/dashboard/jobs/${job.id}#job-feed`,
    },
    {
      key: 'approval',
      // Waiting on the client, not on the contractor — so this one names the
      // wait rather than an action they can't take.
      label: milestones.quoteAccepted ? 'Quote approved' : 'Awaiting approval',
      detail: milestones.quoteAccepted ? 'Client approved' : 'Client approves on their quote page',
      complete: milestones.quoteAccepted,
      href: `/dashboard/jobs/${job.id}?edit=client#job-details`,
    },
    {
      key: 'schedule',
      // Once work has actually started this stops hedging. "Scheduled /
      // underway" covered both a job sitting on Tuesday's calendar and a job
      // with a crew in the driveway, which is the ambiguity the start button
      // exists to remove — so when it has been pressed, say which one it is.
      //
      // AND IT STOPS AT COMPLETION. Started-ness is sticky — started_at is a
      // record of a thing that happened and is never cleared — so a finished
      // job still had a started_at and this step still read "Work in progress",
      // directly under a hero badge saying Complete. Completion-first ordering,
      // the same the `paid` step and deriveJobListBadge already use.
      // isComplete covers archived too, which is right: a cancelled job has no
      // work underway either.
      label: milestones.isComplete
        ? WORKFLOW_STAGE_LABEL.complete
        : startedLabel
          ? WORKFLOW_STAGE_LABEL.in_progress
          : milestones.scheduled
            ? WORKFLOW_STAGE_LABEL.scheduled
            : 'Schedule the work',
      detail:
        startedLabel ??
        (job.scheduled_for ? formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until) : 'No date set'),
      complete: milestones.scheduled,
      href: `/dashboard/jobs/${job.id}?open=scheduling#job-scheduling`,
    },
    {
      key: 'invoice',
      label: milestones.paymentRequested ? 'Invoice / payment requested' : 'Request payment',
      detail: milestones.paymentRequested
        ? `${milestones.paymentLinkCount} payment link${milestones.paymentLinkCount === 1 ? '' : 's'} created`
        : 'Send invoice or payment link',
      complete: milestones.paymentRequested,
      href: `/dashboard/jobs/${job.id}?open=payment#request-payment`,
    },
    {
      key: 'paid',
      label: milestones.paidOrSignedOff ? 'Paid / signed off' : 'Awaiting payment',
      detail:
        milestones.paidTotal > 0
          ? `${formatMoney(milestones.paidTotal)} paid`
          : milestones.hasSignedInvoice
            ? 'Client signed invoice'
            : // A job marked complete counts as signed off, so this step closes
              // with nothing paid. Saying "no payment yet" under a ticked step
              // is the same contradiction in a different place.
              milestones.isComplete
              ? 'Job marked complete'
              : 'No payment or sign-off yet',
      complete: milestones.paidOrSignedOff,
      href: `/dashboard/jobs/${job.id}?open=payment#request-payment`,
    },
  ];
}