import Link from 'next/link';
import DemoNav from '@/components/demo-nav';
import { formatMoney } from '@/lib/jobs';
import { DEMO_CREW } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

export default function DemoCrewPage() {
  const crew = DEMO_CREW;
  const activeCrew = crew.filter((member) => member.active);

  return (
    <>
      <DemoNav active="/demo/crew" />
      <main className="wide-shell workspace-shell">
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Roster</p>
            <h2>Crew members</h2>
          </div>
          <div className="job-list">
            {crew.map((member) => (
              <div key={member.id} className="job-row">
                <div className="job-row-header">
                  <span className="job-ref">{member.name}</span>
                  <span className={`status-badge ${member.active ? 'status-complete' : 'status-archived'}`}>
                    {member.active ? 'Active' : 'Archived'}
                  </span>
                </div>
                <div className="job-client">{member.role_label}</div>
                <div className="job-row-header" style={{ marginTop: '0.4rem' }}>
                  <span className="job-meta">
                    {member.phone}
                    {member.hourly_rate > 0 ? ` · ${formatMoney(member.hourly_rate)}/hr` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="stat-ticker panel">
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{crew.length}</span>
            <span className="stat-ticker-label">Total crew</span>
          </div>
          <div className="stat-ticker-item">
            <span className="stat-ticker-value">{activeCrew.length}</span>
            <span className="stat-ticker-label">Active</span>
          </div>
        </div>

        <section className="panel workspace-section-card demo-locked-card">
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow">Try it yourself</p>
            <h2>+ Add crew member</h2>
          </div>
          <p className="workspace-card-copy">
            Add your team, assign them to jobs on the schedule, and track labor cost per job. This demo
            account is read-only.
          </p>
          <Link href="/login" className="btn primary">
            Create free account
          </Link>
        </section>
      </main>
    </>
  );
}
