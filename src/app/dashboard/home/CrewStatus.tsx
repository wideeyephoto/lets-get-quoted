import Link from 'next/link';
import type { CrewSummary, Loadable } from '@/lib/dashboard-types';

export default function CrewStatus({
  crewSummary,
  basePath = '/dashboard',
}: {
  crewSummary: Loadable<CrewSummary>;
  basePath?: string;
}) {
  if (crewSummary.kind === 'unavailable') {
    return null;
  }

  const { clockedIn, activeRosterCount } = crewSummary.data;

  return (
    <section className="panel workspace-section-card crew-status-panel">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">Team</p>
          <h2>Crew &amp; labor status</h2>
        </div>
        <Link href={`${basePath}/crew`} style={{ fontSize: '0.84rem', color: 'var(--accent)', textDecoration: 'none' }}>
          View roster &rarr;
        </Link>
      </div>

      {clockedIn.length === 0 ? (
        <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--line, rgba(255,255,255,0.08))' }}>
          <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
            No crew currently clocked in
          </strong>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            {activeRosterCount} active team member{activeRosterCount === 1 ? '' : 's'} on roster.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {clockedIn.map((shift) => (
            <div
              key={shift.crewId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                padding: '0.65rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--line, rgba(255,255,255,0.08))',
                background: 'rgba(255,255,255,0.02)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--good, #10b981)' }} />
                  <strong style={{ fontSize: '0.92rem', color: 'var(--text)' }}>
                    {shift.crewName}
                  </strong>
                </div>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginTop: '0.15rem' }}>
                  Clocked into: {shift.jobTitle || 'Active Job'}
                </span>
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                {shift.elapsedHours} hrs on clock
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
