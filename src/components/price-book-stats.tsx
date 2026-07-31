import { formatUnitPrice, type PriceBookStats } from '@/lib/price-book';

// The price book hero's right column was empty. A book's own shape — how many
// priced services, what they average, and how wide the spread is — is the obvious
// thing to put there, and it's the first sanity check on a book that was typed in
// over months or imported from another CRM.
// Shared by /dashboard/services and the public /demo so the two can't drift.
export default function PriceBookStatsPanel({ stats }: { stats: PriceBookStats }) {
  const span = stats.highest - stats.lowest;
  const averagePct = span > 0 ? Math.round(((stats.average - stats.lowest) / span) * 100) : 50;
  return (
    <div className="pricebook-stats">
      <article className="workspace-metric-card accent">
        <span className="workspace-metric-label">Priced services</span>
        <strong className="workspace-metric-value">{stats.count}</strong>
        <p className="workspace-metric-note">Ready to drop into a quote or a recurring plan.</p>
      </article>
      <div className="pricebook-range">
        <div className="pricebook-range-head">
          <span className="workspace-metric-label">Average price</span>
          <strong>{formatUnitPrice(stats.average)}</strong>
        </div>
        <div
          className="pricebook-range-track"
          role="img"
          aria-label={`Prices run from ${formatUnitPrice(stats.lowest)} to ${formatUnitPrice(stats.highest)}, averaging ${formatUnitPrice(stats.average)}.`}
        >
          <span className="pricebook-range-fill" style={{ width: `${averagePct}%` }} />
          <span className="pricebook-range-marker" style={{ left: `${averagePct}%` }} />
        </div>
        <div className="pricebook-range-ends">
          <span>{formatUnitPrice(stats.lowest)}</span>
          <span>{formatUnitPrice(stats.highest)}</span>
        </div>
      </div>
    </div>
  );
}
