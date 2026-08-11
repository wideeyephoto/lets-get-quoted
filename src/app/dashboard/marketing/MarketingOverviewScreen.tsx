import Link from 'next/link';
import { DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { shortDate } from '@/lib/marketing-status';
import type { PostCounts } from '@/lib/marketing-status';
import type { overviewSummary, PreparedRecommendation } from '@/lib/marketing-overview';
import type { CalendarView } from '@/lib/marketing-calendar-data';
import { stateName } from '@/lib/marketing-calendar';
import MarketingNav from './MarketingNav';

/**
 * Marketing's overview, given its numbers.
 *
 * Split out of page.tsx so the logged-out demo renders the same dashboard — see
 * the note on CampaignsScreen for why the demo no longer draws its own.
 *
 * The recommendation hrefs arrive built against /dashboard, because
 * lib/marketing-overview has no business knowing a demo exists. They are
 * re-pointed here, at the boundary, exactly as TopOpportunities does it.
 */

type UpcomingPost = { id: string; title: string; publishAt: string };

type Props = {
  view: CalendarView;
  mailingAddress: string | null;
  summary: ReturnType<typeof overviewSummary>;
  recommendations: PreparedRecommendation[];
  upcoming: UpcomingPost[];
  counts: PostCounts;
  /** False when the account has no website to post to at all. */
  hasBlog: boolean;
  rebookDue: number;
  basePath?: string;
  navOnly?: string[];
};

export default function MarketingOverviewScreen({
  view,
  mailingAddress,
  summary,
  recommendations,
  upcoming,
  counts,
  hasBlog,
  rebookDue,
  basePath = '/dashboard',
  navOnly,
}: Props) {
  const isDemo = basePath !== '/dashboard';
  // The demo's marketing area lives under /demo/marketing, so a straight prefix
  // swap is all that is needed; the app keeps its hrefs untouched.
  const at = (href: string) => (isDemo ? href.replace(/^\/dashboard/, basePath) : href);

  const tiles = [
    { key: 'attention', label: 'Needs attention', ...summary.attention, href: at('/dashboard/marketing/blog?status=draft') },
    { key: 'scheduled', label: 'Scheduled', ...summary.scheduled, href: at('/dashboard/marketing/blog?status=scheduled') },
    { key: 'published', label: 'Published this month', ...summary.published, href: at('/dashboard/marketing/blog?status=published') },
    { key: 'audience', label: 'Email audience', ...summary.audience, href: at('/dashboard/clients') },
  ];

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      <section className="workspace-hero panel marketing-hero mkt-overview-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing overview</p>
          <h1 className="workspace-title">Keep your pipeline moving</h1>
          <p className="workspace-lead">
            Marketing recommendations tailored to {view.businessName}
            {stateName(view.state) ? ` and ${stateName(view.state)}’s seasons` : ' and your local seasons'}.
          </p>
        </div>
        <div className="mkt-hero-action">
          <Link className="btn primary" href={at('/dashboard/marketing/campaigns')}>
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
            <Link href={at('/dashboard/settings')}>Add your mailing address →</Link>
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
            <Link href={at('/dashboard/marketing/campaigns#seasonal')} className="mkt-section-link">View plan</Link>
          </div>

          {recommendations.length === 0 ? (
            <p className="empty-state">
              Nothing seasonal to suggest right now. <Link href={at('/dashboard/marketing/campaigns#seasonal')}>See the year →</Link>
            </p>
          ) : (
            <ul className="mkt-rec-list">
              {recommendations.map((rec) => (
                <li key={rec.beatId} className="mkt-rec">
                  <p className="mkt-rec-head">
                    <span className="mkt-rec-window">{rec.windowLabel}</span>
                    {/* Text, not a color — the badge says what state it is in. */}
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
                        href={at(action.href)}
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
              <Link href={at('/dashboard/marketing/campaigns#seasonal')} className="mkt-section-link">Calendar</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="empty-state">
                Nothing scheduled. A post with a date on it publishes itself.
              </p>
            ) : (
              <ul className="mkt-coming-list">
                {upcoming.slice(0, 5).map((post) => (
                  <li key={post.id}>
                    <Link href={at(`/dashboard/marketing/blog/${post.id}`)} className="mkt-coming-row">
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
            {!hasBlog ? (
              <>
                <p className="mkt-blogsum-line">No website to post to yet.</p>
                <Link href={at('/dashboard/sites')} className="btn secondary">Set one up</Link>
              </>
            ) : (
              <>
                <p className="mkt-blogsum-line">
                  {counts.draft + counts.ready} {counts.draft + counts.ready === 1 ? 'draft' : 'drafts'} ·{' '}
                  {counts.published} published
                </p>
                <Link href={at('/dashboard/marketing/blog')} className="btn secondary">Manage blog</Link>
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
              <Link href={at('/dashboard/rebook')} className="btn secondary">Send booking links</Link>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
