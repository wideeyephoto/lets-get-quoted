import { formatMoney, type Job } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';
import { ready, type BestOpportunity, type Loadable } from '@/lib/dashboard-types';

export function findBestOpportunity(input: {
  jobs: Job[];
  leads: Lead[];
  outstandingTotal: number;
  rebookCount: number;
  basePath?: string;
}): Loadable<BestOpportunity | null> {
  const { jobs, leads, outstandingTotal, rebookCount, basePath = '/dashboard' } = input;

  // 1. High value quote awaiting approval
  const openQuotes = jobs
    .filter((j) => j.status === 'new_lead' && Number(j.quoted_amount) > 0)
    .sort((a, b) => (Number(b.quoted_amount) || 0) - (Number(a.quoted_amount) || 0));

  if (openQuotes.length > 0 && Number(openQuotes[0].quoted_amount) >= 1000) {
    const quote = openQuotes[0];
    const val = Number(quote.quoted_amount);
    return ready({
      id: `quote-${quote.id}`,
      type: 'viewed_quote',
      headline: `Follow up on ${quote.client_name || 'customer'} proposal`,
      reason: `This ${formatMoney(val)} quote is awaiting customer approval. A quick check-in can close the deal.`,
      estimatedValue: val,
      actionLabel: 'Follow up on quote',
      actionHref: `${basePath}/jobs/${quote.id}`,
    });
  }

  // 2. High value lead needing reply
  const newLeads = leads
    .filter((l) => l.status === 'new')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (newLeads.length > 0) {
    const lead = newLeads[0];
    return ready({
      id: `lead-${lead.id}`,
      type: 'high_value_lead',
      headline: `Respond to new inquiry from ${lead.name}`,
      reason: 'Prompt first responses close over 70% more contractor bids than delayed replies.',
      estimatedValue: null,
      actionLabel: 'Respond to lead',
      actionHref: `${basePath}/leads`,
    });
  }

  // 3. Approved job needing scheduling
  const unscheduledApproved = jobs.filter((j) => j.status === 'in_progress' && !j.scheduled_for);
  if (unscheduledApproved.length > 0) {
    const job = unscheduledApproved[0];
    return ready({
      id: `sched-${job.id}`,
      type: 'schedule_approved',
      headline: `Schedule approved job for ${job.client_name}`,
      reason: 'This job is already approved and ready to be placed on the operational calendar.',
      estimatedValue: Number(job.quoted_amount) || null,
      actionLabel: 'Schedule job',
      actionHref: `${basePath}/jobs/${job.id}`,
    });
  }

  // 4. Follow up on significant unpaid balance
  if (outstandingTotal > 2000) {
    return ready({
      id: 'chase-balance',
      type: 'chase_balance',
      headline: `Collect ${formatMoney(outstandingTotal)} in open balances`,
      reason: 'Send friendly payment reminders or update cards on file to recover outstanding cash.',
      estimatedValue: outstandingTotal,
      actionLabel: 'Review invoices',
      actionHref: `${basePath}/jobs?owing=1`,
    });
  }

  // 5. Rebooking candidates
  if (rebookCount > 0) {
    return ready({
      id: 'rebook-candidates',
      type: 'rebook',
      headline: `Rebook ${rebookCount} past customer${rebookCount === 1 ? '' : 's'}`,
      reason: 'Past satisfied customers are ready for recurring or seasonal repeat maintenance.',
      estimatedValue: null,
      actionLabel: 'Reach out to customers',
      actionHref: `${basePath}/rebook`,
    });
  }

  return ready(null);
}
