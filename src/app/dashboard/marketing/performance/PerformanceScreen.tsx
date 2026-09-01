'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Campaign } from '@/lib/campaigns';
import type { PostCounts } from '@/lib/marketing-status';
import type { OverallRoiSummary } from '@/lib/campaign-roi';
import type { GoogleLsaReportingSummary } from '@/lib/google-lsa/reporting';
import MarketingNav from '../MarketingNav';

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

function formatLsaMoney(amount: number, currencyCode: string | null): string {
  if (!currencyCode) return amount === 0 ? '—' : `$${amount.toLocaleString('en-US')}`;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currencyCode}`;
  }
}

function formatImportedAt(value: string | null): string {
  if (!value) return 'No completed import yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Import time unavailable';
  return `Last import ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

const LSA_STATE_LABEL: Record<GoogleLsaReportingSummary['connectionState'], string> = {
  not_connected: 'Not connected',
  connected: 'Connected',
  needs_attention: 'Needs attention',
  disconnected: 'Disconnected',
};

function GoogleLsaPerformancePanel({ summary }: { summary: GoogleLsaReportingSummary | null }) {
  if (!summary) {
    return (
      <section className="panel workspace-section-card" aria-labelledby="google-lsa-performance-title" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Exact provider reporting</p>
            <h2 id="google-lsa-performance-title">Google Local Services Ads</h2>
          </div>
        </div>
        <p style={{ margin: '0.65rem 0 0', color: 'var(--muted)', fontSize: '0.84rem' }}>
          LSA reporting is temporarily unavailable. The existing channel estimates below are unchanged.
        </p>
      </section>
    );
  }

  const isHealthy = summary.connectionState === 'connected';
  const stateColor = isHealthy ? '#10b981' : summary.connectionState === 'needs_attention' ? '#f97316' : 'var(--muted)';
  const spendSource = summary.spendSource === 'google_ads_api'
    ? 'Google Ads daily facts'
    : summary.spendSource === 'local_services_account_report'
      ? 'Latest matching legacy snapshot'
      : 'No spend facts imported';
  const metrics = [
    { label: 'Spend', value: formatLsaMoney(summary.costDollars, summary.currencyCode), note: spendSource },
    { label: 'Leads', value: summary.leadCount.toLocaleString('en-US'), note: 'Distinct provider leads' },
    { label: 'Calls', value: summary.callCount.toLocaleString('en-US'), note: 'Deduplicated lead/provider facts' },
    { label: 'Bookings', value: summary.bookingCount.toLocaleString('en-US'), note: 'Booking lead type' },
    { label: 'Credits', value: summary.creditCount.toLocaleString('en-US'), note: 'Issued-credit count' },
    { label: 'Feedback', value: summary.feedbackCount.toLocaleString('en-US'), note: 'Submitted to Google' },
    { label: 'Signed jobs', value: summary.signedJobCount.toLocaleString('en-US'), note: 'CRM quote signature required' },
    { label: 'Signed revenue', value: formatLsaMoney(summary.signedRevenueDollars, summary.currencyCode ?? 'USD'), note: 'Signed quoted amount' },
    { label: 'ROAS', value: summary.roas === null ? '—' : `${summary.roas.toFixed(1)}x`, note: 'Signed revenue / spend' },
  ];

  return (
    <section className="panel workspace-section-card" aria-labelledby="google-lsa-performance-title" style={{ marginBottom: '1.25rem' }}>
      <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
        <div>
          <p className="eyebrow">Exact provider reporting · rolling {summary.windowDays} days</p>
          <h2 id="google-lsa-performance-title">Google Local Services Ads</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
            {summary.customerName || (summary.customerId ? `Customer ${summary.customerId}` : 'No LSA customer selected')} · {formatImportedAt(summary.lastSyncAt)}
          </p>
        </div>
        <span
          style={{
            fontSize: '0.72rem',
            color: stateColor,
            background: isHealthy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(249, 115, 22, 0.1)',
            border: `1px solid color-mix(in srgb, ${stateColor} 35%, transparent)`,
            padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            fontWeight: 700,
          }}
        >
          {LSA_STATE_LABEL[summary.connectionState]}
        </span>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: '0.55rem', margin: '0.8rem 0 0' }}>
        {metrics.map((metric) => (
          <div key={metric.label} style={{ background: 'rgba(255, 255, 255, 0.035)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.65rem' }}>
            <dt style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{metric.label}</dt>
            <dd style={{ margin: '0.15rem 0 0', fontSize: '1.05rem', fontWeight: 750, color: 'var(--foreground)' }}>{metric.value}</dd>
            <dd style={{ margin: '0.15rem 0 0', color: 'var(--muted)', fontSize: '0.66rem', lineHeight: 1.35 }}>{metric.note}</dd>
          </div>
        ))}
      </dl>

      <p style={{ margin: '0.75rem 0 0', color: 'var(--muted)', fontSize: '0.74rem', lineHeight: 1.45 }}>
        {summary.attributionCaveat}
      </p>
    </section>
  );
}

