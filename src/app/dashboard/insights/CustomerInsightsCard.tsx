import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { CustomerInsights } from '@/lib/insights-metrics';

// Who your customers are, as three facts you can act on: how many come back, how
// many have gone quiet, and how much recurring work is on the books. "Gone quiet"
// is careful — it means nothing booked ahead AND no activity for the threshold,
// so a customer with a visit on the calendar is never counted however long ago
// the last one was. Maintenance is reported as active plans and their monthly
// value rather than a "due this week" count, because nothing links a plan to a
// concrete next date and a confident wrong number beside the money is worse than
// an honest one. Server-only.

export default function CustomerInsightsCard({ customers }: { customers: CustomerInsights }) {
  const { totalClients, repeatClients, repeatRatePct, inactiveClients, inactiveThresholdDays, activeMaintenancePlans, maintenanceMonthly } =
    customers;

  return (
    <section className="panel ins-card ins-cust-card">
      <p className="ins-card-head">
        <span className="ins-chip is-cust" aria-hidden="true">◕</span> Customer insights
      </p>

      {totalClients === 0 ? (
        <p className="ins-empty-note">
          Once you&apos;ve added customers, your repeat rate, who&apos;s gone quiet, and recurring work all appear
          here.
        </p>
      ) : (
        <>
          <div className="ins-cust-grid">
            <div className="ins-cust-stat">
              <span className="ins-figure-label">Repeat rate</span>
              <strong className="ins-mid">{repeatRatePct === null ? '—' : `${repeatRatePct}%`}</strong>
              <span className="ins-sub">
                {repeatClients} customer{repeatClients === 1 ? '' : 's'} came back for more
              </span>
            </div>
            <div className="ins-cust-stat">
              <span className="ins-figure-label">Gone quiet</span>
              <strong className={`ins-mid${inactiveClients > 0 ? ' is-warn' : ''}`}>{inactiveClients}</strong>
              <span className="ins-sub">no visit in {inactiveThresholdDays}+ days, nothing booked ahead</span>
            </div>
            <div className="ins-cust-stat">
              <span className="ins-figure-label">On a maintenance plan</span>
              <strong className="ins-mid">{activeMaintenancePlans}</strong>
              <span className="ins-sub">
                {maintenanceMonthly > 0 ? `${formatMoney(maintenanceMonthly)}/mo recurring` : 'recurring agreements'}
              </span>
            </div>
          </div>

          <div className="ins-card-foot">
            <span>{totalClients} customer{totalClients === 1 ? '' : 's'} in total.</span>
            <Link className="ins-inline-link" href="/dashboard/clients">View customers →</Link>
          </div>
        </>
      )}
    </section>
  );
}
