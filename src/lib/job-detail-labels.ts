import type { InvoiceStatus } from './invoices';
import type { PaymentStatus } from './payments';
import type { Cost } from './jobs';
import type { JobFeedEvent } from './job-feed';

// Display labels for a job's money and activity, shared by the full job page
// and the Focus pane on the pipeline. These were module-private inside
// dashboard/jobs/[id]/page.tsx; two surfaces describing the same event with
// different words is the worst bug class on this screen, because there's no way
// to tell which one is lying.

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  requested: 'Awaiting payment',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  signed: 'Signed',
  paid: 'Paid',
  void: 'Void',
};

export const COST_TYPE_ICON: Record<Cost['type'], string> = {
  material: '🧱',
  labor: '👷',
  sub: '🤝',
  receipt: '🧾',
  other: '📦',
};

export const FEED_VISIBILITY_LABEL: Record<JobFeedEvent['visibility'], string> = {
  internal: 'Internal',
  client: 'Client visible',
  client_financial: 'Client financial',
};

export const FEED_KIND_LABEL: Record<string, string> = {
  job_created: 'Job',
  job_update: 'Update',
  job_scheduled: 'Schedule',
  job_completed: 'Completed',
  appointment_reminder: 'Reminder',
  appointment_confirmed: 'Confirmed',
  review_feedback: 'Private feedback',
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
  review_requested: 'Review request',
  quote_followup: 'Quote follow-up',
};

export const FEED_KIND_ICON: Record<string, string> = {
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
  review_requested: '⭐',
  quote_followup: '↻',
};

export function marginTier(margin: number): 'margin-good' | 'margin-ok' | 'margin-bad' {
  if (margin >= 0.35) return 'margin-good';
  if (margin >= 0.2) return 'margin-ok';
  return 'margin-bad';
}

export function formatFeedTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function getFeedDisplayTitle(event: Pick<JobFeedEvent, 'kind' | 'title'>): string {
  if (event.kind === 'job_created') return 'Quote sent';
  if (event.kind === 'client_link_created') return 'Client view link created';
  if (event.kind === 'client_link_revoked') return 'Client view links revoked';
  return event.title || event.kind;
}

export function getFeedDisplayBody(event: Pick<JobFeedEvent, 'kind' | 'body'>): string | null {
  if (event.kind === 'client_link_created') return 'A client view link was created for this job.';
  if (event.kind === 'client_link_revoked') return 'Active client view links for this job were revoked.';
  return event.body;
}
