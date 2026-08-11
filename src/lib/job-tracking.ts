import { randomBytes, createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyPrecision, arrivalWindowTimes, isClosedStatus, locationExpiry, locationVisible,
  type ArrivalSettings, type ArrivalStatus, type ArrivalWindowTimes, type SmsStatus,
} from '@/lib/arrival';

// The storage side of arrival management. One row per TRIP — a tech heading to
// a house, once — carrying the promise made, who made it, whether it was
// delivered, and how it ended.
//
// The token is random and stored only as a sha-256 hash: the raw token lives
// solely in the URL, so a database read can't reconstruct live links to
// customers' homes.

export function newTrackingToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('hex');
  return { token, hash: hashTrackingToken(token) };
}

export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// The ETA suggestion lives in lib/arrival with the rest of the pure rules, so
// the field app's preview can compute it client-side from the same code.
export { estimateEtaMinutes } from '@/lib/arrival';

type LatLng = { lat: number; lng: number } | null;

export type TrackingRow = {
  id: string;
  account_id: string;
  job_id: string;
  crew_id: string | null;
  sent_by: string | null;
  status: ArrivalStatus;
  tech_lat: number | null;
  tech_lng: number | null;
  eta_minutes: number | null;
  arrival_start: string | null;
  arrival_end: string | null;
  share_location: boolean;
  location_expires_at: string | null;
  message_body: string | null;
  sms_status: SmsStatus | null;
  sms_sid: string | null;
  sms_error: string | null;
  homeowner_note: string | null;
  homeowner_note_at: string | null;
  revision_count: number;
  last_sent_at: string | null;
  en_route_at: string;
  arrived_at: string | null;
  expires_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number | null;
  late_notified_at: string | null;
  suggested_minutes: number | null;
};

const ROW_FIELDS =
  'id, account_id, job_id, crew_id, sent_by, status, tech_lat, tech_lng, eta_minutes, arrival_start, arrival_end, ' +
  'share_location, location_expires_at, message_body, sms_status, sms_sid, sms_error, homeowner_note, ' +
  'homeowner_note_at, revision_count, last_sent_at, en_route_at, arrived_at, expires_at, ' +
  'first_viewed_at, last_viewed_at, view_count, late_notified_at, suggested_minutes';

/**
 * The live trip on this job, if any.
 *
 * Defensive on purpose: before the arrival migration runs, selecting the new
 * columns errors, and the honest answer then is "no live trip" rather than a
 * 500 on the field app's job screen.
 */
