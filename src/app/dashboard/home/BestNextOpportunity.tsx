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
    <section
      className="panel workspace-section-card next-opportunity-panel"
      style={{
        background: 'linear-gradient(135deg, rgba(255, 122, 33, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
        borderColor: 'var(--accent, #ff7a21)',
        padding: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ maxWidth: '680px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: 'var(--accent, #ff7a21)',
                color: '#ffffff',
              }}
            >
              ★ Recommended Next Step
            </span>
          </div>
          <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
            {opp.headline}
          </h2>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--muted)', lineHeight: 1.4 }}>
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
