import Link from 'next/link';
import { EMAIL_THEMES, normalizeEmailTheme } from '@/emails/brand';
import { DEFAULT_REBOOK_DAYS } from '@/lib/rebook';
import { shortDate } from '@/lib/marketing-status';
import type { PostCounts } from '@/lib/marketing-status';
import {
  chooseOverviewPriority,
  type overviewSummary,
  type PreparedRecommendation,
} from '@/lib/marketing-overview';
import type { CalendarView } from '@/lib/marketing-calendar-data';
import { stateName } from '@/lib/marketing-calendar';
import type { OverallRoiSummary } from '@/lib/campaign-roi';
import MarketingNav from './MarketingNav';

/**
 * Marketing's overview, given its numbers.
 *
 * Split out of page.tsx so the logged-out demo renders the same dashboard. The
 * screen deliberately answers one question first: "what should I do now?" The
 * answer changes with setup, audience, unfinished work, and seasonal context.
 */

type UpcomingPost = { id: string; title: string; publishAt: string };

type Props = {
  view: CalendarView;
  mailingAddress: string | null;
  replyEmailReady?: boolean;
  summary: ReturnType<typeof overviewSummary>;
  recommendations: PreparedRecommendation[];
  upcoming: UpcomingPost[];
  counts: PostCounts;
  /** False when the account has no website to post to at all. */
  hasBlog: boolean;
  rebookDue: number;
  emailTheme: { currentTheme: string | null };
  roiSummary?: OverallRoiSummary;
  basePath?: string;
  navOnly?: string[];
};

