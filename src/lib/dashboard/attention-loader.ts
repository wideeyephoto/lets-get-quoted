import { formatMoney } from '@/lib/jobs';
import { leadNeedsYouBreakdown, type leadSummary } from '@/lib/lead-summary';
import { schedulingIssueBreakdown, type collectSchedulingIssues } from '@/lib/scheduling-issues';
import { ready, type Loadable, type PriorityItem, type PriorityQueueSummary } from '@/lib/dashboard-types';

export function buildPriorityQueue(input: {
  leadStats: ReturnType<typeof leadSummary>;
  schedulingIssues: ReturnType<typeof collectSchedulingIssues>;
  schedulingIssueCount: number;
  stuckScheduleCount: number;
  outstanding: { total: number; count: number };
  openQuotes: { total: number; count: number };
  followupsOn: boolean;
  jobsNeedingInfoCount?: number;
  unreviewedFieldIntakeCount?: number;
  basePath?: string;
}): Loadable<PriorityQueueSummary> {
  const {
    leadStats,
    schedulingIssues,
    schedulingIssueCount,
    stuckScheduleCount,
    outstanding,
    openQuotes,
    followupsOn,
    jobsNeedingInfoCount = 0,
    unreviewedFieldIntakeCount = 0,
    basePath = '/dashboard',
  } = input;

  const needsAttention: PriorityItem[] = [];
  const waitingOnCustomer: PriorityItem[] = [];

  // 1. Leads needing response
  if (leadStats.needsYou > 0) {
    needsAttention.push({
      key: 'leads',
      label: `${leadStats.needsYou} lead follow-up${leadStats.needsYou === 1 ? '' : 's'}`,
      detail: leadNeedsYouBreakdown(leadStats),
      href: `${basePath}/leads`,
      cta: 'Review leads',
    });
  }

  // 2. Scheduling issues (Deduplicated union)
  if (schedulingIssueCount > 0) {
    needsAttention.push({
      key: 'scheduling',
      label: `${schedulingIssueCount} scheduling issue${schedulingIssueCount === 1 ? '' : 's'}`,
      detail: schedulingIssueBreakdown(schedulingIssues) ?? undefined,
      href: `${basePath}/schedule#unscheduled-jobs`,
      cta: 'Open schedule',
    });
  }

  // 3. Customer requested new dates
  if (stuckScheduleCount > 0) {
    needsAttention.push({
      key: 'schedule-response',
      label: `${stuckScheduleCount} client${stuckScheduleCount === 1 ? '' : 's'} requested new dates`,
      detail: 'They passed on previously offered times — send alternative dates.',
      href: `${basePath}/schedule#unscheduled-jobs`,
      cta: 'Send dates',
    });
  }

  // 4. Unpaid invoices
  if (outstanding.count > 0) {
    needsAttention.push({
      key: 'unpaid',
      label: `${formatMoney(outstanding.total)} in unpaid invoices`,
      detail: `${outstanding.count} invoice${outstanding.count === 1 ? '' : 's'} still owed, net of deposits and partial payments.`,
      amount: outstanding.total,
      href: `${basePath}/jobs?owing=1`,
      cta: 'Chase payment',
    });
  }

  // 5. Jobs missing critical information
  if (jobsNeedingInfoCount > 0) {
    needsAttention.push({
      key: 'jobs-needing-info',
      label: `${jobsNeedingInfoCount} job${jobsNeedingInfoCount === 1 ? '' : 's'} missing critical details`,
      detail: 'Missing site address, customer phone/email, or pricing before work or invoices can proceed.',
      href: `${basePath}/jobs`,
      cta: 'Complete job details',
    });
  }

  // 6. Field intake dictated from the truck needing office verification
  if (unreviewedFieldIntakeCount > 0) {
    needsAttention.push({
      key: 'field-intake-review',
      label: `${unreviewedFieldIntakeCount} field item${unreviewedFieldIntakeCount === 1 ? '' : 's'} dictated from the truck`,
      detail: 'Recent voice memos or change orders received via Text-to-Job ready for office verification.',
      href: `${basePath}/text-to-job`,
      cta: 'Verify field intake',
    });
  }

  // 5. Quotes out with customer (Waiting on customer)
  if (openQuotes.count > 0) {
    waitingOnCustomer.push({
      key: 'quoted',
      label: `${openQuotes.count} quote${openQuotes.count === 1 ? '' : 's'} awaiting customer approval`,
      detail: `${formatMoney(openQuotes.total)} total proposal value. ${
        followupsOn ? 'Automatic SMS follow-ups are active.' : 'Automatic follow-ups are off — follow up manually.'
      }`,
      amount: openQuotes.total,
      href: `${basePath}/jobs`,
      cta: 'Review quotes',
    });
  }

  return ready({
    needsAttention,
    waitingOnCustomer,
    totalAttentionCount: needsAttention.length,
    totalWaitingCount: waitingOnCustomer.length,
  });
}
