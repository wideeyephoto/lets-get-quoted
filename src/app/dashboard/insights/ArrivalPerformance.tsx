import type { ArrivalAnalytics } from '@/lib/arrival-analytics-data';

// "Are we there when we said we'd be?"
//
// The one number a contractor can put on a van. Everything else on this panel
// exists to explain it or to say honestly that we don't know yet — a metric
// that reports 0% when it means "no data" is a metric nobody trusts twice.

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function minutes(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return 'on time';
  return `${value} min`;
}

export default function ArrivalPerformance({ analytics }: { analytics: ArrivalAnalytics }) {
  const { summary, byCrew, advice, windowDays, available } = analytics;

  if (!available || summary.trips === 0) {
    return (
      <section id="arrival-performance" className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <div>
            <p className="eyebrow">Arrivals</p>
            <h2>Are you there when you said you&rsquo;d be?</h2>
          </div>
        </div>
        <div className="revenue-chart-empty">
          <strong>No arrival updates sent yet</strong>
          <span>
            When your crew taps &ldquo;I&rsquo;m on my way&rdquo;, this tracks how often you hit the window you
            promised, how late you run when you miss it, and how many customers open the link.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section id="arrival-performance" className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading">
        <div>
          <p className="eyebrow">Arrivals</p>
          <h2>Are you there when you said you&rsquo;d be?</h2>
        </div>
        <p className="job-meta">{summary.trips} visit{summary.trips === 1 ? '' : 's'} · last {windowDays} days</p>
      </div>

      <div className="arrival-metrics">
        <div className="arrival-metric is-headline">
          <span className="arrival-metric-value">{pct(summary.onTimeRate)}</span>
          <span className="arrival-metric-label">Arrived inside the window</span>
          <span className="arrival-metric-note">
            {summary.measured > 0
              ? `${summary.onTime} of ${summary.measured} measured`
              : 'No visit has both a promised window and a logged arrival yet'}
          </span>
        </div>
        <div className="arrival-metric">
          <span className="arrival-metric-value">{minutes(summary.medianLateness)}</span>
          <span className="arrival-metric-label">Typical lateness</span>
          {/* The mean sits underneath rather than on top: one three-hour
              disaster drags it somewhere no individual customer experienced. */}
          <span className="arrival-metric-note">
            Average {minutes(summary.averageLateness)}
            {summary.worstLateness ? ` · worst ${summary.worstLateness} min` : ''}
          </span>
        </div>
        <div className="arrival-metric">
          <span className="arrival-metric-value">{pct(summary.openRate)}</span>
          <span className="arrival-metric-label">Opened the link</span>
          <span className="arrival-metric-note">
            {summary.opened} of {summary.delivered} text{summary.delivered === 1 ? '' : 's'} that reached a phone
          </span>
        </div>
        <div className="arrival-metric">
          <span className="arrival-metric-value">{pct(summary.falloverRate)}</span>
          <span className="arrival-metric-label">Visits that fell over</span>
          <span className="arrival-metric-note">
            {summary.rescheduled} rescheduled · {summary.cancelled} cancelled · {summary.noAccess} no access
          </span>
        </div>
      </div>

      {summary.etaBias !== null && summary.averageTravel !== null ? (
        <p className="arrival-bias">
          Your crew promises an arrival and then takes{' '}
          <strong>
            {summary.etaBias > 0 ? `${Math.abs(summary.etaBias)} minutes longer` : summary.etaBias < 0 ? `${Math.abs(summary.etaBias)} minutes less` : 'exactly as long'}
          </strong>{' '}
          on average, with a typical drive of {summary.averageTravel} minutes.
        </p>
      ) : null}

      {advice ? <p className="arrival-advice">{advice}</p> : null}

      {byCrew.length > 1 ? (
        <div className="arrival-crew-scroll">
          <table className="workspace-preview-table">
            <thead>
              <tr>
                <th scope="col">Who</th>
                <th scope="col">Visits</th>
                <th scope="col">In window</th>
                <th scope="col">Typical late</th>
                <th scope="col">Link opened</th>
              </tr>
            </thead>
            <tbody>
              {byCrew.map((row) => (
                <tr key={row.crewId ?? row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.trips}</td>
                  {/* An em dash rather than 0% wherever there's nothing to
                      measure — a blank is honest, a zero is an accusation. */}
                  <td>{pct(row.onTimeRate)}</td>
                  <td>{minutes(row.medianLateness)}</td>
                  <td>{pct(row.openRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
