import React from 'react';
import Link from 'next/link';
import type { Job } from '@/lib/jobs';
import { formatJobSchedule } from '@/lib/jobs';

/** Office job reads stop here, before the owner's financial and admin queries. */
export default function OfficeJobDetail({ job, canSchedule }: {
  job: Job;
  canSchedule: boolean;
}) {
  const status = { new_lead: 'New', in_progress: 'In progress', complete: 'Complete', archived: 'Archived' }[job.status];
  return (
    <main className="wide-shell workspace-shell">
      <section className="panel workspace-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Job {job.ref}</p>
          <h1>{job.client_name}</h1>
          <p>{status}</p>
          <div className="actions">
            <Link href="/dashboard/jobs" className="btn secondary">Back to jobs</Link>
            {job.client_id ? <Link href={`/dashboard/clients/${job.client_id}`} className="btn secondary">View client</Link> : null}
            {canSchedule ? <Link href="/dashboard/schedule" className="btn secondary">Open schedule</Link> : null}
          </div>
        </div>
      </section>
      <section className="panel workspace-section-card">
        <h2>Job details</h2>
        <dl>
          <dt>Address</dt><dd>{job.address || 'No address recorded'}</dd>
          <dt>Schedule</dt><dd>{job.scheduled_for ? formatJobSchedule(job.scheduled_for, job.scheduled_time, job.scheduled_until) : 'Not scheduled'}</dd>
          <dt>Scope of work</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{job.scope || 'No scope recorded'}</dd>
        </dl>
        <div className="actions">
          {job.client_phone ? <a className="btn secondary" href={`tel:${job.client_phone}`}>Call client</a> : null}
          {job.client_email ? <a className="btn secondary" href={`mailto:${job.client_email}`}>Email client</a> : null}
        </div>
      </section>
    </main>
  );
}
