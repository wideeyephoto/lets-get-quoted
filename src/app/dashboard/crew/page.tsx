import { requireOwnerContext } from '@/lib/auth';
import { listCrew } from '@/lib/crew';
import { formatJobSchedule, formatMoney, listJobs } from '@/lib/jobs';
import { assignCrewToJobAction, createCrewAction, setCrewActiveAction } from './actions';

export default async function CrewPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const [crew, jobs] = await Promise.all([listCrew(supabase, accountId), listJobs(supabase, accountId)]);
  const activeCrew = crew.filter((member) => member.active);
  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');

  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Roster</p>
          <h2>Crew members</h2>
        </div>
        {crew.length === 0 ? (
          <p className="empty-state">No crew members yet. Add your first one below.</p>
        ) : (
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
                  <div className="actions">
                    {member.active ? (
                      <form action={assignCrewToJobAction.bind(null, member.id)} className="inline-action-form">
                        <select name="jobId" aria-label={`Assign ${member.name} to job`} disabled={assignableJobs.length === 0} required>
                          <option value="">Choose job</option>
                          {assignableJobs.map((job) => (
                            <option key={job.id} value={job.id}>{job.ref} - {job.client_name} ({formatJobSchedule(job.scheduled_for, job.scheduled_time)})</option>
                          ))}
                        </select>
                        <button type="submit" className="btn secondary" disabled={assignableJobs.length === 0}>Assign to job</button>
                      </form>
                    ) : null}
                    <form action={setCrewActiveAction.bind(null, member.id, !member.active)}>
                      <button type="submit" className="btn secondary">
                        {member.active ? 'Archive' : 'Reactivate'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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

      <details className="panel workspace-section-card workspace-details" open={crew.length === 0}>
        <summary className="workspace-details-summary">
          <span className="btn primary">+ Add crew member</span>
          <span className="workspace-details-copy">They&apos;ll get a text when a manager assigns them to a job.</span>
        </summary>
        <form action={createCrewAction} className="form-grid">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" required placeholder="Mike Torres" />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" required placeholder="(248) 555-0117" />
          </div>
          <div className="field">
            <label htmlFor="roleLabel">Role</label>
            <input id="roleLabel" name="roleLabel" placeholder="Laborer" />
          </div>
          <div className="field">
            <label htmlFor="hourlyRate">Hourly rate ($)</label>
            <input id="hourlyRate" name="hourlyRate" type="number" min="0" step="0.01" placeholder="28" />
          </div>
          <div className="field full">
            <button type="submit" className="btn primary">
              Add crew member
            </button>
          </div>
        </form>
      </details>
    </main>
  );
}
