import Link from 'next/link';
import { createAdminClient, requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { buildInsights, resolvePeriod, PERIOD_PRESETS, type Delta, type Insights } from '@/lib/insights';
import type { Kpi } from '@/lib/insights-metrics';
import { buildFillScheduleCopy, TEMPLATES } from '@/lib/campaign-templates';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import { loadArrivalAnalytics } from '@/lib/arrival-analytics-data';
import ArrivalPerformance from './ArrivalPerformance';
import KpiCard from './KpiCard';
import InsightsHeaderControls from './InsightsHeaderControls';
import RevenueOverTimeChart from './RevenueOverTimeChart';
import SalesFunnelCard from './SalesFunnelCard';
import ScheduleUtilizationCard from './ScheduleUtilizationCard';
import QuotesFollowUpCard from './QuotesFollowUpCard';
import PaymentHealthCard from './PaymentHealthCard';
import CustomerInsightsCard from './CustomerInsightsCard';
import TopOpportunities from './TopOpportunities';
import RevenueByServiceDonut from './RevenueByServiceDonut';
import MarketingPerformanceCard from './MarketingPerformanceCard';
import ExportInsightsModal from './ExportInsightsModal';

export const metadata = {
  title: 'Insights',
  description: 'What you earned, where work is getting stuck, and what to improve next.',
};

/**
 * A ▲/▼ pill against the previous equal period.
 *
 * `tone` is separate from direction on purpose. Costs rising is an UP arrow and
 * bad news; profit rising is an up arrow and good news. One component that
 * paints every up arrow green would quietly congratulate a contractor on
 * spending more.
 */
function DeltaPill({ delta, tone = 'up-good', unit = '%' }: { delta: Delta | undefined; tone?: 'up-good' | 'up-bad'; unit?: string }) {
  if (!delta) return null;
  if (delta.pct === null) {
    return delta.direction === 'up' ? <span className="ins-delta is-good">New</span> : null;
  }
  if (delta.direction === 'flat') return <span className="ins-delta is-flat">– no change</span>;
  const good = tone === 'up-good' ? delta.direction === 'up' : delta.direction === 'down';
  const glyph = delta.direction === 'up' ? '↑' : '↓';
  return (
    <span className={`ins-delta ${good ? 'is-good' : 'is-bad'}`}>
      {glyph} {Math.abs(delta.pct)}{unit === 'pp' ? 'pp' : '%'} <em>vs previous period</em>
    </span>
  );
}

/** A number the page can't honestly produce yet, said as such. */
function Unknown({ hint }: { hint: string }) {
  return <span className="ins-unknown" title={hint}>—</span>;
}

function hours(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} hrs`;
  return `${(value / 24).toFixed(1)} days`;
}

/**
 * Quick Stops, as a business line.
 *
 * The split at the top is the point of the card. A Quick Stop earns a SPEED FEE
 * — what a homeowner paid to be moved up today's route — and then whatever the
 * visit turned into. Reported as one figure they're indistinguishable, and the
 * question the card exists to answer ("is charging for speed worth doing?")
 * can't be asked at all.
 */
function QuickStops({ insights }: { insights: Insights }) {
  const qs = insights.quickStops;
  if (!qs.hasAny) return null;

  const total = qs.totalRevenue;
  const feeShare = total > 0 ? Math.round((qs.feeRevenue / total) * 100) : 0;
  const stats: Array<{ label: string; value: string; note: string }> = [
    {
      label: 'Completed',
      value: String(qs.completed),
      note: qs.completed === 1 ? 'stop finished' : 'stops finished',
    },
    { label: 'Customers offered', value: String(qs.offered), note: 'sent a time and a price' },
    { label: 'Customers accepted', value: String(qs.accepted), note: 'paid the fee and got a slot' },
    {
      label: 'Average value',
      value: qs.averageValue !== null ? formatMoney(qs.averageValue) : '—',
      note: qs.earningStops > 0
        ? `fee and work, across ${qs.earningStops} stop${qs.earningStops === 1 ? '' : 's'} that earned`
        : 'nothing has been paid yet',
    },
    {
      label: 'Average speed fee',
      value: qs.averageFee !== null ? formatMoney(qs.averageFee) : '—',
      note: qs.paidFees > 0
        ? `across ${qs.paidFees} fee${qs.paidFees === 1 ? '' : 's'} paid`
        : 'no fee has been paid yet',
    },
  ];

  return (
    <section className="panel ins-card insq-card">
      <p className="ins-card-head">
        <span className="ins-chip is-speed" aria-hidden="true">⚡</span> Quick Stops — {insights.windowLabel}
      </p>

      <div className="insq-money">
        <div className="insq-total">
          <span className="ins-figure-label">Total Quick Stops revenue</span>
          <strong className="ins-big">{formatMoney(total)}</strong>
        </div>
        {total > 0 ? (
          <>
            <div className="insq-split" role="img" aria-label={`Speed fees ${feeShare}% of Quick Stop revenue, service work ${100 - feeShare}%`}>
              <span className="insq-seg is-fee" style={{ width: `${feeShare}%` }} />
              <span className="insq-seg is-service" style={{ width: `${100 - feeShare}%` }} />
            </div>
            <div className="insq-legend">
              <span className="insq-key">
                <i className="insq-dot is-fee" aria-hidden="true" /> Speed fees
                <strong>{formatMoney(qs.feeRevenue)}</strong>
                <em>{feeShare}%</em>
              </span>
              <span className="insq-key">
                <i className="insq-dot is-service" aria-hidden="true" /> Service work
                <strong>{formatMoney(qs.serviceRevenue)}</strong>
                <em>{100 - feeShare}%</em>
              </span>
            </div>
          </>
        ) : (
          <p className="ins-empty-note">
            No Quick Stop money has landed in this period. The fee is charged when a customer accepts, so
            revenue shows up here the moment one does.
          </p>
        )}
      </div>

      <div className="insq-stats">
        {stats.map((stat) => (
          <div className="insq-stat" key={stat.label}>
            <span className="ins-figure-label">{stat.label}</span>
            <strong className="ins-mid">{stat.value}</strong>
            <span className="ins-sub">{stat.note}</span>
          </div>
        ))}
      </div>

      <div className="insq-rate">
        <span className="ins-figure-label">Acceptance rate</span>
        {qs.acceptanceRate !== null ? (
          <>
            <strong className="ins-mid">{qs.acceptanceRate}%</strong>
            <div className="ins-meter" role="img" aria-label={`${qs.acceptanceRate}% of Quick Stop offers were accepted`}>
              <div className="ins-meter-fill" style={{ width: `${qs.acceptanceRate}%` }} />
            </div>
            <span className="ins-sub">
              {qs.accepted} of the {qs.offered} offer{qs.offered === 1 ? '' : 's'} you sent in this period were
              paid for. Counted on the offers themselves, so a slow yes still lands against the day you asked.
            </span>
          </>
        ) : (
          <>
            <strong className="ins-mid"><Unknown hint="No Quick Stop offer was sent in this period." /></strong>
            <span className="ins-sub">Needs at least one offer sent in this period.</span>
          </>
        )}
      </div>

      {/* --- funnel ---------------------------------------------------------
          Offered -> Accepted -> Completed. Counted from the timestamps, not the
          current status: a finished stop was offered and accepted at some point,
          and status only remembers where it ended up. */}
      {qs.offered > 0 ? (
        <div className="insq-funnel" role="img" aria-label={`${qs.offered} offered, ${qs.accepted} accepted, ${qs.completed} completed`}>
          {[
            { key: 'offered', label: 'Offered', value: qs.offered },
            { key: 'accepted', label: 'Accepted', value: qs.accepted },
            { key: 'completed', label: 'Completed', value: qs.completed },
          ].map((stage) => (
            <div className={`insq-funnel-stage is-${stage.key}`} key={stage.key}>
              <strong>{stage.value}</strong>
              <span>{stage.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* --- the road cost --------------------------------------------------
          The one thing a Quick Stop can measure that no other job can: it knows
          how far off-route it was. Every figure here is over the stops that
          actually recorded a detour, and says so. */}
      {qs.measuredStops > 0 ? (
        <div className="insq-efficiency">
          <span className="ins-figure-label">What the detours cost — {qs.measuredStops} measured stop{qs.measuredStops === 1 ? '' : 's'}</span>
          <div className="insq-effgrid">
            <div>
              <span className="ins-sub">Avg added time</span>
              <strong className="ins-mid">{qs.avgAddedMinutes !== null ? `${qs.avgAddedMinutes} min` : <Unknown hint="No stop recorded how much longer the day got." />}</strong>
            </div>
            <div>
              <span className="ins-sub">Avg detour</span>
              <strong className="ins-mid">{qs.avgAddedMiles !== null ? `${qs.avgAddedMiles} mi` : <Unknown hint="No stop recorded a detour distance." />}</strong>
            </div>
            <div>
              <span className="ins-sub">Revenue per added hour</span>
              <strong className="ins-mid is-good">{qs.revenuePerAddedHour !== null ? formatMoney(qs.revenuePerAddedHour) : <Unknown hint="Needs at least one stop with a recorded time cost." />}</strong>
            </div>
            <div>
              <span className="ins-sub">Revenue per added mile</span>
              <strong className="ins-mid">{qs.revenuePerAddedMile !== null ? formatMoney(qs.revenuePerAddedMile) : <Unknown hint="Needs at least one stop with a recorded detour." />}</strong>
            </div>
          </div>
          {qs.revenuePerAddedHour !== null ? (
            <p className="insq-topline">
              Quick Stops earned <strong>{formatMoney(qs.revenuePerAddedHour)}</strong> per extra hour on the road
              {qs.bestDay ? <> · busiest day is <strong>{qs.bestDay.label}</strong></> : null}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* --- opportunity ----------------------------------------------------
          Missed counts only what the CONTRACTOR declined or let lapse — a stop
          the homeowner walked away from is not one you can go back and win. */}
      <div className="insq-opportunity">
        <span className="ins-figure-label">Opportunity</span>
        <div className="insq-oppgrid">
          <div>
            <span className="ins-sub">Requests received</span>
            <strong className="ins-mid">{qs.requested}</strong>
          </div>
          <div>
            <span className="ins-sub">Declined or expired</span>
            <strong className={`ins-mid${qs.missed > 0 ? ' is-warn' : ''}`}>{qs.missed}</strong>
          </div>
          <div>
            <span className="ins-sub">Still ahead</span>
            <strong className="ins-mid">{qs.upcoming}</strong>
          </div>
          <div>
            <span className="ins-sub">Est. value passed up</span>
            <strong className="ins-mid">
              {qs.missedRevenue !== null ? formatMoney(qs.missedRevenue) : (
                <Unknown hint="An estimate at your median stop value — needs at least three earning stops before it means anything." />
              )}
            </strong>
          </div>
        </div>
        {qs.repeatCustomers > 0 || qs.highestValue !== null ? (
          <p className="ins-sub insq-oppfoot">
            {qs.highestValue !== null ? <>Best single stop {formatMoney(qs.highestValue)}. </> : null}
            {qs.repeatCustomers > 0
              ? `${qs.repeatCustomers} customer${qs.repeatCustomers === 1 ? ' has' : 's have'} taken more than one.`
              : null}
          </p>
        ) : null}
      </div>

      <div className="insq-crew">
        <span className="ins-figure-label">Crew with the most Quick Stops</span>
        {qs.crew.length > 0 ? (
          <ol className="insq-crew-list">
            {qs.crew.slice(0, 5).map((member, index) => (
              <li key={member.crewId} className={index === 0 ? 'is-top' : undefined}>
                <span className="insq-crew-name">{member.name}</span>
                <span className="insq-crew-count">{member.stops}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="ins-empty-note">
            {qs.completed > 0
              ? 'No crew was assigned to the Quick Stops finished in this period, so there is nobody to rank.'
              : 'Nobody has finished a Quick Stop in this period yet.'}
          </p>
        )}
      </div>

      <div className="ins-card-foot">
        <Link className="ins-inline-link" href="/dashboard/quick-stops">Open Quick Stops →</Link>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function ExecutiveSummary({ insights }: { insights: Insights }) {
  const { summary } = insights;
  const isLoss = summary.profit < 0;
  // Three bars on one scale, not a stacked one.
  //
  // A stack only tells the truth while costs fit inside revenue. Spend more
  // than you collect and the costs segment has to be clamped at 100% — which
  // is exactly the month you most need to see that it didn't fit. Measured on
  // a real account: $5,055 collected against $10,626 of costs rendered as two
  // equal bars and a legend claiming "Costs (100%)".
  const revenue = Math.max(summary.revenue, 0);
  const scale = Math.max(revenue, summary.costs, Math.abs(summary.profit), 1);
  const share = (value: number) => Math.max(0, Math.round((value / scale) * 100));
  // Percentages are OF REVENUE and deliberately uncapped: costs at 210% of what
  // came in is the number, and rounding it down to 100 hides the whole problem.
  const ofRevenue = (value: number) => (revenue > 0 ? `${Math.round((value / revenue) * 100)}%` : '—');
  const bars = [
    { key: 'revenue', label: 'Revenue', value: summary.revenue, pct: revenue > 0 ? '100%' : '—' },
    { key: 'costs', label: 'Costs', value: summary.costs, pct: ofRevenue(summary.costs) },
    { key: 'profit', label: 'Profit', value: summary.profit, pct: ofRevenue(summary.profit) },
  ];

  return (
    <section className="panel ins-summary">
      <div className="ins-summary-main">
        <p className="eyebrow">Summary — {insights.windowLabel}</p>
        <h2 className="ins-summary-headline">
          {summary.revenue === 0
            ? 'No payments collected in this period'
            : isLoss
              // Both the headline and the figure below format the SAME absolute
              // value, so they can't round to two different dollar amounts and
              // read as a $1 error in the arithmetic.
              ? `You spent ${formatMoney(Math.abs(summary.profit))} more than you collected`
              : `You kept ${formatMoney(summary.profit)} ${insights.period.sentenceLabel}`}
        </h2>

        <div className="ins-figures">
          <div className="ins-figure">
            <span className="ins-figure-label">Revenue</span>
            <strong className="ins-figure-value">{formatMoney(summary.revenue)}</strong>
            <DeltaPill delta={summary.deltas.revenue} />
          </div>
          <div className="ins-figure">
            <span className="ins-figure-label">Costs</span>
            <strong className="ins-figure-value">{formatMoney(summary.costs)}</strong>
            <DeltaPill delta={summary.deltas.costs} tone="up-bad" />
          </div>
          <div className="ins-figure">
            <span className="ins-figure-label">Profit</span>
            <strong className={`ins-figure-value${isLoss ? ' is-negative' : ' is-positive'}`}>
              {isLoss ? `−${formatMoney(Math.abs(summary.profit))}` : formatMoney(summary.profit)}
            </strong>
            <DeltaPill delta={summary.deltas.profit} />
          </div>
          <div className="ins-figure">
            <span className="ins-figure-label">Profit margin</span>
            <strong className={`ins-figure-value${isLoss ? ' is-negative' : ''}`}>{summary.marginPct}%</strong>
            <DeltaPill delta={summary.deltas.margin} unit="pp" />
          </div>
        </div>

        {!insights.costsRecorded && summary.revenue > 0 ? (
          <p className="ins-caveat">
            No costs are recorded in this period, so &ldquo;profit&rdquo; here is simply your revenue.{' '}
            <Link href="/dashboard/jobs">Add costs to a job</Link> and these figures become real.
          </p>
        ) : null}
      </div>

      <div className="ins-breakdown">
        <p className="eyebrow">Revenue breakdown</p>
        {revenue > 0 || summary.costs > 0 ? (
          <div
            className="ins-splits"
            role="img"
            aria-label={`Of ${formatMoney(summary.revenue)} collected, ${formatMoney(summary.costs)} went on costs, leaving ${formatMoney(summary.profit)}.`}
          >
            {bars.map((bar) => (
              <div className="ins-split" key={bar.key}>
                <span className="ins-split-label"><i className={`ins-dot is-${bar.key}`} /> {bar.label}</span>
                <div className="ins-split-track">
                  <div
                    className={`ins-split-fill is-${bar.key}${bar.value < 0 ? ' is-negative' : ''}`}
                    style={{ width: `${Math.max(bar.value === 0 ? 0 : 2, share(Math.abs(bar.value)))}%` }}
                  />
                </div>
                <b className={bar.value < 0 ? 'is-negative' : undefined}>
                  {bar.value < 0 ? `−${formatMoney(Math.abs(bar.value))}` : formatMoney(bar.value)}
                </b>
                <span className="ins-split-pct">{bar.pct}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="ins-empty-note">Once a payment lands, this splits your revenue into what it cost and what you kept.</p>
        )}

        <div className="ins-subfigures">
          <div>
            <span className="ins-figure-label">Quoted</span>
            <strong>{formatMoney(summary.quotedRevenue)}</strong>
            <DeltaPill delta={summary.deltas.quotedRevenue} />
          </div>
          <div>
            <span className="ins-figure-label">Approved</span>
            <strong>{formatMoney(summary.approvedRevenue)}</strong>
            <DeltaPill delta={summary.deltas.approvedRevenue} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

// The six headline tiles, in mockup order. Each is honest at zero — an empty
// account renders six real $0 / 0 cards with their "why there's no comparison"
// notes, never a fabricated sample.
function KpiGrid({ kpis, showDelta }: { kpis: Insights['kpis']; showDelta: boolean }) {
  const order: Kpi[] = [
    kpis.grossRevenue,
    kpis.netCollected,
    kpis.jobsCompleted,
    kpis.quoteConversion,
    kpis.outstandingBalance,
    kpis.newCustomers,
  ];
  return (
    <section className="ins-kpi-grid" aria-label="Key metrics for the selected period">
      {order.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} showDelta={showDelta} />
      ))}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: { window?: string; from?: string; to?: string; compare?: string };
}) {
  const { supabase, accountId } = await requireOwnerContext();
  const period = resolvePeriod(searchParams);
  const showDelta = searchParams.compare === 'prev';

  // The window/from/to the page is showing, forwarded to the export route so the
  // downloaded file matches exactly this view (compare is display-only).
  const exportParams = new URLSearchParams();
  if (searchParams.window) exportParams.set('window', searchParams.window);
  if (searchParams.from) exportParams.set('from', searchParams.from);
  if (searchParams.to) exportParams.set('to', searchParams.to);
  const exportQuery = exportParams.toString();

  // Account flag + published-site details in one round trip. business_name and
  // the site's company_name/subdomain are only needed to word and address the
  // schedule-filler campaign handoff below.
  const [{ data: account }, { data: siteRow }] = await Promise.all([
    supabase.from('accounts').select('arrival_updates_enabled, business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, published, subdomain').eq('account_id', accountId).maybeSingle(),
  ]);

  // job_tracking is owner-scoped by RLS; this page is already inside
  // requireOwnerContext. Arrival habits are measured over the same window.
  const arrivals = await loadArrivalAnalytics(createAdminClient(), accountId, period.days);
  const insights = await buildInsights(supabase, accountId, period, {
    arrivalUpdatesOn: Boolean(account?.arrival_updates_enabled),
    hasArrivalData: arrivals.summary.trips > 0,
  });

  // The schedule-filler campaign, drafted on the SERVER so the exact words the
  // owner is about to read don't get re-generated on arrival at the composer.
  // The identical draft feeds both Schedule Utilization's button and the
  // fill-schedule row of Top Opportunities, so the two can't drift apart. It
  // never sends — the button only opens the composer.
  const businessName = (siteRow?.company_name as string) || (account?.business_name as string) || 'your business';
  const origin = (process.env.NEXT_PUBLIC_APP_URL || `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com'}`).replace(/\/$/, '');
  const bookingUrl = siteRow?.published && siteRow?.subdomain ? `${origin}/book/${siteRow.subdomain}` : null;
  const fillMeta = TEMPLATES.find((template) => template.id === 'fill-next-week')!;
  const fillCopy = buildFillScheduleCopy({ businessName, openSlotCount: insights.scheduleUtilization.openDays, bookingUrl });
  const fillDraft: CampaignDraft = {
    channel: fillMeta.defaultChannel,
    audience: fillMeta.defaultAudience,
    subject: fillCopy.subject,
    subjectOptions: [],
    body: fillCopy.body,
    beatId: '',
    templateName: fillMeta.title,
    templateExplanation: fillMeta.oneLiner,
    sendTimeHint: fillMeta.sendTimeHint ?? undefined,
  };

  const hasJobValueTrend = insights.revenueByMonth.some((month) => month.avgJobValue > 0);
  const agingTotal = insights.cash.aging.reduce((sum, band) => sum + band.total, 0);
  const sourceTop = Math.max(1, ...insights.leadSources.map((row) => row.leads));

  // The average-job-value line, as a polyline over a 100×100 viewBox.
  const jvPoints = insights.revenueByMonth
    .map((month, index) => {
      const x = insights.revenueByMonth.length > 1 ? (index / (insights.revenueByMonth.length - 1)) * 100 : 50;
      const y = 100 - (month.avgJobValue / insights.peakAvgJobValue) * 88 - 6;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <main className="wide-shell workspace-shell ins-shell">
      <header className="ins-head">
        <div>
          <h1 className="ins-title">Insights</h1>
          <p className="ins-lead">See what you earned, where work is getting stuck, and what to improve next.</p>
        </div>
        <ExportInsightsModal query={exportQuery} periodLabel={period.label} />
      </header>

      <InsightsHeaderControls period={period} presets={PERIOD_PRESETS} searchParams={searchParams} />

      {!insights.hasAnyData ? (
        <section className="panel workspace-section-card">
          <p className="empty-state">
            Nothing to measure yet. As leads arrive, quotes go out and payments land, your profit, cash
            position and funnel appear here.
          </p>
        </section>
      ) : null}

      <KpiGrid kpis={insights.kpis} showDelta={showDelta} />

      <div className="ins-row ins-row-analytics">
        <section className="panel ins-card ins-revtime-card">
          <p className="ins-card-head">
            <span className="ins-chip is-chart" aria-hidden="true">▥</span> Revenue collected over time
          </p>
          <RevenueOverTimeChart
            trend={insights.revenueTrend}
            windowLabel={insights.windowLabel}
            sentenceLabel={insights.period.sentenceLabel}
            showPrevious={showDelta}
          />
        </section>

        <SalesFunnelCard funnel={insights.funnel6} windowLabel={insights.windowLabel} />
      </div>

      {/* Action grid — schedule / quotes / payment / customers, then the ranked
          "do this next" list. The older, denser report lives on below under
          "More detail" so nothing the previous page showed is lost. */}
      <div className="ins-row ins-row-actions3">
        <ScheduleUtilizationCard schedule={insights.scheduleUtilization} fillDraft={fillDraft} />
        <QuotesFollowUpCard opportunity={insights.opportunity} />
        <PaymentHealthCard health={insights.paymentHealth} />
      </div>

      <div className="ins-row ins-row-actions2">
        <CustomerInsightsCard customers={insights.customerInsights} />
        <TopOpportunities opportunities={insights.topOpportunities} fillDraft={fillDraft} />
      </div>

      {/* Revenue by service (approximate) beside what marketing actually sent. */}
      <div className="ins-row ins-row-2">
        <RevenueByServiceDonut revenue={insights.revenueByService} />
        <MarketingPerformanceCard marketing={insights.marketingPerformance} />
      </div>

      {/* More detail — the fuller report the mockup cards above summarize, kept
          so nothing the earlier page showed is lost. Hidden on an empty account,
          where the headline cards already read as "nothing yet." */}
      {insights.hasAnyData ? (
      <section className="ins-more" aria-labelledby="ins-more-heading">
      <div className="ins-more-head">
        <h2 id="ins-more-heading" className="ins-more-title">More detail</h2>
        <p className="ins-more-sub">
          The fuller picture behind the cards above — profit and costs, cash aging, where your work comes
          from, and Quick Stops.
        </p>
      </div>

      <ExecutiveSummary insights={insights} />
        <section className="panel ins-card">
          <p className="ins-card-head"><span className="ins-chip is-cash" aria-hidden="true">$</span> Cash position</p>
          <div className="ins-pair">
            <div>
              <span className="ins-figure-label">Outstanding invoices</span>
              <strong className="ins-big">{formatMoney(insights.cash.outstanding.total)}</strong>
              <span className="ins-sub">
                {insights.cash.outstanding.count === 0
                  ? 'Nothing outstanding'
                  : `${insights.cash.outstanding.count} invoice${insights.cash.outstanding.count === 1 ? '' : 's'} unpaid`}
              </span>
            </div>
            <div>
              <span className="ins-figure-label">Recurring / mo</span>
              <strong className="ins-big">{formatMoney(insights.cash.mrr.monthly)}</strong>
              <span className="ins-sub">
                {insights.cash.mrr.activePlans === 0 ? 'No active agreements' : 'From active agreements'}
              </span>
            </div>
          </div>

          {agingTotal > 0 ? (
            <div className="ins-aging">
              <p className="ins-aging-head">
                How long it&apos;s been owed
                <span>oldest {insights.cash.oldestUnpaidDays} days</span>
              </p>
              <div className="ins-aging-bars">
                {insights.cash.aging.map((band) => {
                  const share = Math.round((band.total / agingTotal) * 100);
                  return (
                    <div className="ins-aging-band" key={band.key} title={`${band.label}: ${formatMoney(band.total)}`}>
                      <div className="ins-aging-track">
                        <div className={`ins-aging-fill band-${band.tone}`} style={{ height: `${band.total > 0 ? Math.max(6, share) : 0}%` }} />
                      </div>
                      <span className="ins-aging-label">{band.label}</span>
                      <span className="ins-aging-value">{band.count > 0 ? formatMoney(band.total) : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="ins-card-foot">
            <span>
              {insights.cash.medianDaysToPayment !== null
                ? `Typically paid in ${insights.cash.medianDaysToPayment.toFixed(1)} days of being asked.`
                : 'Healthy cash flow requires consistent collections.'}
            </span>
            {/* /dashboard/invoices is not a route. There is no invoice list in
                the app at all — the jobs list is where what's owed shows. */}
            <Link href="/dashboard/jobs">Open jobs</Link>
          </div>
        </section>

      <div className="ins-row ins-row-3">
        <section className="panel ins-card">
          <p className="ins-card-head"><span className="ins-chip is-value" aria-hidden="true">◎</span> Average job value</p>
          <strong className="ins-big">{formatMoney(insights.jobValue.average)}</strong>
          <p className="ins-sub">
            {insights.jobValue.count > 0 ? (
              <>Median {formatMoney(insights.jobValue.median)} across {insights.jobValue.count} quoted job{insights.jobValue.count === 1 ? '' : 's'}</>
            ) : (
              'No jobs quoted in this period'
            )}
          </p>
          <DeltaPill delta={insights.jobValue.delta} />
          {hasJobValueTrend ? (
            <>
              <svg className="ins-line" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Average job value by month over the last six months">
                <polyline points={jvPoints} />
                {insights.revenueByMonth.map((month, index) => {
                  if (month.avgJobValue <= 0) return null;
                  const x = insights.revenueByMonth.length > 1 ? (index / (insights.revenueByMonth.length - 1)) * 100 : 50;
                  const y = 100 - (month.avgJobValue / insights.peakAvgJobValue) * 88 - 6;
                  return <circle key={month.key} cx={x} cy={y} r="2.4" />;
                })}
              </svg>
              <div className="ins-line-labels">
                {insights.revenueByMonth.map((month) => <span key={month.key}>{month.label}</span>)}
              </div>
            </>
          ) : (
            <p className="ins-empty-note">Quote a few jobs and the trend appears here.</p>
          )}
        </section>

        <section className="panel ins-card">
          <p className="ins-card-head"><span className="ins-chip is-ok" aria-hidden="true">✓</span> Arrival reliability</p>
          {arrivals.summary.onTimeRate !== null ? (
            <>
              <strong className="ins-big">{arrivals.summary.onTimeRate}%</strong>
              <p className="ins-sub">On-time arrival rate</p>
              <div className="ins-meter" role="img" aria-label={`On time on ${arrivals.summary.onTimeRate}% of measured trips`}>
                <div className="ins-meter-fill" style={{ width: `${arrivals.summary.onTimeRate}%` }} />
              </div>
              <div className="ins-meter-scale"><span>0%</span><span>100%</span></div>
              <p className="ins-sub">
                {arrivals.summary.onTime} of {arrivals.summary.measured} trips arrived inside the window.
              </p>
              <Link className="ins-inline-link" href="#arrival-performance">Full arrival breakdown ↓</Link>
            </>
          ) : (
            <>
              <strong className="ins-big"><Unknown hint="No trip both promised a window and recorded an arrival yet." /></strong>
              <p className="ins-sub">On-time arrival rate</p>
              <p className="ins-empty-note">
                This needs trips that both promised an arrival window and recorded an actual arrival. Send an
                &ldquo;On my way&rdquo; from a job and it starts measuring.
              </p>
            </>
          )}
        </section>

        <section className="panel ins-card">
          <p className="ins-card-head"><span className="ins-chip is-speed" aria-hidden="true">◔</span> Customer responsiveness</p>
          <div className="ins-stat-row">
            <span className="ins-figure-label">Quote turnaround</span>
            <strong className="ins-mid">
              {insights.responsiveness.quoteTurnaroundHours !== null
                ? hours(insights.responsiveness.quoteTurnaroundHours)
                : <Unknown hint="Needs a lead that turned into a job whose quote was shared with the customer." />}
            </strong>
            <span className="ins-sub">
              {insights.responsiveness.quoteTurnaroundSample > 0
                ? `Lead in → quote sent, across ${insights.responsiveness.quoteTurnaroundSample} lead${insights.responsiveness.quoteTurnaroundSample === 1 ? '' : 's'}`
                : 'Lead in → quote sent'}
            </span>
          </div>
          <div className="ins-stat-row">
            <span className="ins-figure-label">Payment response time</span>
            <strong className="ins-mid">
              {insights.responsiveness.paymentDays !== null
                ? `${insights.responsiveness.paymentDays.toFixed(1)} days`
                : <Unknown hint="Needs a payment that was requested and then paid." />}
            </strong>
            <span className="ins-sub">
              {insights.responsiveness.paymentSample > 0
                ? `Requested → paid, across ${insights.responsiveness.paymentSample} payment${insights.responsiveness.paymentSample === 1 ? '' : 's'}`
                : 'Requested → paid'}
            </span>
          </div>
        </section>
      </div>

      {insights.leadSources.length > 0 ? (
        <section className="panel ins-card">
          <p className="ins-card-head"><span className="ins-chip is-source" aria-hidden="true">◆</span> Where work comes from — {insights.windowLabel}</p>
          <div className="ins-sources">
            {insights.leadSources.map((row) => (
              <div className="ins-source" key={row.source}>
                <span className="ins-source-label">{row.label}</span>
                <div className="ins-source-track">
                  <div className="ins-source-fill" style={{ width: `${Math.max(4, Math.round((row.leads / sourceTop) * 100))}%` }} />
                </div>
                <span className="ins-source-count">{row.leads}</span>
                <span className="ins-source-win">{row.won > 0 ? `${row.winRate}% won` : '—'}</span>
              </div>
            ))}
          </div>
          <p className="ins-sub">
            Cost per lead needs advertising spend, which isn&apos;t recorded anywhere yet — so this ranks by
            volume and win rate rather than pretending to know what a lead cost.
          </p>
        </section>
      ) : null}

      <QuickStops insights={insights} />
      </section>
      ) : null}

      <ArrivalPerformance analytics={arrivals} />
    </main>
  );
}
