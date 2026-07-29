'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext, createAdminClient } from '@/lib/auth';
import { createJob } from '@/lib/jobs';
import { sendExtraStopStatusSms } from '@/lib/sms';
import { resolveExtraStopCancellation } from '@/lib/extra-stop-refunds';
import {
  EXTRA_STOP_SETTINGS_COLUMNS,
  extraStopSettingsFromAccount,
  clampFeeCents,
  dollarsToCents,
} from '@/lib/extra-stop';
import { getExtraStopRequest, logExtraStopEvent } from '@/lib/extra-stop-requests';
import { computeExtraStopRoute } from '@/lib/extra-stop-route';
import { sendExtraStopOffer } from '@/lib/extra-stop-payments';

const OFFERABLE = ['awaiting_contractor', 'more_information_requested'];
// Statuses that still occupy a slot on a given arrival day (for the daily cap).
const DAY_OCCUPYING = ['contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'];

// Contractor declines a request outright. Terminal.
export async function declineExtraStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const request = await getExtraStopRequest(supabase, accountId, requestId);
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

  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: request.status, to: 'contractor_declined', meta: { reason } });
  revalidatePath('/dashboard/extra-stops');
}

// Contractor asks the customer for more information before deciding.
export async function requestMoreInfoExtraStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const request = await getExtraStopRequest(supabase, accountId, requestId);
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

  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: request.status, to: 'more_information_requested', meta: { note } });
  revalidatePath('/dashboard/extra-stops');
}

// Contractor sends an offer: validates the window + fee against settings and the
// daily cap, atomically claims the request, then creates a TENTATIVE job — that
// job is the calendar placeholder (it renders like any scheduled job, flagged as
// an unconfirmed Extra Stop) and is what the payment attaches to. Payment link +
// customer SMS + the transition to awaiting_customer_payment are added in M5.
export async function createExtraStopOfferAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const request = await getExtraStopRequest(supabase, accountId, requestId);
  if (!request) throw new Error('Request not found.');
  if (!OFFERABLE.includes(request.status)) throw new Error('This request can no longer be offered.');

  const { data: accountRow } = await supabase
    .from('accounts')
    .select(`${EXTRA_STOP_SETTINGS_COLUMNS}, timezone, instant_book_drive_time, connect_onboarded, stripe_connect_id`)
    .eq('id', accountId)
    .single();
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';

  // Fail early (before creating a placeholder job) if payouts aren't set up —
  // the customer wouldn't be able to pay, so the offer can't stand.
  const connect = accountRow as { connect_onboarded?: boolean; stripe_connect_id?: string | null } | null;
  if (!connect?.connect_onboarded || !connect?.stripe_connect_id) {
    throw new Error('Finish your Stripe payout setup (Settings → Payouts) before sending Extra Stop offers.');
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

  // Window validations against the owner's Extra Stop settings.
  if (!arrivalDate || !arrivalStart || !arrivalEnd) throw new Error('Set an arrival date and a start/end window.');
  if (arrivalStart >= arrivalEnd) throw new Error('The window end must be after its start.');
  const dow = new Date(`${arrivalDate}T12:00:00`).getDay();
  if (settings.weekdays.length && !settings.weekdays.includes(dow)) throw new Error('That day isn’t in your Extra Stop schedule.');
  if (arrivalStart < settings.earliestTime) throw new Error(`Arrival can’t start before ${settings.earliestTime}.`);
  if (arrivalEnd > settings.latestEnd) throw new Error(`The window can’t end after ${settings.latestEnd}.`);
  if (feeCents <= 0) throw new Error('Enter an Extra Stop fee.');

  // Daily Extra Stop cap for that date (separate from normal booking capacity).
  const { data: sameDay } = await supabase
    .from('extra_stop_requests')
    .select('id')
    .eq('account_id', accountId)
    .eq('arrival_date', arrivalDate)
    .in('status', DAY_OCCUPYING);
  if ((sameDay?.length ?? 0) >= settings.maxPerDay) {
    throw new Error(`You’re at your Extra Stop limit (${settings.maxPerDay}) for that day.`);
  }

  // Atomically claim the request so a double-submit can't create two placeholders.
  const { data: claimed } = await supabase
    .from('extra_stop_requests')
    .update({ status: 'contractor_offer_sent', updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', OFFERABLE)
    .select('id')
    .maybeSingle();
  if (!claimed) throw new Error('This request was just updated — reload and try again.');

  // Route cost vs the final scheduled stop that day (best-effort).
  const target = request.lat != null && request.lng != null ? { lat: request.lat, lng: request.lng } : null;
  const route = await computeExtraStopRoute(supabase, accountId, target, {
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
    scope: `Extra Stop — ${request.ai_summary || 'quick visit'}`,
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

  await logExtraStopEvent(supabase, accountId, requestId, {
    actor: 'contractor',
    from: request.status,
    to: 'contractor_offer_sent',
    meta: { feeCents, arrivalDate, arrivalStart, arrivalEnd },
  });

  // Create the payment request, start the 15-minute clock, and text the customer
  // the pay link — moves the request to awaiting_customer_payment.
  await sendExtraStopOffer(supabase, accountId, requestId);

  revalidatePath('/dashboard/extra-stops');
  revalidatePath('/dashboard/schedule');
}

// ---------------------------------------------------------------------------
// Confirmed-appointment lifecycle (owner side).
// ---------------------------------------------------------------------------

// Contractor is heading over. Notifies the customer.
export async function markEnRouteExtraStopAction(requestId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const req = await getExtraStopRequest(supabase, accountId, requestId);
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
  if (!claimed) throw new Error('You can only start “en route” from a confirmed Extra Stop.');
  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: 'confirmed', to: 'en_route' });
  if (req.client_phone) await sendExtraStopStatusSms({ accountId, toPhone: req.client_phone, message: 'Your Extra Stop technician is on the way.' });
  revalidatePath('/dashboard/extra-stops');
}

// "I've Arrived" — records the timestamp and (when the browser grants it) the
// location. Notifies the customer. The window can't be silently extended: this
// is the honest arrival marker used by the no-show logic.
export async function markArrivedExtraStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const req = await getExtraStopRequest(supabase, accountId, requestId);
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
  if (!claimed) throw new Error('This Extra Stop can’t be marked arrived.');
  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: req.status, to: 'arrived', meta: { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null } });
  if (req.client_phone) await sendExtraStopStatusSms({ accountId, toPhone: req.client_phone, message: 'Your technician has arrived.' });
  revalidatePath('/dashboard/extra-stops');
}

