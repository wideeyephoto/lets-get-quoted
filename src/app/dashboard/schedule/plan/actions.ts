'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOfficeContext } from '@/lib/auth';
import { createJobFeedEvent } from '@/lib/job-feed';
import { backfillJobCoordinates, updateJobSchedule } from '@/lib/jobs';
import { normalizeUsPhone } from '@/lib/phone';
import { isPhoneOptedOut, recordSmsConsent, sendArrivalTimeChangedSms } from '@/lib/sms';
import { arrivalWindow, buildScheduleChangeset, formatTimeLabel, parseTimeMinutes } from '@/lib/route-plan';
import { getPlanAccountSettings, listDayJobs } from '@/lib/route-plan-day';
import { geocodeAddress } from '@/lib/geocode';
import { isRouteStopId, normalizeManualKind, rememberPlace, routeStopUuid } from '@/lib/route-stops';
import { savePreferredLast } from '@/lib/day-plan-prefs';
import { listCrew, listJobIdsForCrew } from '@/lib/crew';
import { loadBusinessName } from '@/lib/business-name';
import { buildCrewMorningBriefingSms, type CrewBriefingStop, type NavProvider } from '@/lib/crew-briefing';

// The plan page is force-dynamic, but Next still serves a route's last RSC
// payload from the client router cache on navigation — so a server action that
// redirects back here shows the day as it was before the action ran. Every
// action that changes what this page displays has to clear its own path.
function revalidatePlan(): void {
  revalidatePath('/dashboard/schedule/plan');
  revalidatePath('/dashboard/schedule');
}

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
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) redirect('/dashboard/schedule');

  // "<stopId>:<HH:MM>" per stop, in the planned visit order. Route stops carry a
  // "rs:" prefix so the two tables can be told apart without trusting the browser
  // to say which one a row belongs to.
  const entries = formData.getAll('stop').map((value) => String(value));
  const jobEntries = entries.filter((entry) => !isRouteStopId(entry));
  const stopEntries = entries.filter((entry) => isRouteStopId(entry));

  // Same span settings as the page that built this form, or a job the page put
  // on the route as day 3 of 5 would not be found here and its new time would
  // be silently dropped.
  const settings = await getPlanAccountSettings(supabase, accountId);
  const { jobs } = await listDayJobs(supabase, accountId, dateKey, crewId, {
    workDayHours: settings.scheduleDayHours,
    workingWeekdays: settings.workingWeekdays,
  });
  const { changes, keptConfirmed } = buildScheduleChangeset(jobs, jobEntries);

  // Supply stops are written first and separately. They're not appointments, so
  // there's nobody to disappoint if one lands and the batch then fails — and
  // keeping them out of the job rollback keeps that guarantee simple to reason
  // about. An id that isn't on this day for this account updates nothing.
  let stopsUpdated = 0;
  for (const entry of stopEntries) {
    const separator = entry.lastIndexOf(':');
    const id = routeStopUuid(entry.slice(0, separator));
    const time = entry.slice(separator + 1);
    if (!id || parseTimeMinutes(time) == null) continue;
    const { error } = await supabase
      .from('route_stops')
      .update({ scheduled_time: time, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', accountId)
      .eq('scheduled_for', dateKey);
    if (!error) stopsUpdated += 1;
  }

  const kept: Record<string, string> = keptConfirmed ? { kept: String(keptConfirmed) } : {};
  if (changes.length === 0) {
    revalidatePlan();
    redirect(planUrl(dateKey, crewId, { applied: stopsUpdated > 0 ? String(stopsUpdated) : '0', ...kept }));
  }

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
    revalidatePlan();
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

  revalidatePlan();
  revalidatePath('/dashboard/jobs');
  for (const change of changes) revalidatePath(`/dashboard/jobs/${change.jobId}`);

  redirect(
    planUrl(dateKey, crewId, {
      applied: String(changes.length + stopsUpdated),
      moved: changes.map((change) => change.jobId).join(','),
      ...kept,
    }),
  );
}

// Adds a stop to the day that isn't a job — a dump run, a supply pickup, fuel.
//
// The address is geocoded here rather than trusted from the browser, because an
// un-mappable stop can't be routed and would silently drop out of the day it was
// just added to. If it doesn't resolve we still save it, and the page lists it
// under "can't be routed yet" with the same nudge a job with a bad address gets.
export async function addRouteStopAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) redirect('/dashboard/schedule');

  const label = String(formData.get('label') ?? '').trim().slice(0, 120);
  const address = String(formData.get('address') ?? '').trim().slice(0, 300) || null;
  const kind = normalizeManualKind(formData.get('kind'));
  const minutesRaw = Number(formData.get('minutes'));
  const minutes = Number.isFinite(minutesRaw) ? Math.max(0, Math.min(480, Math.round(minutesRaw))) : 20;
  const scheduledTime = String(formData.get('scheduledTime') ?? '').trim() || null;
  // A saved place carries coordinates already, so re-geocoding it would bill a
  // lookup to learn what we were told last time.
  const savedLat = Number(formData.get('lat'));
  const savedLng = Number(formData.get('lng'));
  const hasSavedCoords = Number.isFinite(savedLat) && Number.isFinite(savedLng) && savedLat !== 0;

  if (!label) redirect(planUrl(dateKey, crewId, { stopError: 'label' }));

  let lat: number | null = hasSavedCoords ? savedLat : null;
  let lng: number | null = hasSavedCoords ? savedLng : null;
  if (!hasSavedCoords && address) {
    const geo = await geocodeAddress(address);
    if (geo?.precise) {
      lat = geo.lat;
      lng = geo.lng;
    }
  }

  const { error } = await supabase.from('route_stops').insert({
    account_id: accountId,
    crew_id: crewId,
    scheduled_for: dateKey,
    scheduled_time: scheduledTime,
    label,
    address,
    lat,
    lng,
    minutes,
    kind,
  });
  if (error) redirect(planUrl(dateKey, crewId, { stopError: 'save' }));

  // Remembered for next time only when it's a real place — a stop with no address
  // can't be re-used, and a place book full of address-less entries is noise.
  if (address) {
    await rememberPlace(supabase, accountId, { label, address, lat, lng, kind, minutes });
  }

  // No redirect. The form that submitted this is already on the plan page, and a
  // server action's revalidatePath re-renders the page it was called from — while
  // redirecting to the same route hands Next's client router cache a chance to
  // serve the day exactly as it was before the stop existed.
  revalidatePlan();
}