export default function MarketingOverviewScreen({
  view,
  mailingAddress,
  replyEmailReady = true,
  summary,
  recommendations,
  upcoming,
  counts,
  hasBlog,
  rebookDue,
  emailTheme,
  roiSummary,
  basePath = '/dashboard',
  navOnly,
}: Props) {
  const isDemo = basePath !== '/dashboard';
  // The demo's marketing area lives under /demo/marketing, so a straight prefix
  // swap is all that is needed; the app keeps its hrefs untouched.
  const at = (href: string) => (isDemo ? href.replace(/^\/dashboard/, basePath) : href);

  const priority = chooseOverviewPriority({
    mailingAddressReady: Boolean(mailingAddress),
    replyEmailReady,
    emailReachable: summary.audience.value,
    attentionCount: summary.attention.value,
    rebookDue,
    recommendation: recommendations[0] ?? null,
    hasBlog,
  });

  const pipeline = [
    {
      key: 'draft',
      label: 'Drafts',
      value: counts.draft,
      note: counts.draft === 1 ? 'Post in progress' : 'Posts in progress',
      href: at('/dashboard/marketing/blog?status=draft'),
    },
    {
      key: 'ready',
      label: 'Ready',
      value: counts.ready,
      note: 'Ready to schedule',
      href: at('/dashboard/marketing/blog?status=ready'),
    },
    {
      key: 'scheduled',
      label: 'Scheduled',
      value: counts.scheduled,
      note: summary.scheduled.note,
      href: at('/dashboard/marketing/blog?status=scheduled'),
    },
    {
      key: 'published',
      label: 'Published',
      value: counts.published,
      note: `${summary.published.value} this month`,
      href: at('/dashboard/marketing/blog?status=published'),
    },
  ];

  const selectedThemeId = normalizeEmailTheme(emailTheme.currentTheme);
  const selectedTheme = EMAIL_THEMES.find((theme) => theme.id === selectedThemeId) ?? EMAIL_THEMES[0];
  const emailThemeHref = isDemo ? '/demo/email-themes' : '/dashboard/marketing/email-theme';

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      <section className="workspace-hero panel marketing-hero mkt-overview-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing overview</p>
          <h1 className="workspace-title">Turn ideas into booked work</h1>
          <p className="workspace-lead">
            A clear next step for {view.businessName}
            {stateName(view.state) ? `, shaped around ${stateName(view.state)}’s seasons` : ' and your local seasons'}.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card mkt-priority" aria-labelledby="mkt-priority-title">
        <div className="mkt-priority-copy">
          <p className="eyebrow">Next best action</p>
          <h2 id="mkt-priority-title">{priority.title}</h2>
          <p>{priority.description}</p>
          <div className="mkt-priority-actions">
            <Link className="btn primary" href={at(priority.primary.href)}>
              {priority.primary.label}
            </Link>
            {priority.secondary ? (
              <Link className="btn secondary" href={at(priority.secondary.href)}>
                {priority.secondary.label}
              </Link>
            ) : null}
          </div>
        </div>
        <div className="mkt-priority-metric" aria-label={`${priority.metricLabel}: ${priority.metricValue}, ${priority.metricNote}`}>
          <span>{priority.metricLabel}</span>
          <strong>{priority.metricValue}</strong>
          <small>{priority.metricNote}</small>
        </div>
      </section>

      <section className="mkt-pipeline-section" aria-labelledby="mkt-pipeline-title">
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Content pipeline</p>
            <h2 id="mkt-pipeline-title">Move work toward published</h2>
          </div>
          <Link href={at('/dashboard/marketing/blog')} className="mkt-section-link">Manage blog</Link>
        </div>
        <div className="mkt-pipeline-tiles">
          {pipeline.map((stage) => (
            <Link key={stage.key} href={stage.href} className="panel mkt-tile">
              <span className="mkt-tile-label">{stage.label}</span>
              <strong className="mkt-tile-value">{stage.value}</strong>
              <span className="mkt-tile-note">{stage.note}</span>
            </Link>
          ))}
        </div>
        {!hasBlog ? (
          <p className="mkt-pipeline-note">
            There is no website to publish to yet. <Link href={at('/dashboard/sites')}>Set one up →</Link>
          </p>
        ) : null}
      </section>

      <div className="mkt-overview-grid">
        <section className="panel workspace-section-card mkt-recommend">
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <h2>Seasonal opportunity</h2>
            <Link href={at('/dashboard/marketing/campaigns#seasonal')} className="mkt-section-link">See yearly plan</Link>
          </div>

          {recommendations.length === 0 ? (
            <div className="mkt-inline-empty">
              <p>There is no seasonal recommendation waiting right now.</p>
              <Link className="btn secondary" href={at('/dashboard/marketing/campaigns#seasonal')}>Browse the year</Link>
            </div>
          ) : (
            <ul className="mkt-rec-list">
              {recommendations.map((rec) => {
                const smallEmailAudience = rec.channels.includes('email') && rec.channels.includes('blog')
                  && rec.reach != null && rec.reach <= 1 && !rec.postedId;
                return (
                  <li key={rec.beatId} className="mkt-rec">
                    <p className="mkt-rec-head">
                      <span className="mkt-rec-window">{rec.windowLabel}</span>
                      {rec.badge ? <span className="mkt-rec-badge">{rec.badge}</span> : null}
                      <span className="mkt-rec-title">{rec.title}</span>
                    </p>
                    <p className="mkt-rec-why">
                      {rec.postedId
                        ? 'Your blog draft is ready. Finish it, then turn it into a customer email.'
                        : rec.whyNow}
                      {rec.postedId || rec.reach == null ? null : smallEmailAudience ? (
                        <> Your email audience is still small, so publishing the article is the stronger first move.</>
                      ) : rec.reach > 0 ? (
                        <> {rec.reach} {rec.reach === 1 ? 'customer is' : 'customers are'} reachable by email.</>
                      ) : (
                        <> Nobody can be emailed about this yet.</>
                      )}
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
                );
              })}
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
              <div className="mkt-inline-empty">
                <p>No posts are scheduled. Choose a draft and give it a publish date.</p>
                <Link className="btn secondary" href={at('/dashboard/marketing/blog?status=draft')}>Schedule a post</Link>
              </div>
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

      {roiSummary ? (
        <section className="panel workspace-section-card" aria-labelledby="mkt-acquisition-title" style={{ marginTop: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">Closed-Loop Acquisition</p>
              <h2 id="mkt-acquisition-title">Ad &amp; Campaign Attribution</h2>
            </div>
            <Link href={at('/dashboard/marketing/performance')} className="mkt-section-link">
              Full ROI report →
            </Link>
          </div>
          <div className="mkt-pipeline-tiles" style={{ marginTop: '0.75rem' }}>
            <Link href={at('/dashboard/marketing/performance')} className="panel mkt-tile">
              <span className="mkt-tile-label">Attributed Leads</span>
              <strong className="mkt-tile-value">{roiSummary.adAttributedLeads}</strong>
              <span className="mkt-tile-note">{roiSummary.adAttributedPct}% from ad &amp; referral links</span>
            </Link>
            <Link href={at('/dashboard/marketing/performance')} className="panel mkt-tile">
              <span className="mkt-tile-label">Won Ad Revenue</span>
              <strong className="mkt-tile-value">${roiSummary.adAttributedRevenue.toLocaleString()}</strong>
              <span className="mkt-tile-note">From converted campaigns</span>
            </Link>
            <Link href={at('/dashboard/marketing/performance')} className="panel mkt-tile">
              <span className="mkt-tile-label">Ad Win Rate</span>
              <strong className="mkt-tile-value">{roiSummary.adWinRatePct}%</strong>
              <span className="mkt-tile-note">{roiSummary.overallWinRatePct}% pipeline average</span>
            </Link>
            <Link href={at('/dashboard/marketing/links')} className="panel mkt-tile">
              <span className="mkt-tile-label">Link &amp; QR Builder</span>
              <strong className="mkt-tile-value">Create</strong>
              <span className="mkt-tile-note">Track social, search &amp; print</span>
            </Link>
          </div>
        </section>
      ) : null}

      <section className="panel workspace-section-card mkt-email-summary" aria-labelledby="mkt-email-theme-title">
        <div>
          <p className="eyebrow">Outgoing email</p>
          <h2 id="mkt-email-theme-title">{selectedTheme.name} theme</h2>
          <p>{selectedTheme.description} New messages use this layout; past messages stay unchanged.</p>
        </div>
        <Link className="btn secondary" href={emailThemeHref}>Preview and change</Link>
      </section>
    </main>
  );
}
