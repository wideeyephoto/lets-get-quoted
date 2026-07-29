import type { SupabaseClient } from '@supabase/supabase-js';
import { findOrCreateClientId } from '@/lib/clients';
import { normalizeUsPhone } from '@/lib/phone';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';
import { EXTRA_STOP_ACTIVE_STATUSES, type ExtraStopStatus } from '@/lib/extra-stop';
import type { ExtraStopQualification } from '@/lib/extra-stop-qualify';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010').replace(/\/$/, '');

// One row of the extra_stop_requests table, as the dashboard reads it. Kept
// loose (unknown-friendly) — callers pick the fields they need.
export type ExtraStopRequest = {
  id: string;
  account_id: string;
  client_id: string | null;
  job_id: string | null;
  status: ExtraStopStatus;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  intake: Record<string, unknown>;
  photo_paths: string[];
  ai_summary: string | null;
  ai_visit_minutes: number | null;
  ai_complexity: string | null;
  ai_eligible: boolean | null;
  ai_confidence: number | null;
  ai_exclusions: string[];
  availability: unknown[];
  detour_miles: number | null;
  detour_minutes: number | null;
  route_extension_minutes: number | null;
  arrival_date: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  fee_cents: number | null;
  diagnostic_fee_cents: number | null;
  offer_visit_minutes: number | null;
  contractor_note: string | null;
  payment_id: string | null;
  refund_cents: number;
  response_deadline_at: string | null;
  offer_sent_at: string | null;
  payment_deadline_at: string | null;
  hold_expires_at: string | null;
  paid_at: string | null;
  en_route_at: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  no_show_reported_at: string | null;
  no_show_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtraStopRequestInput = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  issue: string;
  startedWhen: string | null;
  worsening: string | null;
  propertyType: string | null;
  availability: string | null;
  photoPaths: string[];
};

// Append-only audit entry. Best-effort — never let logging break a transition.
export async function logExtraStopEvent(
  admin: SupabaseClient,
  accountId: string,
  requestId: string,
  entry: { actor: string; from?: ExtraStopStatus | null; to?: ExtraStopStatus | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await admin.from('extra_stop_events').insert({
      account_id: accountId,
      request_id: requestId,
      actor: entry.actor,
      from_status: entry.from ?? null,
      to_status: entry.to ?? null,
      meta: entry.meta ?? {},
    });
  } catch (error) {
    console.error('extra_stop_events insert failed:', error instanceof Error ? error.message : error);
  }
}

// Duplicate guard: has this contact already got a live (not-yet-terminal)
// Extra Stop request open with this contractor? Prevents double-submits and a
// customer stacking requests.
export async function hasActiveExtraStopRequest(
  admin: SupabaseClient,
  accountId: string,
  phone: string | null,
  email: string | null,
): Promise<boolean> {
  const normPhone = phone ? normalizeUsPhone(phone) : null;
  const normEmail = email ? email.trim().toLowerCase() : null;
  if (!normPhone && !normEmail) return false;

  // Separate equality queries (not a string-built .or()) so a customer-supplied
  // email can never distort the filter.
  const base = () =>
    admin.from('extra_stop_requests').select('id').eq('account_id', accountId).in('status', EXTRA_STOP_ACTIVE_STATUSES).limit(1);

  if (normPhone) {
    const { data } = await base().eq('client_phone', normPhone);
    if (data && data.length > 0) return true;
  }
  if (normEmail) {
    const { data } = await base().eq('client_email', normEmail);
    if (data && data.length > 0) return true;
  }
  return false;
}

