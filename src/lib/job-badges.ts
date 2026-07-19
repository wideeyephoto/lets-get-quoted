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