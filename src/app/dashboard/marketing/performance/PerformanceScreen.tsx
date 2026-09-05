'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Campaign } from '@/lib/campaigns';
import type { PostCounts } from '@/lib/marketing-status';
import {
  calculateCampaignRoi,
  type OverallRoiSummary,
  type MarketingAttributionLead,
  type MarketingAttributionJob,
  type JobFinancialLookup,
  CHANNEL_DEFINITIONS,
  type AttributionChannelId,
} from '@/lib/campaign-roi';
import type { GoogleLsaReportingSummary } from '@/lib/google-lsa/reporting';
import type { AdSpendDailyEntry } from '@/lib/ad-billing-shared';
import MarketingNav from '../MarketingNav';

export function formatMoney(amount: number): string {
  if (isNaN(amount) || !isFinite(amount)) return '$0';
  const isNegative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  return `${isNegative ? '-' : ''}$${abs.toLocaleString('en-US')}`;
}

export function formatLsaMoney(amount: number, currencyCode: string | null): string {
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

export function formatImportedAt(value: string | null): string {
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

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (cell: string | number) => {
    const str = String(cell ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\r\n');
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const LSA_STATE_LABEL: Record<GoogleLsaReportingSummary['connectionState'], string> = {
  not_connected: 'Not connected',
  connected: 'Connected',
  needs_attention: 'Needs attention',
  disconnected: 'Disconnected',
};

export function GoogleLsaPanelSkeleton() {
  return (
    <section
      className="panel workspace-section-card"
      aria-busy="true"
      aria-label="Loading Google Local Services Ads reporting"
      style={{ marginBottom: '1.25rem', opacity: 0.85 }}
    >
      <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
        <div>
          <p className="eyebrow">Exact provider reporting · loading...</p>
          <h2 style={{ color: 'var(--foreground)' }}>Google Local Services Ads</h2>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
          gap: '0.55rem',
          margin: '0.8rem 0 0',
        }}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(var(--tint), 0.035)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              padding: '0.65rem',
              height: '76px',
            }}
          />
        ))}
      </div>
    </section>
  );
}

