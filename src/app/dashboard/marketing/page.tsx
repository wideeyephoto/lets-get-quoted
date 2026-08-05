import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { loadRecipients } from '@/lib/campaigns';
import { resolveMarketingMailingAddress } from '@/lib/email-suppression';
import { loadBlogWorkspace } from '@/lib/site-blog';
import { listRebookCandidates, DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import {
  countStates, needsAttention, postState, shortDate, todayKeyOf,
} from '@/lib/marketing-status';
import { overviewSummary, prepareRecommendations, type Recommendation } from '@/lib/marketing-overview';
import { marketingCalendarAction } from './actions';
import MarketingNav from './MarketingNav';

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
 * what to do next, and what is already coming.
 */
export default async function MarketingPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const today = todayKeyOf();

  const [view, recipients, { data: addressRow }, rebookCandidates, blogData] = await Promise.all([
    marketingCalendarAction(4),
    loadRecipients(supabase, accountId),
    supabase.from('accounts').select('mailing_address').eq('id', accountId).maybeSingle(),
    listRebookCandidates(supabase, accountId, DEFAULT_REBOOK_DAYS),
    loadBlogWorkspace(supabase, accountId, process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'),
  ]);

  const mailingAddress = resolveMarketingMailingAddress(addressRow?.mailing_address as string | null);
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

  const emailReachable = recipients.filter((recipient) => recipient.emailReady).length;

  const summary = overviewSummary({
    drafts: attention.drafts,
    overdue: attention.overdue,
    scheduledCount: counts.scheduled,
    nextScheduledLabel: upcoming[0] ? shortDate(upcoming[0].publishAt) : null,
    publishedThisMonth,
    emailReachable,
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

  const rebookDue = rebookCandidates.filter(
    (candidate) => (candidate.smsReady || candidate.hasEmail) && !candidate.invitedAt,
  ).length;

  const tiles = [
    { key: 'attention', label: 'Needs attention', ...summary.attention, href: '/dashboard/marketing/blog?status=draft' },
    { key: 'scheduled', label: 'Scheduled', ...summary.scheduled, href: '/dashboard/marketing/blog?status=scheduled' },
    { key: 'published', label: 'Published this month', ...summary.published, href: '/dashboard/marketing/blog?status=published' },
    { key: 'audience', label: 'Email audience', ...summary.audience, href: '/dashboard/clients' },
  ];

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <section className="workspace-hero panel marketing-hero mkt-overview-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing overview</p>
          <h1 className="workspace-title">Keep your pipeline moving</h1>
          <p className="workspace-lead">
            Your next best marketing actions, timed to {view.businessName}
            {view.state ? ` and ${view.state} weather` : ' and your local weather'}.
          </p>
        </div>
        <div className="mkt-hero-action">
          <Link className="btn primary" href="/dashboard/marketing/campaigns">
            Create email campaign
          </Link>
        </div>
      </section>

      {/* Said before they write, not thrown as an error after the work is done. */}
      {!mailingAddress ? (
        <section className="panel workspace-section-card flash-banner flash-warn">
          <p>
            Marketing email needs a physical postal address by law, and you don&apos;t have one on file — anything
            you write can&apos;t be emailed until you add it.{' '}
            <Link href="/dashboard/settings">Add your mailing address →</Link>
          </p>
        </section>
      ) : null}

      <div className="mkt-tiles">
        {tiles.map((tile) => (
          <Link key={tile.key} href={tile.href} className="panel mkt-tile">
            <span className="mkt-tile-label">{tile.label}</span>
            <strong className="mkt-tile-value">{tile.value}</strong>
            <span className="mkt-tile-note">{tile.note}</span>
          </Link>
        ))}
      </div>

      <div className="mkt-overview-grid">
        <section className="panel workspace-section-card mkt-recommend">
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <h2>Recommended next actions</h2>
            <Link href="/dashboard/marketing/calendar" className="mkt-section-link">View plan</Link>
          </div>

          {recommendations.length === 0 ? (
            <p className="empty-state">
              Nothing seasonal to suggest right now. <Link href="/dashboard/marketing/calendar">See the year →</Link>
            </p>
          ) : (
            <ul className="mkt-rec-list">
              {recommendations.map((rec) => (
                <li key={rec.beatId} className="mkt-rec">
                  <p className="mkt-rec-head">
                    <span className="mkt-rec-window">{rec.windowLabel}</span>
                    {/* Text, not a colour — the badge says what state it is in. */}
                    {rec.badge ? <span className="mkt-rec-badge">{rec.badge}</span> : null}
                    <span className="mkt-rec-title">{rec.title}</span>
                  </p>
                  <p className="mkt-rec-why">
                    {rec.postedId
                      ? 'Your blog draft is ready. Finish it, then turn it into a customer email.'
                      : rec.whyNow}
                    {rec.reach != null && rec.reach > 0 && !rec.postedId ? (
                      <> {rec.reach} {rec.reach === 1 ? 'customer is' : 'customers are'} reachable by email.</>
                    ) : null}
                  </p>
                  <div className="mkt-rec-actions">
                    {rec.actions.map((action) => (
                      <Link
                        key={action.label}
                        href={action.href}
                        className={`btn ${action.primary ? 'primary' : 'secondary'}`}
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mkt-side">
          <section className="panel workspace-section-card mkt-coming">
            <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
              <h2>Coming up</h2>
              <Link href="/dashboard/marketing/calendar" className="mkt-section-link">Calendar</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="empty-state">
                Nothing scheduled. A post with a date on it publishes itself.
              </p>
            ) : (
              <ul className="mkt-coming-list">
                {upcoming.slice(0, 5).map((post) => (
                  <li key={post.id}>
                    <Link href={`/dashboard/marketing/blog/${post.id}`} className="mkt-coming-row">
                      <span className="mkt-coming-date">{shortDate(post.publishAt)}</span>
                      <span className="mkt-coming-copy">
                        <strong>{post.title.trim() || 'Untitled post'}</strong>
                        <small>Scheduled</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel workspace-section-card mkt-blogsum">
            <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
              <h2>Blog</h2>
            </div>
            {!blogData ? (
              <>
                <p className="mkt-blogsum-line">No website to post to yet.</p>
                <Link href="/dashboard/sites" className="btn secondary">Set one up</Link>
              </>
            ) : (
              <>
                <p className="mkt-blogsum-line">
                  {counts.draft + counts.ready} {counts.draft + counts.ready === 1 ? 'draft' : 'drafts'} ·{' '}
                  {counts.published} published
                </p>
                <Link href="/dashboard/marketing/blog" className="btn secondary">Manage blog</Link>
              </>
            )}
          </section>

          {rebookDue > 0 ? (
            <section className="panel workspace-section-card mkt-blogsum">
              <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
                <h2>Book again</h2>
              </div>
              <p className="mkt-blogsum-line">
                {rebookDue} past {rebookDue === 1 ? 'customer' : 'customers'} {DEFAULT_REBOOK_DAYS}+ days quiet,
                not yet asked.
              </p>
              <Link href="/dashboard/rebook" className="btn secondary">Send booking links</Link>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