export async function deleteRouteStopAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const stopId = String(formData.get('stopId') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !stopId) redirect('/dashboard/schedule');

  // account_id in the filter, not just the id: RLS already scopes this, and the
  // belt-and-braces means a guessed uuid can't delete another tenant's stop even
  // if a policy is ever loosened.
  await supabase.from('route_stops').delete().eq('id', stopId).eq('account_id', accountId);

  revalidatePlan();
}

// Texts the customers whose arrival time just changed. Opt-in, one tap, after the
// fact — and it reads the times back out of the database so the message can never
// disagree with the calendar.
export async function notifyMovedClientsAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  const jobIds = String(formData.get('jobIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || jobIds.length === 0) redirect('/dashboard/schedule');

  // Settings first, because the day's job list depends on them: a multi-day job
  // is on this day's route by the same span rule the page used.
  const settings = await getPlanAccountSettings(supabase, accountId);
  const [{ jobs }, { data: account }] = await Promise.all([
    listDayJobs(supabase, accountId, dateKey, crewId, {
      workDayHours: settings.scheduleDayHours,
      workingWeekdays: settings.workingWeekdays,
    }),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
  ]);
  const businessName = (account?.business_name as string) || "Let's Get Quoted contractor";
  const dayStart = parseTimeMinutes(settings.workdayStart);
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
    const window = arrivalWindow(minutes, { earliestMinutes: dayStart });
    await sendArrivalTimeChangedSms({
      phone,
      businessName,
      clientName: job.client_name,
      windowLabel: window.label,
      accountId,
      idempotencyKey: `arrival-window:${job.id}:${job.scheduled_for}:${job.scheduled_time ?? 'none'}`,
    });
    await createJobFeedEvent(supabase, accountId, job.id, {
      kind: 'job_update',
      title: 'Customer texted their new arrival window',
      body: `Told them we'll arrive ${window.label} (estimated ${formatTimeLabel(minutes)}).`,
      visibility: 'client',
    });
    sent += 1;
  }

  revalidatePath('/dashboard/messages');
  redirect(planUrl(dateKey, crewId, { texted: String(sent), ...(skipped ? { untexted: String(skipped) } : {}) }));
}

// Puts the day's un-mappable jobs on the map now, rather than waiting for the
// nightly sweep. Geocoding moved out of page render because it billed a lookup on
// every load; this keeps it available on demand, where the contractor asked for it
// and can see the result.
export async function geocodeDayAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) redirect('/dashboard/schedule');

  const fixed = await backfillJobCoordinates(supabase, accountId, 25);

  revalidatePlan();
  redirect(planUrl(dateKey, crewId, { geocoded: String(fixed) }));
}

/**
 * Remember (or forget) the stop this day should end on.
 *
 * Called straight from the row menu rather than through a form: it changes one
 * remembered fact and nothing about the calendar, so there is nothing to submit
 * and nothing to navigate to. The running order is deliberately NOT saved here
 * — that still only reaches the calendar when Save schedule is pressed.
 */
export async function setPreferredLastAction(dateKey: string, crewId: string | null, stopId: string | null) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('That day isn\u2019t a real date.');

  await savePreferredLast(supabase, accountId, dateKey, crewId || null, stopId || null);
  revalidatePlan();
}

