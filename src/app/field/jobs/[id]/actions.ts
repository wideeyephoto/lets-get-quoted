'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireCrewContext } from '@/lib/crew-auth';
import { createAdminClient } from '@/lib/auth';
import { isJobAssignedToCrew } from '@/lib/crew';
import { createJobFeedEvent } from '@/lib/job-feed';
import { createCost } from '@/lib/jobs';
import { createJobTask, setJobTaskDone } from '@/lib/job-tasks';
import { arrivalPermissionsFromCrew, MAX_ETA_MINUTES, MIN_ETA_MINUTES, type ArrivalStatus } from '@/lib/arrival';
import { applyArrivalStatus, sendArrival } from '@/lib/arrival-send';
import { clockIn, clockOut, getOpenShift, getTimeClockMode } from '@/lib/time-clock-data';

async function assertAssigned(supabase: SupabaseClient, accountId: string, jobId: string, crewId: string) {
  if (!(await isJobAssignedToCrew(supabase, accountId, jobId, crewId))) {
    throw new Error('You are not assigned to this job.');
  }
}

export async function setFieldJobStatusAction(jobId: string, status: 'in_progress' | 'complete') {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const { error } = await supabase.from('jobs').update({ status }).eq('account_id', accountId).eq('id', jobId);
  if (error) throw error;

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

  const override = String(formData.get('message') ?? '').trim();
  const result = await sendArrival(createAdminClient(), {
    accountId,
    jobId,
    actor: { crewId: crew.id, name: crew.name },
    permissions: arrivalPermissionsFromCrew(crew as unknown as Record<string, unknown>),
    etaMinutes,
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
export async function clockInFieldAction(jobId: string) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const mode = await getTimeClockMode(supabase, accountId);
  if (mode === 'off') redirect(`/field/jobs/${jobId}`);

  try {
    await clockIn(supabase, accountId, crew.id, jobId, Number(crew.hourly_rate) || 0);
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
  const { hours } = await clockOut(supabase, accountId, entry, {
    endedAt: new Date().toISOString(),
    crewName: crew.name,
    note,
  });

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?clocked=out&hours=${hours}`);
}

// Crew logs their hours on the job from the field. Amount is server-computed as
// hours × rate (createCost never trusts a client amount for labor); the rate
// defaults to the crew member's saved hourly rate but can be overridden.
export async function logFieldTimeAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  // With the clock required, typing hours is not a second way in — it's a way
  // around the thing the owner turned on. The UI hides the form; this is the
  // check that means hiding it is enough.
  if ((await getTimeClockMode(supabase, accountId)) === 'required') {
    redirect(`/field/jobs/${jobId}?clock=${encodeURIComponent('Clock in and out to log time on this job.')}`);
  }

  const hours = Number(formData.get('hours'));
  if (!Number.isFinite(hours) || hours <= 0) redirect(`/field/jobs/${jobId}?logged=time-invalid`);
  const rawRate = Number(formData.get('rate'));
  const rate = Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : Number(crew.hourly_rate) || 0;
  const note = String(formData.get('description') ?? '').trim();
  const description = note || `${crew.name} — labor`;

  await createCost(supabase, accountId, jobId, { type: 'labor', description, crewId: crew.id, hours, rate });

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
  await createCost(supabase, accountId, jobId, { type: 'material', description, amount, crewId: crew.id });

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
