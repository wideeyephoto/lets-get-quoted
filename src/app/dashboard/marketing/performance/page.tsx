import { Suspense } from 'react';
import { createAdminClient, requireOfficeContext } from '@/lib/auth';
import {
  calculateCampaignRoi,
  loadMarketingAttributionData,
  type JobFinancialLookup,
} from '@/lib/campaign-roi';
import type { AdBudgetWalletState, AdSpendDailyEntry } from '@/lib/ad-billing-shared';
import { getGoogleLsaReportingSummary } from '@/lib/google-lsa/reporting';
import PerformanceScreen, {
  GoogleLsaPerformancePanel,
  GoogleLsaPanelSkeleton,
} from './PerformanceScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing performance & ROI' };

async function GoogleLsaReportingSection({ accountId }: { accountId: string }) {
  const admin = createAdminClient();
  const lsaSummary = await getGoogleLsaReportingSummary(admin, accountId).catch((error) => {
    console.error(
      `Google LSA performance reporting failed for account ${accountId}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  });
  return <GoogleLsaPerformancePanel summary={lsaSummary} />;
}

export default async function MarketingPerformancePage() {
  const { supabase, accountId } = await requireOfficeContext('marketing.read');
  const admin = createAdminClient();

  // Run lightweight, targeted queries in parallel
  const [
    { leads, jobs },
    { data: siteRow },
    { data: campaignRows },
    { data: merchandiseRows },
    { data: lsaSpendRows },
    { data: lsaConnectionRow },
  ] = await Promise.all([
    loadMarketingAttributionData(supabase, accountId),
    supabase
      .from('sites')
      .select('content')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase
      .from('campaigns')
      .select('id, channel, email_sent, sms_sent')
      .eq('account_id', accountId),
    supabase
      .from('merchandise_orders')
      .select('id, total_amount, status')
      .eq('account_id', accountId)
      .neq('status', 'cancelled')
      .neq('status', 'refunded'),
    admin
      .from('google_lsa_spend')
      .select('gross_cost_micros')
      .eq('account_id', accountId),
    admin
      .from('google_lsa_connections')
      .select('customer_id, disconnected_at')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

  const jobLookup: JobFinancialLookup = {};
  for (const job of jobs) {
    const isWon = job.status === 'in_progress' || job.status === 'complete';
    jobLookup[job.id] = { total: Number(job.quoted_amount) || 0, isWon };
  }

  const siteContent = siteRow?.content as Record<string, unknown> | null | undefined;
  const adWallet = (siteContent?.adCampaign as Partial<AdBudgetWalletState> | undefined) || {};
  const walletSpendDollars = (adWallet.totalSpendAllTimeCents ?? adWallet.spendThisMonthCents ?? 0) / 100;
  const dailySpendHistory = (adWallet.dailySpendHistory as AdSpendDailyEntry[] | undefined) || [];

  const lsaSpendDollars = (lsaSpendRows ?? []).reduce(
    (sum, r) => sum + (Number(r.gross_cost_micros) || 0) / 1_000_000,
    0,
  );

  const printSpendDollars = (merchandiseRows ?? []).reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0,
  );

  const smsSentCount = (campaignRows ?? []).reduce(
    (sum, c) => sum + (Number(c.sms_sent) || 0),
    0,
  );

  const hasActiveCampaigns = (campaignRows ?? []).some(
    (c) => (Number(c.email_sent) || 0) > 0 || (Number(c.sms_sent) || 0) > 0,
  );

  const blogPosts = ((siteContent?.blog as Record<string, unknown> | null | undefined)?.posts as Array<{ status?: string }> | undefined) || [];
  const publishedBlogCount = blogPosts.filter((p) => p.status === 'published').length;

  const hasLsaConnection = Boolean(lsaConnectionRow?.customer_id && !lsaConnectionRow?.disconnected_at);

  const totalAdSpend = walletSpendDollars + lsaSpendDollars;
  const roiSummary = calculateCampaignRoi(leads, jobLookup, { actualAdSpend: totalAdSpend });

  return (
    <PerformanceScreen
      leads={leads}
      jobs={jobs}
      roiSummary={roiSummary}
      walletSpendDollars={walletSpendDollars}
      dailySpendHistory={dailySpendHistory}
      lsaSpendDollars={lsaSpendDollars}
      printSpendDollars={printSpendDollars}
      smsSentCount={smsSentCount}
      hasActiveCampaigns={hasActiveCampaigns}
      publishedBlogCount={publishedBlogCount}
      hasLsaConnection={hasLsaConnection}
      lsaSlot={
        <Suspense fallback={<GoogleLsaPanelSkeleton />}>
          <GoogleLsaReportingSection accountId={accountId} />
        </Suspense>
      }
    />
  );
}

