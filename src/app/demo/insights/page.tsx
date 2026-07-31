import { formatMoney, type Job } from '@/lib/jobs';
import { formatLeadSource, type Lead, type LeadSource } from '@/lib/leads';
import type { FunnelStage, RevenueMonth } from '@/lib/insights';
import { DEMO_JOBS, DEMO_LEADS, DEMO_TRAILING_VOLUME } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

// Static time-window tabs. The real page links each to ?window=…; the demo is
// read-only, so they render as a non-interactive, pre-selected control.
const WINDOWS: { key: string; label: string }[] = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '365', label: '12 months' },
  { key: 'all', label: 'All time' },
];
const SELECTED_WINDOW = '365';

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// --- Funnel derived from the demo leads -------------------------------------
const totalLeads = DEMO_LEADS.length;
const quotedLeads = DEMO_LEADS.filter((lead: Lead) => lead.status === 'quoted' || lead.status === 'won').length;
const wonLeads = DEMO_LEADS.filter((lead: Lead) => lead.status === 'won').length;

const funnel: FunnelStage[] = [
  { key: 'leads', label: 'Leads', count: totalLeads, rateOfPrev: 100 },
  { key: 'quoted', label: 'Quoted', count: quotedLeads, rateOfPrev: pct(quotedLeads, totalLeads) },
  { key: 'won', label: 'Won', count: wonLeads, rateOfPrev: pct(wonLeads, quotedLeads) },
];
const leadsTop = Math.max(1, funnel[0].count);

const winRate = pct(wonLeads, quotedLeads);
const overallConversion = pct(wonLeads, totalLeads);

// --- Money -------------------------------------------------------------------
// Collected = trailing 12-month paid volume. Costs follow the same split the
// demo dataset uses for every job (materials + sub ≈ 42%, labor ≈ 26%), so the
// margin story stays consistent with the Jobs pages.
const collected = DEMO_TRAILING_VOLUME;
const materialsCost = Math.round(collected * 0.42);
const laborCost = Math.round(collected * 0.26);
const costs = materialsCost + laborCost;
const grossProfit = collected - costs;
const marginPct = Math.round((grossProfit / collected) * 100);

const costTotal = Math.max(1, costs);
const materialsWidth = Math.round((materialsCost / costTotal) * 100);
const laborWidth = 100 - materialsWidth;

const quotedJobs = DEMO_JOBS.filter((job: Job) => job.quoted_amount > 0);
const avgQuoteValue = quotedJobs.length
  ? quotedJobs.reduce((sum, job) => sum + job.quoted_amount, 0) / quotedJobs.length
  : 0;

// --- Revenue trend: spread trailing volume across the last 6 months ----------
// A lawn & landscape shop ramps hard into summer, so the recent months carry a
// seasonal weight. Profit kept per month follows the same margin.
const MONTH_WEIGHTS = [0.11, 0.14, 0.18, 0.2, 0.19, 0.18]; // Feb→Jul style curve
const RECENT_VOLUME = Math.round(collected * 0.62); // share of annual paid in the last 6 months

const revenueByMonth: RevenueMonth[] = (() => {
  const now = new Date();
  const months = MONTH_WEIGHTS.length;
  return MONTH_WEIGHTS.map((weight, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    const total = Math.round(RECENT_VOLUME * weight);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      total,
      profit: Math.round(total * (grossProfit / collected)),
    };
  });
})();
const peakMonthTotal = Math.max(1, ...revenueByMonth.map((month) => month.total));

// --- Top job types -----------------------------------------------------------
// Each job is bucketed into a single service line by its scope, then ranked by
// job count (revenue shown alongside).
const JOB_TYPE_RULES: { label: string; test: (scope: string) => boolean }[] = [
  { label: 'Retaining walls', test: (s) => s.includes('retaining wall') },
  { label: 'Irrigation', test: (s) => s.includes('irrigation') },
  { label: 'Drainage', test: (s) => s.includes('drain') },
  { label: 'Outdoor lighting', test: (s) => s.includes('lighting') },
  { label: 'Patios & hardscape', test: (s) => s.includes('patio') || s.includes('paver') || s.includes('flagstone') || s.includes('walkway') },
  { label: 'Lawn & sod', test: (s) => s.includes('sod') || s.includes('hydroseed') || s.includes('new lawn') },
  { label: 'Landscape design & install', test: () => true },
];