export async function getActiveTracking(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<TrackingRow | null> {
  const { data, error } = await admin
    .from('job_tracking')
    .select(ROW_FIELDS)
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .not('status', 'in', '(done,cancelled,rescheduled,no_access)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as TrackingRow;
}

/**
 * The live trip on each of several jobs, in one query.
 *
 * getActiveTracking is per job, which is right on a job screen and wrong on a
 * day's route: ten stops would be ten round trips before the page could draw.
 * Same filter, same "no rows on error" defensiveness — the only difference is
 * that the newest row per job is picked here rather than by LIMIT 1.
 */
export async function getActiveTrackingByJob(
  admin: SupabaseClient,
  accountId: string,
  jobIds: string[],
): Promise<Map<string, TrackingRow>> {
  const found = new Map<string, TrackingRow>();
  if (jobIds.length === 0) return found;

  const { data, error } = await admin
    .from('job_tracking')
    .select(ROW_FIELDS)
    .eq('account_id', accountId)
    .in('job_id', jobIds)
    .not('status', 'in', '(done,cancelled,rescheduled,no_access)')
    .order('created_at', { ascending: false });
  if (error || !data) return found;

  // Newest first, so the first row seen for a job is the one to keep.
  for (const row of data as unknown as TrackingRow[]) {
    if (!found.has(row.job_id)) found.set(row.job_id, row);
  }
  return found;
}

export type StartArrivalInput = {
  accountId: string;
  jobId: string;
  crewId: string | null;
  sentBy: string;
  etaMinutes: number;
  /** What GPS suggested, when it could. Kept alongside what the tech actually
   *  promised so analytics can tell "the estimate was wrong" apart from "the
   *  tech overrode a good estimate" — different problems, different fixes. */
  suggestedMinutes?: number | null;
  times: ArrivalWindowTimes | null;
  techLoc: LatLng;
  shareLocation: boolean;
  message: string;
  settings: ArrivalSettings;
  now?: Date;
};

/**
 * Open a trip and return the raw token to text.
 *
 * Supersedes any prior active row for this job so there is exactly ONE live
 * link at a time — a customer holding two status pages for the same visit is a
 * customer we have confused.
 */
export async function startArrival(
  admin: SupabaseClient,
  input: StartArrivalInput,
): Promise<{ token: string; trackingId: string }> {
  const now = input.now ?? new Date();
  await admin
    .from('job_tracking')
    .update({ status: 'done', updated_at: now.toISOString() })
    .eq('account_id', input.accountId)
    .eq('job_id', input.jobId)
    .not('status', 'in', '(done,cancelled,rescheduled,no_access)');

  const { token, hash } = newTrackingToken();
  const point = input.shareLocation ? applyPrecision(input.techLoc, input.settings.locationPrecision) : null;

  const { data, error } = await admin
    .from('job_tracking')
    .insert({
      account_id: input.accountId,
      job_id: input.jobId,
      crew_id: input.crewId,
      sent_by: input.sentBy,
      token_hash: hash,
      status: 'en_route',
      tech_lat: point?.lat ?? null,
      tech_lng: point?.lng ?? null,
      eta_minutes: input.etaMinutes,
      suggested_minutes: input.suggestedMinutes ?? null,
      arrival_start: input.times?.start.toISOString() ?? null,
      arrival_end: input.times?.end.toISOString() ?? null,
      share_location: input.shareLocation && Boolean(point),
      location_expires_at: input.shareLocation && point ? locationExpiry(now).toISOString() : null,
      message_body: input.message,
      en_route_at: now.toISOString(),
      last_sent_at: now.toISOString(),
      expires_at: new Date(now.getTime() + input.settings.linkHours * 3_600_000).toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) throw error ?? new Error('Could not start the visit.');
  return { token, trackingId: data.id as string };
}

/**
 * Revise the promise on a trip already in flight — a new ETA on the SAME link,
 * so the page the customer already has open updates itself instead of a second
 * link landing in their messages.
 */
export async function reviseArrival(
  admin: SupabaseClient,
  row: TrackingRow,
  input: {
    etaMinutes: number;
    times: ArrivalWindowTimes | null;
    techLoc: LatLng;
    message: string;
    settings: ArrivalSettings;
    late: boolean;
    now?: Date;
  },
): Promise<void> {
  const now = input.now ?? new Date();
  const point = row.share_location ? applyPrecision(input.techLoc, input.settings.locationPrecision) : null;
  await admin
    .from('job_tracking')
    .update({
      status: input.late ? 'delayed' : 'en_route',
      eta_minutes: input.etaMinutes,
      arrival_start: input.times?.start.toISOString() ?? null,
      arrival_end: input.times?.end.toISOString() ?? null,
      message_body: input.message,
      revision_count: (row.revision_count ?? 0) + 1,
      last_sent_at: now.toISOString(),
      // A revised promise re-arms the location share; without this a delay
      // announcement would be the moment the map went dark.
      ...(point ? { tech_lat: point.lat, tech_lng: point.lng, location_expires_at: locationExpiry(now).toISOString() } : {}),
      updated_at: now.toISOString(),
    })
    .eq('id', row.id);
}

/**
 * End the trip. Every terminal state drops the location share in the same
 * statement, so there is no window where a finished visit is still broadcasting.
 */
export async function setArrivalStatus(
  admin: SupabaseClient,
  row: TrackingRow,
  status: ArrivalStatus,
  now = new Date(),
): Promise<void> {
  const closing = isClosedStatus(status) || status === 'arrived';
  await admin
    .from('job_tracking')
    .update({
      status,
      ...(status === 'arrived' ? { arrived_at: now.toISOString() } : {}),
      ...(closing ? { share_location: false, location_expires_at: null } : {}),
      updated_at: now.toISOString(),
    })
    .eq('id', row.id);
}

/**
 * Move the tech's pin on a trip already in flight.
 *
 * Only ever called while the field app's job screen is OPEN and the tech has
 * already consented to sharing on this trip — there is no background tracking
 * here, by choice. It re-arms the location expiry, so the share stays alive
 * while they're actively driving and lapses on its own the moment they stop
 * looking at it.
 */
export async function updateTechPosition(
  admin: SupabaseClient,
  row: TrackingRow,
  point: { lat: number; lng: number },
  precision: ArrivalSettings['locationPrecision'],
  now = new Date(),
): Promise<void> {
  if (!row.share_location) return;
  if (row.status !== 'en_route' && row.status !== 'delayed') return;
  const blurred = applyPrecision(point, precision);
  if (!blurred) return;
  await admin
    .from('job_tracking')
    .update({
      tech_lat: blurred.lat,
      tech_lng: blurred.lng,
      location_expires_at: locationExpiry(now).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', row.id);
}

/** Record what actually happened to the text, so the tech is told the truth. */
export async function recordSmsOutcome(
  admin: SupabaseClient,
  trackingId: string,
  outcome: { status: SmsStatus; sid?: string | null; error?: string | null },
): Promise<void> {
  await admin
    .from('job_tracking')
    .update({
      sms_status: outcome.status,
      sms_sid: outcome.sid ?? null,
      sms_error: outcome.error ? outcome.error.slice(0, 300) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', trackingId);
}

/**
 * The homeowner opened their status page.
 *
 * Throttled to one counted visit per 10 minutes, because the page refreshes
 * itself every 30 seconds — an untrottled counter would report a phone left
 * face-up on a kitchen counter as an extremely engaged customer, and the number
 * would be quietly useless.
 *
 * first_viewed_at is set once and never moved: "did this text get read at all"
 * is the question worth answering, and it's the one the open rate is built on.
 */
const VIEW_THROTTLE_MS = 10 * 60_000;

export async function recordTrackingView(
  admin: SupabaseClient,
  row: Pick<TrackingRow, 'id' | 'first_viewed_at'> & { last_viewed_at?: string | null; view_count?: number | null },
  now = new Date(),
): Promise<void> {
  const last = row.last_viewed_at ? new Date(row.last_viewed_at).getTime() : 0;
  const fresh = !Number.isFinite(last) || now.getTime() - last > VIEW_THROTTLE_MS;
  if (!fresh && row.first_viewed_at) return;

  try {
    await admin
      .from('job_tracking')
      .update({
        ...(row.first_viewed_at ? {} : { first_viewed_at: now.toISOString() }),
        last_viewed_at: now.toISOString(),
        view_count: (row.view_count ?? 0) + (fresh ? 1 : 0),
      })
      .eq('id', row.id);
  } catch (error) {
    // A metric must never take down the page it measures.
    console.error('Recording a tracking view failed:', error instanceof Error ? error.message : error);
  }
}

/** The homeowner tapped one of the reply buttons on their status page. */
export async function recordHomeownerNote(admin: SupabaseClient, trackingId: string, note: string): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from('job_tracking')
    .update({ homeowner_note: note, homeowner_note_at: now, updated_at: now })
    .eq('id', trackingId);
}

// -- The public read ----------------------------------------------------------

export type PublicTracking = {
  trackingId: string;
  accountId: string;
  jobId: string;
  status: ArrivalStatus;
  businessName: string;
  /** Branding, so the page looks like the contractor and not like us. */
  logoUrl: string | null;
  accent: string | null;
  /** Who is coming: first name only, plus a face if the business uploaded one. */
  crewFirstName: string | null;
  crewPhotoUrl: string | null;
  crewRole: string | null;
  clientFirst: string | null;
  windowLabel: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  enRouteAt: string;
  arrivedAt: string | null;
  homeownerNote: string | null;
  /** Present only while the share is live — see locationVisible. */
  tech: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number } | null;
  destLabel: string | null;
  contactPhone: string | null;
  expired: boolean;
  /** Enough to record a throttled view. Read by the page, not the reply action,
   *  so tapping a button doesn't also count as opening the link. */
  viewState: { id: string; first_viewed_at: string | null; last_viewed_at: string | null; view_count: number | null };
};

/**
 * Public read by raw token (service-role). Deliberately minimal: no price, no
 * customer phone or email, no job scope, no crew surname. Everything on this
 * page is reachable by anyone holding the link, so the page only holds what a
 * person waiting at home needs.
 */
export async function getTrackingByToken(
  admin: SupabaseClient,
  token: string,
  now = new Date(),
): Promise<PublicTracking | null> {
  const { data, error } = await admin
    .from('job_tracking')
    .select(ROW_FIELDS)
    .eq('token_hash', hashTrackingToken(token))
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as TrackingRow;

  const [{ data: job }, { data: site }, { data: account }] = await Promise.all([
    admin.from('jobs').select('client_name, address, lat, lng').eq('id', row.job_id).maybeSingle(),
    admin.from('sites').select('company_name, logo_url, accent_override, phone').eq('account_id', row.account_id).limit(1).maybeSingle(),
    admin.from('accounts').select('business_name, timezone').eq('id', row.account_id).maybeSingle(),
  ]);

  // The arriving contact. First name and photo only — a homeowner needs to
  // recognize who's at the door, not to be handed an employee's full identity.
  let crewFirstName: string | null = null;
  let crewPhotoUrl: string | null = null;
  let crewRole: string | null = null;
  if (row.crew_id) {
    const { data: crew } = await admin.from('crew').select('name, role_label, photo_path').eq('id', row.crew_id).maybeSingle();
    if (crew) {
      crewFirstName = String(crew.name ?? '').trim().split(/\s+/)[0] || null;
      crewRole = (crew.role_label as string | null) || null;
      crewPhotoUrl = crew.photo_path ? await signCrewPhoto(admin, crew.photo_path as string) : null;
    }
  }
  if (!crewFirstName && row.sent_by) crewFirstName = row.sent_by.trim().split(/\s+/)[0] || null;

  const clientName = (job?.client_name as string | undefined) ?? '';
  const jobLat = Number(job?.lat);
  const jobLng = Number(job?.lng);
  const timeZone = (account?.timezone as string | undefined) || 'America/New_York';

  const times = row.arrival_start
    ? { start: new Date(row.arrival_start), end: new Date(row.arrival_end ?? row.arrival_start) }
    : null;

  const showTech = locationVisible(row, now);

  return {
    trackingId: row.id,
    accountId: row.account_id,
    jobId: row.job_id,
    status: row.status,
    businessName: (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor',
    logoUrl: (site?.logo_url as string | null) ?? null,
    accent: (site?.accent_override as string | null) ?? null,
    crewFirstName,
    crewPhotoUrl,
    crewRole,
    clientFirst: clientName ? clientName.trim().split(/\s+/)[0] : null,
    windowLabel: times ? formatWindowLabel(times, timeZone) : null,
    windowStart: row.arrival_start,
    windowEnd: row.arrival_end,
    enRouteAt: row.en_route_at,
    arrivedAt: row.arrived_at,
    homeownerNote: row.homeowner_note,
    tech: showTech && Number.isFinite(Number(row.tech_lat)) && Number.isFinite(Number(row.tech_lng))
      ? { lat: Number(row.tech_lat), lng: Number(row.tech_lng) }
      : null,
    dest: Number.isFinite(jobLat) && Number.isFinite(jobLng) ? { lat: jobLat, lng: jobLng } : null,
    destLabel: (job?.address as string | undefined) ?? null,
    contactPhone: (site?.phone as string | null) ?? null,
    expired: new Date(row.expires_at).getTime() < now.getTime(),
    viewState: {
      id: row.id,
      first_viewed_at: row.first_viewed_at,
      last_viewed_at: row.last_viewed_at,
      view_count: row.view_count,
    },
  };
}

function formatWindowLabel(times: ArrivalWindowTimes, timeZone: string): string {
  const fmt = (date: Date) => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
    } catch {
      return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
    }
  };
  const start = fmt(times.start);
  return times.end.getTime() <= times.start.getTime() ? start : `${start} to ${fmt(times.end)}`;
}

// crew-photos is a PRIVATE bucket, so a public URL would 404 and the homeowner
// would get a broken face. Signed per render (the page is force-dynamic, so the
// hour of validity is only ever spent on the tab that's already open) and
// best-effort: no photo beats a broken image.
async function signCrewPhoto(admin: SupabaseClient, path: string): Promise<string | null> {
  try {
    const { data } = await admin.storage.from('crew-photos').createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/** Re-export so callers don't need two imports to compute a window. */
export { arrivalWindowTimes };