export async function updateCrewPhoneQuickAction(crewId: string, phone: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const normalized = normalizeUsPhone(phone);
  if (!normalized) {
    return { ok: false, error: 'Please enter a valid 10-digit US phone number.' };
  }
  const { error } = await supabase
    .from('crew')
    .update({ phone: normalized })
    .eq('id', crewId)
    .eq('account_id', accountId);

  if (error) {
    return { ok: false, error: error.message || 'Failed to update phone number.' };
  }
  revalidatePlan();
  return { ok: true, phone: normalized };
}

export async function sendCrewMorningBriefingAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const dateKey = String(formData.get('dateKey') ?? '').trim();
  const crewId = String(formData.get('crewId') ?? '').trim() || null;
  const customNote = String(formData.get('customNote') ?? '').trim() || null;
  const weatherSummary = String(formData.get('weatherSummary') ?? '').trim() || null;
  const navProvider = (String(formData.get('navProvider') ?? 'google') as NavProvider) || 'google';
  const includeFullRoute = formData.get('includeFullRoute') !== '0';
  const isUrgentUpdate = formData.get('isUrgentUpdate') === '1';
  const includeMaterialsChecklist = formData.get('includeMaterialsChecklist') === '1';
  const scheduledTiming = (String(formData.get('scheduledTiming') ?? 'now') as 'now' | 'scheduled_7am') || 'now';
  const selectedMemberIds = formData.getAll('memberId').map(String).filter(Boolean);
  const includePortal = formData.get('includePortal') !== '0';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) redirect('/dashboard/schedule');

  const settings = await getPlanAccountSettings(supabase, accountId);
  const businessName = await loadBusinessName(supabase, accountId);
  const { jobs } = await listDayJobs(supabase, accountId, dateKey, crewId, {
    workDayHours: settings.scheduleDayHours,
    workingWeekdays: settings.workingWeekdays,
  });

  const crew = await listCrew(supabase, accountId, { activeOnly: true });
  let targets = crew;
  if (selectedMemberIds.length > 0) {
    targets = crew.filter((c) => selectedMemberIds.includes(c.id));
  } else if (crewId) {
    targets = crew.filter((c) => c.id === crewId);
  }

  let briefedCount = 0;
  let skippedNoPhone = 0;
  let skippedNoJobs = 0;
  const failedList: string[] = [];

  for (const member of targets) {
    if (!member.phone) {
      skippedNoPhone += 1;
      continue;
    }
    const phone = normalizeUsPhone(member.phone);
    if (!phone) {
      skippedNoPhone += 1;
      continue;
    }

    // Filter jobs assigned to this crew member
    let memberJobs = jobs;
    if (crew.length > 1) {
      const assignedIds: string[] = await listJobIdsForCrew(supabase, accountId, member.id).catch(() => [] as string[]);
      if (assignedIds.length > 0) {
        memberJobs = jobs.filter((j) => assignedIds.includes(j.id));
      }
    }
    if (memberJobs.length === 0) {
      skippedNoJobs += 1;
      continue;
    }

    const stops: CrewBriefingStop[] = memberJobs.map((j) => ({
      jobRef: `JOB-${j.id.slice(0, 6).toUpperCase()}`,
      clientName: j.client_name,
      address: j.address || '',
      phone: j.client_phone,
      scheduledTime: j.scheduled_time,
      scope: j.scope,
      lat: j.lat,
      lng: j.lng,
    }));

    const text = buildCrewMorningBriefingSms({
      crewName: member.name,
      businessName,
      date: dateKey,
      stops,
      portalUrl: includePortal ? 'https://letsgetquoted.com/field' : null,
      customNote,
      weatherSummary,
      navProvider,
      includeFullRoute,
      isUrgentUpdate,
      includeMaterialsChecklist,
      scheduledTiming,
    });

    try {
      const { enqueueSmsDelivery } = await import('@/lib/sms-delivery');
      await enqueueSmsDelivery({
        accountId,
        phoneNumber: phone,
        body: text,
        messageKind: 'crew-briefing',
        context: 'crew',
        eventType: 'crew_briefing',
        crewId: member.id,
        senderPurpose: 'lgq_dispatch',
        billingCategory: 'crew_message',
        idempotencyKey: `crew-briefing:${member.id}:${dateKey}:${Date.now()}`,
      });
      briefedCount += 1;
    } catch (deliveryErr) {
      console.error(`[actions.ts] Failed to enqueue SMS delivery for crew member ${member.name} (${member.id}):`, deliveryErr);
      failedList.push(member.name);
    }
  }

  revalidatePlan();
  const queryParams: Record<string, string> = {};
  if (briefedCount > 0) queryParams.briefed = String(briefedCount);
  if (failedList.length > 0) queryParams.failedDispatch = failedList.join(',');
  if (isUrgentUpdate) queryParams.urgent = '1';
  if (scheduledTiming === 'scheduled_7am') queryParams.scheduled = '1';
  if (skippedNoPhone > 0) queryParams.skippedNoPhone = String(skippedNoPhone);
  if (skippedNoJobs > 0) queryParams.skippedNoJobs = String(skippedNoJobs);

  redirect(planUrl(dateKey, crewId, queryParams));
}