function classifyJob(job: Job): string {
  const scope = (job.scope ?? '').toLowerCase();
  return (JOB_TYPE_RULES.find((rule) => rule.test(scope)) ?? JOB_TYPE_RULES[JOB_TYPE_RULES.length - 1]).label;
}

const jobTypeMap = new Map<string, { count: number; revenue: number }>();
for (const job of DEMO_JOBS) {
  const label = classifyJob(job);
  const entry = jobTypeMap.get(label) ?? { count: 0, revenue: 0 };
  entry.count += 1;
  entry.revenue += job.quoted_amount;
  jobTypeMap.set(label, entry);
}
const topJobTypes = Array.from(jobTypeMap.entries())
  .map(([label, value]) => ({ label, ...value }))
  .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
  .slice(0, 5);
const topTypeCount = Math.max(1, ...topJobTypes.map((type) => type.count));

// --- Lead source breakdown ---------------------------------------------------
const leadSourceMap = new Map<LeadSource, number>();
for (const lead of DEMO_LEADS) {
  leadSourceMap.set(lead.source, (leadSourceMap.get(lead.source) ?? 0) + 1);
}
const leadSources = Array.from(leadSourceMap.entries())
  .map(([source, count]) => ({ source, label: formatLeadSource(source), count }))
  .sort((a, b) => b.count - a.count);
const topSourceCount = Math.max(1, ...leadSources.map((source) => source.count));

