import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import type { LaborEfficiency } from '@/lib/insights-metrics';

/**
 * Labor and Crew efficiency: shows how effectively crew hours translate into revenue,
 * the billable utilization of the team, and hours logged per person.
 */
export default function LaborEfficiencyCard({
  labor,
  basePath = '/dashboard',
}: {
  labor: LaborEfficiency;
  basePath?: string;
}) {
  const { totalHours, billableHours, billableRatio, revenuePerCrewHour, totalLaborCost, crewBreakdown, hasData } = labor;

  return (
    <section className="panel ins-card ins-labor-card">
      <p className="ins-card-head">
        <span className="ins-chip is-speed" aria-hidden="true">⏱</span> Labor &amp; crew productivity
      </p>

      {!hasData ? (
        <p className="ins-empty-note">
          When crew clock in or labor expenses are logged against jobs, team hours, billable utilization, and revenue per crew hour appear here.
        </p>
      ) : (
        <>
          <div className="ins-figures" style={{ marginBottom: '0.75rem' }}>
            <div className="ins-figure">
              <span className="ins-figure-label">Total crew hours</span>
              <strong className="ins-figure-value">{totalHours.toFixed(1)} hrs</strong>
              <span className="ins-sub">{billableHours.toFixed(1)} billable on jobs</span>
            </div>
            <div className="ins-figure">
              <span className="ins-figure-label">Revenue / crew hour</span>
              <strong className="ins-figure-value" style={{ color: '#166534' }}>
                {revenuePerCrewHour !== null ? `${formatMoney(revenuePerCrewHour)}/hr` : '—'}
              </strong>
              <span className="ins-sub">collected per paid hour</span>
            </div>
            <div className="ins-figure">
              <span className="ins-figure-label">Billable ratio</span>
              <strong className="ins-figure-value">{billableRatio}%</strong>
              <span className="ins-sub">{totalLaborCost > 0 ? `${formatMoney(totalLaborCost)} total labor` : 'on-site time'}</span>
            </div>
          </div>

          {crewBreakdown.length > 0 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <span className="ins-figure-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Hours by crew member</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {crewBreakdown.slice(0, 4).map((member) => (
                  <div key={member.crewId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '0.35rem 0.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{member.name}</span>
                    <div style={{ display: 'flex', gap: '1rem', color: '#666', fontSize: '0.8rem' }}>
                      <span>{member.hours.toFixed(1)} hrs</span>
                      {member.jobCount > 0 ? <span>{member.jobCount} jobs</span> : null}
                      {member.cost > 0 ? <span>{formatMoney(member.cost)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="ins-card-foot" style={{ marginTop: '1rem' }}>
            <span>Derived from time clock shifts and job labor entries.</span>
            <Link className="ins-inline-link" href={`${basePath}/crew`}>Manage crew →</Link>
          </div>
        </>
      )}
    </section>
  );
}
