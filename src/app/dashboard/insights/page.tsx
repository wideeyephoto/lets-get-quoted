import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { buildInsights } from '@/lib/insights';

const WINDOWS: { key: string; label: string; days: number }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All time', days: 0 },
];

export default async function InsightsPage({ searchParams }: { searchParams: { window?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const selected = WINDOWS.find((option) => option.key === searchParams.window) ?? WINDOWS[1];
  const insights = await buildInsights(supabase, accountId, selected.days);

  const leadsTop = Math.max(1, insights.funnel[0].count);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Insights</p>
          <h1 className="workspace-title">Your funnel &amp; revenue</h1>
          <p className="workspace-lead">
            Where your leads go and what you collect — {insights.windowLabel.toLowerCase()}.
          </p>
          <div className="insight-window-tabs" role="tablist" aria-label="Time window">
            {WINDOWS.map((option) => (
              <Link
                key={option.key}
                href={`/dashboard/insights?window=${option.key}`}
                className={`insight-window-tab${option.key === selected.key ? ' is-active' : ''}`}
                aria-selected={option.key === selected.key}
                role="tab"
              >
                {option.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {!insights.hasAnyData ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            No data in this window yet. As leads come in and quotes get approved, your funnel and
            revenue trend will appear here.
          </p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Conversion funnel</p>
          <h2>Lead → Quoted → Won</h2>
        </div>
        <div className="funnel">
          {insights.funnel.map((stage, index) => {
            const width = Math.max(4, Math.round((stage.count / leadsTop) * 100));
            return (
              <div className="funnel-stage" key={stage.key}>
                <div className="funnel-stage-head">
                  <span className="funnel-stage-label">{stage.label}</span>
                  <span className="funnel-stage-count">{stage.count.toLocaleString()}</span>
                </div>
                <div className="funnel-track">
                  <div className={`funnel-bar funnel-bar-${stage.key}`} style={{ width: `${width}%` }} />
                </div>
                {index > 0 ? (
                  <span className="funnel-stage-rate">
                    {stage.rateOfPrev}% of {insights.funnel[index - 1].label.toLowerCase()}
                  </span>
                ) : (
                  <span className="funnel-stage-rate">Top of funnel</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Headline numbers</p>
          <h2>Key metrics</h2>
        </div>
        <div className="workspace-metric-grid">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Win rate</span>
            <strong className="workspace-metric-value">{insights.winRate}%</strong>
            <p className="workspace-metric-note">Quotes that turned into won work.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Lead → won</span>
            <strong className="workspace-metric-value">{insights.overallConversion}%</strong>
            <p className="workspace-metric-note">Overall conversion from every lead.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Avg quote value</span>
            <strong className="workspace-metric-value">{formatMoney(insights.avgQuoteValue)}</strong>
            <p className="workspace-metric-note">Average quoted amount across jobs.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Collected</span>
            <strong className="workspace-metric-value">{formatMoney(insights.totalCollected)}</strong>
            <p className="workspace-metric-note">Paid payments in this window.</p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Revenue trend</p>
          <h2>Collected, last 6 months</h2>
        </div>
        <div className="revenue-chart" role="img" aria-label="Monthly collected revenue for the last six months">
          {insights.revenueByMonth.map((month) => {
            const height = Math.max(2, Math.round((month.total / insights.peakMonthTotal) * 100));
            return (
              <div className="revenue-col" key={month.key}>
                <span className="revenue-col-value">{month.total > 0 ? formatMoney(month.total) : ''}</span>
                <div className="revenue-col-track">
                  <div className="revenue-col-bar" style={{ height: `${height}%` }} />
                </div>
                <span className="revenue-col-label">{month.label}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
