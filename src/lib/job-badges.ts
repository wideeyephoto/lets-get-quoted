import type { Invoice } from '@/lib/invoices';
import type { Job, JobStatus } from '@/lib/jobs';
import type { Payment } from '@/lib/payments';

export type JobListBadgeTone = JobStatus | 'flag';

export type JobListBadge = {
  label: string;
  tone: JobListBadgeTone;
  title?: string;
};

function moneyCents(value: number): number {
  return Math.round(Number(value || 0) * 100);
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
  if (requestedPayment) return { label: 'Invoice sent · Waiting on payment', tone: 'in_progress' };
  if (processingPayment) return { label: 'Payment processing', tone: 'in_progress' };
  if (quoteNeedsRevision) return { label: 'Send revised quote', tone: 'flag', title: 'Current job quote differs from an existing quote/invoice total.' };
  if (signedInvoice && !paidPayment) return { label: 'Client signed off on quote', tone: 'in_progress' };
  if (sentInvoice) return { label: 'Quote sent · Awaiting sign-off', tone: 'in_progress' };
  if (paidPayment && !job.scheduled_for) return { label: 'Paid · Schedule work', tone: 'in_progress' };
  if (job.scheduled_for) return { label: 'Work scheduled', tone: 'in_progress' };
  if (job.status === 'in_progress') return { label: 'Ready for invoice', tone: 'in_progress' };
  if (job.quoted_amount > 0 && activeClientLinkCount === 0) return { label: 'Share quote', tone: 'new_lead' };
  if (job.quoted_amount > 0) return { label: 'Awaiting quote approval', tone: 'new_lead' };
  return { label: 'Add quote', tone: 'new_lead' };
}