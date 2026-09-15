'use server';

import { revalidatePath } from 'next/cache';
import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { sendQuickStopStatusSms } from '@/lib/sms';
import { quickStopStatusText } from '@/lib/sms-templates';
import { resolveQuickStopCancellation } from '@/lib/quick-stop-refunds';
import {
  QUICK_STOP_SETTINGS_COLUMNS,
  quickStopSettingsFromAccount,
  clampFeeCents,
  dollarsToCents,
} from '@/lib/quick-stop';
import { getQuickStopRequest, logQuickStopEvent } from '@/lib/quick-stop-requests';
import { geocodeArea } from '@/lib/geocode';
import { computeQuickStopRoute } from '@/lib/quick-stop-route';
import { sendQuickStopOffer } from '@/lib/quick-stop-payments';
import { validateQuickStopOfferWindow } from '@/lib/quick-stop-offers';
import { transitionQuickStopRequest } from '@/lib/quick-stop-transition';

const OFFERABLE = ['awaiting_contractor', 'more_information_requested'];

// Contractor declines a request outright. Terminal.
export async function declineQuickStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOfficeContext('schedule.write');
  const request = await getQuickStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  if (!OFFERABLE.includes(request.status)) throw new Error('This request can no longer be declined.');
  const reason = (formData.get('reason') ?? '').toString().trim() || null;

  const claimed = await transitionQuickStopRequest(supabase, {
    accountId, requestId, from: request.status, to: 'contractor_declined',
    patch: { cancel_reason: reason, updated_at: new Date().toISOString() },
  });
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

  let claimed: boolean;
  const patch = { contractor_note: note, updated_at: new Date().toISOString() };
  if (request.status === 'more_information_requested') {
    const { data, error } = await supabase.from('extra_stop_requests').update(patch)
      .eq('account_id', accountId).eq('id', requestId).eq('status', request.status).select('id').maybeSingle();
    if (error) throw new Error(error.message);
    claimed = Boolean(data);
  } else {
    claimed = await transitionQuickStopRequest(supabase, {
      accountId, requestId, from: request.status, to: 'more_information_requested', patch,
    });
  }
  if (!claimed) throw new Error('This request is no longer open.');

  await logQuickStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: request.status, to: 'more_information_requested', meta: { note } });
  revalidatePath('/dashboard/quick-stops');
}

// Publish the date, calendar hold, payment and expiration in one transaction.
// A failure cannot leave a staged request or an unlinked payable payment.
export async function createQuickStopOfferAction(requestId: string, formData: FormData) {
  // The service-role transaction replaces session writes to jobs/payments, so
  // explicitly preserve both capabilities those tables previously enforced.
  const { supabase, accountId } = await requireOfficeContext('schedule.write', 'jobs.write', 'payments.collect');
  const request = await getQuickStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  if (!OFFERABLE.includes(request.status)) throw new Error('This request can no longer be offered.');

  const { data: accountRow, error: accountError } = await supabase
    .from('accounts')
    .select(`${QUICK_STOP_SETTINGS_COLUMNS}, timezone, instant_book_drive_time, connect_onboarded, stripe_connect_id`)
    .eq('id', accountId)
    .single();
  if (accountError || !accountRow) throw new Error('Could not load your Quick Stop settings.');
  const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';

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

  validateQuickStopOfferWindow(arrivalDate, arrivalStart, arrivalEnd, timezone, settings);
  if (feeCents <= 0) throw new Error('Enter a Quick Stop fee.');

  // Complete route work before reserving capacity or creating money records.
  const target = request.lat != null && request.lng != null ? { lat: request.lat, lng: request.lng } : null;
  const route = await computeQuickStopRoute(supabase, accountId, target, {
    arrivalDate,
    visitMinutes,
    driveTime: Boolean((accountRow as { instant_book_drive_time?: boolean } | null)?.instant_book_drive_time),
    timezone,
  });

  const { data: published, error } = await createAdminClient().rpc('create_quick_stop_offer', {
    p_account_id: accountId,
    p_request_id: requestId,
    p_offer: {
      arrival_date: arrivalDate,
      arrival_start: arrivalStart,
      arrival_end: arrivalEnd,
      fee_cents: feeCents,
      diagnostic_fee_cents: diagnosticFeeCents,
      visit_minutes: visitMinutes,
      contractor_note: note,
      detour_miles: route.detourMiles,
      detour_minutes: route.detourMinutes,
      route_extension_minutes: route.routeExtensionMinutes,
    },
  });
  if (error || !published) throw new Error(error?.message || 'Could not create the Quick Stop offer.');

  // Notification is idempotent and best-effort; the complete offer is durable.
  await sendQuickStopOffer(supabase, accountId, requestId);

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
  const claimed = await transitionQuickStopRequest(supabase, {
    accountId, requestId, from: req.status, to: 'en_route',
    patch: { en_route_at: nowIso, updated_at: nowIso },
  });
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
  const claimed = await transitionQuickStopRequest(supabase, {
    accountId, requestId, from: req.status, to: 'arrived',
    patch: {
      arrived_at: nowIso,
      arrival_lat: Number.isFinite(lat) ? lat : null,
      arrival_lng: Number.isFinite(lng) ? lng : null,
      updated_at: nowIso,
    },
  });
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
  if (!['arrived', 'en_route', 'confirmed'].includes(req.status)) throw new Error('This Quick Stop can’t be completed.');
  const nowIso = new Date().toISOString();
  const claimed = await transitionQuickStopRequest(supabase, {
    accountId, requestId, from: req.status, to: 'completed',
    patch: { completed_at: nowIso, updated_at: nowIso },
    expected: { no_show_reported_at: null },
  });
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

  const { data: accountRow, error: accountError } = await supabase.from('accounts').select(`${QUICK_STOP_SETTINGS_COLUMNS}, timezone`).eq('id', accountId).single();
  if (accountError || !accountRow) throw new Error('Could not load your Quick Stop settings.');
  const settings = quickStopSettingsFromAccount(accountRow as Parameters<typeof quickStopSettingsFromAccount>[0]);
  const timezone = (accountRow as { timezone?: string | null }).timezone || 'America/New_York';

  const d = (formData.get('proposedDate') ?? '').toString().trim();
  const st = (formData.get('proposedStart') ?? '').toString().trim();
  const en = (formData.get('proposedEnd') ?? '').toString().trim();
  validateQuickStopOfferWindow(d, st, en, timezone, settings);

  const nowIso = new Date().toISOString();
  const { data: proposed, error: proposalError } = await supabase
    .from('extra_stop_requests')
    .update({ proposed_arrival_date: d, proposed_arrival_start: st, proposed_arrival_end: en, proposed_window_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .eq('status', req.status)
    .select('id')
    .maybeSingle();
  if (proposalError || !proposed) throw new Error(proposalError?.message || 'This Quick Stop was just updated. Reload before proposing a window.');
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
