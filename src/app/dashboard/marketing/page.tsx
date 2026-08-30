import { requireOfficeContext } from '@/lib/auth';
import { listCampaigns, loadRecipients, loadSentBeats } from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { listRebookCandidates, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { countStates, needsAttention, postState, shortDate, todayKeyOf } from '@/lib/marketing-status';
import { overviewSummary, prepareRecommendations, type Recommendation } from '@/lib/marketing-overview';
import { buildCalendarView } from '@/lib/marketing-calendar-data';
import { listLeads } from '@/lib/leads';
import { listJobs } from '@/lib/jobs';
import { calculateCampaignRoi, type JobFinancialLookup } from '@/lib/campaign-roi';
import MarketingOverviewScreen from './MarketingOverviewScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing' };

export default async function MarketingPage() {
  const { supabase, accountId } = await requireOfficeContext('settings.write');
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
    leads,
    jobs,
    campaigns,
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
    listLeads(supabase, accountId),
    listJobs(supabase, accountId),
    listCampaigns(supabase, accountId),
  ]);

  const jobLookup: JobFinancialLookup = {};
  for (const job of jobs) {
    const isWon = job.status === 'in_progress' || job.status === 'complete' || job.status === 'archived';
    jobLookup[job.id] = { total: Number(job.quoted_amount) || 0, isWon };
  }

  const roiSummary = calculateCampaignRoi(leads, jobLookup);

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
      roiSummary={roiSummary}
      campaigns={campaigns}
    />
  );
}
