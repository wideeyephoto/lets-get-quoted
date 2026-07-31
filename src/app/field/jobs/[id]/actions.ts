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
import { startJobEnRoute, markJobArrivedTracking } from '@/lib/job-tracking';
import { isPhoneOptedOut, sendOnMyWaySms } from '@/lib/sms';
import { clockIn, clockOut, getOpenShift, getTimeClockMode } from '@/lib/time-clock-data';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

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

// "On my way" — the tech taps this when heading to the job. Texts the customer a
// live tracking link (respecting opt-out) with a rough ETA from the tech's shared
// location. Uses the admin client for the owner-scoped tracking row + the send,
// after verifying the crew member is assigned via the RLS client.
export async function onMyWayFieldAction(jobId: string, formData: FormData) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);

  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  const techLoc = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;

  const admin = createAdminClient();
  const { data: job } = await admin.from('jobs').select('client_phone, client_name, lat, lng').eq('id', jobId).eq('account_id', accountId).maybeSingle();
  const jobLoc = job && Number.isFinite(Number(job.lat)) && Number.isFinite(Number(job.lng)) ? { lat: Number(job.lat), lng: Number(job.lng) } : null;

  const { token, etaMinutes } = await startJobEnRoute(admin, accountId, jobId, techLoc, jobLoc);

  const phone = (job?.client_phone as string | null) ?? null;
  if (phone && !(await isPhoneOptedOut(accountId, phone))) {
    const { data: site } = await admin.from('sites').select('company_name').eq('account_id', accountId).maybeSingle();
    const { data: account } = await admin.from('accounts').select('business_name').eq('id', accountId).maybeSingle();
    const businessName = (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor';
    try {
      await sendOnMyWaySms({ phone, businessName, trackingUrl: `${APP_ORIGIN}/track/${token}`, etaMinutes, accountId });
    } catch (error) {
      console.error('On-my-way SMS failed:', error instanceof Error ? error.message : error);
    }
  }

  await createJobFeedEvent(supabase, accountId, jobId, {
    kind: 'job_update',
    title: 'On the way',
    body: `${crew.name} is en route${etaMinutes ? ` (~${etaMinutes} min)` : ''}. The customer got a live tracking link.`,
    visibility: 'internal',
    author: crew.name,
  });

  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?onmyway=1`);
}

// Tech arrived — flips the tracking link to "arrived".
export async function markArrivedFieldAction(jobId: string) {
  const { supabase, accountId, crew } = await requireCrewContext();
  await assertAssigned(supabase, accountId, jobId, crew.id);
  await markJobArrivedTracking(createAdminClient(), accountId, jobId);
  revalidatePath(`/field/jobs/${jobId}`);
  redirect(`/field/jobs/${jobId}?arrived=1`);
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
