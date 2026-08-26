import Link from 'next/link';
import { formatJobTime } from '@/lib/jobs';
import type { CrewMember } from '@/lib/crew';
import { extractCity, initials } from '@/lib/dashboard/schedule-loader';
import type { CapacitySummary, Loadable } from '@/lib/dashboard-types';

export default function CapacityPanel({
  capacity,
  crew,
  assignmentsByJob,
  basePath = '/dashboard',
}: {
  capacity: Loadable<CapacitySummary>;
  crew: CrewMember[];
  assignmentsByJob: Record<string, string[]>;
  basePath?: string;
}) {
  if (capacity.kind === 'unavailable') {
    return (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">What&apos;s next</p>
          <h2>Next 7 days</h2>
        </div>
        <p className="workspace-card-copy" style={{ color: 'var(--muted)' }}>
          Capacity data is temporarily unavailable.
        </p>
      </section>
    );
  }

  const { days, quietDaysCount, workingDaysWithJobs, workingDaysTotal } = capacity.data;
  const quietDays = days.filter((d) => d.jobCount === 0);

  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <p className="eyebrow">What&apos;s next</p>
          <h2>Next 7 days</h2>
        </div>
        <span style={{ fontSize: '0.84rem', color: 'var(--muted)' }}>
          {workingDaysWithJobs} of {workingDaysTotal} days scheduled
        </span>
      </div>

      {/* Quiet days line */}
      {quietDaysCount > 0 && quietDaysCount < 7 ? (
        <p className="week-glance-quiet">
          Clear: {quietDays.map((day) => day.shortLabel).join(', ')}
        </p>
      ) : quietDaysCount === 7 ? (
        <p className="week-glance-quiet" style={{ display: 'block' }}>
          All 7 days are clear — no jobs scheduled this week.
        </p>
      ) : null}

      <div className="week-glance-grid">
        {days.map((day) => (
          <div
            className={`week-glance-day${day.isToday ? ' today' : ''}${day.jobCount === 0 ? ' is-quiet' : ''}`}
            key={day.dateKey}
          >
            <span className="week-glance-date">{day.label}</span>
            <div className="week-glance-jobs">
              {day.jobCount === 0 ? (
                <p className="week-glance-empty">No jobs</p>
              ) : (
                day.jobs.map((job) => {
                  const assignedMembers = (assignmentsByJob[job.id] ?? [])
                    .map((id) => crew.find((member) => member.id === id))
                    .filter((member): member is NonNullable<typeof member> => Boolean(member));
                  return (
                    <Link key={`${job.id}:${job.scheduled_for}`} href={`${basePath}/jobs/${job.id}`} className="week-glance-job">
                      <span className="week-glance-job-top">
                        <strong>{job.client_name}</strong>
                        {assignedMembers.length > 0 ? (
                          <span className="week-glance-crew" title={`Assigned: ${assignedMembers.map((member) => member.name).join(', ')}`}>
                            {assignedMembers.slice(0, 2).map((member) => initials(member.name)).join(' ')}
                          </span>
                        ) : null}
                      </span>
                      <span>{[formatJobTime(job.scheduled_time), extractCity(job.address)].filter(Boolean).join(' - ')}</span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
