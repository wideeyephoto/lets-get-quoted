import Link from 'next/link';
import type { Campaign } from '@/lib/campaigns';
import type { PostCounts } from '@/lib/marketing-status';
import type { OverallRoiSummary } from '@/lib/campaign-roi';
import MarketingNav from '../MarketingNav';

/**
 * What marketing actually did, given the sends and lead provenance.
 *
 * Split out of page.tsx so the logged-out demo renders the same screen — see
 * the note on CampaignsScreen.
 */

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export default function PerformanceScreen({
  campaigns,
  counts,
  roiSummary,
  basePath = '/dashboard',
  navOnly,
}: {
  campaigns: Campaign[];
  counts: PostCounts;
  roiSummary?: OverallRoiSummary;
  basePath?: string;
  /** See MarketingNav — the demo lists only the sections it has built. */
  navOnly?: string[];
}) {
  const emailSent = campaigns.reduce((sum, campaign) => sum + (campaign.email_sent ?? 0), 0);
  const smsQueued = campaigns.reduce((sum, campaign) => sum + (campaign.sms_sent ?? 0), 0);
  const failed = campaigns.reduce((sum, campaign) => sum + (campaign.failed_count ?? 0), 0);
  const skipped = campaigns.reduce((sum, campaign) => sum + (campaign.skipped_count ?? 0), 0);

  const sendTiles = [
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
          <p className="eyebrow">Marketing · Performance &amp; ROI</p>
          <h1 className="workspace-title">Marketing &amp; Campaign Attribution</h1>
          <p className="workspace-lead">
            Closed-loop conversion analytics, ad channel ROI, and outgoing campaign history.
          </p>
        </div>
      </section>

      {roiSummary ? (
        <>
          <div className="mkt-tiles">
            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Ad-Attributed Leads</span>
              <strong className="mkt-tile-value">{roiSummary.adAttributedLeads}</strong>
              <span className="mkt-tile-note">
                {roiSummary.adAttributedPct}% of {roiSummary.totalLeads} total leads
              </span>
            </article>

            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Won Revenue from Ads</span>
              <strong className="mkt-tile-value">{formatMoney(roiSummary.adAttributedRevenue)}</strong>
              <span className="mkt-tile-note">
                {roiSummary.estimatedRoasMultiplier > 0
                  ? `${roiSummary.estimatedRoasMultiplier}x Return on Ad Spend (ROAS)`
                  : 'Closed & converted jobs'}
              </span>
            </article>

            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Ad Lead Win Rate</span>
              <strong className="mkt-tile-value">{roiSummary.adWinRatePct}%</strong>
              <span className="mkt-tile-note">
                {roiSummary.overallWinRatePct}% across all pipeline leads
              </span>
            </article>

            <article className="panel mkt-tile">
              <span className="mkt-tile-label">Average Ticket Size</span>
              <strong className="mkt-tile-value">{formatMoney(roiSummary.overallAvgTicket)}</strong>
              <span className="mkt-tile-note">Per converted job</span>
            </article>
          </div>

          <section className="panel workspace-section-card">
            <div className="section-heading workspace-section-heading compact-heading">
              <div>
                <h2>Acquisition Channels &amp; Conversion</h2>
                <p className="workspace-lead" style={{ fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
                  Track where incoming estimate requests and bookings originate across digital ads, search, local referrals, and QR collateral.
                </p>
              </div>
              <Link href={`${basePath}/marketing/links`} className="btn secondary">
                + Create Campaign Link / QR
              </Link>
            </div>

            <div className="mkt-perf-table-wrap">
              <table className="mkt-perf-table">
                <thead>
                  <tr>
                    <th scope="col">Acquisition Channel</th>
                    <th scope="col">Leads</th>
                    <th scope="col">Quotes Sent</th>
                    <th scope="col">Won Jobs</th>
                    <th scope="col">Win Rate</th>
                    <th scope="col">Total Won Revenue</th>
                    <th scope="col">Top Campaign</th>
                  </tr>
                </thead>
                <tbody>
                  {roiSummary.channels.map((ch) => (
                    <tr key={ch.id}>
                      <td>
                        <strong>{ch.icon} {ch.name}</strong>
                        {ch.isPaid && <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(249, 115, 22, 0.15)', color: '#f97316' }}>Paid</span>}
                      </td>
                      <td>{ch.leadsCount}</td>
                      <td>{ch.quotedCount}</td>
                      <td>{ch.wonCount}</td>
                      <td>
                        <strong>{ch.winRatePct}%</strong>
                      </td>
                      <td>
                        <strong>{formatMoney(ch.totalRevenue)}</strong>
                      </td>
                      <td>{ch.topCampaign || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {roiSummary.topCampaigns.length > 0 ? (
            <section className="panel workspace-section-card">
              <div className="section-heading workspace-section-heading compact-heading">
                <h2>Top Performing Campaigns</h2>
              </div>
              <div className="mkt-perf-table-wrap">
                <table className="mkt-perf-table">
                  <thead>
                    <tr>
                      <th scope="col">Campaign Name</th>
                      <th scope="col">Channel</th>
                      <th scope="col">Leads</th>
                      <th scope="col">Won Jobs</th>
                      <th scope="col">Win Rate</th>
                      <th scope="col">Total Revenue</th>
                      <th scope="col">Avg Ticket</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roiSummary.topCampaigns.map((c) => (
                      <tr key={c.campaign}>
                        <td>
                          <strong>{c.campaign}</strong>
                        </td>
                        <td>{c.channelName}</td>
                        <td>{c.leadsCount}</td>
                        <td>{c.wonCount}</td>
                        <td>{c.winRatePct}%</td>
                        <td>
                          <strong>{formatMoney(c.totalRevenue)}</strong>
                        </td>
                        <td>{formatMoney(c.avgTicket)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <div className="section-heading workspace-section-heading" style={{ marginTop: '1.5rem' }}>
        <div>
          <p className="eyebrow">Outreach history</p>
          <h2>Outgoing Messages &amp; Broadcasts</h2>
        </div>
      </div>

      <div className="mkt-tiles">
        {sendTiles.map((tile) => (
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
          <h2>Privacy &amp; Direct Measurement Policy</h2>
        </div>
        <p className="workspace-lead">
          Opens and clicks inside customer emails are not tracked to respect homeowner privacy. Our attribution engine measures direct, first-party conversions on your domain when visitors arrive through campaign URLs, search ads, social promotions, or scanned QR codes.
        </p>
      </section>
    </main>
  );
}
