import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { JobProfitability } from '@/lib/insights-metrics';

/**
 * Job-level profitability: reveals where the business actually made money versus
 * where costs eroded margin or exceeded the quoted budget.
 */
export default function JobProfitabilityCard({
  profitability,
  basePath = '/dashboard',
}: {
  profitability: JobProfitability;
  basePath?: string;
}) {
  const { winners, bleeders, overruns, totalProfit, overallMarginPct, measuredJobs, hasData } = profitability;

  if (!hasData || measuredJobs === 0) {
    return (
      <section className="panel ins-card ins-profitability-card">
        <p className="ins-card-head">
          <span className="ins-chip is-ok" aria-hidden="true">★</span> Job profitability
        </p>
        <p className="ins-empty-note">
          As jobs are completed and costs are logged, your highest-margin winners and cost-overrun alerts will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel ins-card ins-profitability-card">
      <p className="ins-card-head">
        <span className="ins-chip is-ok" aria-hidden="true">★</span> Job profitability &amp; variance
      </p>

      <div className="ins-figures" style={{ marginBottom: '1rem' }}>
        <div className="ins-figure">
          <span className="ins-figure-label">Tracked profit</span>
          <strong className={`ins-figure-value${totalProfit < 0 ? ' is-negative' : ' is-positive'}`}>
            {totalProfit < 0 ? `−${formatMoney(Math.abs(totalProfit))}` : formatMoney(totalProfit)}
          </strong>
        </div>
        <div className="ins-figure">
          <span className="ins-figure-label">Overall margin</span>
          <strong className={`ins-figure-value${overallMarginPct < 0 ? ' is-negative' : ''}`}>
            {overallMarginPct}%
          </strong>
        </div>
        <div className="ins-figure">
          <span className="ins-figure-label">Analyzed jobs</span>
          <strong className="ins-figure-value">{measuredJobs}</strong>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        {/* Top Winners */}
        <div>
          <span className="ins-figure-label" style={{ color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
            <span>↑</span> Top margin winners
          </span>
          {winners.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {winners.map((job) => (
                <li key={job.jobId} style={{ padding: '0.5rem 0.75rem', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Link href={`${basePath}/jobs/${job.jobId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                      {job.clientName} {job.ref ? `(${job.ref})` : ''}
                    </Link>
                    <strong style={{ color: '#166534' }}>+{formatMoney(job.profit)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.78rem', marginTop: '2px' }}>
                    <span>{job.marginPct}% margin · Rev {formatMoney(job.revenue)}</span>
                    <span>Costs {formatMoney(job.costs)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ins-empty-note" style={{ fontSize: '0.8rem' }}>No high-margin jobs in this period.</p>
          )}
        </div>

        {/* Margin Bleeders / Losses */}
        <div>
          <span className="ins-figure-label" style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
            <span>↓</span> Tight or negative margin
          </span>
          {bleeders.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {bleeders.map((job) => (
                <li key={job.jobId} style={{ padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Link href={`${basePath}/jobs/${job.jobId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                      {job.clientName} {job.ref ? `(${job.ref})` : ''}
                    </Link>
                    <strong style={{ color: job.profit < 0 ? '#b91c1c' : '#854d0e' }}>
                      {job.profit < 0 ? `−${formatMoney(Math.abs(job.profit))}` : formatMoney(job.profit)}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.78rem', marginTop: '2px' }}>
                    <span>{job.marginPct}% margin</span>
                    <span>Costs {formatMoney(job.costs)} of {formatMoney(job.revenue)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ins-empty-note" style={{ fontSize: '0.8rem' }}>No margin bleeders recorded.</p>
          )}
        </div>

        {/* Quoted vs Actual Overruns */}
        {overruns.length > 0 ? (
          <div>
            <span className="ins-figure-label" style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
              <span>!</span> Cost exceeded quote
            </span>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {overruns.map((job) => (
                <li key={job.jobId} style={{ padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Link href={`${basePath}/jobs/${job.jobId}`} style={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                      {job.clientName}
                    </Link>
                    <strong style={{ color: '#b45309' }}>+{formatMoney(job.costOverrun)} over</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: '0.78rem', marginTop: '2px' }}>
                    <span>Quoted {formatMoney(job.quotedAmount)}</span>
                    <span>Actual costs {formatMoney(job.costs)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="ins-card-foot" style={{ marginTop: '1rem' }}>
        <span>Compares billed payments or signed quotes against recorded labor &amp; material expenses.</span>
        <Link className="ins-inline-link" href={`${basePath}/jobs`}>All jobs →</Link>
      </div>
    </section>
  );
}