// Visit done → completes the Extra Stop and its job.
export async function completeExtraStopAction(requestId: string) {
  const { supabase, accountId } = await requireOwnerContext();
  const req = await getExtraStopRequest(supabase, accountId, requestId);
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
  if (!claimed) throw new Error('This Extra Stop can’t be completed.');
  if (req.job_id) await supabase.from('jobs').update({ status: 'complete' }).eq('id', req.job_id).eq('account_id', accountId);
  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', from: req.status, to: 'completed' });
  revalidatePath('/dashboard/extra-stops');
  revalidatePath('/dashboard/schedule');
}

// Contractor cancels a confirmed Extra Stop → full refund to the customer.
export async function cancelExtraStopByContractorAction(requestId: string, formData: FormData) {
  const { accountId } = await requireOwnerContext();
  const reason = (formData.get('reason') ?? '').toString().trim() || null;
  await resolveExtraStopCancellation(createAdminClient(), accountId, requestId, { kind: 'contractor_cancel', reason });
  revalidatePath('/dashboard/extra-stops');
  revalidatePath('/dashboard/schedule');
}

// ---------------------------------------------------------------------------
// Phase 2: revised-window negotiation + diagnostic conversion (owner side).
// ---------------------------------------------------------------------------

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// Contractor proposes a NEW arrival window on a confirmed Extra Stop. It only
// takes effect once the customer accepts (no silent extension). Validated the
// same way as the original offer window.
export async function proposeRevisedWindowExtraStopAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const req = await getExtraStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  if (!['confirmed', 'en_route'].includes(req.status)) throw new Error('You can only propose a new window on a confirmed Extra Stop.');

  const { data: accountRow } = await supabase.from('accounts').select(EXTRA_STOP_SETTINGS_COLUMNS).eq('id', accountId).single();
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);

  const d = (formData.get('proposedDate') ?? '').toString().trim();
  const st = (formData.get('proposedStart') ?? '').toString().trim();
  const en = (formData.get('proposedEnd') ?? '').toString().trim();
  if (!d || !st || !en) throw new Error('Set a date and a start/end window.');
  if (st >= en) throw new Error('The window end must be after its start.');
  const dow = new Date(`${d}T12:00:00`).getDay();
  if (settings.weekdays.length && !settings.weekdays.includes(dow)) throw new Error('That day isn’t in your Extra Stop schedule.');
  if (st < settings.earliestTime) throw new Error(`Arrival can’t start before ${settings.earliestTime}.`);
  if (en > settings.latestEnd) throw new Error(`The window can’t end after ${settings.latestEnd}.`);

  const nowIso = new Date().toISOString();
  await supabase
    .from('extra_stop_requests')
    .update({ proposed_arrival_date: d, proposed_arrival_start: st, proposed_arrival_end: en, proposed_window_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('id', requestId)
    .in('status', ['confirmed', 'en_route']);
  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', meta: { proposedWindow: { d, st, en } } });
  if (req.client_phone) {
    await sendExtraStopStatusSms({ accountId, toPhone: req.client_phone, message: `Your contractor proposed a new arrival window: ${d}, ${st}–${en}. Accept or decline here: ${APP_ORIGIN}/extra-stop/${requestId}.` });
  }
  revalidatePath('/dashboard/extra-stops');
}

// Contractor proposes converting the visit into a diagnostic appointment. The
// customer must approve applying the Extra Stop fee as a deposit + any extra
// charge before it takes effect (the contractor can't convert unilaterally).
export async function proposeDiagnosticConversionAction(requestId: string, formData: FormData) {
  const { supabase, accountId } = await requireOwnerContext();
  const req = await getExtraStopRequest(supabase, accountId, requestId);
  if (!req) throw new Error('Request not found.');
  if (!['confirmed', 'en_route', 'arrived'].includes(req.status)) throw new Error('You can only convert a live Extra Stop.');

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
  await logExtraStopEvent(supabase, accountId, requestId, { actor: 'contractor', meta: { diagnosticProposedCents: totalCents } });
  if (req.client_phone) {
    const totalLabel = `$${(totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    await sendExtraStopStatusSms({ accountId, toPhone: req.client_phone, message: `Your contractor suggests a diagnostic visit (${totalLabel} total; your Extra Stop fee applies as a deposit). Review & approve here: ${APP_ORIGIN}/extra-stop/${requestId}.` });
  }
  revalidatePath('/dashboard/extra-stops');
}
