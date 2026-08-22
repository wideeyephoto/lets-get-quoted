import Link from 'next/link';
import type { Campaign } from '@/lib/campaigns';
import type { PostCounts } from '@/lib/marketing-status';
import MarketingNav from '../MarketingNav';

/**
 * What marketing actually did, given the sends.
 *
 * Split out of page.tsx so the logged-out demo renders the same screen — see
 * the note on CampaignsScreen. The honesty about opens and clicks below is the
 * whole point of the page and is exactly the thing a hand-drawn demo copy would
 * have quietly dropped.
 */

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PerformanceScreen({
  campaigns,
  counts,
  basePath = '/dashboard',
  navOnly,
}: {
  campaigns: Campaign[];
  counts: PostCounts;
  basePath?: string;
  /** See MarketingNav — the demo lists only the sections it has built. */
  navOnly?: string[];
}) {
  const emailSent = campaigns.reduce((sum, campaign) => sum + (campaign.email_sent ?? 0), 0);
  const smsQueued = campaigns.reduce((sum, campaign) => sum + (campaign.sms_sent ?? 0), 0);
  const failed = campaigns.reduce((sum, campaign) => sum + (campaign.failed_count ?? 0), 0);
  const skipped = campaigns.reduce((sum, campaign) => sum + (campaign.skipped_count ?? 0), 0);

  const tiles = [
    { key: 'campaigns', label: 'Campaign runs', value: campaigns.length, note: 'All time' },
    { key: 'messages', label: 'Messages accepted', value: emailSent + smsQueued, note: `${emailSent} email sent · ${smsQueued} texts queued` },
    { key: 'published', label: 'Posts published', value: counts.published, note: counts.scheduled > 0 ? `${counts.scheduled} scheduled` : 'On your website' },
    { key: 'failed', label: 'Not processed', value: failed + skipped, note: `${failed} failed · ${skipped} unreachable` },
  ];

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      <section className="workspace-hero panel marketing-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Performance</p>
          <h1 className="workspace-title">What went out</h1>
          <p className="workspace-lead">
            Every campaign you&apos;ve sent and every post you&apos;ve published.
          </p>
        </div>
      </section>

      <div className="mkt-tiles">
        {tiles.map((tile) => (
          <article key={tile.key} className="panel mkt-tile">
            <span className="mkt-tile-label">{tile.label}</span>
            <strong className="mkt-tile-value">{tile.value}</strong>
            <span className="mkt-tile-note">{tile.note}</span>
          </article>
        ))}
      </div>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <h2>Every send</h2>
        </div>
        {campaigns.length === 0 ? (
          <p className="empty-state">
            Nothing sent yet. <Link href={`${basePath}/marketing/campaigns`}>Write your first campaign →</Link>
          </p>
        ) : (
          <div className="mkt-perf-table-wrap">
            <table className="mkt-perf-table">
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Audience</th>
                  <th scope="col">Email sent</th>
                  <th scope="col">Texts queued</th>
                  <th scope="col">Not processed</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const missed = (campaign.failed_count ?? 0) + (campaign.skipped_count ?? 0);
                  return (
                    <tr key={campaign.id}>
                      <td>{monthLabel(campaign.created_at)}</td>
                      <td>{campaign.subject?.trim() || <span className="mkt-perf-muted">No subject (SMS)</span>}</td>
                      <td>{campaign.audience}</td>
                      <td>{campaign.email_sent ?? 0}</td>
                      <td>{campaign.sms_sent ?? 0}</td>
                      {/* Zero reads as good here, so it is not dressed as a
                          warning — only a real miss gets the tone. */}
                      <td className={missed > 0 ? 'mkt-perf-miss' : undefined}>{missed > 0 ? missed : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <h2>What isn&apos;t measured</h2>
        </div>
        <p className="workspace-lead">
          Opens and clicks aren&apos;t tracked. Counting them means putting an invisible tracking pixel in every
          email you send, and we&apos;d rather not do that to your customers without asking you first. So these
          email counts are provider-accepted and text counts are durably queued. Carrier delivery is shown only when a callback proves it.
        </p>
      </section>
    </main>
  );
}
