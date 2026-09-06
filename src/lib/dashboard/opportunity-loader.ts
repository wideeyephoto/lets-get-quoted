import { formatMoney, type Job } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';
import { ready, type BestOpportunity, type Loadable } from '@/lib/dashboard-types';

export function findOpportunities(input: {
  jobs: Job[];
  leads: Lead[];
  outstandingTotal: number;
  rebookCount: number;
  basePath?: string;
}): Loadable<BestOpportunity[]> {
  const { jobs, leads, outstandingTotal, rebookCount, basePath = '/dashboard' } = input;
  const list: BestOpportunity[] = [];

  // 1. High value quotes awaiting approval (>= $1,000)
  const openQuotes = jobs
    .filter((j) => j.status === 'new_lead' && Number(j.quoted_amount) > 0)
    .sort((a, b) => (Number(b.quoted_amount) || 0) - (Number(a.quoted_amount) || 0));

  const highValueQuotes = openQuotes.filter((q) => Number(q.quoted_amount) >= 1000);
  for (const quote of highValueQuotes.slice(0, 3)) {
    const val = Number(quote.quoted_amount);
    list.push({
      id: `quote-${quote.id}`,
      type: 'viewed_quote',
      headline: `Follow up on ${quote.client_name || 'customer'} proposal`,
      reason: `This ${formatMoney(val)} quote is awaiting customer approval. A quick check-in can close the deal.`,
      estimatedValue: val,
      actionLabel: 'Follow up on quote',
      actionHref: `${basePath}/jobs/${quote.id}`,
      badgeLabel: 'Recommended Next Step',
    });
  }

  // 2. High value leads needing reply
  const newLeads = leads
    .filter((l) => l.status === 'new')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  for (const lead of newLeads.slice(0, 3)) {
    list.push({
      id: `lead-${lead.id}`,
      type: 'high_value_lead',
      headline: `Respond to new inquiry from ${lead.name}`,
      reason: 'Prompt first responses close over 70% more contractor bids than delayed replies.',
      estimatedValue: null,
      actionLabel: 'Respond to lead',
      actionHref: `${basePath}/leads/${lead.id}`,
      badgeLabel: 'Recommended Next Step',
    });
  }

  // 3. Additional open quotes under $1,000 (up to 2)
  const otherQuotes = openQuotes.filter((q) => Number(q.quoted_amount) < 1000);
  for (const quote of otherQuotes.slice(0, 2)) {
    const val = Number(quote.quoted_amount);
    list.push({
      id: `quote-${quote.id}`,
      type: 'viewed_quote',
      headline: `Follow up on ${quote.client_name || 'customer'} proposal`,
      reason: `This ${formatMoney(val)} quote is awaiting customer approval. A quick check-in can close the deal.`,
      estimatedValue: val,
      actionLabel: 'Follow up on quote',
      actionHref: `${basePath}/jobs/${quote.id}`,
      badgeLabel: 'Recommended Next Step',
    });
  }

  // 4. Approved jobs needing scheduling
  const unscheduledApproved = jobs.filter((j) => j.status === 'in_progress' && !j.scheduled_for);
  for (const job of unscheduledApproved.slice(0, 2)) {
    list.push({
      id: `sched-${job.id}`,
      type: 'schedule_approved',
      headline: `Schedule approved job for ${job.client_name}`,
      reason: 'This job is already approved and ready to be placed on the operational calendar.',
      estimatedValue: Number(job.quoted_amount) || null,
      actionLabel: 'Schedule job',
      actionHref: `${basePath}/jobs/${job.id}`,
      badgeLabel: 'Recommended Next Step',
    });
  }

  // 5. Follow up on significant unpaid balance
  if (outstandingTotal > 2000) {
    list.push({
      id: 'chase-balance',
      type: 'chase_balance',
      headline: `Collect ${formatMoney(outstandingTotal)} in open balances`,
      reason: 'Send friendly payment reminders or update cards on file to recover outstanding cash.',
      estimatedValue: outstandingTotal,
      actionLabel: 'Review invoices',
      actionHref: `${basePath}/jobs?owing=1`,
      badgeLabel: 'Recommended Next Step',
    });
  }

  // 6. Rebooking candidates
  if (rebookCount > 0) {
    list.push({
      id: 'rebook-candidates',
      type: 'rebook',
      headline: `Rebook ${rebookCount} past customer${rebookCount === 1 ? '' : 's'}`,
      reason: 'Past satisfied customers are ready for recurring or seasonal repeat maintenance.',
      estimatedValue: null,
      actionLabel: 'Reach out to customers',
      actionHref: `${basePath}/rebook`,
      badgeLabel: 'Recommended Next Step',
    });
  }

  // Cap at 6 total prioritized opportunities
  return ready(list.slice(0, 6));
}

export function findBestOpportunity(input: {
  jobs: Job[];
  leads: Lead[];
  outstandingTotal: number;
  rebookCount: number;
  basePath?: string;
}): Loadable<BestOpportunity | null> {
  const opps = findOpportunities(input);
  if (opps.kind !== 'ready' || opps.data.length === 0) {
    return ready(null);
  }
  return ready(opps.data[0]);
}
