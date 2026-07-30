'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { updateJobSchedule } from '@/lib/jobs';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendArrivalTimeChangedSms } from '@/lib/sms';
import { formatTimeLabel, parseTimeMinutes } from '@/lib/route-plan';
import { listDayJobs } from '@/lib/route-plan-day';

function planUrl(dateKey: string, crewId: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ date: dateKey });
  if (crewId) params.set('crew', crewId);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  return `/dashboard/schedule/plan?${params.toString()}`;
}

// Writes the proposed order onto the calendar as new start times.
//
// The times come from the page so the contractor gets exactly the plan they were
// shown, but nothing is trusted: every job must genuinely be on that day for this
// account, and a confirmed appointment can never be moved off the time the
// customer agreed to — even if the form says otherwise.
export async function applyDayPlanAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) redirect('/dashboard/schedule');

  // "<jobId>:<HH:MM>" per stop, in the planned visit order.
  const entries = formData.getAll('stop').map((value) => String(value));
  const { jobs } = await listDayJobs(supabase, accountId, dateKey, crewId);
  const jobById = new Map(jobs.map((job) => [job.id, job]));

  const moved: string[] = [];
  let skippedConfirmed = 0;

  for (const entry of entries) {
    const separator = entry.indexOf(':');
    if (separator < 0) continue;
    const jobId = entry.slice(0, separator);
    const time = entry.slice(separator + 1);
    const job = jobById.get(jobId);
    if (!job) continue; // not on this day / not this account — ignore silently
    const minutes = parseTimeMinutes(time);
    if (minutes == null) continue;

    // The promise: a confirmed appointment keeps its time.
    if (job.appointment_confirmed_at) {
      if (parseTimeMinutes(job.scheduled_time) !== minutes) skippedConfirmed += 1;
      continue;
    }
    if (parseTimeMinutes(job.scheduled_time) === minutes) continue; // already there

    const nextTime = `${time}:00`;
    await updateJobSchedule(supabase, accountId, jobId, dateKey, nextTime);
    await createJobFeedEvent(supabase, accountId, jobId, {
      kind: 'job_scheduled',
      title: 'Start time updated by route planning',
      body: `Arrival moved to ${formatTimeLabel(minutes)} to tighten the day's driving.`,
      visibility: 'internal',
      meta: { scheduled_for: dateKey, scheduled_time: nextTime, source: 'route_plan' },
    });
    moved.push(jobId);
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  for (const jobId of moved) revalidatePath(`/dashboard/jobs/${jobId}`);

  redirect(
    planUrl(dateKey, crewId, {
      applied: String(moved.length),
      ...(moved.length ? { moved: moved.join(',') } : {}),
      ...(skippedConfirmed ? { kept: String(skippedConfirmed) } : {}),
    }),
  );
}

// Texts the customers whose arrival time just changed. Opt-in, one tap, after the
// fact — and it reads the times back out of the database so the message can never
// disagree with the calendar.
export async function notifyMovedClientsAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  const jobIds = String(formData.get('jobIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || jobIds.length === 0) redirect('/dashboard/schedule');

  const [{ jobs }, { data: account }] = await Promise.all([
    listDayJobs(supabase, accountId, dateKey, crewId),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  const businessName = (account?.business_name as string) || "Let's Get Quoted contractor";
  const wanted = new Set(jobIds);

  let sent = 0;
  let skipped = 0;
  for (const job of jobs) {
    if (!wanted.has(job.id)) continue;
    const phone = job.client_phone ? normalizeUsPhone(job.client_phone) : null;
    const minutes = parseTimeMinutes(job.scheduled_time);
    if (!phone || minutes == null) {
      skipped += 1;
      continue;
    }
    if (await isPhoneOptedOut(accountId, phone)) {
      skipped += 1;
      continue;
    }
    await recordSmsConsent(accountId, phone, 'arrival_time_changed');
    await sendArrivalTimeChangedSms({
      phone,
      businessName,
      clientName: job.client_name,
      whenLabel: formatTimeLabel(minutes),
      accountId,
    });
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_update',
      title: 'Customer texted their new arrival time',
      body: `Told them we'll arrive at ${formatTimeLabel(minutes)}.`,
      visibility: 'client',
    });
    sent += 1;
  }

  revalidatePath('/dashboard/messages');
  redirect(planUrl(dateKey, crewId, { texted: String(sent), ...(skipped ? { untexted: String(skipped) } : {}) }));
}
