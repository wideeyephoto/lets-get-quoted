'use server';

import { revalidatePath } from 'next/cache';
import { requireOwnerContext } from '@/lib/auth';
import { createJob } from '@/lib/jobs';
import {
  EXTRA_STOP_SETTINGS_COLUMNS,
  extraStopSettingsFromAccount,
  clampFeeCents,
  dollarsToCents,
} from '@/lib/extra-stop';
import { getExtraStopRequest, logExtraStopEvent } from '@/lib/extra-stop-requests';
import { computeExtraStopRoute } from '@/lib/extra-stop-route';

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
    .select(`${EXTRA_STOP_SETTINGS_COLUMNS}, timezone, instant_book_drive_time`)
    .eq('id', accountId)
    .single();
  const settings = extraStopSettingsFromAccount(accountRow as Parameters<typeof extraStopSettingsFromAccount>[0]);
  const timezone = (accountRow as { timezone?: string } | null)?.timezone || 'America/New_York';

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

  revalidatePath('/dashboard/extra-stops');
  revalidatePath('/dashboard/schedule');
}
