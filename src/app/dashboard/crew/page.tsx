import { requireOwnerContext } from '@/lib/auth';
import { listCrew, listCrewWorkHistory } from '@/lib/crew';
import { formatJobSchedule, formatMoney, listJobs } from '@/lib/jobs';
import SaveButton from '@/components/save-button';
import { assignCrewToJobAction, createCrewAction, deleteArchivedCrewAction, setCrewActiveAction, updateCrewAction } from './actions';

export default async function CrewPage() {
  const { supabase, accountId } = await requireOwnerContext();
  const [crew, jobs] = await Promise.all([listCrew(supabase, accountId), listJobs(supabase, accountId)]);
  const activeCrew = crew.filter((member) => member.active);
  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');
  const historyEntries = await Promise.all(crew.map((member) => listCrewWorkHistory(supabase, accountId, member.id)));
  const historyByCrew = new Map(crew.map((member, index) => [member.id, historyEntries[index]]));

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
            {crew.map((member) => {
              const history = historyByCrew.get(member.id) ?? [];
              const totalPaid = history.reduce((sum, item) => sum + item.amount, 0);
              return (
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
                      {!member.active ? (
                        <form action={deleteArchivedCrewAction.bind(null, member.id)}>
                          <button type="submit" className="btn danger">Delete</button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <details className="workspace-details" style={{ marginTop: '1rem' }}>
                    <summary className="workspace-details-summary">
                      <span className="btn secondary">Edit crew member</span>
                      <span className="workspace-details-copy">Update name, phone, role, and default hourly rate.</span>
                    </summary>
                    <form action={updateCrewAction.bind(null, member.id)} className="form-grid compact-form" style={{ marginTop: '1rem' }}>
                      <div className="field">
                        <label htmlFor={`name-${member.id}`}>Name</label>
                        <input id={`name-${member.id}`} name="name" required defaultValue={member.name} />
                      </div>
                      <div className="field">
                        <label htmlFor={`phone-${member.id}`}>Phone</label>
                        <input id={`phone-${member.id}`} name="phone" type="tel" required defaultValue={member.phone} />
                      </div>
                      <div className="field">
                        <label htmlFor={`roleLabel-${member.id}`}>Role</label>
                        <input id={`roleLabel-${member.id}`} name="roleLabel" defaultValue={member.role_label} />
                      </div>
                      <div className="field">
                        <label htmlFor={`hourlyRate-${member.id}`}>Hourly rate ($)</label>
                        <input id={`hourlyRate-${member.id}`} name="hourlyRate" type="number" min="0" step="0.01" defaultValue={member.hourly_rate} />
                      </div>
                      <div className="field full">
                        <SaveButton>Save crew member</SaveButton>
                      </div>
                    </form>
                  </details>

                  <details className="workspace-details" style={{ marginTop: '0.75rem' }}>
                    <summary className="workspace-details-summary">
                      <span className="btn secondary">Work history</span>
                      <span className="workspace-details-copy">{history.length} labor entr{history.length === 1 ? 'y' : 'ies'} · {formatMoney(totalPaid)} paid</span>
                    </summary>
                    {history.length === 0 ? (
                      <p className="empty-state" style={{ marginTop: '1rem' }}>No paid labor history logged yet.</p>
                    ) : (
                      <div className="cost-list" style={{ marginTop: '1rem' }}>
                        {history.map((item) => (
                          <div key={item.cost_id} className="cost-item">
                            <div className="cost-item-main">
                              <span className="cost-item-desc">{item.job_ref} · {item.client_name}</span>
                              <span className="cost-item-sub">
                                {formatJobSchedule(item.scheduled_for, item.scheduled_time)} · {item.hours ?? 0} hrs × {formatMoney(item.rate ?? 0)}/hr
                              </span>
                            </div>
                            <span className="cost-item-amount">{formatMoney(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </details>
                </div>
              );
            })}
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
            <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">Add crew member</SaveButton>
          </div>
        </form>
      </details>
    </main>
  );
}