// Create the request row (status awaiting_contractor), link a client profile,
// stamp the contractor response deadline, log the opening event, and alert the
// owner — Extra Stop is time-sensitive, so the notification matters. The AI
// qualification is captured as a snapshot for the contractor's card. Geocoding
// is done by the caller (server action) so this stays storage-only.
export async function createExtraStopRequest(
  admin: SupabaseClient,
  accountId: string,
  input: ExtraStopRequestInput,
  qualification: ExtraStopQualification,
  opts: { responseDeadlineMins: number; lat: number | null; lng: number | null; businessName: string },
): Promise<ExtraStopRequest> {
  const phone = input.phone ? normalizeUsPhone(input.phone) : null;
  const email = input.email ? input.email.trim().toLowerCase() : null;
  const clientId = await findOrCreateClientId(admin, accountId, { name: input.name, phone, email, address: input.address });

  const responseDeadlineAt = new Date(Date.now() + opts.responseDeadlineMins * 60_000).toISOString();

  const { data, error } = await admin
    .from('extra_stop_requests')
    .insert({
      account_id: accountId,
      client_id: clientId,
      status: 'awaiting_contractor',
      client_name: input.name,
      client_phone: phone,
      client_email: email,
      address: input.address,
      lat: opts.lat,
      lng: opts.lng,
      intake: {
        issue: input.issue,
        startedWhen: input.startedWhen,
        worsening: input.worsening,
        propertyType: input.propertyType,
      },
      photo_paths: input.photoPaths,
      ai_summary: qualification.summary,
      ai_visit_minutes: qualification.visitMinutes,
      ai_complexity: qualification.complexity,
      ai_eligible: qualification.eligible,
      ai_confidence: qualification.confidence,
      ai_exclusions: qualification.exclusions,
      availability: input.availability ? [input.availability] : [],
      response_deadline_at: responseDeadlineAt,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Could not create the Extra Stop request.');

  const request = data as ExtraStopRequest;
  await logExtraStopEvent(admin, accountId, request.id, { actor: 'customer', to: 'awaiting_contractor', meta: { source: '/book' } });

  // Alert the owner. Best-effort — a notification failure never fails the request.
  try {
    const ownerEmail = await getAccountOwnerEmail(admin, accountId);
    if (ownerEmail) {
      await sendContractorAlertEmail({
        recipientEmail: ownerEmail,
        businessName: opts.businessName,
        subject: `⚡ New Extra Stop request — respond within ${opts.responseDeadlineMins} min`,
        heading: 'A customer wants an Extra Stop',
        bodyLines: [
          qualification.summary || input.issue,
          input.address ? `Location: ${input.address}` : 'No address given.',
          qualification.visitMinutes ? `Estimated visit: ~${qualification.visitMinutes} min.` : 'Visit duration not estimated.',
          `Review the job, propose an arrival window, and set your fee before the ${opts.responseDeadlineMins}-minute window closes.`,
        ],
        ctaLabel: 'Review the request',
        ctaUrl: `${APP_ORIGIN}/dashboard/extra-stops`,
        tone: 'info',
      });
    }
  } catch (error) {
    console.error('Extra Stop owner alert failed:', error instanceof Error ? error.message : error);
  }

  return request;
}

// Owner-side reads (dashboard). Newest first; optionally filter by status set.
export async function listExtraStopRequests(
  supabase: SupabaseClient,
  accountId: string,
  opts?: { statuses?: ExtraStopStatus[]; limit?: number },
): Promise<ExtraStopRequest[]> {
  let query = supabase
    .from('extra_stop_requests')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });
  if (opts?.statuses?.length) query = query.in('status', opts.statuses);
  if (opts?.limit) query = query.limit(opts.limit);
  const { data } = await query;
  return (data ?? []) as ExtraStopRequest[];
}

export async function getExtraStopRequest(
  supabase: SupabaseClient,
  accountId: string,
  requestId: string,
): Promise<ExtraStopRequest | null> {
  const { data } = await supabase
    .from('extra_stop_requests')
    .select('*')
    .eq('account_id', accountId)
    .eq('id', requestId)
    .maybeSingle();
  return (data as ExtraStopRequest) ?? null;
}

// Public loader by id alone (the request id is an unguessable uuid, used as the
// customer's capability token on the /extra-stop status page). Admin client.
export async function getExtraStopRequestById(admin: SupabaseClient, requestId: string): Promise<ExtraStopRequest | null> {
  const { data } = await admin.from('extra_stop_requests').select('*').eq('id', requestId).maybeSingle();
  return (data as ExtraStopRequest) ?? null;
}
