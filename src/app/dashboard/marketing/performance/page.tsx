import { requireOfficeContext } from '@/lib/auth';
import { listCampaigns } from '@/lib/campaigns';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { countStates, todayKeyOf } from '@/lib/marketing-status';
import { listLeads } from '@/lib/leads';
import { listJobs } from '@/lib/jobs';
import { calculateCampaignRoi, type JobFinancialLookup } from '@/lib/campaign-roi';
import PerformanceScreen from './PerformanceScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing performance & ROI' };

export default async function MarketingPerformancePage() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
  const today = todayKeyOf();

  const [campaigns, blogData, leads, jobs] = await Promise.all([
    listCampaigns(supabase, accountId),
    loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'),
    listLeads(supabase, accountId),
    listJobs(supabase, accountId),
  ]);

  const jobLookup: JobFinancialLookup = {};
  for (const job of jobs) {
    const isWon = job.status === 'in_progress' || job.status === 'complete' || job.status === 'archived';
    jobLookup[job.id] = { total: Number(job.quoted_amount) || 0, isWon };
  }

  const roiSummary = calculateCampaignRoi(leads, jobLookup);

  return (
    <PerformanceScreen
      campaigns={campaigns}
      counts={countStates(blogData?.posts ?? [], today)}
      roiSummary={roiSummary}
    />
  );
}

