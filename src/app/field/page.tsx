import Link from 'next/link';
import { requireCrewContext } from '@/lib/crew-auth';
import { listJobIdsForCrew } from '@/lib/crew';
import { formatJobSchedule, formatJobTime } from '@/lib/jobs';
import { createAdminClient } from '@/lib/auth';
import { arrivalSettingsFromAccount, formatClockTime } from '@/lib/arrival';
import { accountToday } from '@/lib/route-plan-day';
import { departurePlans, type DeparturePlan } from '@/lib/departure-plan';
import NavigateButton from '@/components/navigate-button';
import FieldHeader from './FieldHeader';
import FieldPwa from './FieldPwa';

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
  lat: number | null;
  lng: number | null;
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

// A numbered stop in today's route: tap the body to open the job, tap Navigate
// to launch turn-by-turn to the address.
//
// The "leave by" line only appears when it's actionable — imminent or already
// missed. A departure time on every row is a wall of numbers; on the one row
// that matters it's the most useful thing on the screen.
function RouteStop({ job, index, plan, timeZone }: { job: FieldJob; index: number; plan?: DeparturePlan; timeZone: string }) {
  const showLeave = plan?.leaveBy && (plan.overdue || plan.soon);
  return (
    <div className="field-route-stop">
      <span className="field-route-num">{index + 1}</span>
      <Link href={`/field/jobs/${job.id}`} className="field-route-body">
        <div className="field-route-top">
          <strong>{job.client_name}</strong>
          <span className="field-route-time">{formatJobTime(job.scheduled_time) || 'Anytime'}</span>
        </div>
        {job.address ? <p className="field-route-addr">{job.address}</p> : <p className="field-route-addr muted">No address on file</p>}
        {showLeave ? (
          <p className={`field-route-leave${plan.overdue ? ' is-overdue' : ''}`}>
            {plan.overdue ? '⚠ Should have left by' : 'Leave by'} {formatClockTime(plan.leaveBy as Date, timeZone)}
            {plan.driveMinutes ? ` · ~${plan.driveMinutes} min drive` : ''}
          </p>
        ) : null}
        <span className={`field-status field-status-${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
      </Link>
      {job.address || job.lat ? (
        <NavigateButton
          className="field-route-nav"
          target={{ address: job.address, lat: job.lat, lng: job.lng }}
        />
      ) : null}
    </div>
  );
}

export default async function FieldHomePage() {
  const { supabase, accountId, crew, businessName } = await requireCrewContext();

  const jobIds = await listJobIdsForCrew(supabase, accountId, crew.id);
  let jobs: FieldJob[] = [];
  if (jobIds.length > 0) {
    const { data } = await supabase
      .from('jobs')
      .select('id, ref, client_name, address, scope, status, scheduled_for, scheduled_time, lat, lng')
      .eq('account_id', accountId)
      .in('id', jobIds);
    jobs = (data ?? []) as FieldJob[];
  }

  // The account's own timezone, not the server's — a tech in Detroit planning at
  // 11pm should see tomorrow's route, not a day that ended hours ago on a UTC
  // host. Read with the admin client because crew RLS doesn't reach `accounts`.
  const { data: accountRow } = await createAdminClient()
    .from('accounts').select('timezone, job_buffer_minutes').eq('id', accountId).maybeSingle();
  const arrivalSettings = arrivalSettingsFromAccount(accountRow as Record<string, unknown> | null);
  const today = accountToday(arrivalSettings.timeZone);
  const open = jobs.filter((job) => job.status !== 'archived' && job.status !== 'complete');
  const todayJobs = open.filter((job) => job.scheduled_for === today).sort(byScheduleAsc);
  const upcoming = open.filter((job) => job.scheduled_for && job.scheduled_for > today).sort(byScheduleAsc);
  const other = open.filter((job) => !job.scheduled_for || job.scheduled_for < today).sort(byScheduleAsc);
  const completed = jobs.filter((job) => job.status === 'complete').sort(byScheduleAsc).reverse().slice(0, 10);

  const firstName = crew.name.trim().split(/\s+/)[0] || crew.name;

  // When to set off for each of today's stops. Anchored at this crew member's
  // own start address when they have one — Plan my day already uses it, and a
  // route measured from the shop is wrong for anybody who leaves from home.
  const plans = departurePlans(
    todayJobs.map((job) => ({ id: job.id, scheduledTime: job.scheduled_time, lat: job.lat, lng: job.lng })),
    {
      day: today,
      timeZone: arrivalSettings.timeZone,
      bufferMinutes: Number((accountRow as { job_buffer_minutes?: number } | null)?.job_buffer_minutes) || 0,
      origin: Number.isFinite(Number(crew.start_lat)) && Number.isFinite(Number(crew.start_lng))
        ? { lat: Number(crew.start_lat), lng: Number(crew.start_lng) }
        : null,
    },
  );
  const planById = new Map(plans.map((plan) => [plan.id, plan]));

  return (
    <>
      <FieldHeader businessName={businessName} crewName={crew.name} />
      <main className="field-main">
        <h1 className="field-greeting">Hi {firstName} 👋</h1>
        <FieldPwa />

        {/* Deliberately above the jobs. Somebody checking what they're owed
            shouldn't have to scroll past a week of work to find it. */}
        <Link href="/field/pay" className="field-paylink">
          <span>
            <strong>My pay</strong>
            Your hours this period, and when they&apos;re due
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        {jobs.length === 0 ? (
          <p className="field-empty">You have no assigned jobs right now. When your manager assigns you to a job, it&apos;ll show up here.</p>
        ) : (
          <>
            {todayJobs.length > 0 ? (
              <section className="field-section">
                <h2 className="field-section-title">Today&apos;s route · {todayJobs.length} stop{todayJobs.length === 1 ? '' : 's'}</h2>
                <div className="field-route">
                  {todayJobs.map((job, index) => (
                    <RouteStop key={job.id} job={job} index={index} plan={planById.get(job.id)} timeZone={arrivalSettings.timeZone} />
                  ))}
                </div>
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
