import { redirect } from 'next/navigation';
import { requireCrewContext } from '@/lib/crew-auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { formatJobSchedule, formatMoney } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { listJobTasks, taskProgress } from '@/lib/job-tasks';
import SaveButton from '@/components/save-button';
import FieldHeader from '../../FieldHeader';
import { setFieldJobStatusAction, postFieldUpdateAction, logFieldTimeAction, logFieldMaterialAction, toggleFieldTaskAction, addFieldTaskAction, sendArrivalFieldAction, setArrivalStatusFieldAction, updateArrivalPositionAction, clockInFieldAction, clockOutFieldAction } from './actions';
import { getOpenShift, getTimeClockMode } from '@/lib/time-clock-data';
import { formatClock, formatElapsed } from '@/lib/time-clock';
import FieldClock from './FieldClock';
import ArrivalPanel from '@/components/arrival-panel';
import NavigateButton from '@/components/navigate-button';
import ArrivalTracker from '@/components/arrival-tracker';
import {
  arrivalPermissionsFromCrew, arrivalSettingsFromAccount, canShareLocation, describeArrivalOutcome,
  formatArrivalWindow, locationDefaultsOn, DEFAULT_ARRIVAL_TEMPLATE,
} from '@/lib/arrival';
import { getActiveTracking } from '@/lib/job-tracking';
import { createAdminClient } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  new_lead: 'New',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

function formatTime(value: string): string {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}


