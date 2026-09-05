import { requireOfficeContext } from '@/lib/auth';
import { listCampaigns, loadRecipients, loadSentBeats } from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { listRebookCandidates, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { countStates, needsAttention, postState, shortDate, todayKeyOf } from '@/lib/marketing-status';
import { overviewSummary, prepareRecommendations, type Recommendation } from '@/lib/marketing-overview';
import { buildCalendarView } from '@/lib/marketing-calendar-data';
import {
  calculateCampaignRoi,
  loadMarketingAttributionData,
  type JobFinancialLookup,
} from '@/lib/campaign-roi';
import type { AdBudgetWalletState } from '@/lib/ad-billing-shared';
import MarketingOverviewScreen from './MarketingOverviewScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing' };

export default async function MarketingPage() {
  const { supabase, accountId } = await requireOfficeContext('marketing.read');
  const today = todayKeyOf();

  const [
    recipients,
    { data: accountRow },
    rebookCandidates,
    blogData,
    { data: siteRow },
    { data: serviceRows },
    sentBeats,
    { data: userData },
    { leads, jobs },
    campaigns,
    { count: sentCampaignsCount },
  ] = await Promise.all([
    loadRecipients(supabase, accountId),
    supabase.from('accounts').select('business_name, mailing_address, reply_to_email').eq('id', accountId).maybeSingle(),
    listRebookCandidates(supabase, accountId, DEFAULT_REBOOK_DAYS),
    loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'),
    supabase
      .from('sites')
      .select('company_name, content, service_area, email_theme')
      .eq('account_id', accountId)
      .maybeSingle(),
    supabase.from('services').select('name').eq('account_id', accountId).eq('active', true),
    loadSentBeats(supabase, accountId),
    supabase.auth.getUser(),
    loadMarketingAttributionData(supabase, accountId),
    listCampaigns(supabase, accountId),
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .or('email_sent.gt.0,sms_sent.gt.0'),
  ]);

  const adWallet = ((siteRow?.content as Record<string, unknown> | null | undefined)?.adCampaign as Partial<AdBudgetWalletState> | undefined) || {};
  const spendThisMonthDollars = (adWallet.spendThisMonthCents ?? 0) / 100;

  const now = new Date();
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoKey = thirtyDaysAgoIso.slice(0, 10);
  const currentMonthPrefix = today.slice(0, 7);

  let spendLast30dDollars = spendThisMonthDollars;
  if (Array.isArray(adWallet.dailySpendHistory) && adWallet.dailySpendHistory.length > 0) {
    const recentSpendCents = adWallet.dailySpendHistory
      .filter((entry) => entry.date >= thirtyDaysAgoKey)
      .reduce((sum, entry) => sum + (entry.spendCents || 0), 0);
    spendLast30dDollars = recentSpendCents / 100;
  }

  const jobLookupMonth: JobFinancialLookup = {};
  const jobLookup30d: JobFinancialLookup = {};

  for (const job of jobs) {
    const isWon = job.status === 'in_progress' || job.status === 'complete';
    const total = Number(job.quoted_amount) || 0;
    const createdAt = job.created_at || '';
    if (createdAt.startsWith(currentMonthPrefix)) {
      jobLookupMonth[job.id] = { total, isWon };
    }
    if (createdAt >= thirtyDaysAgoIso) {
      jobLookup30d[job.id] = { total, isWon };
    }
  }

  const leadsMonth = leads.filter((l) => (l.created_at || '').startsWith(currentMonthPrefix));
  const leads30d = leads.filter((l) => (l.created_at || '') >= thirtyDaysAgoIso);

  const roiSummaryMonth = calculateCampaignRoi(leadsMonth, jobLookupMonth, { actualAdSpend: spendThisMonthDollars });
  const roiSummary30d = calculateCampaignRoi(leads30d, jobLookup30d, { actualAdSpend: spendLast30dDollars });

  const replyEmailReady = Boolean(
    ((accountRow?.reply_to_email as string | null) ?? '').trim() ||
    ((userData?.user?.email as string | null) ?? '').trim()
  );

  const serviceNames = (serviceRows ?? []).map((row) => String((row as { name?: unknown }).name ?? ''));
  const view = await buildCalendarView(supabase, accountId, 4, {
    recipients,
    sentBeats,
    serviceNames,
    account: accountRow,
    site: siteRow,
  });

  const posts = blogData?.posts ?? [];
  const counts = countStates(posts, today);
  const attention = needsAttention(posts, today);

  // Scheduled posts, soonest first — the "Coming up" rail and the tile read the
  // same list, so they cannot disagree about what is next.
  const upcoming = posts
    .filter((post) => postState(post, today) === 'scheduled')
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));

  const monthPrefix = today.slice(0, 7);
  const publishedThisMonth = posts.filter(
    (post) => post.status === 'published' && post.date.startsWith(monthPrefix),
  ).length;

  const summary = overviewSummary({
    drafts: attention.drafts,
    overdue: attention.overdue,
    scheduledCount: counts.scheduled,
    nextScheduledLabel: upcoming[0] ? shortDate(upcoming[0].publishAt) : null,
    publishedThisMonth,
    emailReachable: recipients.filter((recipient) => recipient.emailReady).length,
  });

  const recommendations = prepareRecommendations(
    view.planned.map<Recommendation>((beat) => ({
      beatId: beat.beatId,
      title: beat.title,
      whyNow: beat.whyNow,
      windowLabel: beat.monthName,
      channels: beat.channels,
      reach: beat.reach,
      sentAt: beat.sentAt,
      postedId: beat.postedId,
      postedTitle: beat.postedTitle,
    })),
  );

  return (
    <MarketingOverviewScreen
      view={view}
      mailingAddress={resolveMarketingMailingAddress((accountRow?.mailing_address as string | null) ?? null)}
      replyEmailReady={replyEmailReady}
      summary={summary}
      recommendations={recommendations}
      upcoming={upcoming}
      counts={counts}
      hasBlog={Boolean(blogData)}
      rebookDue={rebookCandidates.filter((c) => (c.smsReady || c.hasEmail) && !c.invitedAt).length}
      emailTheme={{
        currentTheme: (siteRow?.email_theme as string | null) ?? null,
      }}
      roiSummary={roiSummaryMonth}
      roiSummaryByRange={{ month: roiSummaryMonth, '30d': roiSummary30d }}
      sentCampaignsCount={sentCampaignsCount ?? undefined}
      campaigns={campaigns}
    />
  );
}
