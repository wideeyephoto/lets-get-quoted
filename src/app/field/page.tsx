import Link from 'next/link';
import { requireCrewContext } from '@/lib/crew-auth';
import { listJobIdsForCrew } from '@/lib/crew';
import { formatJobSchedule } from '@/lib/jobs';
import FieldHeader from './FieldHeader';

export const dynamic = 'force-dynamic';

type FieldJob = {
  id: string;
  ref: string;
  client_name: string;
  address: string | null;
  scope: string | null;
  status: string;
  scheduled_for: string | null;
  scheduled_time: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function byScheduleAsc(a: FieldJob, b: FieldJob): number {
  const aKey = `${a.scheduled_for ?? '9999'}${a.scheduled_time ?? ''}`;
  const bKey = `${b.scheduled_for ?? '9999'}${b.scheduled_time ?? ''}`;
  return aKey.localeCompare(bKey);
}

function JobCard({ job }: { job: FieldJob }) {
  return (
    <Link href={`/field/jobs/${job.id}`} className="field-job-card">
      <div className="field-job-top">
        <strong>{job.client_name}</strong>
        <span className={`field-status field-status-${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
      </div>
      <p className="field-job-when">{formatJobSchedule(job.scheduled_for, job.scheduled_time)}</p>
      {job.address ? <p className="field-job-addr">{job.address}</p> : null}
      {job.scope ? <p className="field-job-scope">{job.scope}</p> : null}
    </Link>
  );
}

export default async function FieldHomePage() {
  const { supabase, accountId, crew } = await requireCrewContext();

  const jobIds = await listJobIdsForCrew(supabase, accountId, crew.id);
  let jobs: FieldJob[] = [];
  if (jobIds.length > 0) {
    const { data } = await supabase
      .from('jobs')
      .select('id, ref, client_name, address, scope, status, scheduled_for, scheduled_time')
      .eq('account_id', accountId)
      .in('id', jobIds);
    jobs = (data ?? []) as FieldJob[];
  }

  const [{ data: account }, { data: site }] = await Promise.all([
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name').eq('account_id', accountId).maybeSingle(),
  ]);
  const businessName = site?.company_name || account?.business_name || 'My crew';

  const today = new Date().toISOString().slice(0, 10);
  const open = jobs.filter((job) => job.status !== 'archived' && job.status !== 'complete');
  const todayJobs = open.filter((job) => job.scheduled_for === today).sort(byScheduleAsc);
  const upcoming = open.filter((job) => job.scheduled_for && job.scheduled_for > today).sort(byScheduleAsc);
  const other = open.filter((job) => !job.scheduled_for || job.scheduled_for < today).sort(byScheduleAsc);
  const completed = jobs.filter((job) => job.status === 'complete').sort(byScheduleAsc).reverse().slice(0, 10);

  const firstName = crew.name.trim().split(/\s+/)[0] || crew.name;

  return (
    <>
      <FieldHeader businessName={businessName} crewName={crew.name} />
      <main className="field-main">
        <h1 className="field-greeting">Hi {firstName} 👋</h1>

        {jobs.length === 0 ? (
          <p className="field-empty">You have no assigned jobs right now. When your manager assigns you to a job, it&apos;ll show up here.</p>
        ) : (
          <>
            {todayJobs.length > 0 ? (
              <section className="field-section">
                <h2 className="field-section-title">Today</h2>
                {todayJobs.map((job) => <JobCard key={job.id} job={job} />)}
              </section>
            ) : null}

            {upcoming.length > 0 ? (
              <section className="field-section">
                <h2 className="field-section-title">Upcoming</h2>
                {upcoming.map((job) => <JobCard key={job.id} job={job} />)}
              </section>
            ) : null}

            {other.length > 0 ? (
              <section className="field-section">
                <h2 className="field-section-title">Needs scheduling &amp; overdue</h2>
                {other.map((job) => <JobCard key={job.id} job={job} />)}
              </section>
            ) : null}

            {completed.length > 0 ? (
              <section className="field-section">
                <h2 className="field-section-title">Recently completed</h2>
                {completed.map((job) => <JobCard key={job.id} job={job} />)}
              </section>
            ) : null}

            {todayJobs.length === 0 && upcoming.length === 0 && other.length === 0 && completed.length === 0 ? (
              <p className="field-empty">Nothing on your plate right now. Enjoy the breather.</p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
