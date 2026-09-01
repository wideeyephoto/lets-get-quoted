'use server';

import { revalidatePath } from 'next/cache';
import { resolveCrewBurdenPct } from '@/lib/cost-truth-data';
import { normalizeCostSource } from '@/lib/cost-truth';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireCrewContext } from '@/lib/crew-auth';
import { createAdminClient } from '@/lib/auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { applyQuoteAcceptance, createJobFeedEvent } from '@/lib/job-feed';
import { createCost } from '@/lib/jobs';
import { evaluateAndTriggerMarginAlert } from '@/lib/margin-alerts';
import { createJobTask, setJobTaskDone } from '@/lib/job-tasks';
import { arrivalPermissionsFromCrew, arrivalSettingsFromAccount, MAX_ETA_MINUTES, MIN_ETA_MINUTES, type ArrivalStatus } from '@/lib/arrival';
import { applyArrivalStatus, sendArrival } from '@/lib/arrival-send';
import { getActiveTracking, updateTechPosition } from '@/lib/job-tracking';
import { clockIn, clockOut, getOpenShift } from '@/lib/time-clock-data';
import { setCrewJobStatus } from '@/lib/crew-job-status';
import { sendJobsiteArrivalBriefingSms } from '@/lib/crew-onsite-briefing';

export async function assertAssigned(supabase: SupabaseClient, accountId: string, jobId: string, crewId: string) {
  if (!(await isJobAssignedToCrew(supabase, accountId, jobId, crewId))) {
    throw new Error('You are not assigned to this job.');
  }
}

/**
 * The crew's own Start work / Mark complete.
 *
 * THE THIRD DOOR OUT OF THE QUOTE STAGE, and it used to be the only one that
 * left no trace. A crew member is on site because the customer said yes, so
 * their press means the same thing the owner's does — and it wrote a bare
 * status, skipping the acceptance record, the lead, and the contractor's
 * conversion rate. Same treatment as markJobStartedAction: through the one
 * function that defines what accepted means, best-effort so a downstream
 * failure never blocks a tech standing in a driveway.
 *
 * started_at is stamped here too, and was not. Every owner-facing surface reads
 * that column to tell "on the calendar" from "underway" — the badge, the
 * pipeline step, the late-arrival sweep — so a job the crew had started still
 * showed the owner a "Job started" button to press.
 *
 * THE WRITE ITSELF is no longer an update from here. It went through the crew's
 * own client against a table whose guard trigger permits crew `status` and
 * nothing else, so writing started_at alongside it failed outright on any
 * database carrying that trigger — the first press of Start work did nothing but
 * raise. See lib/crew-job-status.
 */