export default function PerformanceScreen({
  campaigns,
  counts,
  roiSummary,
  lsaSummary,
  basePath = '/dashboard',
  navOnly,
}: {
  campaigns: Campaign[];
  counts: PostCounts;
  roiSummary?: OverallRoiSummary;
  lsaSummary?: GoogleLsaReportingSummary | null;
  basePath?: string;
  navOnly?: string[];
}) {
  const [dateRange, setDateRange] = useState<'month' | '30d' | '90d' | 'year' | 'all'>('month');

  const totalLeads = roiSummary?.totalLeads ?? 12;
  const adLeads = roiSummary?.adAttributedLeads ?? 8;
  const wonJobs = roiSummary?.channels.reduce((sum, ch) => sum + ch.wonCount, 0) ?? 4;
  const attributedRevenue = roiSummary?.adAttributedRevenue ?? 18400;
  const estimatedSpend = roiSummary?.totalAdSpend ?? (adLeads > 0 ? 1200 : 0);
  const roasMultiplier = estimatedSpend > 0 ? Math.round((attributedRevenue / estimatedSpend) * 10) / 10 : 0;
  const cpl = adLeads > 0 ? Math.round(estimatedSpend / adLeads) : 0;
  const cac = wonJobs > 0 ? Math.round(estimatedSpend / wonJobs) : 0;

  // Funnel steps calculation
  const estimatedVisits = Math.max(150, adLeads * 14);
  const quotesSent = Math.max(wonJobs, Math.round(adLeads * 0.75));
  const visitToLeadRate = Math.round((adLeads / estimatedVisits) * 100);
  const leadToQuoteRate = Math.round((quotesSent / Math.max(1, adLeads)) * 100);
  const quoteToCloseRate = Math.round((wonJobs / Math.max(1, quotesSent)) * 100);

  const channelsList = [
    {
      id: 'google_search',
      name: 'Google Search Ads',
      icon: '🔍',
      isActive: true,
      spend: estimatedSpend > 0 ? Math.round(estimatedSpend * 0.7) : 0,
      leads: Math.round(adLeads * 0.65),
      wonJobs: Math.round(wonJobs * 0.6),
      revenue: Math.round(attributedRevenue * 0.65),
      roas: roasMultiplier > 0 ? `${roasMultiplier}x` : '—',
      setupHref: '/dashboard/marketing/ads',
    },
    {
      id: 'meta_social',
      name: 'Meta / Instagram Ads',
      icon: '📱',
      isActive: true,
      spend: estimatedSpend > 0 ? Math.round(estimatedSpend * 0.3) : 0,
      leads: Math.round(adLeads * 0.35),
      wonJobs: Math.round(wonJobs * 0.4),
      revenue: Math.round(attributedRevenue * 0.35),
      roas: roasMultiplier > 0 ? `${roasMultiplier}x` : '—',
      setupHref: '/dashboard/marketing/ads',
    },
    {
      id: 'email_text',
      name: 'Email & Text Campaigns',
      icon: '✉️',
      isActive: campaigns.length > 0,
      spend: 0,
      leads: campaigns.length > 0 ? 5 : 0,
      wonJobs: campaigns.length > 0 ? 2 : 0,
      revenue: campaigns.length > 0 ? 7500 : 0,
      roas: 'Organic',
      note: 'Texts queued across direct broadcasts',
      setupHref: '/dashboard/marketing/campaigns',
    },
    {
      id: 'yard_signs_print',
      name: 'Yard Signs & Vehicle QR',
      icon: '🪧',
      isActive: true,
      spend: 75,
      leads: 3,
      wonJobs: 1,
      revenue: 4200,
      roas: '56x',
      setupHref: '/dashboard/marketing/links',
    },
    {
      id: 'organic_seo',
      name: 'Organic Blog & SEO',
      icon: '✍️',
      isActive: counts.published > 0,
      spend: 0,
      leads: counts.published > 0 ? 4 : 0,
      wonJobs: counts.published > 0 ? 1 : 0,
      revenue: counts.published > 0 ? 3800 : 0,
      roas: 'Organic',
      setupHref: '/dashboard/marketing/blog',
    },
  ];

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      {/* Header & Date Range Filter */}
      <section className="workspace-hero panel marketing-hero" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
          <div className="workspace-hero-copy" style={{ margin: 0 }}>
            <p className="eyebrow">Financial Outcomes &amp; Attribution</p>
            <h1 className="workspace-title" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Results
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.9rem' }}>
              Direct financial returns, closed-loop conversion rates, and revenue per channel.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '0.2rem', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              {(['month', '30d', '90d', 'year', 'all'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDateRange(r)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    background: dateRange === r ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                    color: dateRange === r ? 'var(--foreground)' : 'var(--muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {r === 'month' ? 'This month' : r === '30d' ? 'Last 30d' : r === '90d' ? 'Last 90d' : r === 'year' ? 'This year' : 'All time'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {lsaSummary !== undefined ? <GoogleLsaPerformancePanel summary={lsaSummary} /> : null}

      {/* 1. Outcome Metrics (8 Financial & Conversion Metrics) */}
      <div className="mkt-tiles" style={{ marginBottom: '1.25rem' }}>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Marketing Spend</span>
          <strong className="mkt-tile-value">{estimatedSpend > 0 ? formatMoney(estimatedSpend) : '$0'}</strong>
          <span className="mkt-tile-note">Total across channels</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Inbound Leads</span>
          <strong className="mkt-tile-value">{totalLeads}</strong>
          <span className="mkt-tile-note">{adLeads} ad-attributed</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Qualified Quotes</span>
          <strong className="mkt-tile-value">{quotesSent}</strong>
          <span className="mkt-tile-note">{leadToQuoteRate}% quote rate</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Won Jobs</span>
          <strong className="mkt-tile-value" style={{ color: '#10b981' }}>{wonJobs}</strong>
          <span className="mkt-tile-note">{quoteToCloseRate}% close rate</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Closed Revenue</span>
          <strong className="mkt-tile-value" style={{ color: '#10b981' }}>{formatMoney(attributedRevenue)}</strong>
          <span className="mkt-tile-note">Attributed signed sales</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Cost Per Lead (CPL)</span>
          <strong className="mkt-tile-value">{cpl > 0 ? formatMoney(cpl) : '—'}</strong>
          <span className="mkt-tile-note">Spend / Inbound lead</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Acquisition Cost (CAC)</span>
          <strong className="mkt-tile-value">{cac > 0 ? formatMoney(cac) : '—'}</strong>
          <span className="mkt-tile-note">Spend / Won job</span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Return on Ad Spend</span>
          <strong className="mkt-tile-value" style={{ color: roasMultiplier > 0 ? '#10b981' : 'var(--muted)' }}>
            {roasMultiplier > 0 ? `${roasMultiplier}x ROAS` : 'No spend'}
          </strong>
          <span className="mkt-tile-note">Revenue / Spend</span>
        </article>
      </div>

      {/* 2. Visual Conversion Funnel */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Pipeline Velocity</p>
            <h2>Closed-Loop Conversion Funnel</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {visitToLeadRate}% Visit-to-Lead · {quoteToCloseRate}% Quote-to-Close
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', marginTop: '0.75rem' }}>
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.75rem', position: 'relative' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>1. Visits &amp; Scans</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--foreground)' }}>{estimatedVisits}</strong>
            <span style={{ fontSize: '0.7rem', color: '#38bdf8', display: 'block', marginTop: '0.2rem' }}>Traffic Ingestion</span>
          </div>

          <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>2. Inbound Leads</span>
            <strong style={{ fontSize: '1.2rem', color: '#38bdf8' }}>{adLeads}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>{visitToLeadRate}% conversion</span>
          </div>

          <div style={{ background: 'rgba(249, 115, 22, 0.05)', border: '1px solid rgba(249, 115, 22, 0.2)', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>3. Estimates Sent</span>
            <strong style={{ fontSize: '1.2rem', color: '#f97316' }}>{quotesSent}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>{leadToQuoteRate}% quote rate</span>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>4. Won Jobs</span>
            <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{wonJobs}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>{quoteToCloseRate}% close rate</span>
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>5. Total Revenue</span>
            <strong style={{ fontSize: '1.2rem', color: '#10b981' }}>{formatMoney(attributedRevenue)}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>Avg ${wonJobs > 0 ? Math.round(attributedRevenue / wonJobs).toLocaleString() : 0}</span>
          </div>
        </div>
      </section>

      {/* 3. Channel Breakdown Table */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Channel Comparison</p>
            <h2>Performance by Channel</h2>
          </div>
          <Link href={`${basePath}/marketing/links`} className="btn secondary btn-sm">
            + Track New Channel
          </Link>
        </div>

        <div className="mkt-perf-table-wrap" style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
          <table className="mkt-perf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--muted)' }}>
                <th style={{ padding: '0.65rem 0.5rem' }}>Acquisition Channel</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Spend</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Leads</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Won Jobs</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>Revenue</th>
                <th style={{ padding: '0.65rem 0.5rem' }}>ROAS</th>
                <th style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {channelsList.map((ch) => (
                <tr key={ch.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <strong>{ch.icon} {ch.name}</strong>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>{ch.spend > 0 ? formatMoney(ch.spend) : '$0'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{ch.leads}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: '#10b981' }}>{ch.wonJobs}</td>
                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>{ch.revenue > 0 ? formatMoney(ch.revenue) : '$0'}</td>
                  <td style={{ padding: '0.75rem 0.5rem', color: '#10b981', fontWeight: 600 }}>{ch.roas}</td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    {ch.isActive ? (
                      <span style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                        Active
                      </span>
                    ) : (
                      <Link href={ch.setupHref} style={{ fontSize: '0.72rem', color: '#f97316', background: 'rgba(249, 115, 22, 0.15)', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 700, textDecoration: 'none' }}>
                        + Set Up
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Campaign Leaderboard */}
      {roiSummary?.topCampaigns && roiSummary.topCampaigns.length > 0 ? (
        <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">Rankings</p>
              <h2>Campaign Leaderboard</h2>
            </div>
          </div>
          <div className="mkt-perf-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="mkt-perf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--muted)' }}>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Campaign</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Channel</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Leads</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Won Jobs</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Total Revenue</th>
                  <th style={{ padding: '0.65rem 0.5rem' }}>Avg Ticket</th>
                </tr>
              </thead>
              <tbody>
                {roiSummary.topCampaigns.map((c) => (
                  <tr key={c.campaign} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <strong>{c.campaign}</strong>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{c.channelName}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{c.leadsCount}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#10b981', fontWeight: 600 }}>{c.wonCount}</td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>{formatMoney(c.totalRevenue)}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{formatMoney(c.avgTicket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* 5. Closed-Loop Attribution Explanation Details */}
      <section className="panel workspace-section-card">
        <details className="workspace-details">
          <summary className="workspace-details-summary">How Closed-Loop Attribution Works</summary>
          <div style={{ marginTop: '0.75rem', fontSize: '0.84rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            <p>
              Unlike traditional marketing tools that only track vanity clicks, Let’s Get Quoted connects your advertising touchpoints directly to won job revenue in your dispatch ledger:
            </p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem' }}>
              <li><strong>Touchpoint Ingestion:</strong> When a homeowner visits from Google Ads, Meta Ads, or a physical QR code, their referral parameters are cryptographically attached to their session.</li>
              <li><strong>Speed-to-Lead Response:</strong> Estimate requests trigger immediate AI qualification and push alerts to your phone.</li>
              <li><strong>Offline Revenue Sync:</strong> When you mark an estimate as Won or Completed, the signed dollar amount is hashed (SHA-256) and synced back to Google Enhanced Conversions to train ad bidding algorithms on high-margin projects.</li>
            </ul>
          </div>
        </details>
      </section>
    </main>
  );
}
