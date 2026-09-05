'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
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
import type { Campaign } from '@/lib/campaigns';
import MarketingNav from './MarketingNav';
import MailIcon from '@/components/MailIcon';

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
  emailTheme?: { currentTheme: string | null };
  roiSummary?: OverallRoiSummary;
  roiSummaryByRange?: { month: OverallRoiSummary; '30d': OverallRoiSummary };
  sentCampaignsCount?: number;
  campaigns?: Campaign[];
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
  roiSummary,
  roiSummaryByRange,
  sentCampaignsCount,
  campaigns = [],
  basePath = '/dashboard',
  navOnly,
}: Props) {
  const [dateRange, setDateRange] = useState<'month' | '30d'>('month');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 6,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  useEffect(() => {
    if (!createMenuOpen) return;
    updateCoords();

    const handleScrollOrResize = () => updateCoords();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCreateMenuOpen(false);
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKey);
    };
  }, [createMenuOpen, updateCoords]);

  const isDemo = basePath !== '/dashboard';
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

  // Calculate metrics based on selected date range
  const activeSummary = (dateRange === 'month' ? roiSummaryByRange?.month : roiSummaryByRange?.['30d']) ?? roiSummary;
  const marketingLeads = activeSummary?.adAttributedLeads ?? 0;
  const wonJobs = activeSummary?.channels.reduce((sum, ch) => sum + ch.wonCount, 0) ?? 0;
  const attributedRevenue = activeSummary?.adAttributedRevenue ?? 0;
  const totalAdSpend = activeSummary?.totalAdSpend ?? 0;
  const roasMultiplier = activeSummary?.estimatedRoasMultiplier ?? 0;
  const hasAdSpend = totalAdSpend > 0;

  // Active channels sorted to find genuine top channel
  const activeChannels = [...(activeSummary?.channels ?? [])].filter((c) => c.leadsCount > 0);
  const topChannel = activeChannels.sort((a, b) => b.totalRevenue - a.totalRevenue || b.wonCount - a.wonCount || b.leadsCount - a.leadsCount)[0] ?? null;

  // Campaigns sent metrics
  const sentCampaigns = campaigns.filter((c) => (c.email_sent || 0) + (c.sms_sent || 0) > 0);
  const totalDelivered = campaigns.reduce((sum, c) => sum + (c.email_sent || 0) + (c.sms_sent || 0), 0);
  const displaySentCount = sentCampaignsCount ?? sentCampaigns.length;

  // Real winners (campaigns with won jobs or conversions)
  const winningCampaigns = (activeSummary?.topCampaigns ?? []).filter((c) => c.wonCount > 0 || c.leadsCount > 0).slice(0, 2);
  const recentDispatchedCampaigns = sentCampaigns.slice(0, 2);

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      {/* 1. Header with Date Filter & Primary Create Menu */}
      <section className="workspace-hero panel marketing-hero mkt-overview-hero" style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
          <div className="workspace-hero-copy" style={{ margin: 0 }}>
            <p className="eyebrow">Marketing Command Center</p>
            <h1 className="workspace-title" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Marketing Overview
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.9rem' }}>
              Everything your marketing is producing for {view.businessName}
              {stateName(view.state) ? ` across ${stateName(view.state)}` : ''}.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {/* Date range toggle */}
            <div style={{ display: 'inline-flex', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '8px', padding: '0.2rem', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button
                type="button"
                className={`btn ghost ${dateRange === 'month' ? 'active' : ''}`}
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: dateRange === 'month' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: dateRange === 'month' ? 'var(--foreground)' : 'var(--muted)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setDateRange('month')}
              >
                This month
              </button>
              <button
                type="button"
                className={`btn ghost ${dateRange === '30d' ? 'active' : ''}`}
                style={{
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  borderRadius: '6px',
                  background: dateRange === '30d' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                  color: dateRange === '30d' ? 'var(--foreground)' : 'var(--muted)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setDateRange('30d')}
              >
                Last 30 days
              </button>
            </div>

            {/* Primary Action: Create Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                ref={triggerRef}
                type="button"
                className="btn primary"
                onClick={() => setCreateMenuOpen((prev) => !prev)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}
                aria-expanded={createMenuOpen}
                aria-controls="marketing-create-menu"
                aria-haspopup="true"
              >
                <span>+ Create</span>
                <span style={{ fontSize: '0.65rem', transform: createMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>▼</span>
              </button>

              {mounted && createMenuOpen
                ? createPortal(
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                        onClick={() => setCreateMenuOpen(false)}
                      />
                      <div
                        id="marketing-create-menu"
                        role="menu"
                        style={{
                          position: 'fixed',
                          top: `${menuCoords.top}px`,
                          right: `${menuCoords.right}px`,
                          background: 'var(--panel-bg, #18181b)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          borderRadius: '10px',
                          padding: '0.4rem',
                          width: '220px',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                          zIndex: 9999,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.2rem',
                          backdropFilter: 'blur(16px)',
                        }}
                      >
                        <Link
                          href={at('/dashboard/marketing/campaigns?tab=create&channel=email')}
                          className="btn ghost"
                          role="menuitem"
                          style={{ justifyContent: 'flex-start', fontSize: '0.82rem', padding: '0.45rem 0.65rem', textAlign: 'left' }}
                          onClick={() => setCreateMenuOpen(false)}
                        >
                          <MailIcon style={{ marginRight: '0.4rem' }} /> Email campaign
                        </Link>
                        <Link
                          href={at('/dashboard/marketing/campaigns?tab=create&channel=sms')}
                          className="btn ghost"
                          role="menuitem"
                          style={{ justifyContent: 'flex-start', fontSize: '0.82rem', padding: '0.45rem 0.65rem', textAlign: 'left' }}
                          onClick={() => setCreateMenuOpen(false)}
                        >
                          💬 Text campaign
                        </Link>
                        <Link
                          href={at('/dashboard/marketing/blog')}
                          className="btn ghost"
                          role="menuitem"
                          style={{ justifyContent: 'flex-start', fontSize: '0.82rem', padding: '0.45rem 0.65rem', textAlign: 'left' }}
                          onClick={() => setCreateMenuOpen(false)}
                        >
                          ✍️ Blog &amp; SEO article
                        </Link>
                        <Link
                          href={at('/dashboard/marketing/links')}
                          className="btn ghost"
                          role="menuitem"
                          style={{ justifyContent: 'flex-start', fontSize: '0.82rem', padding: '0.45rem 0.65rem', textAlign: 'left' }}
                          onClick={() => setCreateMenuOpen(false)}
                        >
                          🔗 Tracking link or QR
                        </Link>
                      </div>
                    </>,
                    document.body,
                  )
                : null}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Marketing Results (4 Compact Metrics) */}
      <section style={{ marginBottom: '1.25rem' }}>
        <div className="mkt-tiles">
          <article className="panel mkt-tile">
            <span className="mkt-tile-label">Marketing Leads</span>
            <strong className="mkt-tile-value">{marketingLeads}</strong>
            <span className="mkt-tile-note">From campaigns &amp; ads</span>
          </article>

          <article className="panel mkt-tile">
            <span className="mkt-tile-label">Booked &amp; Won Jobs</span>
            <strong className="mkt-tile-value">{wonJobs}</strong>
            <span className="mkt-tile-note">Booked &amp; completed work</span>
          </article>

          <article className="panel mkt-tile">
            <span className="mkt-tile-label">Attributed Revenue</span>
            <strong className="mkt-tile-value">${attributedRevenue.toLocaleString()}</strong>
            <span className="mkt-tile-note">Booked &amp; completed quote value</span>
          </article>

          <article className="panel mkt-tile">
            <span className="mkt-tile-label">Return on Ad Spend</span>
            <strong
              className="mkt-tile-value"
              style={{
                fontSize: hasAdSpend ? '1.5rem' : '1.05rem',
                color: hasAdSpend
                  ? roasMultiplier >= 1.0
                    ? '#10b981'
                    : '#f59e0b'
                  : 'var(--muted)',
              }}
            >
              {hasAdSpend ? `${roasMultiplier}x ROAS` : 'No ad spend yet'}
            </strong>
            <span className="mkt-tile-note">
              {hasAdSpend ? (
                `Revenue / Ad investment ($${Math.round(totalAdSpend).toLocaleString()} spent)`
              ) : (
                <Link href={at('/dashboard/marketing/ads')}>Launch Paid Ads →</Link>
              )}
            </span>
          </article>
        </div>
      </section>

      {/* 3. Next Best Action (Single Focused Action) */}
      <section className="panel workspace-section-card mkt-priority" aria-labelledby="mkt-priority-title" style={{ marginBottom: '1.25rem' }}>
        <div className="mkt-priority-copy">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.85rem' }}>⚡</span>
            <p className="eyebrow" style={{ margin: 0 }}>Next Best Action</p>
          </div>
          <h2 id="mkt-priority-title" style={{ fontSize: '1.35rem', margin: '0.2rem 0 0.4rem' }}>{priority.title}</h2>
          <p style={{ margin: '0 0 0.85rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.45 }}>{priority.description}</p>
          <div className="mkt-priority-actions">
            <Link className="btn primary" href={at(priority.primary.href)}>
              {priority.primary.label} →
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

      {/* 4. Channel Health (4 Cards linking to respective sub-workspaces) */}
      <section style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Marketing Systems</p>
            <h2 style={{ fontSize: '1.2rem' }}>Channel Health</h2>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Multi-channel performance</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {/* Email & Text */}
          <Link href={at('/dashboard/marketing/campaigns')} className="panel mkt-tile" style={{ textDecoration: 'none', transition: 'all 0.15s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><MailIcon /> Email &amp; Text</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-green-1, #10b981)', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                {summary.audience.value} Clients
              </span>
            </div>
            <strong style={{ fontSize: '1.15rem', color: 'var(--text)', display: 'block', margin: '0.2rem 0' }}>
              {displaySentCount} Sent
            </strong>
            <span className="mkt-tile-note">
              {totalDelivered > 0
                ? `${totalDelivered.toLocaleString()} messages delivered`
                : campaigns[0]
                  ? `Last send: ${shortDate(campaigns[0].created_at)}`
                  : 'Ready to compose'}
            </span>
          </Link>

          {/* Paid Ads */}
          <Link href={at('/dashboard/marketing/ads')} className="panel mkt-tile" style={{ textDecoration: 'none', transition: 'all 0.15s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>🚀 Paid Ads</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-orange-7, #ea580c)', background: 'rgba(249, 115, 22, 0.15)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                Google + Meta
              </span>
            </div>
            <strong style={{ fontSize: '1.15rem', color: 'var(--text)', display: 'block', margin: '0.2rem 0' }}>
              {hasAdSpend ? `${roasMultiplier}x ROAS` : 'Autopilot Ready'}
            </strong>
            <span className="mkt-tile-note">
              {hasAdSpend
                ? `$${attributedRevenue.toLocaleString()} revenue ($${Math.round(totalAdSpend).toLocaleString()} spend)`
                : 'Launch with zero retainer'}
            </span>
          </Link>

          {/* Blog & SEO */}
          <Link href={at('/dashboard/marketing/blog')} className="panel mkt-tile" style={{ textDecoration: 'none', transition: 'all 0.15s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>✍️ Blog &amp; SEO</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-blue, #0284c7)', background: 'rgba(56, 189, 248, 0.15)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                {counts.published} Live
              </span>
            </div>
            <strong style={{ fontSize: '1.15rem', color: 'var(--text)', display: 'block', margin: '0.2rem 0' }}>
              {summary.published.value} Published
            </strong>
            <span className="mkt-tile-note">
              {counts.draft} draft{counts.draft === 1 ? '' : 's'} waiting
            </span>
          </Link>

          {/* Tracking */}
          <Link href={at('/dashboard/marketing/links')} className="panel mkt-tile" style={{ textDecoration: 'none', transition: 'all 0.15s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>🎯 Tracking</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-violet-5, #7e22ce)', background: 'rgba(168, 85, 247, 0.15)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                Links &amp; QR
              </span>
            </div>
            <strong style={{ fontSize: '1.15rem', color: 'var(--text)', display: 'block', margin: '0.2rem 0' }}>
              {marketingLeads} Leads
            </strong>
            <span className="mkt-tile-note">
              Closed-loop job tracking
            </span>
          </Link>

          {/* Neighborhood Halo */}
          <Link href={at('/dashboard/marketing/ads?tab=halo')} className="panel mkt-tile" style={{ textDecoration: 'none', transition: 'all 0.15s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>📡 Neighborhood Halo</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-green-1, #10b981)', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                Geo-Fencing
              </span>
            </div>
            <strong style={{ fontSize: '1.15rem', color: 'var(--text)', display: 'block', margin: '0.2rem 0' }}>
              1-Mile Geo-Fencing
            </strong>
            <span className="mkt-tile-note">
              Target homes around active jobs
            </span>
          </Link>
        </div>
      </section>

      {/* 5. Marketing Calendar & Timeline (Combined Seasonal + Scheduled + Planned) */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Marketing Calendar</p>
            <h2 style={{ fontSize: '1.2rem' }}>Timeline &amp; Upcoming Opportunities</h2>
          </div>
          <Link href={at('/dashboard/marketing/campaigns?tab=calendar')} className="mkt-section-link">
            Full calendar →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
          {/* Seasonal Recommendations */}
          <div>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--muted)' }}>
              🍁 Seasonal Recommendations &amp; Angles
            </h3>
            {recommendations.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No seasonal triggers waiting right now.</p>
            ) : (
              <ul className="mkt-rec-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {recommendations.slice(0, 2).map((rec) => (
                  <li key={rec.beatId} className="mkt-rec" style={{ padding: '0.75rem', borderRadius: '8px' }}>
                    <p className="mkt-rec-head" style={{ marginBottom: '0.25rem' }}>
                      <span className="mkt-rec-window">{rec.windowLabel}</span>
                      <strong style={{ fontSize: '0.85rem' }}>{rec.title}</strong>
                    </p>
                    <p className="mkt-rec-why" style={{ fontSize: '0.78rem', margin: '0 0 0.5rem' }}>{rec.whyNow}</p>
                    <div className="mkt-rec-actions">
                      <Link href={at('/dashboard/marketing/campaigns?tab=create')} className="btn primary" style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}>
                        Send campaign
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Scheduled & Planned Pipeline */}
          <div>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--muted)' }}>
              📅 Scheduled Articles &amp; Sends
            </h3>
            {upcoming.length === 0 ? (
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.85rem' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 0.5rem' }}>
                  No posts or campaigns scheduled.
                </p>
                <Link href={at('/dashboard/marketing/blog')} className="btn secondary" style={{ fontSize: '0.74rem' }}>
                  Schedule a draft →
                </Link>
              </div>
            ) : (
              <ul className="mkt-coming-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {upcoming.slice(0, 3).map((post) => (
                  <li key={post.id}>
                    <Link href={at(`/dashboard/marketing/blog/${post.id}`)} className="mkt-coming-row" style={{ padding: '0.55rem 0.75rem' }}>
                      <span className="mkt-coming-date">{shortDate(post.publishAt)}</span>
                      <span className="mkt-coming-copy">
                        <strong>{post.title.trim() || 'Untitled post'}</strong>
                        <small>Scheduled article</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* 6. Recent Winners & Top Performing Sources */}
      {winningCampaigns.length > 0 || recentDispatchedCampaigns.length > 0 || topChannel ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">Top Performers</p>
              <h2 style={{ fontSize: '1.2rem' }}>Recent Winners &amp; Attribution</h2>
            </div>
            <Link href={at('/dashboard/marketing/performance')} className="mkt-section-link">
              See all results →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem', marginTop: '0.65rem' }}>
            {winningCampaigns.length > 0 ? (
              winningCampaigns.map((c) => (
                <div key={c.campaign} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{c.campaign || 'Direct Campaign'}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{c.channelName}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                    <span>{c.leadsCount} leads</span>
                    <span>{c.wonCount} won</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>${c.totalRevenue.toLocaleString()}</span>
                  </div>
                </div>
              ))
            ) : (
              recentDispatchedCampaigns.map((c) => (
                <div key={c.id} style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{c.subject || 'Direct Client Campaign'}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{shortDate(c.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><MailIcon /> {c.email_sent || 0} emails</span>
                    <span>💬 {c.sms_sent || 0} texts</span>
                    <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Sent</span>
                  </div>
                </div>
              ))
            )}
            {topChannel ? (
              <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#10b981' }}>{topChannel.icon} {topChannel.name}</strong>
                  <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>Top Channel</span>
                </div>
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text)', marginTop: '0.35rem' }}>
                  <span>{topChannel.leadsCount} Leads</span>
                  <span>{topChannel.wonCount} Won Jobs</span>
                  <span style={{ fontWeight: 700 }}>${topChannel.totalRevenue.toLocaleString()}</span>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
        <Link href={at('/dashboard/marketing/email-theme')} style={{ fontSize: '0.78rem', color: 'var(--muted)', textDecoration: 'none' }}>
          🎨 Customize Email Appearance &amp; Branding Settings →
        </Link>
      </div>
    </main>
  );
}

