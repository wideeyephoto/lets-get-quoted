import { requireOwnerContext } from '@/lib/auth';
import { loadRecipients } from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { listRebookCandidates, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { countStates, needsAttention, postState, shortDate, todayKeyOf } from '@/lib/marketing-status';
import { overviewSummary, prepareRecommendations, type Recommendation } from '@/lib/marketing-overview';
import { marketingCalendarAction, updateEmailThemeAction } from './actions';
import MarketingOverviewScreen from './MarketingOverviewScreen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Marketing' };

/**
 * Marketing, overview.
 *
 * This page used to be the whole of marketing: the seasonal calendar, the full
 * email composer, the send history and two summary tiles, stacked. The composer
 * alone is 336 lines of form, and it sat between the topics that suggest what to
 * write and the history of what had been written — so the page opened on a blank
 * form rather than on an answer to "what should I do today".
 *
 * The composer now lives at /campaigns and this is a dashboard: four figures,
 * what to do next, and what is already coming. The screen itself is in
 * MarketingOverviewScreen so the demo renders the same one.
 */
export default async function MarketingPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const today = todayKeyOf();

  const [view, recipients, { data: addressRow }, rebookCandidates, blogData, { data: emailSite }] = await Promise.all([
    marketingCalendarAction(4),
    loadRecipients(supabase, accountId),
    supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle(),
    listRebookCandidates(supabase, accountId, DEFAULT_REBOOK_DAYS),
    loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'),
    supabase
      .from('sites')
      .select('accent_override, logo_url, email_theme')
      .eq('account_id', accountId)
      .maybeSingle(),
  ]);

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
      mailingAddress={resolveMarketingMailingAddress(addressRow?.mailing_address as string | null)}
      summary={summary}
      recommendations={recommendations}
      upcoming={upcoming}
      counts={counts}
      hasBlog={Boolean(blogData)}
      rebookDue={rebookCandidates.filter((c) => (c.smsReady || c.hasEmail) && !c.invitedAt).length}
      emailTheme={{
        businessName: view.businessName,
        accent: (emailSite?.accent_override as string | null) ?? null,
        logoUrl: (emailSite?.logo_url as string | null) ?? null,
        currentTheme: (emailSite?.email_theme as string | null) ?? null,
        saveAction: updateEmailThemeAction,
      }}
    />
  );
}