export default async function FieldJobPage({ params, searchParams }: { params: { id: string }; searchParams: { logged?: string; clocked?: string; clock?: string; hours?: string; arrival?: string; sms?: string } }) {
  const { supabase, accountId, crew, businessName } = await requireCrewContext();

  if (!(await isJobAssignedToCrew(supabase, accountId, params.id, crew.id))) {
    redirect('/field');
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id, ref, client_name, client_phone, address, scope, status, scheduled_for, scheduled_time, lat, lng')
    .eq('account_id', accountId)
    .eq('id', params.id)
    .maybeSingle();
  if (!job) redirect('/field');

  // Arrival state. The account row and the live trip are read with the admin
  // client: crew RLS deliberately doesn't reach `accounts` (billing) or the
  // owner-scoped tracking table, and the assignment check above is what makes
  // this safe.
  const admin = createAdminClient();
  const [{ data: accountRow }, activeTrip] = await Promise.all([
    admin.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    getActiveTracking(admin, accountId, params.id),
  ]);
  const arrivalSettings = arrivalSettingsFromAccount(accountRow as Record<string, unknown> | null);
  const arrivalPermissions = arrivalPermissionsFromCrew(crew as unknown as Record<string, unknown>);

  const [{ data: feed }, { data: myCosts }] = await Promise.all([
    supabase
      .from('job_feed')
      .select('id, title, body, author, created_at')
      .eq('account_id', accountId)
      .eq('job_id', params.id)
      .order('created_at', { ascending: false })
      .limit(8),
    // The crew member's own logged time & materials on this job.
    supabase
      .from('costs')
      .select('id, type, description, hours, amount, created_at')
      .eq('account_id', accountId)
      .eq('job_id', params.id)
      .eq('crew_id', crew.id)
      .in('type', ['labor', 'material'])
      .order('created_at', { ascending: false }),
  ]);

  const loggedCosts = myCosts ?? [];
  const loggedHours = loggedCosts.filter((c) => c.type === 'labor').reduce((sum, c) => sum + (Number(c.hours) || 0), 0);
  const loggedMaterials = loggedCosts.filter((c) => c.type === 'material').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const loggedFlash =
    searchParams.logged === 'time'
      ? 'Time logged ✓'
      : searchParams.logged === 'material'
        ? 'Material logged ✓'
        : searchParams.logged === 'time-invalid'
          ? 'Enter hours greater than 0.'
          : searchParams.logged === 'material-invalid'
            ? 'Add what it was and a valid amount.'
            : null;
  const loggedFlashError = searchParams.logged === 'time-invalid' || searchParams.logged === 'material-invalid';

  // The time clock. Read here so the page can show the running shift and, when
  // the owner has made clocking required, drop the manual hours form entirely.
  const clockMode = await getTimeClockMode(supabase, accountId);
  const openShift = clockMode === 'off' ? null : await getOpenShift(supabase, accountId, crew.id);
  const shiftOnThisJob = openShift && openShift.job_id === params.id ? openShift : null;
  const clockFlash = searchParams.clock
    ? searchParams.clock
    : searchParams.clocked === 'in'
      ? 'Clocked in ✓'
      : searchParams.clocked === 'out'
        ? `Clocked out ✓ ${searchParams.hours ?? ''} hrs logged`.trim()
        : null;

  const jobTasks = await listJobTasks(supabase, accountId, params.id);
  const taskStats = taskProgress(jobTasks);

  // What the tech is told after an arrival action. The delivery outcome is
  // spelled out rather than reduced to a tick, because "sent" and "we tried to
  // send" lead to different behaviour at the door.
  const arrivalFlash = describeArrivalOutcome(searchParams.arrival, searchParams.sms);

  const isComplete = job.status === 'complete';

  return (
    <>
      <FieldHeader businessName={businessName} crewName={crew.name} backHref="/field" />
      <main className="field-main">
        {arrivalFlash ? <div className={`field-flash${arrivalFlash.error ? ' is-error' : ''}`}>{arrivalFlash.text}</div> : null}
        {loggedFlash ? <div className={`field-flash${loggedFlashError ? ' is-error' : ''}`}>{loggedFlash}</div> : null}
        {clockFlash ? <div className={`field-flash${searchParams.clock ? ' is-error' : ''}`}>{clockFlash}</div> : null}
        <div className="field-detail-head">
          <h1>{job.client_name}</h1>
          <span className={`field-status field-status-${job.status}`}>{STATUS_LABEL[job.status] ?? job.status}</span>
        </div>
        <p className="field-detail-ref">{job.ref} · {formatJobSchedule(job.scheduled_for, job.scheduled_time)}</p>

        <div className="field-actions-row">
          {job.client_phone && arrivalPermissions.viewContact ? (
            <>
              <a className="field-chip" href={`tel:${job.client_phone}`}>📞 Call</a>
              <a className="field-chip" href={`sms:${job.client_phone}`}>💬 Text</a>
            </>
          ) : null}
          {job.address || job.lat ? (
            <NavigateButton
              className="field-chip"
              target={{
                address: job.address,
                // Coordinates beat the address string when we have them: a
                // geocoded point can't be mis-parsed by a map app, and Waze in
                // particular strands you on a search screen without them.
                lat: Number.isFinite(Number(job.lat)) ? Number(job.lat) : null,
                lng: Number.isFinite(Number(job.lng)) ? Number(job.lng) : null,
              }}
            />
          ) : null}
        </div>

        {job.address ? (
          <section className="field-block">
            <h2 className="field-block-title">Address</h2>
            <p>{job.address}</p>
          </section>
        ) : null}

        {job.client_phone && arrivalPermissions.viewContact ? (
          <section className="field-block">
            <h2 className="field-block-title">Customer</h2>
            <p>{formatPhoneDashes(job.client_phone)}</p>
          </section>
        ) : null}

        <section className="field-block">
          <h2 className="field-block-title">Scope of work</h2>
          <p className="field-scope-body">{job.scope || 'No scope notes added yet.'}</p>
        </section>

        {/* Only mounted while a trip is actually in flight — no live trip, no
            geolocation watch, no battery cost. */}
        {activeTrip && (activeTrip.status === 'en_route' || activeTrip.status === 'delayed') ? (
          <ArrivalTracker
            jobId={job.id}
            dest={Number.isFinite(Number(job.lat)) && Number.isFinite(Number(job.lng))
              ? { lat: Number(job.lat), lng: Number(job.lng) }
              : null}
            sharing={Boolean(activeTrip.share_location)}
            updatePosition={updateArrivalPositionAction.bind(null, job.id)}
            arrivedForm={(
              <form action={setArrivalStatusFieldAction.bind(null, job.id)}>
                <input type="hidden" name="status" value="arrived" />
                <button type="submit" className="btn primary">✓ Mark arrived</button>
              </form>
            )}
          />
        ) : null}

        {!isComplete ? (
          <ArrivalPanel
            job={{
              id: job.id,
              clientName: job.client_name,
              address: job.address,
              scheduleLabel: formatJobSchedule(job.scheduled_for, job.scheduled_time),
              // First line of the scope, as the "what am I here for" check.
              jobType: job.scope ? job.scope.split('\n')[0].slice(0, 60) : null,
              hasPhone: Boolean(job.client_phone),
              lat: Number.isFinite(Number(job.lat)) ? Number(job.lat) : null,
              lng: Number.isFinite(Number(job.lng)) ? Number(job.lng) : null,
            }}
            trip={activeTrip ? {
              status: activeTrip.status,
              windowLabel: activeTrip.arrival_start
                ? formatArrivalWindow(
                    { start: new Date(activeTrip.arrival_start), end: new Date(activeTrip.arrival_end ?? activeTrip.arrival_start) },
                    arrivalSettings.timeZone,
                  )
                : null,
              sentAgoMinutes: activeTrip.last_sent_at
                ? Math.max(0, Math.round((Date.now() - new Date(activeTrip.last_sent_at).getTime()) / 60000))
                : null,
              smsStatus: activeTrip.sms_status,
              shareLocation: Boolean(activeTrip.share_location),
              sentBy: activeTrip.sent_by,
              homeownerNote: activeTrip.homeowner_note,
            } : null}
            business={businessName}
            crewName={crew.name}
            template={arrivalSettings.messageTemplate || DEFAULT_ARRIVAL_TEMPLATE}
            timeZone={arrivalSettings.timeZone}
            windowStyle={arrivalSettings.windowStyle}
            windowMinutes={arrivalSettings.windowMinutes}
            defaultMinutes={arrivalSettings.defaultMinutes}
            canShareLocation={canShareLocation(arrivalSettings, arrivalPermissions)}
            shareDefaultsOn={locationDefaultsOn(arrivalSettings, arrivalPermissions)}
            canReschedule={arrivalPermissions.reschedule}
            canSend={arrivalPermissions.send}
            sendAction={sendArrivalFieldAction.bind(null, job.id)}
            statusAction={setArrivalStatusFieldAction.bind(null, job.id)}
          />
        ) : null}

        <section className="field-block">
          <h2 className="field-block-title">Update status</h2>
          <div className="field-actions-row">
            {!isComplete && job.status !== 'in_progress' ? (
              <form action={setFieldJobStatusAction.bind(null, job.id, 'in_progress')}>
                <SaveButton className="btn secondary" pendingLabel="Saving…" savedLabel="Started ✓">Start work</SaveButton>
              </form>
            ) : null}
            {!isComplete ? (
              <form action={setFieldJobStatusAction.bind(null, job.id, 'complete')}>
                <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Done ✓">Mark complete</SaveButton>
              </form>
            ) : (
              <p className="field-complete-note">✓ This job is marked complete.</p>
            )}
          </div>
        </section>

        <section className="field-block">
          <h2 className="field-block-title">Checklist{taskStats.total > 0 ? ` · ${taskStats.done}/${taskStats.total}` : ''}</h2>
          {taskStats.total > 0 ? (
            <div className="task-progress" aria-hidden="true"><div className="task-progress-fill" style={{ width: `${taskStats.pct}%` }} /></div>
          ) : null}
          {jobTasks.length > 0 ? (
            <div className="field-task-list">
              {jobTasks.map((task) => (
                <form action={toggleFieldTaskAction.bind(null, job.id, task.id, !task.done)} key={task.id} className={`field-task${task.done ? ' is-done' : ''}`}>
                  <button type="submit" className="field-task-btn">
                    <span className="field-task-check">{task.done ? '✓' : ''}</span>
                    <span className="field-task-title">{task.title}</span>
                    {task.done && task.done_by ? <span className="field-task-by">{task.done_by}</span> : null}
                  </button>
                </form>
              ))}
            </div>
          ) : (
            <p className="field-empty">No checklist items for this job yet.</p>
          )}
          <form action={addFieldTaskAction.bind(null, job.id)} className="field-task-add">
            <input name="title" placeholder="Add a task you found…" required />
            <SaveButton className="btn secondary" pendingLabel="Adding…" savedLabel="Added ✓">Add</SaveButton>
          </form>
        </section>

        <section className="field-block">
          <h2 className="field-block-title">Log time &amp; materials</h2>
          {loggedHours > 0 || loggedMaterials > 0 ? (
            <p className="field-log-summary">
              You&apos;ve logged {loggedHours > 0 ? `${loggedHours} hr${loggedHours === 1 ? '' : 's'}` : ''}
              {loggedHours > 0 && loggedMaterials > 0 ? ' · ' : ''}
              {loggedMaterials > 0 ? `${formatMoney(loggedMaterials)} materials` : ''} on this job.
            </p>
          ) : null}

          {/* The clock, when the owner has switched it on. It goes above the
              manual form because when both are available it's the one that
              needs no arithmetic at the end of a long day. */}
          {clockMode !== 'off' ? (
            <FieldClock
              jobId={job.id}
              clockIn={clockInFieldAction.bind(null, job.id)}
              clockOut={clockOutFieldAction.bind(null, job.id)}
              startedAt={shiftOnThisJob?.started_at ?? null}
              startedLabel={shiftOnThisJob ? formatClock(shiftOnThisJob.started_at) : null}
              elapsedLabel={shiftOnThisJob ? formatElapsed(shiftOnThisJob.started_at) : null}
              busyElsewhere={Boolean(openShift && !shiftOnThisJob)}
              required={clockMode === 'required'}
            />
          ) : null}

          {clockMode !== 'required' ? (
            <form action={logFieldTimeAction.bind(null, job.id)} className="field-log-form">
              <div className="field-log-row">
                <label>
                  <span>Hours</span>
                  <input name="hours" type="number" min="0" step="0.25" inputMode="decimal" placeholder="0" required />
                </label>
                <label>
                  <span>Rate ($/hr)</span>
                  <input name="rate" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={Number(crew.hourly_rate) > 0 ? Number(crew.hourly_rate) : ''} placeholder="0" />
                </label>
              </div>
              <input name="description" type="text" placeholder="What you worked on (optional)" />
              <SaveButton className="btn secondary" pendingLabel="Saving…" savedLabel="Logged ✓">Log time</SaveButton>
            </form>
          ) : null}

          <form action={logFieldMaterialAction.bind(null, job.id)} className="field-log-form">
            <div className="field-log-row">
              <label className="field-log-grow">
                <span>Material / expense</span>
                <input name="description" type="text" placeholder="e.g. 2 bundles shingles" required />
              </label>
              <label>
                <span>Cost ($)</span>
                <input name="amount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" required />
              </label>
            </div>
            <SaveButton className="btn secondary" pendingLabel="Saving…" savedLabel="Added ✓">Add material</SaveButton>
          </form>

          {loggedCosts.length > 0 ? (
            <div className="field-log-list">
              {loggedCosts.slice(0, 8).map((cost) => (
                <div key={cost.id} className="field-log-item">
                  <span>{cost.type === 'labor' ? '⏱' : '🧾'} {cost.description}</span>
                  <span>{cost.type === 'labor' ? `${Number(cost.hours) || 0} hr` : formatMoney(Number(cost.amount) || 0)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="field-block">
          <h2 className="field-block-title">Post an update</h2>
          <form action={postFieldUpdateAction.bind(null, job.id)} className="field-update-form">
            <textarea name="body" rows={3} placeholder="On site, started demo. Running about an hour behind…" required />
            <label className="field-share">
              <input type="checkbox" name="share" />
              <span>Also share this with the customer</span>
            </label>
            <SaveButton className="btn secondary" pendingLabel="Posting…" savedLabel="Posted ✓">Post update</SaveButton>
          </form>
        </section>

        {(feed ?? []).length > 0 ? (
          <section className="field-block">
            <h2 className="field-block-title">Recent activity</h2>
            <div className="field-feed">
              {(feed ?? []).map((event) => (
                <div key={event.id} className="field-feed-item">
                  <div className="field-feed-top">
                    <strong>{event.title}</strong>
                    <span>{formatTime(event.created_at)}</span>
                  </div>
                  {event.body ? <p>{event.body}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}