export function GoogleLsaPerformancePanel({ summary }: { summary: GoogleLsaReportingSummary | null }) {
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
  const stateColor = isHealthy ? 'var(--good, #3dd68c)' : summary.connectionState === 'needs_attention' ? 'var(--warn, #fdb022)' : 'var(--muted)';
  const spendSource = summary.spendSource === 'google_ads_api'
    ? 'Google Ads daily facts'
    : summary.spendSource === 'local_services_account_report'
      ? `Legacy snapshot${summary.spendPeriodEnd ? ` through ${summary.spendPeriodEnd}` : ''}${summary.spendStale ? ' · awaiting newer data' : ''}`
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
            background: isHealthy ? 'rgba(61, 214, 140, 0.15)' : 'rgba(253, 176, 34, 0.12)',
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
          <div key={metric.label} style={{ background: 'rgba(var(--tint), 0.035)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.65rem' }}>
            <dt style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{metric.label}</dt>
            <dd style={{ margin: '0.15rem 0 0' }}>
              <span style={{ display: 'block', fontSize: '1.05rem', fontWeight: 750, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
                {metric.value}
              </span>
              <span style={{ display: 'block', margin: '0.15rem 0 0', color: 'var(--muted)', fontSize: '0.66rem', lineHeight: 1.35 }}>
                {metric.note}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <p style={{ margin: '0.75rem 0 0', color: 'var(--muted)', fontSize: '0.74rem', lineHeight: 1.45 }}>
        {summary.attributionCaveat}
      </p>
    </section>
  );
}

export type DateRangeKey = '30d' | '90d' | 'month' | 'all';

function getDateBounds(range: DateRangeKey, now = new Date()) {
  if (range === 'all') {
    return {
      startIso: null,
      endIso: null,
      priorStartIso: null,
      priorEndIso: null,
      label: 'All Time',
      priorLabel: null,
    };
  }

  const nowMs = now.getTime();

  if (range === '30d') {
    const startMs = nowMs - 30 * 24 * 60 * 60 * 1000;
    const priorStartMs = nowMs - 60 * 24 * 60 * 60 * 1000;
    return {
      startIso: new Date(startMs).toISOString(),
      endIso: now.toISOString(),
      priorStartIso: new Date(priorStartMs).toISOString(),
      priorEndIso: new Date(startMs).toISOString(),
      label: 'Last 30 Days',
      priorLabel: 'prior 30 days',
    };
  }

  if (range === '90d') {
    const startMs = nowMs - 90 * 24 * 60 * 60 * 1000;
    const priorStartMs = nowMs - 180 * 24 * 60 * 60 * 1000;
    return {
      startIso: new Date(startMs).toISOString(),
      endIso: now.toISOString(),
      priorStartIso: new Date(priorStartMs).toISOString(),
      priorEndIso: new Date(startMs).toISOString(),
      label: 'Last 90 Days',
      priorLabel: 'prior 90 days',
    };
  }

  // 'month': This calendar month
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfPriorMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return {
    startIso: startOfMonth.toISOString(),
    endIso: now.toISOString(),
    priorStartIso: startOfPriorMonth.toISOString(),
    priorEndIso: startOfMonth.toISOString(),
    label: 'This Month',
    priorLabel: 'prior month',
  };
}

function computeDelta(current: number, prior: number): { pct: number; label: string; direction: 'up' | 'down' | 'neutral' } | null {
  if (prior === 0) {
    if (current === 0) return null;
    return { pct: 100, label: '↑ +100%', direction: 'up' };
  }
  const diff = current - prior;
  const pct = Math.round((diff / prior) * 100);
  if (pct > 0) return { pct, label: `↑ +${pct}%`, direction: 'up' };
  if (pct < 0) return { pct, label: `↓ ${pct}%`, direction: 'down' };
  return { pct: 0, label: '— 0%', direction: 'neutral' };
}

export type PerformanceScreenProps = {
  leads?: MarketingAttributionLead[];
  jobs?: MarketingAttributionJob[];
  walletSpendDollars?: number;
  dailySpendHistory?: AdSpendDailyEntry[];
  lsaSpendDollars?: number;
  printSpendDollars?: number;
  smsSentCount?: number;
  hasActiveCampaigns?: boolean;
  publishedBlogCount?: number;
  hasLsaConnection?: boolean;
  campaigns?: Campaign[];
  counts?: PostCounts;
  roiSummary?: OverallRoiSummary;
  lsaSummary?: GoogleLsaReportingSummary | null;
  basePath?: string;
  navOnly?: string[];
  lsaSlot?: React.ReactNode;
};

export default function PerformanceScreen({
  leads = [],
  jobs = [],
  walletSpendDollars = 0,
  dailySpendHistory = [],
  lsaSpendDollars = 0,
  printSpendDollars = 0,
  smsSentCount = 0,
  hasActiveCampaigns = false,
  publishedBlogCount = 0,
  hasLsaConnection = false,
  campaigns = [],
  roiSummary: fallbackRoiSummary,
  lsaSummary,
  basePath = '/dashboard',
  navOnly,
  lsaSlot,
}: PerformanceScreenProps) {
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [channelSortCol, setChannelSortCol] = useState<'name' | 'spend' | 'leads' | 'won' | 'revenue' | 'roas'>('revenue');
  const [channelSortAsc, setChannelSortAsc] = useState<boolean>(false);
  const [campSortCol, setCampSortCol] = useState<'campaign' | 'channel' | 'leads' | 'won' | 'revenue' | 'avgTicket'>('revenue');
  const [campSortAsc, setCampSortAsc] = useState<boolean>(false);
  const [showAllCampaigns, setShowAllCampaigns] = useState<boolean>(false);

  // Derive job lookup dictionary for financial computations
  const fullJobLookup = useMemo(() => {
    const lookup: JobFinancialLookup = {};
    for (const job of jobs) {
      const isWon = job.status === 'in_progress' || job.status === 'complete';
      lookup[job.id] = { total: Number(job.quoted_amount) || 0, isWon };
    }
    return lookup;
  }, [jobs]);

  // Compute metrics for selected range & prior period
  const { currentRoi, priorRoi, rangeLabel, priorLabel, rangeSpendBreakdown } = useMemo(() => {
    const bounds = getDateBounds(dateRange);

    const inRange = (iso: string | undefined, startIso: string | null, endIso: string | null) => {
      if (!iso) return false;
      if (startIso && iso < startIso) return false;
      if (endIso && iso > endIso) return false;
      return true;
    };

    const currentLeads = bounds.startIso
      ? leads.filter((l) => inRange(l.created_at, bounds.startIso, bounds.endIso))
      : leads;

    const priorLeads = bounds.priorStartIso
      ? leads.filter((l) => inRange(l.created_at, bounds.priorStartIso, bounds.priorEndIso))
      : [];

    // Calculate spend breakdown by channel for active period
    let currWalletSpend = walletSpendDollars;
    let currMetaSpend = 0;
    let currGoogleWalletSpend = walletSpendDollars;
    let currLsaSpend = lsaSpendDollars;
    let currPrintSpend = printSpendDollars;
    let currSmsSpend = Math.round(smsSentCount * 0.042);

    if (dailySpendHistory.length > 0 && bounds.startIso) {
      const startDateKey = bounds.startIso.slice(0, 10);
      const endDateKey = (bounds.endIso ?? '').slice(0, 10);
      const periodEntries = dailySpendHistory.filter(
        (e) => e.date >= startDateKey && (!endDateKey || e.date <= endDateKey),
      );
      currMetaSpend = Math.round(
        periodEntries
          .filter((e) => e.source === 'meta_ads_api')
          .reduce((sum, e) => sum + (e.spendCents || 0), 0) / 100,
      );
      currGoogleWalletSpend = Math.round(
        periodEntries
          .filter((e) => e.source === 'google_ads_api' || e.source === 'scheduled_pacing')
          .reduce((sum, e) => sum + (e.spendCents || 0), 0) / 100,
      );
      currWalletSpend = currMetaSpend + currGoogleWalletSpend;
    } else if (dateRange === '30d') {
      currLsaSpend = Math.round(lsaSpendDollars / 3);
      currPrintSpend = Math.round(printSpendDollars / 3);
      currSmsSpend = Math.round(currSmsSpend / 3);
    } else if (dateRange === 'month') {
      currLsaSpend = Math.round(lsaSpendDollars / 3);
      currPrintSpend = Math.round(printSpendDollars / 3);
      currSmsSpend = Math.round(currSmsSpend / 3);
    }

    const currTotalSpend = currGoogleWalletSpend + currLsaSpend + currMetaSpend + currPrintSpend + currSmsSpend;
    const currTotalAdSpend = currGoogleWalletSpend + currLsaSpend + currMetaSpend;

    const currRoi = fallbackRoiSummary && dateRange === 'all' && leads.length === 0
      ? fallbackRoiSummary
      : calculateCampaignRoi(currentLeads, fullJobLookup, { actualAdSpend: currTotalAdSpend });

    const priorRoiSummary = bounds.priorStartIso
      ? calculateCampaignRoi(priorLeads, fullJobLookup, { actualAdSpend: currTotalAdSpend * 0.9 })
      : null;

    return {
      currentRoi: currRoi,
      priorRoi: priorRoiSummary,
      rangeLabel: bounds.label,
      priorLabel: bounds.priorLabel,
      rangeSpendBreakdown: {
        googleSpend: currGoogleWalletSpend + currLsaSpend,
        metaSpend: currMetaSpend,
        printSpend: currPrintSpend,
        smsSpend: currSmsSpend,
        totalSpend: currTotalSpend,
        totalAdSpend: currTotalAdSpend,
      },
    };
  }, [
    dateRange,
    leads,
    fullJobLookup,
    walletSpendDollars,
    dailySpendHistory,
    lsaSpendDollars,
    printSpendDollars,
    smsSentCount,
    fallbackRoiSummary,
  ]);

  // Outcome Metrics
  const totalLeads = currentRoi.totalLeads;
  const adLeads = currentRoi.adAttributedLeads;
  const wonJobs = currentRoi.totalWonCount;
  const adWonJobs = currentRoi.adWonCount;
  const totalRevenue = currentRoi.totalRevenue;
  const adRevenue = currentRoi.adAttributedRevenue;
  const quotesSent = currentRoi.totalQuotedCount;
  const adQuotesSent = currentRoi.adQuotedCount;
  const totalMarketingSpend = rangeSpendBreakdown.totalSpend;
  const totalAdSpend = rangeSpendBreakdown.totalAdSpend;

  const leadToQuoteRate = totalLeads > 0 ? Math.round((quotesSent / totalLeads) * 100) : 0;
  const quoteToCloseRate = quotesSent > 0 ? Math.round((wonJobs / quotesSent) * 100) : 0;
  const contactRate = totalLeads > 0 ? Math.round((currentRoi.channels.reduce((sum, c) => sum + c.contactedCount, 0) / totalLeads) * 100) : 0;
  const contactedLeads = currentRoi.channels.reduce((sum, c) => sum + c.contactedCount, 0);

  // Paid and Blended unit economics
  const paidCpl = adLeads > 0 && totalAdSpend > 0 ? Math.round(totalAdSpend / adLeads) : 0;
  const blendedCpl = totalLeads > 0 && totalMarketingSpend > 0 ? Math.round(totalMarketingSpend / totalLeads) : 0;

  const paidCac = adWonJobs > 0 && totalAdSpend > 0 ? Math.round(totalAdSpend / adWonJobs) : 0;
  const blendedCac = wonJobs > 0 && totalMarketingSpend > 0 ? Math.round(totalMarketingSpend / wonJobs) : 0;

  const roasMultiplier = totalAdSpend > 0 ? Math.round((adRevenue / totalAdSpend) * 10) / 10 : 0;
  // ROAS turns green at >= 2.0x (to account for labor, materials, overhead), warning at 1.0x-2.0x, muted/subdued below 1.0x
  const roasColor = totalAdSpend > 0
    ? roasMultiplier >= 2.0
      ? 'var(--good, #3dd68c)'
      : roasMultiplier >= 1.0
        ? 'var(--warn, #fdb022)'
        : 'var(--bad, #fd8a7a)'
    : 'var(--muted)';

  // Trend Deltas
  const leadsDelta = priorRoi ? computeDelta(totalLeads, priorRoi.totalLeads) : null;
  const wonDelta = priorRoi ? computeDelta(wonJobs, priorRoi.totalWonCount) : null;
  const revenueDelta = priorRoi ? computeDelta(totalRevenue, priorRoi.totalRevenue) : null;
  const spendDelta = priorRoi ? computeDelta(totalMarketingSpend, priorRoi.totalAdSpend) : null;

  // Build comprehensive channel list encompassing all channels
  const channelsList = useMemo(() => {
    const channelMap = new Map<AttributionChannelId, (typeof currentRoi.channels)[number]>();
    for (const ch of currentRoi.channels) {
      channelMap.set(ch.id, ch);
    }

    const allChannelIds: AttributionChannelId[] = [
      'google',
      'meta',
      'tiktok',
      'local',
      'print_qr',
      'email_sms',
      'promo',
      'organic_search',
      'direct',
    ];

    return allChannelIds.map((id) => {
      const ch = channelMap.get(id);
      const def = CHANNEL_DEFINITIONS[id];
      const leadsCount = ch?.leadsCount ?? 0;
      const wonCount = ch?.wonCount ?? 0;
      const revenue = ch?.totalRevenue ?? 0;

      let spend = 0;
      if (id === 'google') spend = rangeSpendBreakdown.googleSpend;
      else if (id === 'meta') spend = rangeSpendBreakdown.metaSpend;
      else if (id === 'print_qr') spend = rangeSpendBreakdown.printSpend;
      else if (id === 'email_sms') spend = rangeSpendBreakdown.smsSpend;

      let roas = '—';
      if (spend > 0) {
        const mult = Math.round((revenue / spend) * 10) / 10;
        roas = `${mult}x`;
      } else if (!def.isPaid) {
        roas = 'Organic';
      }

      let isActive = false;
      if (id === 'google') isActive = hasLsaConnection || leadsCount > 0 || spend > 0;
      else if (id === 'meta') isActive = leadsCount > 0 || spend > 0;
      else if (id === 'tiktok') isActive = leadsCount > 0;
      else if (id === 'local') isActive = leadsCount > 0;
      else if (id === 'print_qr') isActive = leadsCount > 0 || spend > 0;
      else if (id === 'email_sms') isActive = hasActiveCampaigns || campaigns.some((c) => (c.email_sent || 0) > 0 || (c.sms_sent || 0) > 0) || leadsCount > 0;
      else if (id === 'promo') isActive = leadsCount > 0;
      else if (id === 'organic_search') isActive = publishedBlogCount > 0 || leadsCount > 0;
      else if (id === 'direct') isActive = leadsCount > 0;

      return {
        id,
        name: def.name,
        icon: def.icon,
        isPaid: def.isPaid,
        spend,
        leads: leadsCount,
        wonJobs: wonCount,
        revenue,
        roas,
        isActive,
        setupHref: def.defaultSetupHref,
      };
    });
  }, [
    currentRoi.channels,
    rangeSpendBreakdown,
    hasLsaConnection,
    hasActiveCampaigns,
    campaigns,
    publishedBlogCount,
  ]);

  // Sort channels
  const sortedChannels = useMemo(() => {
    return [...channelsList].sort((a, b) => {
      let cmp = 0;
      if (channelSortCol === 'name') cmp = a.name.localeCompare(b.name);
      else if (channelSortCol === 'spend') cmp = a.spend - b.spend;
      else if (channelSortCol === 'leads') cmp = a.leads - b.leads;
      else if (channelSortCol === 'won') cmp = a.wonJobs - b.wonJobs;
      else if (channelSortCol === 'revenue') cmp = a.revenue - b.revenue;
      else if (channelSortCol === 'roas') cmp = a.roas.localeCompare(b.roas);
      return channelSortAsc ? cmp : -cmp;
    });
  }, [channelsList, channelSortCol, channelSortAsc]);

  // Sort leaderboard campaigns
  const sortedCampaigns = useMemo(() => {
    const list = [...(currentRoi.topCampaigns ?? [])];
    return list.sort((a, b) => {
      let cmp = 0;
      if (campSortCol === 'campaign') cmp = a.campaign.localeCompare(b.campaign);
      else if (campSortCol === 'channel') cmp = a.channelName.localeCompare(b.channelName);
      else if (campSortCol === 'leads') cmp = a.leadsCount - b.leadsCount;
      else if (campSortCol === 'won') cmp = a.wonCount - b.wonCount;
      else if (campSortCol === 'revenue') cmp = a.totalRevenue - b.totalRevenue;
      else if (campSortCol === 'avgTicket') cmp = a.avgTicket - b.avgTicket;
      return campSortAsc ? cmp : -cmp;
    });
  }, [currentRoi.topCampaigns, campSortCol, campSortAsc]);

  const displayedCampaigns = showAllCampaigns ? sortedCampaigns : sortedCampaigns.slice(0, 10);

  // CSV Export Handlers
  const handleExportChannelsCsv = () => {
    const headers = ['Acquisition Channel', 'Spend ($)', 'Leads', 'Won Jobs', 'Revenue ($)', 'ROAS', 'Status'];
    const rows = sortedChannels.map((c) => [
      c.name,
      c.spend,
      c.leads,
      c.wonJobs,
      c.revenue,
      c.roas,
      c.isActive ? 'Active' : 'Unconfigured',
    ]);
    const csvData = toCsv(headers, rows);
    downloadCsv(`marketing-channels-${dateRange}.csv`, csvData);
  };

  const handleExportCampaignsCsv = () => {
    const headers = ['Campaign', 'Channel', 'Leads', 'Won Jobs', 'Total Revenue ($)', 'Avg Ticket ($)'];
    const rows = sortedCampaigns.map((c) => [
      c.campaign,
      c.channelName,
      c.leadsCount,
      c.wonCount,
      c.totalRevenue,
      c.avgTicket,
    ]);
    const csvData = toCsv(headers, rows);
    downloadCsv(`campaign-leaderboard-${dateRange}.csv`, csvData);
  };

  const hasAnyData = totalLeads > 0 || totalMarketingSpend > 0 || wonJobs > 0;

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      {/* Header & Date Range Filter */}
      <section className="workspace-hero panel marketing-hero" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
          <div className="workspace-hero-copy" style={{ margin: 0 }}>
            <p className="eyebrow">Financial Outcomes &amp; Attribution</p>
            <h1 className="workspace-title" style={{ fontSize: '1.75rem', marginBottom: '0.35rem' }}>
              Results
            </h1>
            <p className="workspace-lead" style={{ margin: 0, fontSize: '0.9rem' }}>
              Direct financial returns, closed-loop conversion rates, and revenue per channel.
            </p>
          </div>

          {/* Date Range Selector */}
          <div
            role="group"
            aria-label="Filter performance date range"
            style={{
              display: 'inline-flex',
              background: 'rgba(var(--tint), 0.04)',
              border: '1px solid var(--line)',
              borderRadius: '999px',
              padding: '3px',
              gap: '2px',
            }}
          >
            {(
              [
                { key: '30d', label: '30 Days' },
                { key: '90d', label: '90 Days' },
                { key: 'month', label: 'This Month' },
                { key: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDateRange(opt.key)}
                aria-pressed={dateRange === opt.key}
                style={{
                  border: 'none',
                  background: dateRange === opt.key ? 'rgba(var(--tint), 0.12)' : 'transparent',
                  color: dateRange === opt.key ? 'var(--foreground)' : 'var(--muted)',
                  fontWeight: dateRange === opt.key ? 700 : 500,
                  fontSize: '0.78rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
          <span>Showing: <strong>{rangeLabel}</strong></span>
          {priorLabel ? <span>· vs {priorLabel}</span> : null}
        </div>
      </section>

      {/* LSA Section Slot (Streamed via Suspense in Server Page, or fallback panel) */}
      {lsaSlot ?? (lsaSummary !== undefined ? <GoogleLsaPerformancePanel summary={lsaSummary} /> : null)}

      {/* 1. Outcome Metrics (8 Financial & Conversion Metrics) */}
      <div className="mkt-tiles" style={{ marginBottom: '1.25rem' }}>
        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Marketing Spend</span>
          <strong className="mkt-tile-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalMarketingSpend > 0 ? formatMoney(totalMarketingSpend) : '$0'}
          </strong>
          <span className="mkt-tile-note">
            {spendDelta ? (
              <span style={{ color: spendDelta.direction === 'up' ? 'var(--warn, #fdb022)' : 'var(--good, #3dd68c)', fontWeight: 600 }}>
                {spendDelta.label} vs prior ·{' '}
              </span>
            ) : null}
            ${formatMoney(totalAdSpend)} digital ads
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Inbound Leads</span>
          <strong className="mkt-tile-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalLeads}
          </strong>
          <span className="mkt-tile-note">
            {leadsDelta ? (
              <span style={{ color: leadsDelta.direction === 'up' ? 'var(--good, #3dd68c)' : 'var(--warn, #fdb022)', fontWeight: 600 }}>
                {leadsDelta.label} vs prior ·{' '}
              </span>
            ) : null}
            {adLeads} ad-attributed
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Qualified Quotes</span>
          <strong className="mkt-tile-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {quotesSent}
          </strong>
          <span className="mkt-tile-note">
            {leadToQuoteRate}% quote rate ({adQuotesSent} paid)
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Won Jobs</span>
          <strong className="mkt-tile-value" style={{ color: 'var(--good, #3dd68c)', fontVariantNumeric: 'tabular-nums' }}>
            {wonJobs}
          </strong>
          <span className="mkt-tile-note">
            {wonDelta ? (
              <span style={{ color: wonDelta.direction === 'up' ? 'var(--good, #3dd68c)' : 'var(--warn, #fdb022)', fontWeight: 600 }}>
                {wonDelta.label} vs prior ·{' '}
              </span>
            ) : null}
            {quoteToCloseRate}% close rate ({adWonJobs} paid)
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Closed Revenue</span>
          <strong className="mkt-tile-value" style={{ color: 'var(--good, #3dd68c)', fontVariantNumeric: 'tabular-nums' }}>
            {formatMoney(totalRevenue)}
          </strong>
          <span className="mkt-tile-note">
            {revenueDelta ? (
              <span style={{ color: revenueDelta.direction === 'up' ? 'var(--good, #3dd68c)' : 'var(--warn, #fdb022)', fontWeight: 600 }}>
                {revenueDelta.label} vs prior ·{' '}
              </span>
            ) : null}
            {formatMoney(adRevenue)} ad-attributed
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Paid CPL</span>
          <strong className="mkt-tile-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {paidCpl > 0 ? formatMoney(paidCpl) : '—'}
          </strong>
          <span className="mkt-tile-note">
            Spend / Paid lead ({blendedCpl > 0 ? formatMoney(blendedCpl) : '$0'} blended)
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Paid CAC</span>
          <strong className="mkt-tile-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {paidCac > 0 ? formatMoney(paidCac) : '—'}
          </strong>
          <span className="mkt-tile-note">
            Spend / Paid win ({blendedCac > 0 ? formatMoney(blendedCac) : '$0'} blended)
          </span>
        </article>

        <article className="panel mkt-tile">
          <span className="mkt-tile-label">Return on Ad Spend</span>
          <strong
            className="mkt-tile-value"
            style={{ color: roasColor, fontVariantNumeric: 'tabular-nums' }}
          >
            {totalAdSpend > 0 ? `${roasMultiplier}x ROAS` : 'No spend'}
          </strong>
          <span className="mkt-tile-note">
            Ad revenue / Ad spend (2.0x target)
          </span>
        </article>
      </div>

      {/* Empty State when no marketing or lead data exists */}
      {!hasAnyData ? (
        <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem', padding: '1.75rem', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }} aria-hidden="true">🚀</span>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--foreground)', margin: '0 0 0.5rem' }}>
            Ready to track marketing performance &amp; ROI
          </h2>
          <p style={{ maxWidth: '560px', margin: '0 auto 1.25rem', fontSize: '0.86rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            Connect your advertising channels, print high-contrast QR codes for jobsite yard signs, and monitor Texts queued across direct broadcasts to measure every closed dollar in your dispatch ledger.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href={`${basePath}/marketing/ads`} className="btn primary btn-sm">
              🎯 Connect Google Ads &amp; LSA
            </Link>
            <Link href={`${basePath}/marketing/links`} className="btn secondary btn-sm">
              🪧 Create Yard Sign &amp; QR Links
            </Link>
            <Link href={`${basePath}/marketing/campaigns`} className="btn secondary btn-sm">
              ✉️ Launch Email &amp; SMS Campaign
            </Link>
          </div>
        </section>
      ) : null}

      {/* 2. Visual Conversion Funnel (100% Measured Stages) */}
      <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
        <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
          <div>
            <p className="eyebrow">Pipeline Velocity</p>
            <h2>Closed-Loop Conversion Funnel</h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {leadToQuoteRate}% Lead-to-Quote · {quoteToCloseRate}% Quote-to-Close
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', marginTop: '0.75rem' }}>
          <div style={{ background: 'rgba(var(--tint), 0.035)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>1. Inbound Leads</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{totalLeads}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--info, #7aa2ff)', display: 'block', marginTop: '0.2rem' }}>Total inquiries</span>
          </div>

          <div style={{ background: 'rgba(var(--info-rgb, 122, 162, 255), 0.05)', border: '1px solid color-mix(in srgb, var(--info, #7aa2ff) 25%, var(--line))', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>2. Contacted</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--info, #7aa2ff)', fontVariantNumeric: 'tabular-nums' }}>{contactedLeads}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>{contactRate}% contacted</span>
          </div>

          <div style={{ background: 'rgba(var(--accent-rgb, 255, 122, 33), 0.05)', border: '1px solid color-mix(in srgb, var(--accent, #ff7a21) 25%, var(--line))', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>3. Estimates Quoted</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--accent, #ff7a21)', fontVariantNumeric: 'tabular-nums' }}>{quotesSent}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>{leadToQuoteRate}% quote rate</span>
          </div>

          <div style={{ background: 'rgba(var(--good-rgb, 61, 214, 140), 0.07)', border: '1px solid color-mix(in srgb, var(--good, #3dd68c) 30%, var(--line))', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>4. Won Jobs</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--good, #3dd68c)', fontVariantNumeric: 'tabular-nums' }}>{wonJobs}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>{quoteToCloseRate}% close rate</span>
          </div>

          <div style={{ background: 'rgba(var(--good-rgb, 61, 214, 140), 0.12)', border: '1px solid color-mix(in srgb, var(--good, #3dd68c) 45%, var(--line))', borderRadius: '8px', padding: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', display: 'block' }}>5. Total Revenue</span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--good, #3dd68c)', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalRevenue)}</strong>
            <span style={{ fontSize: '0.7rem', color: 'var(--foreground)', display: 'block', marginTop: '0.2rem' }}>Avg ${wonJobs > 0 ? Math.round(totalRevenue / wonJobs).toLocaleString() : 0}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={handleExportChannelsCsv}
              aria-label="Export channel performance data as CSV"
            >
              📥 Export CSV
            </button>
            <Link href={`${basePath}/marketing/links`} className="btn secondary btn-sm">
              + Track New Channel
            </Link>
          </div>
        </div>

        <div className="mkt-perf-table-wrap" style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
          <table className="mkt-perf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <caption className="sr-only">Performance breakdown by marketing acquisition channel</caption>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                <th
                  scope="col"
                  style={{ padding: '0.65rem 0.5rem', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => {
                    if (channelSortCol === 'name') setChannelSortAsc(!channelSortAsc);
                    else { setChannelSortCol('name'); setChannelSortAsc(true); }
                  }}
                  aria-sort={channelSortCol === 'name' ? (channelSortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  Acquisition Channel {channelSortCol === 'name' ? (channelSortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                  onClick={() => {
                    if (channelSortCol === 'spend') setChannelSortAsc(!channelSortAsc);
                    else { setChannelSortCol('spend'); setChannelSortAsc(false); }
                  }}
                  aria-sort={channelSortCol === 'spend' ? (channelSortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  Spend {channelSortCol === 'spend' ? (channelSortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                  onClick={() => {
                    if (channelSortCol === 'leads') setChannelSortAsc(!channelSortAsc);
                    else { setChannelSortCol('leads'); setChannelSortAsc(false); }
                  }}
                  aria-sort={channelSortCol === 'leads' ? (channelSortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  Leads {channelSortCol === 'leads' ? (channelSortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                  onClick={() => {
                    if (channelSortCol === 'won') setChannelSortAsc(!channelSortAsc);
                    else { setChannelSortCol('won'); setChannelSortAsc(false); }
                  }}
                  aria-sort={channelSortCol === 'won' ? (channelSortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  Won Jobs {channelSortCol === 'won' ? (channelSortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                  onClick={() => {
                    if (channelSortCol === 'revenue') setChannelSortAsc(!channelSortAsc);
                    else { setChannelSortCol('revenue'); setChannelSortAsc(false); }
                  }}
                  aria-sort={channelSortCol === 'revenue' ? (channelSortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  Revenue {channelSortCol === 'revenue' ? (channelSortAsc ? '▲' : '▼') : ''}
                </th>
                <th
                  scope="col"
                  style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                  onClick={() => {
                    if (channelSortCol === 'roas') setChannelSortAsc(!channelSortAsc);
                    else { setChannelSortCol('roas'); setChannelSortAsc(false); }
                  }}
                  aria-sort={channelSortCol === 'roas' ? (channelSortAsc ? 'ascending' : 'descending') : 'none'}
                >
                  ROAS {channelSortCol === 'roas' ? (channelSortAsc ? '▲' : '▼') : ''}
                </th>
                <th scope="col" style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedChannels.map((ch) => (
                <tr key={ch.id} style={{ borderBottom: '1px solid rgba(var(--tint), 0.05)' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <Link
                      href={`${basePath}/leads?channel=${ch.id}`}
                      style={{ color: 'var(--foreground)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                      title={`Filter lead workspace to ${ch.name}`}
                    >
                      <span aria-hidden="true" style={{ marginRight: '0.45rem' }}>{ch.icon}</span>
                      <strong>{ch.name}</strong>
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {ch.spend > 0 ? formatMoney(ch.spend) : '$0'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    <Link href={`${basePath}/leads?channel=${ch.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {ch.leads}
                    </Link>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--good, #3dd68c)', fontVariantNumeric: 'tabular-nums' }}>
                    {ch.wonJobs}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {ch.revenue > 0 ? formatMoney(ch.revenue) : '$0'}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--good, #3dd68c)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {ch.roas}
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                    {ch.isActive ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--good, #3dd68c)',
                          background: 'rgba(61, 214, 140, 0.15)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          display: 'inline-block',
                        }}
                      >
                        Active
                      </span>
                    ) : (
                      <Link
                        href={ch.setupHref}
                        aria-label={`Set up ${ch.name}`}
                        style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          color: 'var(--accent, #ff7a21)',
                          background: 'rgba(var(--tint), 0.05)',
                          border: '1px solid color-mix(in srgb, var(--accent, #ff7a21) 35%, var(--line))',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
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
      {sortedCampaigns.length > 0 ? (
        <section className="panel workspace-section-card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-heading workspace-section-heading compact-heading mkt-section-head">
            <div>
              <p className="eyebrow">Rankings</p>
              <h2>Campaign Leaderboard</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={handleExportCampaignsCsv}
                aria-label="Export campaign leaderboard as CSV"
              >
                📥 Export CSV
              </button>
              {sortedCampaigns.length > 10 ? (
                <button
                  type="button"
                  className="btn ghost btn-sm"
                  onClick={() => setShowAllCampaigns(!showAllCampaigns)}
                  style={{ fontSize: '0.78rem' }}
                >
                  {showAllCampaigns ? 'Show top 10' : `Show all (${sortedCampaigns.length})`}
                </button>
              ) : null}
            </div>
          </div>
          <div className="mkt-perf-table-wrap" style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
            <table className="mkt-perf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <caption className="sr-only">Top marketing campaigns ranked by revenue and lead volume</caption>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                  <th
                    scope="col"
                    style={{ padding: '0.65rem 0.5rem', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => {
                      if (campSortCol === 'campaign') setCampSortAsc(!campSortAsc);
                      else { setCampSortCol('campaign'); setCampSortAsc(true); }
                    }}
                    aria-sort={campSortCol === 'campaign' ? (campSortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    Campaign {campSortCol === 'campaign' ? (campSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '0.65rem 0.5rem', textAlign: 'left', cursor: 'pointer' }}
                    onClick={() => {
                      if (campSortCol === 'channel') setCampSortAsc(!campSortAsc);
                      else { setCampSortCol('channel'); setCampSortAsc(true); }
                    }}
                    aria-sort={campSortCol === 'channel' ? (campSortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    Channel {campSortCol === 'channel' ? (campSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => {
                      if (campSortCol === 'leads') setCampSortAsc(!campSortAsc);
                      else { setCampSortCol('leads'); setCampSortAsc(false); }
                    }}
                    aria-sort={campSortCol === 'leads' ? (campSortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    Leads {campSortCol === 'leads' ? (campSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => {
                      if (campSortCol === 'won') setCampSortAsc(!campSortAsc);
                      else { setCampSortCol('won'); setCampSortAsc(false); }
                    }}
                    aria-sort={campSortCol === 'won' ? (campSortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    Won Jobs {campSortCol === 'won' ? (campSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => {
                      if (campSortCol === 'revenue') setCampSortAsc(!campSortAsc);
                      else { setCampSortCol('revenue'); setCampSortAsc(false); }
                    }}
                    aria-sort={campSortCol === 'revenue' ? (campSortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    Total Revenue {campSortCol === 'revenue' ? (campSortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th
                    scope="col"
                    style={{ padding: '0.65rem 0.5rem', textAlign: 'right', cursor: 'pointer' }}
                    onClick={() => {
                      if (campSortCol === 'avgTicket') setCampSortAsc(!campSortAsc);
                      else { setCampSortCol('avgTicket'); setCampSortAsc(false); }
                    }}
                    aria-sort={campSortCol === 'avgTicket' ? (campSortAsc ? 'ascending' : 'descending') : 'none'}
                  >
                    Avg Ticket {campSortCol === 'avgTicket' ? (campSortAsc ? '▲' : '▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedCampaigns.map((c) => (
                  <tr key={c.campaign} style={{ borderBottom: '1px solid rgba(var(--tint), 0.05)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <strong>{c.campaign}</strong>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{c.channelName}</td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.leadsCount}</td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--good, #3dd68c)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{c.wonCount}</td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.totalRevenue)}</td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(c.avgTicket)}</td>
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
          <summary className="workspace-details-summary">
            <h3 style={{ display: 'inline', fontSize: 'inherit', fontWeight: 'inherit', margin: 0 }}>
              How Closed-Loop Attribution Works
            </h3>
          </summary>
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
