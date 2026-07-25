import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { buildInsights, type Delta } from '@/lib/insights';

const WINDOWS: { key: string; label: string; days: number }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All time', days: 0 },
];

// A small ▲/▼ pill showing change vs the previous equal window. "Higher is better"
// for every metric it's used on (collected, profit, win rate), so up is always green.
function DeltaPill({ delta }: { delta: Delta | undefined }) {
  if (!delta) return null;
  if (delta.pct === null) {
    return delta.direction === 'up' ? <span className="metric-delta up">New</span> : null;
  }
  const glyph = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '–';
  return (
    <span className={`metric-delta ${delta.direction}`}>
      {glyph} {Math.abs(delta.pct)}%
    </span>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: { window?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const selected = WINDOWS.find((option) => option.key === searchParams.window) ?? WINDOWS[1];
  const insights = await buildInsights(supabase, accountId, selected.days);

  const leadsTop = Math.max(1, insights.funnel[0].count);
  const marginPct = Math.round(insights.margin * 100);
  const costTotal = Math.max(1, insights.costs);
  const materialsWidth = Math.round((insights.materialsCost / costTotal) * 100);
  const laborWidth = 100 - materialsWidth;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Insights</p>
          <h1 className="workspace-title">Profit, cash &amp; conversion</h1>
          <p className="workspace-lead">
            What you collected, what you kept, and what&rsquo;s still owed — {insights.windowLabel.toLowerCase()}.
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
            No data in this window yet. As leads come in, quotes get approved, and payments are
            collected, your profit, cash position, and funnel will appear here.
          </p>
        </section>
      ) : null}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Money</p>
          <h2>What you kept — {insights.windowLabel.toLowerCase()}</h2>
        </div>
        <div className="workspace-metric-grid">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Collected</span>
            <strong className="workspace-metric-value">
              {formatMoney(insights.collected)} <DeltaPill delta={insights.deltas?.collected} />
            </strong>
            <p className="workspace-metric-note">Payments paid in this window.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Gross profit</span>
            <strong className="workspace-metric-value">
              {formatMoney(insights.grossProfit)} <DeltaPill delta={insights.deltas?.grossProfit} />
            </strong>
            <p className="workspace-metric-note">Collected minus {formatMoney(insights.costs)} in costs.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Margin</span>
            <strong className="workspace-metric-value">{marginPct}%</strong>
            <p className="workspace-metric-note">Share of every dollar you keep.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Win rate</span>
            <strong className="workspace-metric-value">
              {insights.winRate}% <DeltaPill delta={insights.deltas?.winRate} />
            </strong>
            <p className="workspace-metric-note">Quotes that turned into won work.</p>
          </article>
        </div>

        {insights.costs > 0 ? (
          <div className="cost-split">
            <div className="cost-split-track" role="img" aria-label={`Costs: ${formatMoney(insights.materialsCost)} materials, ${formatMoney(insights.laborCost)} labor`}>
              <div className="cost-split-seg materials" style={{ width: `${materialsWidth}%` }} />
              <div className="cost-split-seg labor" style={{ width: `${laborWidth}%` }} />
            </div>
            <div className="cost-split-legend">
              <span><i className="dot materials" /> Materials &amp; supplies {formatMoney(insights.materialsCost)}</span>
              <span><i className="dot labor" /> Labor {formatMoney(insights.laborCost)}</span>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Cash position</p>
          <h2>As of today</h2>
        </div>
        <div className="workspace-metric-grid condensed">
          <Link href="/dashboard/jobs" className="workspace-metric-card metric-card-link">
            <span className="workspace-metric-label">Unpaid invoices</span>
            <strong className="workspace-metric-value">{formatMoney(insights.outstanding.total)}</strong>
            <p className="workspace-metric-note">
              {insights.outstanding.count === 0
                ? 'Nothing outstanding — you’re all caught up.'
                : `${insights.outstanding.count} invoice${insights.outstanding.count === 1 ? '' : 's'} awaiting payment.`}
            </p>
          </Link>
          <Link href="/dashboard/recurring" className="workspace-metric-card metric-card-link">
            <span className="workspace-metric-label">Recurring / mo</span>
            <strong className="workspace-metric-value">{formatMoney(insights.mrr.monthly)}</strong>
            <p className="workspace-metric-note">
              {insights.mrr.activePlans === 0
                ? 'No active recurring plans yet.'
                : `${insights.mrr.activePlans} active plan${insights.mrr.activePlans === 1 ? '' : 's'} on autopilot.`}
            </p>
          </Link>
        </div>
      </section>

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
        <div className="workspace-metric-grid condensed insight-secondary">
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
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Revenue &amp; profit</p>
          <h2>Collected, last 6 months</h2>
        </div>
        <div className="revenue-chart" role="img" aria-label="Monthly collected revenue and profit for the last six months">
          {insights.revenueByMonth.map((month) => {
            const height = Math.max(2, Math.round((month.total / insights.peakMonthTotal) * 100));
            // Profit's share of the month's collected total — the solid "kept" portion.
            const profitShare = month.total > 0 ? Math.max(0, Math.min(100, Math.round((month.profit / month.total) * 100))) : 0;
            return (
              <div className="revenue-col" key={month.key}>
                <span className="revenue-col-value">{month.total > 0 ? formatMoney(month.total) : ''}</span>
                <div className="revenue-col-track">
                  <div className="revenue-col-bar" style={{ height: `${height}%` }}>
                    <div className="revenue-col-profit" style={{ height: `${profitShare}%` }} />
                  </div>
                </div>
                <span className="revenue-col-label">{month.label}</span>
              </div>
            );
          })}
        </div>
        <div className="cost-split-legend revenue-legend">
          <span><i className="dot collected" /> Collected</span>
          <span><i className="dot profit" /> Profit kept</span>
        </div>
      </section>
    </main>
  );
}