export async function setFieldJobStatusAction(jobId: string, status: 'in_progress' | 'complete') {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const { data: current } = await supabase
    .from('jobs').select('status').eq('account_id', accountId).eq('id', jobId).maybeSingle();

  if (current?.status === 'new_lead') {
    try {
      await applyQuoteAcceptance(createAdminClient(), accountId, jobId, {
        source: status === 'complete' ? 'work_completed' : 'work_started',
      });
    } catch (error) {
      console.error(`Quote acceptance from the field app failed for job ${jobId}:`, error instanceof Error ? error.message : error);
    }
  }

  try {
    await setCrewJobStatus(supabase, accountId, jobId, status);
  } catch (error) {
    // A tech in a driveway needs to be told, not shown a stack trace. The
    // message is the database's own — "you are not assigned to this job",
    // "that job has been archived" — and each is actionable.
    const message = error instanceof Error ? error.message : 'Could not update this job.';
    redirect(`/field/jobs/${jobId}?clock=${encodeURIComponent(message)}`);
  }

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: status === 'complete' ? 'Marked complete by crew' : 'Work started by crew',
    body: `${crew.name} ${status === 'complete' ? 'marked this job complete' : 'started work'} from the field app.`,
    visibility: 'internal',
    author: crew.name,
  });

  revalidatePath('/field');
  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}`);
}

// "On my way" — the tech announces a specific arrival time and the customer gets
// a status link. Everything real happens in lib/arrival-send so the owner's
// dashboard runs identical code; this layer is authentication, input validation
// and telling the tech what happened.
//
// Uses the admin client for the owner-scoped tracking row and the send, after
// verifying via the RLS client that this crew member is actually on this job.
export async function sendArrivalFieldAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  const techLoc = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  // The ETA is the tech's promise, so it is validated rather than trusted: a
  // fat-fingered "600" becomes a window nobody can keep.
  const etaMinutes = Math.round(Number(formData.get('eta')));
  if (!Number.isFinite(etaMinutes) || etaMinutes < MIN_ETA_MINUTES || etaMinutes > MAX_ETA_MINUTES) {
    redirect(`/field/jobs/${jobId}?arrival=bad-eta`);
  }

  const suggestedRaw = Number(formData.get('suggested'));
  const override = String(formData.get('message') ?? '').trim();
  const result = await sendArrival(createAdminClient(), {
    accountId,
    jobId,
    actor: { crewId: crew.id, name: crew.name },
    permissions: arrivalPermissionsFromCrew(crew as unknown as Record<string, unknown>),
    etaMinutes,
    suggestedMinutes: Number.isFinite(suggestedRaw) && suggestedRaw > 0 ? Math.round(suggestedRaw) : null,
    shareLocation: formData.get('share') === 'on',
    techLoc,
    override: override || null,
    confirmedResend: formData.get('confirm') === 'on',
  });

  revalidatePath(`/field/jobs/${jobId}`);
  if (!result.ok) redirect(`/field/jobs/${jobId}?arrival=${result.reason}`);
  // The delivery outcome rides back in the URL because it is the single thing
  // the tech needs to read before they start driving.
  redirect(`/field/jobs/${jobId}?arrival=${result.mode}&sms=${result.sms.status}`);
}

// Move the tech's pin while they're actually driving.
//
// Called only from the open job screen, only on a trip they already consented
// to share, and it returns nothing — a position update is not worth a redirect
// or a re-render. There is no background tracking behind this: close the page
// and the pin stops moving, then lapses on its own.
export async function updateArrivalPositionAction(jobId: string, lat: number, lng: number): Promise<void> {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);
  if (!arrivalPermissionsFromCrew(crew as unknown as Record<string, unknown>).shareLocation) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const admin = createAdminClient();
  const [{ data: account }, active, { data: job }] = await Promise.all([
    admin.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    getActiveTracking(admin, accountId, jobId),
    admin.from('jobs').select('lat, lng').eq('id', jobId).maybeSingle(),
  ]);
  if (!active) return;

  const settings = arrivalSettingsFromAccount(account as Record<string, unknown> | null);
  if (settings.locationPolicy === 'off') return;
  const jobDest = job && job.lat != null && job.lng != null ? { lat: Number(job.lat), lng: Number(job.lng) } : null;
  await updateTechPosition(admin, active, { lat, lng }, settings.locationPrecision, new Date(), jobDest, settings);
}

// Arrived / couldn't get in / rescheduled / cancelled. One action, because they
// are the same decision — how did this visit end — and splitting them into four
// would mean four places to forget to close the location share.
export async function setArrivalStatusFieldAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const status = String(formData.get('status') ?? '') as ArrivalStatus;
  if (!['arrived', 'no_access', 'rescheduled', 'cancelled'].includes(status)) {
    redirect(`/field/jobs/${jobId}`);
  }

  const result = await applyArrivalStatus(createAdminClient(), {
    accountId,
    jobId,
    actor: { crewId: crew.id, name: crew.name },
    permissions: arrivalPermissionsFromCrew(crew as unknown as Record<string, unknown>),
    status: status as 'arrived' | 'no_access' | 'rescheduled' | 'cancelled',
    note: String(formData.get('note') ?? '').trim() || null,
    // Undefined when the box wasn't ticked (or wasn't offered) — the per-status
    // default lives in applyArrivalStatus so both send paths share it.
    notify: formData.get('notify') === 'on' ? true : undefined,
  });

  revalidatePath(`/field/jobs/${jobId}`);
  if (!result.ok) redirect(`/field/jobs/${jobId}?arrival=${result.reason}`);
  redirect(`/field/jobs/${jobId}?arrival=${status}`);
}

// Start a shift. The rate is snapshotted now, so a rate change later doesn't
// restate time that was already worked.
export async function clockInFieldAction(jobId: string, formData?: FormData) {
  const { supabase, accountId, crew, timeClockMode } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  // From the context, which resolved it with the admin client. Asking the crew
  // member's own client would answer 'off' every time — they hold no read on
  // `accounts` — which is how "required" quietly became "optional".
  if (timeClockMode === 'off') redirect(`/field/jobs/${jobId}`);

  let geofenceEvidence: {
    status?: string | null;
    distanceFt?: number | null;
    accuracyMeters?: number | null;
    verifiedAt?: string | null;
    gpsUnavailable?: boolean | null;
  } | undefined = undefined;

  if (formData) {
    const latStr = formData.get('lat');
    const lngStr = formData.get('lng');
    const accStr = formData.get('accuracy');
    const status = formData.get('geofenceStatus');
    const distStr = formData.get('distanceFt');
    const gpsUnavailable = formData.get('gpsUnavailable') === 'true';

    if (latStr && lngStr) {
      geofenceEvidence = {
        status: status ? String(status) : null,
        distanceFt: distStr ? Number(distStr) : null,
        accuracyMeters: accStr ? Number(accStr) : null,
        verifiedAt: new Date().toISOString(),
        gpsUnavailable,
      };
    } else if (gpsUnavailable) {
      geofenceEvidence = {
        status: 'coordinates_missing',
        gpsUnavailable: true,
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  try {
    await clockIn(supabase, accountId, crew.id, jobId, Number(crew.hourly_rate) || 0, undefined, undefined, geofenceEvidence);

    // Trigger on-site briefing text for special requests/cautions (idempotent 1/day)
    sendJobsiteArrivalBriefingSms(
      {
        accountId,
        jobId,
        crewId: crew.id,
        triggerSource: 'geofence_clock_in',
      },
      createAdminClient(),
    ).catch((err) => {
      console.warn('On-site crew clock-in briefing send non-blocking error:', err);
    });
  } catch (error) {
    // Everything that can go wrong here is worth SAYING — "already clocked in
    // on another job" is the one a crew member actually hits, and a silent
    // no-op would leave them tapping a button that appears dead.
    const message = error instanceof Error ? error.message : 'Could not clock in.';
    redirect(`/field/jobs/${jobId}?clock=${encodeURIComponent(message)}`);
  }

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?clocked=in`);
}

