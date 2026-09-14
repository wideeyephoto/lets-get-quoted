'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { createJob } from '@/lib/jobs';
import { sendQuickStopStatusSms } from '@/lib/sms';
import { quickStopStatusText } from '@/lib/sms-templates';
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';
import {
  QUICK_STOP_SETTINGS_COLUMNS,
  quickStopSettingsFromAccount,
  clampFeeCents,
  dollarsToCents,
  isAllowedQuickStopDay,
  zonedNowParts,
  DEFAULT_QUICK_STOP_TIME_ZONE,
  QUICK_STOP_OFFERABLE_STATUSES,
  QUICK_STOP_DAY_OCCUPYING_STATUSES,
} from '@/lib/quick-stop';
import { getQuickStopRequest, logQuickStopEvent } from '@/lib/quick-stop-requests';
import { geocodeArea } from '@/lib/geocode';
import { computeQuickStopRoute } from '@/lib/quick-stop-route';
import { quickStopWindowPhrase } from '@/lib/quick-stop-window';
import { sendQuickStopOffer } from '@/lib/quick-stop-payments';

// Both lists now live in lib/quick-stop, beside QUICK_STOP_TRANSITIONS, so the
// table and the guards that implement it are pinned together by a test instead of
// being two copies of one decision that drifted for a year. Aliased locally to
// keep the call sites below reading the way they did.
const OFFERABLE: readonly string[] = QUICK_STOP_OFFERABLE_STATUSES;
const DAY_OCCUPYING: readonly string[] = QUICK_STOP_DAY_OCCUPYING_STATUSES;

// Contractor declines a request outright. Terminal.
export async function declineQuickStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const request = await getQuickStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  const reason = (formData.get('reason') ?? '').toString().trim() || null;

  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({ status: 'contractor_declined', cancel_reason: reason, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', OFFERABLE)
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('This request can no longer be declined.');

  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: request.status, to: 'contractor_declined', meta: { reason } });
  revalidatePath('/dashboard/quick-stops');
}

// Contractor asks the customer for more information before deciding.
export async function requestMoreInfoQuickStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const request = await getQuickStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  const note = (formData.get('note') ?? '').toString().trim() || null;

  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({ status: 'more_information_requested', contractor_note: note, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', OFFERABLE)
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('This request is no longer open.');

  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: request.status, to: 'more_information_requested', meta: { note } });
  revalidatePath('/dashboard/quick-stops');
}

