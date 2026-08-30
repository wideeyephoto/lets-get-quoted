import Link from 'next/link';
import type { BestOpportunity, Loadable } from '@/lib/dashboard-types';

export default function BestNextOpportunity({
  opportunity,
}: {
  opportunity: Loadable<BestOpportunity | null>;
}) {
  if (opportunity.kind !== 'ready' || !opportunity.data) {
    return null;
  }

  const opp = opportunity.data;

  return (
    <section className="panel workspace-section-card next-opportunity-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ maxWidth: '680px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="next-opportunity-badge">
              ★ Recommended Next Step
            </span>
          </div>
          <h2 className="next-opportunity-headline">
            {opp.headline}
          </h2>
          <p className="next-opportunity-reason">
            {opp.reason}
          </p>
        </div>
        <div>
          <Link href={opp.actionHref} className="btn primary" style={{ minHeight: '44px', padding: '0.55rem 1.25rem' }}>
            {opp.actionLabel} &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