// End the shift and turn it into a labor entry.
export async function clockOutFieldAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const entry = await getOpenShift(supabase, accountId, crew.id);
  if (!entry || entry.job_id !== jobId) redirect(`/field/jobs/${jobId}?clock=${encodeURIComponent('No open shift to clock out of.')}`);

  const note = String(formData.get('description') ?? '').trim() || null;

  let geofenceEvidence: {
    status?: string | null;
    distanceFt?: number | null;
    accuracyMeters?: number | null;
    verifiedAt?: string | null;
  } | undefined = undefined;

  const latStr = formData.get('lat');
  const lngStr = formData.get('lng');
  const accStr = formData.get('accuracy');
  const status = formData.get('geofenceStatus');
  const distStr = formData.get('distanceFt');

  if (latStr && lngStr) {
    geofenceEvidence = {
      status: status ? String(status) : null,
      distanceFt: distStr ? Number(distStr) : null,
      accuracyMeters: accStr ? Number(accStr) : null,
      verifiedAt: new Date().toISOString(),
    };
  }

  const { hours } = await clockOut(supabase, accountId, entry, {
    endedAt: new Date().toISOString(),
    crewName: crew.name,
    note,
    geofenceEvidence,
  });

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?clocked=out&hours=${hours}`);
}

// Crew logs their hours on the job from the field.
//
// THE HOURS ARE THEIRS TO REPORT; THE RATE IS NOT. This action used to read a
// "rate" field straight off the form, and the form put an editable "Rate ($/hr)"
// box next to the hours — so a crew member could log four hours at any figure
// they typed, and it landed in the owner's labor cost, their margin and their
// pay run as if the owner had set it. The rate now comes from the crew row,
// which only an owner can write, and the database refuses a labor cost carrying
// any other figure (crew_costs_guard).
export async function logFieldTimeAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew, timeClockMode } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  // With the clock required, typing hours is not a second way in — it's a way
  // around the thing the owner turned on. The UI hides the form; this is the
  // check that means hiding it is enough. Read from the context, because the
  // crew member's own client cannot see this setting at all.
  if (timeClockMode === 'required') {
    redirect(`/field/jobs/${jobId}?clock=${encodeURIComponent('Clock in and out to log time on this job.')}`);
  }

  const hours = Number(formData.get('hours'));
  if (!Number.isFinite(hours) || hours <= 0) redirect(`/field/jobs/${jobId}?logged=time-invalid`);
  const rate = Number(crew.hourly_rate) || 0;
  const note = String(formData.get('description') ?? '').trim();
  const description = note || `${crew.name} — labor`;

  // 'estimated': hours typed in after the fact are a recollection. Time the
  // clock measured is recorded as 'clocked' instead — the distinction is the
  // point of the field, and calling both "measured" would erase it.
  const cost = await createCost(supabase, accountId, jobId, {
    type: 'labor',
    description,
    crewId: crew.id,
    hours,
    rate,
    source: 'estimated',
    burdenPct: await resolveCrewBurdenPct(supabase, accountId, crew.id),
  });

  await evaluateAndTriggerMarginAlert(supabase, accountId, jobId, cost);

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?logged=time`);
}