// Contractor sends an offer: validates the window + fee against settings and the
// daily cap, claims the request in a single transaction, then creates a TENTATIVE job — that
// job is the calendar placeholder (it renders like any scheduled job, flagged as
// an unconfirmed Quick Stop) and is what the payment attaches to. Payment link +
// customer SMS + the transition to awaiting_customer_payment are added in M5.
export async function createQuickStopOfferAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const request = await getQuickStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  if (!OFFERABLE.includes(request.status)) throw new Error('This request can no longer be offered.');

  const { data: accountRow } = await supabase
    .from('accounts')
    .select(`${QUICK_STOP_SETTINGS_COLUMNS}, timezone, instant_book_drive_time, connect_onboarded, stripe_connect_id`)
    .eq('id', accountId)
    .single();
  const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || DEFAULT_QUICK_STOP_TIME_ZONE;

  // Fail early (before creating a placeholder job) if payouts aren't set up —
  // the customer wouldn't be able to pay, so the offer can't stand.
  const connect = accountRow as { connect_onboarded?: boolean; stripe_connect_id?: string | null } | null;
  if (!connect?.connect_onboarded || !connect?.stripe_connect_id) {
    throw new Error('Finish your Stripe payout setup (Settings → Payouts) before sending Quick Stop offers.');
  }

  const arrivalDate = (formData.get('arrivalDate') ?? '').toString().trim();
  const arrivalStart = (formData.get('arrivalStart') ?? '').toString().trim();
  const arrivalEnd = (formData.get('arrivalEnd') ?? '').toString().trim();
  const feeCents = clampFeeCents(dollarsToCents(formData.get('fee')), settings);
  const diagRaw = dollarsToCents(formData.get('diagnosticFee'));
  const diagnosticFeeCents = diagRaw > 0 ? diagRaw : null;
  const visitMinutesRaw = Number(formData.get('visitMinutes'));
  const visitMinutes = Number.isFinite(visitMinutesRaw) && visitMinutesRaw > 0 ? Math.round(visitMinutesRaw) : request.ai_visit_minutes ?? null;
  const note = (formData.get('note') ?? '').toString().trim() || null;

  // Window validations against the owner's Quick Stop settings.
  if (!arrivalDate || !arrivalStart || !arrivalEnd) throw new Error('Set an arrival date and a start/end window.');
  if (arrivalStart >= arrivalEnd) throw new Error('The window end must be after its start.');
  const dow = new Date(`${arrivalDate}T12:00:00`).getDay();
  if (settings.weekdays.length && !settings.weekdays.includes(dow)) throw new Error('That day isn’t in your Quick Stop schedule.');
  if (arrivalStart < settings.earliestTime) throw new Error(`Arrival can’t start before ${settings.earliestTime}.`);
  if (arrivalEnd > settings.latestEnd) throw new Error(`The window can’t end after ${settings.latestEnd}.`);
  if (feeCents <= 0) throw new Error('Enter a Quick Stop fee.');

  /* THE DAY WAS NEVER CHECKED — only the weekday and the times were.
     Nothing stopped an offer being dated in the past, and a past-dated offer is
     immediately auto-completable by the sweep and immediately trips the
     contractorMissedWindow tier, which is a 100% refund. Nothing checked
     `daysAhead` either, even though the customer-facing picker enforces it, so the
     contractor could commit to a day their own settings say they do not serve.
     Both are judged in the contractor's zone — a UTC host's idea of "today" is
     tomorrow for a good part of every evening. */
  const { dateKey: todayKey } = zonedNowParts(new Date(), timezone);
  if (arrivalDate < todayKey) throw new Error('That date has already passed.');
  if (!isAllowedQuickStopDay(arrivalDate, settings, { timeZone: timezone })) {
    // The window is READ OFF the setting via quickStopWindowPhrase rather than
    // asserted, for the reason lib/quick-stop-window exists: an account set to a
    // week out must not be told its own feature is same-day.
    const window = quickStopWindowPhrase(settings.daysAhead);
    throw new Error(
      arrivalDate === todayKey
        ? `Today’s last arrival time (${settings.latestEnd}) has passed, so today can no longer be offered.`
        : `You take Quick Stops ${window}, and that date is outside it.`,
    );
  }

  // Daily Quick Stop cap for that date (separate from normal booking capacity).
  // Cheap pre-check so the common rejection is instant and says something useful;
  // the binding check is the re-count after the claim below.
  const { data: sameDay } = await supabase
    .from('extra_stop_requests')
    .select('id')
    .eq('account_id', accountId)
    .eq('arrival_date', arrivalDate)
    .in('status', DAY_OCCUPYING);
  if ((sameDay?.length ?? 0) >= settings.maxPerDay) {
    throw new Error(`You’re at your Quick Stop limit (${settings.maxPerDay}) for that day.`);
  }

  /* THE CLAIM NOW TAKES THE DAY, NOT JUST THE REQUEST.
     The count above and the claim below were two separate round trips, and the
     claim only wrote `status` — `arrival_date` was stamped later, in the update
     after the job was created. So the row did not occupy the day until well after
     it had been counted, and two DIFFERENT requests offered for the same date at
     the same time both read a count under the cap and both went through. The old
     comment was accurate about what the compare-and-set protected (one request
     against a double submit) and silent about what it did not (the day against
     two requests). Writing arrival_date here makes the claim the reservation. */
  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({ status: 'contractor_offer_sent', arrival_date: arrivalDate, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', OFFERABLE)
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('This request was just updated — reload and try again.');

  /* Re-count now that we are visibly holding the day, and settle any tie the same
     way on both sides: oldest requests keep the slots. A plain "am I over?" test
     would make two racing offers BOTH stand down, losing a slot that was free —
     ordering by created_at means exactly one set of winners, whichever order the
     two transactions happened to interleave in. */
  const releaseDay = async () => {
    await supabase
      .from('extra_stop_requests')
      .update({ status: request.status, arrival_date: null, updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('id', requestId)
      .eq('status', 'contractor_offer_sent');
  };
  const { data: occupants } = await supabase
    .from('extra_stop_requests')
    .select('id, created_at')
    .eq('account_id', accountId)
    .eq('arrival_date', arrivalDate)
    .in('status', DAY_OCCUPYING)
    .order('created_at', { ascending: true });
  const keeping = (occupants ?? []).slice(0, settings.maxPerDay).map((row) => (row as { id: string }).id);
  if ((occupants?.length ?? 0) > settings.maxPerDay && !keeping.includes(requestId)) {
    await releaseDay();
    throw new Error(`You’re at your Quick Stop limit (${settings.maxPerDay}) for that day.`);
  }

  // Route cost vs the final scheduled stop that day (best-effort).
  const target = request.lat != null && request.lng != null ? { lat: request.lat, lng: request.lng } : null;
  const route = await computeQuickStopRoute(supabase, accountId, target, {
    arrivalDate,
    visitMinutes,
    driveTime: Boolean((accountRow as { instant_book_drive_time?: boolean } | null)?.instant_book_drive_time),
    timezone,
  });

  // The tentative placeholder job (calendar hold). Confirmed → made live in M5.
  const job = await createJob(supabase, accountId, {
    clientName: request.client_name,
    clientPhone: request.client_phone,
    clientEmail: request.client_email,
    address: request.address,
    scope: `Quick Stop — ${request.ai_summary || 'quick visit'}`,
    status: 'new_lead',
    scheduledFor: arrivalDate,
    scheduledTime: arrivalStart,
    quotedAmount: 0,
    estimatedHours: visitMinutes ? Math.max(0.25, Math.round((visitMinutes / 60) * 100) / 100) : undefined,
  });

  await supabase
    .from('extra_stop_requests')
    .update({
      job_id: job.id,
      arrival_date: arrivalDate,
      arrival_start: arrivalStart,
      arrival_end: arrivalEnd,
      fee_cents: feeCents,
      diagnostic_fee_cents: diagnosticFeeCents,
      offer_visit_minutes: visitMinutes,
      contractor_note: note,
      detour_miles: route.detourMiles,
      detour_minutes: route.detourMinutes,
      route_extension_minutes: route.routeExtensionMinutes,
      offer_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('id', requestId);

  await logQuickStopEvent(supabase, accountId, requestId, {
    actor: 'contractor',
    from: request.status,
    to: 'contractor_offer_sent',
    meta: { feeCents, arrivalDate, arrivalStart, arrivalEnd },
  });

  /* Create the payment request, start the 15-minute clock, and text the customer
     the pay link — moves the request to awaiting_customer_payment.

     IF THIS THROWS, PUT EVERYTHING BACK. Nothing swept `contractor_offer_sent`, so
     a Stripe error here used to leave the request stranded in a status no cleanup
     path looked at, with a live placeholder job on the calendar. And because that
     status counts in DAY_OCCUPYING, each stranded row silently ate one of the
     account's daily slots for good and blocked that customer's duplicate guard
     from ever clearing. The contractor got an error and no way to retry.

     The sweep now has a backstop for the case where the process dies before this
     catch can run (see step 4 of sweepQuickStopOffers), but the catch is what
     handles the ordinary failure, immediately and while we still know the job id. */
  try {
    await sendQuickStopOffer(supabase, accountId, requestId);
  } catch (error) {
    await supabase
      .from('extra_stop_requests')
      .update({ status: request.status, job_id: null, arrival_date: null, updated_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('id', requestId)
      .eq('status', 'contractor_offer_sent');
    await supabase.from('jobs').update({ status: 'archived' }).eq('id', job.id).eq('account_id', accountId);
    await logQuickStopEvent(supabase, accountId, requestId, {
      actor: 'system',
      from: 'contractor_offer_sent',
      to: request.status,
      meta: { reason: 'offer_handoff_failed', error: error instanceof Error ? error.message : String(error) },
    });
    revalidatePath('/dashboard/quick-stops');
    revalidatePath('/dashboard/schedule');
    throw new Error(
      `The offer couldn’t be sent, so nothing was charged and the request is back in your queue. ${
        error instanceof Error ? error.message : 'Please try again.'
      }`,
    );
  }

  revalidatePath('/dashboard/quick-stops');
  revalidatePath('/dashboard/schedule');
}

// ---------------------------------------------------------------------------
// Confirmed-appointment lifecycle (owner side).
// ---------------------------------------------------------------------------

// Contractor is heading over. Notifies the customer.
export async function markEnRouteQuickStopAction(requestId: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const req = await getQuickStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  const nowIso = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({ status: 'en_route', en_route_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .eq('status', 'confirmed')
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('You can only start “en route” from a confirmed Quick Stop.');
  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: 'confirmed', to: 'en_route' });
  if (req.client_phone) await sendQuickStopStatusSms({
    accountId,
    toPhone: req.client_phone,
    message: quickStopStatusText('en_route'),
    idempotencyKey: `quick-stop:${requestId}:en-route`,
  });
  revalidatePath('/dashboard/quick-stops');
}

// "I've Arrived" — records the timestamp and (when the browser grants it) the
// location. Notifies the customer. The window can't be silently extended: this
// is the honest arrival marker used by the no-show logic.
export async function markArrivedQuickStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const req = await getQuickStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  const nowIso = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({
      status: 'arrived',
      arrived_at: nowIso,
      arrival_lat: Number.isFinite(lat) ? lat : null,
      arrival_lng: Number.isFinite(lng) ? lng : null,
      updated_at: nowIso,
    })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', ['confirmed', 'en_route'])
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('This Quick Stop can’t be marked arrived.');
  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: req.status, to: 'arrived', meta: { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null } });
  if (req.client_phone) await sendQuickStopStatusSms({
    accountId,
    toPhone: req.client_phone,
    message: quickStopStatusText('arrived'),
    idempotencyKey: `quick-stop:${requestId}:arrived`,
  });
  revalidatePath('/dashboard/quick-stops');
}

// Visit done → completes the Quick Stop and its job.
export async function sendEtaSmsQuickStopAction(requestId: string, minutes: number = 15) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const req = await getQuickStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  if (!['confirmed', 'en_route'].includes(req.status)) {
    throw new Error('Can only send ETA updates for confirmed or en route Quick Stops.');
  }
  if (!req.client_phone) throw new Error('No phone number on file for this customer.');

  await sendQuickStopStatusSms({
    accountId,
    toPhone: req.client_phone,
    message: quickStopStatusText('eta', { minutes }),
    idempotencyKey: `quick-stop:${requestId}:eta-${Date.now().toString().slice(0, -4)}`,
  });

  await logQuickStopEvent(supabase, accountId, requestId, {
    actor: 'contractor',
    from: req.status,
    to: req.status,
    meta: { action: 'eta_sms_sent', etaMinutes: minutes },
  });

  revalidatePath('/dashboard/quick-stops');
}

export async function completeQuickStopAction(requestId: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const req = await getQuickStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  const nowIso = new Date().toISOString();
  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({ status: 'completed', completed_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', ['arrived', 'en_route', 'confirmed'])
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('This Quick Stop can’t be completed.');
  if (req.job_id) await supabase.from('jobs').update({ status: 'complete' }).eq('id', req.job_id).eq('account_id', accountId);
  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: req.status, to: 'completed' });
  revalidatePath('/dashboard/quick-stops');
  revalidatePath('/dashboard/schedule');
}

// Contractor cancels a confirmed Quick Stop → full refund to the customer.
export async function cancelQuickStopByContractorAction(requestId: string, formData: FormData) {
  const { accountId } = await requireOfficeContext('schedule.write');
  const reason = (formData.get('reason') ?? '').toString().trim() || null;
  await resolveQuickStopCancellation(createAdminClient(), accountId, requestId, { kind: 'contractor_cancel', reason });
  revalidatePath('/dashboard/quick-stops');
  revalidatePath('/dashboard/schedule');
}

// ---------------------------------------------------------------------------
// Phase 2: revised-window negotiation + diagnostic conversion (owner side).
// ---------------------------------------------------------------------------

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Contractor proposes a NEW arrival window on a confirmed Quick Stop. It only
// takes effect once the customer accepts (no silent extension). Validated the
// same way as the original offer window.
export async function proposeRevisedWindowQuickStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const req = await getQuickStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  if (!['confirmed', 'en_route'].includes(req.status)) throw new Error('You can only propose a new window on a confirmed Quick Stop.');

  const { data: accountRow } = await supabase.from('accounts').select(QUICK_STOP_SETTINGS_COLUMNS).eq('id', accountId).single();
  const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);

  const d = (formData.get('proposedDate') ?? '').toString().trim();
  const st = (formData.get('proposedStart') ?? '').toString().trim();
  const en = (formData.get('proposedEnd') ?? '').toString().trim();
  if (!d || !st || !en) throw new Error('Set a date and a start/end window.');
  if (st >= en) throw new Error('The window end must be after its start.');
  const dow = new Date(`${d}T12:00:00`).getDay();
  if (settings.weekdays.length && !settings.weekdays.includes(dow)) throw new Error('That day isn’t in your Quick Stop schedule.');
  if (st < settings.earliestTime) throw new Error(`Arrival can’t start before ${settings.earliestTime}.`);
  if (en > settings.latestEnd) throw new Error(`The window can’t end after ${settings.latestEnd}.`);

  const nowIso = new Date().toISOString();
  await supabase
    .from('extra_stop_requests')
    .update({ proposed_arrival_date: d, proposed_arrival_start: st, proposed_arrival_end: en, proposed_window_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', ['confirmed', 'en_route']);
  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', meta: { proposedWindow: { d, st, en } } });
  if (req.client_phone) {
    await sendQuickStopStatusSms({
      accountId,
      toPhone: req.client_phone,
      message: `Your contractor proposed a new arrival window: ${d}, ${st}–${en}. Accept or decline here: ${APP_ORIGIN}/quick-stop/${requestId}.`,
      idempotencyKey: `quick-stop:${requestId}:window:${d}:${st}:${en}`,
    });
  }
  revalidatePath('/dashboard/quick-stops');
}

// Contractor proposes converting the visit into a diagnostic appointment. The
// customer must approve applying the Quick Stop fee as a deposit + any extra
// charge before it takes effect (the contractor can't convert unilaterally).
export async function proposeDiagnosticConversionAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const req = await getQuickStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  if (!['confirmed', 'en_route', 'arrived'].includes(req.status)) throw new Error('You can only convert a live Quick Stop.');

  const totalCents = dollarsToCents(formData.get('diagnosticTotal'));
  const note = (formData.get('note') ?? '').toString().trim() || null;
  if (totalCents <= 0) throw new Error('Enter the diagnostic total.');

  const nowIso = new Date().toISOString();
  await supabase
    .from('extra_stop_requests')
    .update({ diagnostic_conversion: 'proposed', diagnostic_proposed_cents: totalCents, diagnostic_note: note, diagnostic_decided_at: null, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', ['confirmed', 'en_route', 'arrived']);
  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', meta: { diagnosticProposedCents: totalCents } });
  if (req.client_phone) {
    const totalLabel = `$${(totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    await sendQuickStopStatusSms({
      accountId,
      toPhone: req.client_phone,
      message: `Your contractor suggests a diagnostic visit (${totalLabel} total; your Quick Stop fee applies as a deposit). Review & approve here: ${APP_ORIGIN}/quick-stop/${requestId}.`,
      idempotencyKey: `quick-stop:${requestId}:diagnostic:${totalCents}`,
    });
  }
  revalidatePath('/dashboard/quick-stops');
}

/* --- Priority areas ----------------------------------------------------------
   Areas the owner has decided are worth a longer drive. Named by them, for their
   own reasons — see the migration for why this is never derived from income or
   demographic data.

   Added by TYPING a city or ZIP code. This replaced tapping a center on the map,
   which asked an owner to express "Birmingham" as a pin and a radius — two
   numbers nobody holds in their head about a place they already know by name.
   The circle is still what gets stored, because the whole downstream stack
   (zoneContains, the request card, the map) is built on one; it is now DERIVED
   from the place's own boundary instead of guessed at. */

function zoneNumber(form: FormData, field: string, max: number): number {
  const value = Number(form.get(field));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Enter a ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} greater than zero.`);
  if (value > max) throw new Error(`That ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is too large.`);
  return value;
}

export async function addQuickStopAreaAction(formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');

  const place = String(formData.get('place') ?? '').trim();
  if (!place) throw new Error('Type a city or ZIP code.');

  const maxDetourMiles = zoneNumber(formData, 'maxDetourMiles', 500);

  const found = await geocodeArea(place);
  if (!found.ok) {
    // Each reason gets its own sentence, because the fix is different for each
    // and "that didn't work" would send an owner to retype a ZIP that was right.
    if (found.reason === 'unconfigured') {
      throw new Error('Place lookup is not configured on this server yet, so areas cannot be added by name.');
    }
    if (found.reason === 'too-large') {
      throw new Error(`“${place}” covers too much ground for a priority area — try a city, town or ZIP code.`);
    }
    throw new Error(`Couldn’t find “${place}”. Try a US city, town or ZIP code.`);
  }

  // The owner's own name for it still wins when they gave one; otherwise the
  // resolved place name, which is what they typed said back properly.
  const label = (String(formData.get('label') ?? '').trim() || found.label).slice(0, 80);

  const { error } = await supabase.from('quick_stop_priority_zones').insert({
    account_id: accountId,
    label,
    center_lat: found.lat,
    center_lng: found.lng,
    radius_miles: found.radiusMiles,
    max_detour_miles: maxDetourMiles,
    active: true,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/quick-stops');
}

/** Change how far a saved area is worth driving, without re-finding the place. */
export async function updateQuickStopAreaDetourAction(id: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const maxDetourMiles = zoneNumber(formData, 'maxDetourMiles', 500);

  const { error } = await supabase
    .from('quick_stop_priority_zones')
    .update({ max_detour_miles: maxDetourMiles, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', id);
  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/quick-stops');
}

export async function deleteQuickStopZoneAction(id: string) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const { error } = await supabase
    .from('quick_stop_priority_zones')
    .delete()
    .eq('account_id', accountId)
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/dashboard/quick-stops');
}
