import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { listCrew, listCrewAssignmentsForJobs } from '@/lib/crew';
import { createCrewPhotoUrls } from '@/lib/crew-photo-storage';
import { formatJobSchedule, formatMoney, listJobs } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import CrewWorkHistory from '@/components/crew-work-history';
import SaveButton from '@/components/save-button';
import CrewPhotoUpload from './CrewPhotoUpload';
import ConfirmActionButton from '@/app/dashboard/jobs/[id]/ConfirmActionButton';
import { assignCrewToJobAction, createCrewAction, deleteArchivedCrewAction, setCrewActiveAction, updateCrewAction, updateCrewPhotoAction } from './actions';

function initialsFor(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C';
}

export default async function CrewPage({ searchParams }: { searchParams: { status?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();
  const [crew, jobs] = await Promise.all([listCrew(supabase, accountId), listJobs(supabase, accountId)]);
  const photoUrls = await createCrewPhotoUrls(accountId, crew.map((member) => member.photo_path).filter((path): path is string => Boolean(path)));
  const activeCrew = crew.filter((member) => member.active);
  const assignableJobs = jobs.filter((job) => job.status !== 'complete' && job.status !== 'archived');

  // Invert jobId -> crewIds into crewId -> open jobs, so each card can show what
  // the member is currently working on (and flag idle active members as free).
  const assignmentsByJob = await listCrewAssignmentsForJobs(supabase, accountId, assignableJobs.map((job) => job.id));
  const jobsById = new Map(assignableJobs.map((job) => [job.id, job]));
  const jobsByCrew: Record<string, typeof assignableJobs> = {};
  for (const [jobId, crewIds] of Object.entries(assignmentsByJob)) {
    const job = jobsById.get(jobId);
    if (!job) continue;
    for (const crewId of crewIds) {
      const bucket = jobsByCrew[crewId] ?? (jobsByCrew[crewId] = []);
      bucket.push(job);
    }
  }
  const onJobCount = activeCrew.filter((member) => (jobsByCrew[member.id]?.length ?? 0) > 0).length;
  const availableCount = activeCrew.length - onJobCount;

  const filter = searchParams.status === 'archived' ? 'archived' : 'active';
  const visibleCrew = crew.filter((member) => (filter === 'archived' ? !member.active : member.active));

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
          <>
            <div className="status-tabs workspace-status-tabs">
              <Link href="/dashboard/crew" className={`status-tab${filter === 'active' ? ' active' : ''}`}>
                Active ({activeCrew.length})
              </Link>
              <Link href="/dashboard/crew?status=archived" className={`status-tab${filter === 'archived' ? ' active' : ''}`}>
                Archived ({crew.length - activeCrew.length})
              </Link>
            </div>
            {visibleCrew.length === 0 ? (
              <p className="empty-state">
                {filter === 'archived' ? 'No archived crew members.' : 'No active crew members. Add one below, or check the Archived tab.'}
              </p>
            ) : (
              <div className="job-list">
                {visibleCrew.map((member) => {
              const photoUrl = member.photo_path ? photoUrls[member.photo_path] : null;
              return (
                <div key={member.id} className="job-row crew-card">
                  <div className="crew-row-intro">
                    <CrewPhotoUpload
                      action={updateCrewPhotoAction.bind(null, member.id)}
                      photoUrl={photoUrl}
                      initials={initialsFor(member.name)}
                      name={member.name}
                    />
                    <div className="crew-row-main">
                      <div className="job-row-header">
                        <span className="crew-card-name">{member.name}</span>
                        <span className={`status-badge ${member.active ? 'status-complete' : 'status-archived'}`}>
                          {member.active ? 'Active' : 'Archived'}
                        </span>
                      </div>
                      <div className="crew-card-meta">
                        <span className="crew-card-role">{member.role_label}</span>
                        {member.hourly_rate > 0 ? (
                          <span className="crew-card-contact">{formatMoney(member.hourly_rate)}/hr</span>
                        ) : null}
                      </div>
                      {member.phone ? (
                        <div className="job-hero-contact" style={{ marginTop: '0.5rem' }}>
                          <a href={`tel:${member.phone}`} className="hero-phone-link" aria-label={`Call ${member.name}`}>
                            <span aria-hidden="true">📞</span> {formatPhoneDashes(member.phone)}
                          </a>
                        </div>
                      ) : null}
                      {member.active ? (
                        <div className="crew-card-jobs">
                          {(jobsByCrew[member.id] ?? []).length > 0 ? (
                            (jobsByCrew[member.id] ?? []).map((job) => (
                              <Link key={job.id} href={`/dashboard/jobs/${job.id}`} className="crew-job-chip">
                                {job.ref} · {job.client_name}
                              </Link>
                            ))
                          ) : (
                            <span className="crew-available-pill">Available</span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="crew-card-actions">
                    {member.active ? (
                      assignableJobs.length === 0 ? (
                        <p className="crew-assign-empty">No open jobs to assign yet.</p>
                      ) : (
                        <form action={assignCrewToJobAction.bind(null, member.id, true)} className="inline-action-form">
                          <select name="jobId" aria-label={`Assign ${member.name} to job`} required>
                            <option value="">Choose job</option>
                            {assignableJobs.map((job) => (
                              <option key={job.id} value={job.id}>{job.ref} - {job.client_name} ({formatJobSchedule(job.scheduled_for, job.scheduled_time)})</option>
                            ))}
                          </select>
                          <button type="submit" formAction={assignCrewToJobAction.bind(null, member.id, true)} className="btn secondary" aria-label={`Assign ${member.name} to the selected job and text them`}>Assign &amp; text</button>
                          <button type="submit" formAction={assignCrewToJobAction.bind(null, member.id, false)} className="btn secondary" aria-label={`Assign ${member.name} to the selected job without texting`}>Assign, no text</button>
                        </form>
                      )
                    ) : null}
                    <form action={setCrewActiveAction.bind(null, member.id, !member.active)}>
                      <button type="submit" className="btn secondary">
                        {member.active ? 'Archive' : 'Reactivate'}
                      </button>
                    </form>
                    {!member.active ? (
                      <ConfirmActionButton
                        action={deleteArchivedCrewAction.bind(null, member.id)}
                        confirmMessage={`Delete ${member.name}? This can't be undone.`}
                        className="btn danger"
                        pendingLabel="Deleting…"
                        savedLabel="Deleted ✓"
                      >
                        Delete
                      </ConfirmActionButton>
                    ) : null}
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

                  <CrewWorkHistory crewId={member.id} />
                </div>
              );
                })}
              </div>
            )}
          </>
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
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{onJobCount}</span>
          <span className="stat-ticker-label">On a job</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{availableCount}</span>
          <span className="stat-ticker-label">Available</span>
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
            <label htmlFor="photo">Owner-taken crew photo</label>
            <input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" capture="environment" />
          </div>
          <div className="field full">
            <SaveButton pendingLabel="Adding…" savedLabel="Added ✓">Add crew member</SaveButton>
          </div>
        </form>
      </details>
    </main>
  );
}