export default function DemoInsightsPage() {
  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Insights</p>
          <h1 className="workspace-title">Profit, cash &amp; conversion</h1>
          <p className="workspace-lead">
            What Evergreen Lawn &amp; Landscape collected, what they kept, and what turned into won
            work — last 12 months.
          </p>
          <div className="insight-window-tabs" role="tablist" aria-label="Time window">
            {WINDOWS.map((option) => (
              <span
                key={option.key}
                className={`insight-window-tab${option.key === SELECTED_WINDOW ? ' is-active' : ''}`}
                role="tab"
                aria-selected={option.key === SELECTED_WINDOW}
                aria-disabled="true"
              >
                {option.label}
              </span>
            ))}
          </div>
        </div>
        <div className="insight-hero-visual">
          <div className="insight-ring-wrap">
            <div
              className="insight-ring"
              style={{ ['--ring' as string]: marginPct }}
              role="img"
              aria-label={`Margin ${marginPct}% — ${formatMoney(grossProfit)} kept of ${formatMoney(collected)} collected.`}
            />
            <div className="insight-ring-label">
              <span className="insight-ring-value">{marginPct}%</span>
              <span className="insight-ring-caption">margin</span>
            </div>
          </div>
          <p className="insight-ring-foot">
            You kept <strong>{formatMoney(grossProfit)}</strong> of the {formatMoney(collected)} you collected.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Money</p>
          <h2>What you kept — last 12 months</h2>
        </div>
        <div className="workspace-metric-grid four-up">
          <article className="workspace-metric-card accent">
            <span className="workspace-metric-label">Collected</span>
            <strong className="workspace-metric-value">{formatMoney(collected)}</strong>
            <p className="workspace-metric-note">Payments paid in this window.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Gross profit</span>
            <strong className="workspace-metric-value">{formatMoney(grossProfit)}</strong>
            <p className="workspace-metric-note">Collected minus {formatMoney(costs)} in costs.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Margin</span>
            <strong className="workspace-metric-value">{marginPct}%</strong>
            <p className="workspace-metric-note">Share of every dollar you keep.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Win rate</span>
            <strong className="workspace-metric-value">{winRate}%</strong>
            <p className="workspace-metric-note">Quotes that turned into won work.</p>
          </article>
        </div>

        <div className="cost-split">
          <div className="cost-split-heading">
            <span>Where it went</span>
            <span className="cost-split-total">{formatMoney(costs)} in costs</span>
          </div>
          <div
            className="cost-split-track"
            role="img"
            aria-label={`Costs: ${formatMoney(materialsCost)} materials, ${formatMoney(laborCost)} labor`}
          >
            <div className="cost-split-seg materials" style={{ width: `${materialsWidth}%` }} />
            <div className="cost-split-seg labor" style={{ width: `${laborWidth}%` }} />
          </div>
          <div className="cost-split-legend">
            <span><i className="dot materials" /> Materials &amp; supplies {formatMoney(materialsCost)}</span>
            <span><i className="dot labor" /> Labor {formatMoney(laborCost)}</span>
          </div>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Conversion funnel</p>
          <h2>Lead → Quoted → Won</h2>
        </div>
        <div className="funnel">
          {funnel.map((stage, index) => {
            const width = Math.max(4, Math.round((stage.count / leadsTop) * 100));
            const previous = index > 0 ? funnel[index - 1] : null;
            const lost = previous ? previous.count - stage.count : 0;
            return (
              <div className="funnel-stage" key={stage.key}>
                <div className="funnel-stage-head">
                  <span className="funnel-stage-label">{stage.label}</span>
                  <span className="funnel-stage-count">{stage.count.toLocaleString()}</span>
                </div>
                <div className="funnel-track">
                  <div className={`funnel-bar funnel-bar-${stage.key}`} style={{ width: `${width}%` }} />
                </div>
                <div className="funnel-stage-foot">
                  <span className="funnel-stage-rate">
                    {previous ? `${stage.rateOfPrev}% of ${previous.label.toLowerCase()}` : 'Top of funnel'}
                  </span>
                  {lost > 0 ? <span className="funnel-stage-drop">−{lost.toLocaleString()} dropped off</span> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="workspace-metric-grid condensed insight-secondary">
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Lead → won</span>
            <strong className="workspace-metric-value">{overallConversion}%</strong>
            <p className="workspace-metric-note">Overall conversion from every lead.</p>
          </article>
          <article className="workspace-metric-card">
            <span className="workspace-metric-label">Avg job value</span>
            <strong className="workspace-metric-value">{formatMoney(avgQuoteValue)}</strong>
            <p className="workspace-metric-note">Average quoted amount across jobs.</p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Revenue &amp; profit</p>
          <h2>Collected, last 6 months</h2>
        </div>
        <div
          className="revenue-chart"
          role="img"
          aria-label="Monthly collected revenue and profit for the last six months"
        >
          <div className="revenue-chart-grid" aria-hidden="true" />
          {revenueByMonth.map((month) => {
            const height = Math.max(2, Math.round((month.total / peakMonthTotal) * 100));
            const profitShare = month.total > 0 ? Math.max(0, Math.min(100, Math.round((month.profit / month.total) * 100))) : 0;
            const isPeak = month.total > 0 && month.total === peakMonthTotal;
            return (
              <div className={`revenue-col${isPeak ? ' is-peak' : ''}`} key={month.key}>
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

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Where the work is</p>
          <h2>Top job types</h2>
        </div>
        <div className="funnel">
          {topJobTypes.map((type) => {
            const width = Math.max(4, Math.round((type.count / topTypeCount) * 100));
            return (
              <div className="funnel-stage" key={type.label}>
                <div className="funnel-stage-head">
                  <span className="funnel-stage-label">{type.label}</span>
                  <span className="funnel-stage-count">
                    {type.count} · {formatMoney(type.revenue)}
                  </span>
                </div>
                <div className="funnel-track">
                  <div className="funnel-bar funnel-bar-quoted" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Where leads come from</p>
          <h2>Lead source breakdown</h2>
        </div>
        <div className="funnel">
          {leadSources.map((source) => {
            const width = Math.max(4, Math.round((source.count / topSourceCount) * 100));
            return (
              <div className="funnel-stage" key={source.source}>
                <div className="funnel-stage-head">
                  <span className="funnel-stage-label">{source.label}</span>
                  <span className="funnel-stage-count">{source.count}</span>
                </div>
                <div className="funnel-track">
                  <div className="funnel-bar funnel-bar-leads" style={{ width: `${width}%` }} />
                </div>
                <span className="funnel-stage-rate">{pct(source.count, totalLeads)}% of all leads</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
