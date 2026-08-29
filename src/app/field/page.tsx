import Link from 'next/link';
import { requireCrewContext } from '@/lib/crew-auth';
import { listJobIdsForCrew } from '@/lib/crew';
import { formatJobSchedule, formatJobTime } from '@/lib/jobs';
import { createAdminClient } from '@/lib/auth';
import { arrivalSettingsFromAccount, formatClockTime } from '@/lib/arrival';
import { accountToday } from '@/lib/route-plan-day';
import { departurePlans, type DeparturePlan } from '@/lib/departure-plan';
import { KIND_EMOJI, KIND_LABEL, listDayRouteStops, type RouteStop as DayRouteStop } from '@/lib/route-stops';
import { getSharedFieldPhoneNumber } from '@/lib/sms';
import { displayPhone } from '@/lib/phone';
import NavigateButton from '@/components/navigate-button';
import FieldHeader from './FieldHeader';
import FieldPwa from './FieldPwa';
import FieldOfflineWarm from './FieldOfflineWarm';

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

// TODAY'S ROUTE IS NOT JUST JOBS.
//
// The owner plans a day containing a supply run, a dump trip and fuel; those
// stops carry real coordinates and real minutes and are already in the data
// model (lib/route-stops). The field app showed jobs only, so the day a tech
// saw on their phone was a different day from the one their office planned —
// they'd finish stop two and drive straight past the yard they were supposed to
// call at. These two types are interleaved into one numbered list, in time
// order, because that is what a route is.
type RouteItem =
  | { kind: 'job'; id: string; time: string | null; lat: number | null; lng: number | null; job: FieldJob }
  | { kind: 'stop'; id: string; time: string | null; lat: number | null; lng: number | null; stop: DayRouteStop };

// Undated stops sort last, the same rule the job list uses — a stop with no
// time isn't at 00:00, it's "sometime today".
function byTimeAsc(a: RouteItem, b: RouteItem): number {
  return `${a.time ?? '~'}`.localeCompare(`${b.time ?? '~'}`);
}

// The "leave by" line only appears when it's actionable — imminent or already
// missed. A departure time on every row is a wall of numbers; on the one row
// that matters it's the most useful thing on the screen.
function LeaveBy({ plan, timeZone }: { plan?: DeparturePlan; timeZone: string }) {
  if (!plan?.leaveBy || !(plan.overdue || plan.soon)) return null;
  return (
    <p className={`field-route-leave${plan.overdue ? ' is-overdue' : ''}`}>
      {plan.overdue ? '⚠ Should have left by' : 'Leave by'} {formatClockTime(plan.leaveBy, timeZone)}
      {plan.driveMinutes ? ` · ~${plan.driveMinutes} min drive` : ''}
    </p>
  );
}