// Crew logs a material/expense from the field. We attribute it to the crew
// member (crew_id/crew_name) so the owner sees who bought what.
export async function logFieldMaterialAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const description = String(formData.get('description') ?? '').trim();
  const amount = Number(formData.get('amount'));
  if (!description || !Number.isFinite(amount) || amount < 0) redirect(`/field/jobs/${jobId}?logged=material-invalid`);

  // Attribute to the crew member inline (createCost snapshots their name) — no
  // follow-up update, so the row satisfies the crew "own rows only" cost RLS.
  // A crew member logging a material spend is standing at the counter with the
  // receipt in their hand, so 'receipt' is the honest default here — unlike the
  // owner's form, where the figure could have come from anywhere.
  const cost = await createCost(supabase, accountId, jobId, {
    type: 'material',
    description,
    amount,
    crewId: crew.id,
    source: normalizeCostSource(formData.get('costSource')) === 'estimated' ? 'estimated' : 'receipt',
  });

  await evaluateAndTriggerMarginAlert(supabase, accountId, jobId, cost);

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?logged=material`);
}

// Crew ticks a checklist item off (or back on) from the field; records their
// name as who did it.
export async function toggleFieldTaskAction(jobId: string, taskId: string, done: boolean) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);
  await setJobTaskDone(supabase, accountId, taskId, done, crew.name);
  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}`);
}

// Crew adds a task they found on site (punch-list additions from the field).
export async function addFieldTaskAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);
  const title = String(formData.get('title') ?? '').trim();
  if (!title) redirect(`/field/jobs/${jobId}`);
  await createJobTask(supabase, accountId, jobId, title);
  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}`);
}

export async function postFieldUpdateAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const body = String(formData.get('body') ?? '').trim();
  const share = formData.get('share') === 'on';
  if (!body) redirect(`/field/jobs/${jobId}`);

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: share ? `Update from ${crew.name}` : `Field note from ${crew.name}`,
    body,
    // Shared updates land on the customer's job dashboard; notes stay internal.
    visibility: share ? 'client' : 'internal',
    author: crew.name,
  });

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}`);
}
