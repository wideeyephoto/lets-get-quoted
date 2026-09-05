import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import { listCampaigns } from '@/lib/campaigns';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { countStates, todayKeyOf } from '@/lib/marketing-status';
import {
  calculateCampaignRoi,
  loadMarketingAttributionData,
  type JobFinancialLookup,
} from '@/lib/campaign-roi';
import type { AdBudgetWalletState } from '@/lib/ad-billing-shared';
import { getGoogleLsaReportingSummary } from '@/lib/google-lsa/reporting';
import PerformanceScreen from './PerformanceScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing performance & ROI' };

export default async function MarketingPerformancePage() {
  const { supabase, accountId } = await requireOfficeContext('marketing.read');
  const admin = createAdminClient();
  const today = todayKeyOf();

  const [campaigns, blogData, { leads, jobs }, { data: siteRow }, lsaSummary] = await Promise.all([
    listCampaigns(supabase, accountId),
    loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'),
    loadMarketingAttributionData(supabase, accountId),
    supabase
      .from('sites')
      .select('content')
      .eq('account_id', accountId)
      .maybeSingle(),
    getGoogleLsaReportingSummary(admin, accountId).catch((error) => {
      console.error(
        `Google LSA performance reporting failed for account ${accountId}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }),
  ]);

  const jobLookup: JobFinancialLookup = {};
  for (const job of jobs) {
    const isWon = job.status === 'in_progress' || job.status === 'complete';
    jobLookup[job.id] = { total: Number(job.quoted_amount) || 0, isWon };
  }

  const adWallet = ((siteRow?.content as Record<string, unknown> | null | undefined)?.adCampaign as Partial<AdBudgetWalletState> | undefined) || {};
  const walletSpendDollars = (adWallet.totalSpendAllTimeCents ?? adWallet.spendThisMonthCents ?? 0) / 100;
  const lsaSpendDollars = lsaSummary?.costDollars ?? 0;
  const totalAdSpend = walletSpendDollars + lsaSpendDollars;

  const roiSummary = calculateCampaignRoi(leads, jobLookup, { actualAdSpend: totalAdSpend });

  return (
    <PerformanceScreen
      campaigns={campaigns}
      counts={countStates(blogData?.posts ?? [], today)}
      roiSummary={roiSummary}
      lsaSummary={lsaSummary}
    />
  );
}