// A numbered job stop: tap the body to open the job, tap Navigate to launch
// turn-by-turn to the address.
function RouteStop({ job, index, plan, timeZone }: { job: FieldJob; index: number; plan?: DeparturePlan; timeZone: string }) {
  return (
    <div className="field-route-stop">
      <span className="field-route-num">{index + 1}</span>
      <Link href={`/field/jobs/${job.id}`} className="field-route-body">
        <div className="field-route-top">
          <strong>{job.client_name}</strong>
          <span className="field-route-time">{formatJobTime(job.scheduled_time) || 'Anytime'}</span>
        </div>
        {job.address ? <p className="field-route-addr">{job.address}</p> : <p className="field-route-addr muted">No address on file</p>}
        <LeaveBy plan={plan} timeZone={timeZone} />
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

// A stop that isn't a job. Deliberately NOT a link: there's no job page behind
// it, nothing to clock into and nothing to mark complete. It's an errand with
// an address, so the address and the Navigate button are the whole card.
function RouteErrand({
  stop,
  index,
  plan,
  timeZone,
}: {
  stop: DayRouteStop;
  index: number;
  plan?: DeparturePlan;
  timeZone: string;
}) {
  return (
    <div className="field-route-stop is-errand">
      <span className="field-route-num">{index + 1}</span>
      <div className="field-route-body">
        <div className="field-route-top">
          <strong>
            <span aria-hidden="true">{KIND_EMOJI[stop.kind]}</span> {stop.label}
          </strong>
          <span className="field-route-time">{formatJobTime(stop.scheduled_time) || 'Anytime'}</span>
        </div>
        {stop.address ? <p className="field-route-addr">{stop.address}</p> : <p className="field-route-addr muted">No address on file</p>}
        <LeaveBy plan={plan} timeZone={timeZone} />
        {stop.note ? <p className="field-route-note">{stop.note}</p> : null}
        <span className="field-status field-status-errand">{KIND_LABEL[stop.kind]}</span>
      </div>
      {stop.address || stop.lat != null ? (
        <NavigateButton
          className="field-route-nav"
          target={{
            address: stop.address,
            lat: stop.lat != null ? Number(stop.lat) : null,
            lng: stop.lng != null ? Number(stop.lng) : null,
          }}
        />
      ) : null}
    </div>
  );
}

export default async function FieldHomePage() {
  const { supabase, accountId, crew, businessName, businesses } = await requireCrewContext();

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

  // The rest of the day: the supply run, the dump trip, the fuel stop. Assigned
  // to this crew member or to nobody — an unassigned stop still has to be made
  // by somebody, which is the same rule the owner's planner applies.
  const dayStops = await listDayRouteStops(supabase, accountId, today, crew.id);

  const routeItems: RouteItem[] = [
    ...todayJobs.map<RouteItem>((job) => ({
      kind: 'job',
      id: job.id,
      time: job.scheduled_time,
      lat: job.lat,
      lng: job.lng,
      job,
    })),
    ...dayStops.map<RouteItem>((stop) => ({
      kind: 'stop',
      id: `stop:${stop.id}`,
      time: stop.scheduled_time,
      lat: stop.lat != null ? Number(stop.lat) : null,
      lng: stop.lng != null ? Number(stop.lng) : null,
      stop,
    })),
  ].sort(byTimeAsc);

  // When to set off for each of today's stops. Anchored at this crew member's
  // own start address when they have one — Plan my day already uses it, and a
  // route measured from the shop is wrong for anybody who leaves from home.
  //
  // Computed over the MERGED list: each stop's origin is the one before it, so
  // leaving the dump run out didn't just hide a stop, it measured the next job's
  // drive from the wrong place and told the tech to leave later than they could.
  const plans = departurePlans(
    routeItems.map((item) => ({ id: item.id, scheduledTime: item.time, lat: item.lat, lng: item.lng })),
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
  const sharedPhoneRaw = await getSharedFieldPhoneNumber();
  const sharedPhoneDisplay = sharedPhoneRaw ? displayPhone(sharedPhoneRaw) : null;

  return (
    <>
      <FieldHeader businessName={businessName} crewName={crew.name} switchable={businesses.length > 1} />
      <main className="field-main">
        <h1 className="field-greeting">Hi {firstName} 👋</h1>
        <FieldPwa />

        {/* Quick Texting Field Tip */}
        <div className="field-textintake-tip">
          <div className="field-textintake-tip-header">
            <span className="field-textintake-tip-badge">📱 Voice & Text Field Intake</span>
            <span className="field-textintake-tip-sub">No app needed</span>
          </div>
          <p>
            On-site or driving? Text or voice memo site updates, gate codes, tasks, or receipt photos to{' '}
            {sharedPhoneRaw ? (
              <a href={`sms:${sharedPhoneRaw}`} className="field-textintake-phone">
                <strong>{sharedPhoneDisplay}</strong>
              </a>
            ) : (
              <strong>our company line</strong>
            )}
            .
          </p>
        </div>

        {/* Pull today's job pages into the cache while there's still signal, so
            the scope, address and checklist survive the drive into the valley
            with no bars. See public/sw.js.

            My pay is deliberately NOT warmed. It is the most sensitive page the
            field app has — somebody's earnings, sitting in a device cache — and
            the least useful in a dead spot, because nothing on it is needed to
            do the work in front of you. Opening it still caches it; nobody who
            never looks at it carries it around. */}
        <FieldOfflineWarm urls={['/field', ...todayJobs.map((job) => `/field/jobs/${job.id}`)]} />

        {/* Deliberately above the jobs. Somebody checking what they're owed
            shouldn't have to scroll past a week of work to find it. */}
        <Link href="/field/pay" className="field-paylink">
          <span>
            <strong>My pay</strong>
            Your hours this period, and when they&apos;re due
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        {/* End-of-Day Dictated Inputs & Voice Log */}
        <Link href="/field/dictate" className="field-paylink" style={{ borderLeft: '4px solid #ff6a24' }}>
          <span>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🎙️ Dictated Inputs &amp; Tasks</span>
              <span style={{ fontSize: '10px', background: 'rgba(255,106,36,0.2)', color: '#ff8e42', padding: '1px 6px', borderRadius: '4px' }}>
                End of Day Wrap-Up
              </span>
            </strong>
            Review voice memos, check off punch lists &amp; submit daily summary
          </span>
          <span aria-hidden="true">›</span>
        </Link>

        {/* routeItems, not jobs: a day can legitimately be one dump run and
            nothing else, and "you have no assigned jobs" would have hidden the
            only thing on it. */}
        {jobs.length === 0 && routeItems.length === 0 ? (
          <p className="field-empty">You have no assigned jobs right now. When your manager assigns you to a job, it&apos;ll show up here.</p>
        ) : (
          <>
            {routeItems.length > 0 ? (
              <section className="field-section">
                <h2 className="field-section-title">Today&apos;s route · {routeItems.length} stop{routeItems.length === 1 ? '' : 's'}</h2>
                <div className="field-route">
                  {routeItems.map((item, index) =>
                    item.kind === 'job' ? (
                      <RouteStop
                        key={item.id}
                        job={item.job}
                        index={index}
                        plan={planById.get(item.id)}
                        timeZone={arrivalSettings.timeZone}
                      />
                    ) : (
                      <RouteErrand
                        key={item.id}
                        stop={item.stop}
                        index={index}
                        plan={planById.get(item.id)}
                        timeZone={arrivalSettings.timeZone}
                      />
                    ),
                  )}
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

            {routeItems.length === 0 && upcoming.length === 0 && other.length === 0 && completed.length === 0 ? (
              <p className="field-empty">Nothing on your plate right now. Enjoy the breather.</p>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
