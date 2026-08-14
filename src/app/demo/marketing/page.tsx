import { loadRecipients } from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { listRebookCandidates, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { countStates, needsAttention, postState, shortDate, todayKeyOf } from '@/lib/marketing-status';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { overviewSummary, prepareRecommendations, type Recommendation } from '@/lib/marketing-overview';
import { buildCalendarView } from '@/lib/marketing-calendar-data';
import { DEMO_ACCOUNT_ID, DEMO_SITE_HOST } from '@/lib/demo-data';
import { DEMO_ACCOUNT_ROW, DEMO_SITE_ROW, demoSupabase } from '@/lib/demo-rows';
import MarketingOverviewScreen from '@/app/dashboard/marketing/MarketingOverviewScreen';

export const metadata = { title: 'Marketing — Live Demo' };

/**
 * Marketing's overview, for a logged-out visitor.
 *
 * The seasonal calendar is real: buildCalendarView reads the demo's own service
 * area, derives a Michigan climate zone from it, and plans the topics that fit
 * a lawn-and-landscape trade in the months ahead. So the recommendations a
 * prospect reads are produced by the same planner an owner's are, against a
 * plausible business, rather than being three sentences somebody typed once.
 *
 * The blog side is honestly empty — the demo account has a website but no posts
 * seeded — and the panels say so in their own words.
 */
export default async function DemoMarketingPage() {
  const today = todayKeyOf();

  const [view, recipients, rebookCandidates, blogData] = await Promise.all([
    buildCalendarView(demoSupabase, DEMO_ACCOUNT_ID, 4),
    loadRecipients(demoSupabase, DEMO_ACCOUNT_ID),
    listRebookCandidates(demoSupabase, DEMO_ACCOUNT_ID, DEFAULT_REBOOK_DAYS),
    loadBlogWorkspace(demoSupabase, DEMO_ACCOUNT_ID, DEMO_SITE_HOST.split('.').slice(1).join('.')),
  ]);

  // Derived exactly as the real page derives them, off the same seeded posts the
  // Blog section shows — so the overview's tiles and the blog list cannot
  // disagree about how many drafts there are.
  const posts = blogData?.posts ?? [];
  const counts = countStates(posts, today);
  const attention = needsAttention(posts, today);
  const upcoming = posts
    .filter((post) => postState(post, today) === 'scheduled')
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt));

  const monthPrefix = today.slice(0, 7);
  const summary = overviewSummary({
    drafts: attention.drafts,
    overdue: attention.overdue,
    scheduledCount: counts.scheduled,
    nextScheduledLabel: upcoming[0] ? shortDate(upcoming[0].publishAt) : null,
    publishedThisMonth: posts.filter((post) => post.status === 'published' && post.date.startsWith(monthPrefix)).length,
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
      mailingAddress={resolveMarketingMailingAddress((DEMO_ACCOUNT_ROW.mailing_address as string | null) ?? null)}
      summary={summary}
      recommendations={recommendations}
      upcoming={upcoming}
      counts={counts}
      hasBlog={Boolean(blogData)}
      rebookDue={rebookCandidates.filter((c) => (c.smsReady || c.hasEmail) && !c.invitedAt).length}
      emailTheme={{
        businessName: view.businessName,
        accent: (DEMO_SITE_ROW.accent_override as string | null) ?? null,
        logoUrl: (DEMO_SITE_ROW.logo_url as string | null) ?? null,
        currentTheme: (DEMO_SITE_ROW.email_theme as string | null) ?? null,
      }}
      basePath="/demo"
    />
  );
}
