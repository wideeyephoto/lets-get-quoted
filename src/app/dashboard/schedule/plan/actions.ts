'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwnerContext } from '@/lib/auth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { updateJobSchedule } from '@/lib/jobs';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendArrivalTimeChangedSms } from '@/lib/sms';
import { buildScheduleChangeset, formatTimeLabel, parseTimeMinutes } from '@/lib/route-plan';
import { listDayJobs } from '@/lib/route-plan-day';

function planUrl(dateKey: string, crewId: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ date: dateKey });
  if (crewId) params.set('crew', crewId);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  return `/dashboard/schedule/plan?${params.toString()}`;
}

// Writes the proposed order onto the calendar as new start times.
//
// All-or-nothing. Every rule is applied up front by buildScheduleChangeset — job
// is really on this day, time parses, confirmed appointments untouchable — so the
// only thing left to fail is the database. If one write does fail, the ones
// already made are put back, because a half-applied route is worse than no route:
// it leaves stops overlapping at times nobody chose.
//
// Postgres would do this more cleanly in one transaction, which needs an RPC and
// a migration; this keeps the guarantee without a schema change.
export async function applyDayPlanAction(formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) redirect('/dashboard/schedule');

  // "<jobId>:<HH:MM>" per stop, in the planned visit order.
  const entries = formData.getAll('stop').map((value) => String(value));
  const { jobs } = await listDayJobs(supabase, accountId, dateKey, crewId);
  const { changes, keptConfirmed } = buildScheduleChangeset(jobs, entries);

  const kept: Record<string, string> = keptConfirmed ? { kept: String(keptConfirmed) } : {};
  if (changes.length === 0) redirect(planUrl(dateKey, crewId, { applied: '0', ...kept }));

  // Applied so far, newest last, so a failure can be unwound in reverse.
  const applied: Array<{ jobId: string; previous: string | null }> = [];
  let failure: string | null = null;
  let stranded = 0;

  try {
    for (const change of changes) {
      await updateJobSchedule(supabase, accountId, change.jobId, dateKey, change.to);
      applied.push({ jobId: change.jobId, previous: change.from });
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown error';
    // Unwind. Each restore is itself best-effort — if one fails there is nothing
    // further we can do but count it and say so rather than pretend.
    for (const done of [...applied].reverse()) {
      try {
        await updateJobSchedule(supabase, accountId, done.jobId, dateKey, done.previous);
      } catch {
        stranded += 1;
      }
    }
    console.error('applyDayPlanAction rolled back:', failure);
  }

  if (failure) {
    revalidatePath('/dashboard/schedule');
    redirect(planUrl(dateKey, crewId, { failed: '1', ...(stranded ? { stranded: String(stranded) } : {}) }));
  }

  // Only once every move stuck: the feed is an audit trail, so it must not record
  // moves that were rolled back.
  for (const change of changes) {
    await createJobFeedEvent(supabase, accountId, change.jobId, {
      kind: 'job_scheduled',
      title: 'Start time updated by route planning',
      body: `Arrival moved to ${formatTimeLabel(parseTimeMinutes(change.to) ?? 0)} to tighten the day's driving.`,
      visibility: 'internal',
      meta: { scheduled_for: dateKey, scheduled_time: change.to, source: 'route_plan' },
    });
  }

  revalidatePath('/dashboard/schedule');
  revalidatePath('/dashboard/jobs');
  for (const change of changes) revalidatePath(`/dashboard/jobs/${change.jobId}`);

  redirect(
    planUrl(dateKey, crewId, {
      applied: String(changes.length),
      moved: changes.map((change) => change.jobId).join(','),
      ...kept,
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
