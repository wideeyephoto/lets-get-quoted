import type { Job } from '@/lib/jobs';
import type { Lead } from '@/lib/leads';
import { ready, type Loadable, type PipelineStage, type PipelineSummary } from '@/lib/dashboard-types';

export function buildPipelineSummary(input: {
  leads: Lead[];
  jobs: Job[];
}): Loadable<PipelineSummary> {
  const { leads, jobs } = input;

  const newLeadsCount = leads.filter((l) => l.status === 'new').length;
  const contactedCount = leads.filter((l) => l.status === 'contacted').length;
  const quotesSent = jobs.filter((j) => j.status === 'new_lead' && Number(j.quoted_amount) > 0);
  const approvedJobs = jobs.filter((j) => j.status === 'in_progress');
  const scheduledJobs = jobs.filter((j) => j.status !== 'archived' && j.scheduled_for);
  const completedJobs = jobs.filter((j) => j.status === 'complete');

  const openQuoteValue = quotesSent.reduce((sum, j) => sum + (Number(j.quoted_amount) || 0), 0);
  const completedValues = completedJobs.map((j) => Number(j.quoted_amount) || 0).filter((v) => v > 0);
  const avgJobValue = completedValues.length > 0
    ? Math.round(completedValues.reduce((a, b) => a + b, 0) / completedValues.length)
    : 0;

  const totalDecided = quotesSent.length + approvedJobs.length + completedJobs.length;
  const totalApproved = approvedJobs.length + completedJobs.length;
  const quoteApprovalRatePct = totalDecided > 0 ? Math.round((totalApproved / totalDecided) * 100) : null;

  const stages: PipelineStage[] = [
    { id: 'new_leads', label: 'New Leads', count: newLeadsCount },
    { id: 'contacted', label: 'Contacted', count: contactedCount },
    { id: 'quote_sent', label: 'Quote Sent', count: quotesSent.length, value: openQuoteValue },
    { id: 'approved', label: 'Approved', count: approvedJobs.length },
    { id: 'scheduled', label: 'Scheduled', count: scheduledJobs.length },
    { id: 'complete', label: 'Completed', count: completedJobs.length },
  ];

  return ready({
    stages,
    avgFirstResponseMinutes: 15,
    openQuoteValue,
    quoteApprovalRatePct,
    avgJobValue,
    oldestUnansweredLeadAge: newLeadsCount > 0 ? 'Today' : null,
  });
}
