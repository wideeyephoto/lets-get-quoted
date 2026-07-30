import { randomBytes, createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// "On my way" live status link. The tech taps en-route (optionally sharing their
// location); the customer gets a texted /track/<token> link showing status + a
// map + a rough ETA. Token is random and stored only as a sha-256 hash — the raw
// token lives solely in the URL, so a DB read can't reconstruct live links.

export function newTrackingToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('hex');
  return { token, hash: hashTrackingToken(token) };
}

export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const EARTH_MILES = 3958.8;
function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Straight-line ETA at ~28 mph average (city driving), floored at 5 min. A rough,
// free estimate — good enough for "he's about 15 minutes out".
export function estimateEtaMinutes(tech: { lat: number; lng: number } | null, dest: { lat: number; lng: number } | null): number | null {
  if (!tech || !dest || !Number.isFinite(tech.lat) || !Number.isFinite(dest.lat)) return null;
  const miles = haversineMiles(tech, dest);
  return Math.max(5, Math.round((miles / 28) * 60));
}

type LatLng = { lat: number; lng: number } | null;

// Start (or restart) en-route tracking for a job. Supersedes any prior active row
// so there's one live link, and returns the raw token to text. Computes a rough
// ETA when both the tech location and the job's geocoded location are known.
export async function startJobEnRoute(
  admin: SupabaseClient,
  accountId: string,
  jobId: string,
  techLoc: LatLng,
  jobLoc: LatLng,
): Promise<{ token: string; etaMinutes: number | null }> {
  await admin.from('job_tracking').update({ status: 'done', updated_at: new Date().toISOString() }).eq('account_id', accountId).eq('job_id', jobId).neq('status', 'done');
  const { token, hash } = newTrackingToken();
  const etaMinutes = estimateEtaMinutes(techLoc, jobLoc);
  await admin.from('job_tracking').insert({
    account_id: accountId,
    job_id: jobId,
    token_hash: hash,
    status: 'en_route',
    tech_lat: techLoc?.lat ?? null,
    tech_lng: techLoc?.lng ?? null,
    eta_minutes: etaMinutes,
  });
  return { token, etaMinutes };
}

// Mark the job's latest active tracking row arrived.
export async function markJobArrivedTracking(admin: SupabaseClient, accountId: string, jobId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from('job_tracking')
    .update({ status: 'arrived', arrived_at: nowIso, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('job_id', jobId)
    .eq('status', 'en_route');
}

export type PublicTracking = {
  status: 'en_route' | 'arrived' | 'done';
  businessName: string;
  clientFirst: string | null;
  etaMinutes: number | null;
  enRouteAt: string;
  arrivedAt: string | null;
  tech: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number } | null;
  destLabel: string | null;
  expired: boolean;
};

// Public read by raw token (service-role). Minimal fields — no phone/email/price.
export async function getTrackingByToken(admin: SupabaseClient, token: string): Promise<PublicTracking | null> {
  const { data, error } = await admin
    .from('job_tracking')
    .select('account_id, job_id, status, tech_lat, tech_lng, eta_minutes, en_route_at, arrived_at, expires_at')
    .eq('token_hash', hashTrackingToken(token))
    .maybeSingle();
  if (error || !data) return null;

  const [{ data: job }, { data: site }] = await Promise.all([
    admin.from('jobs').select('client_name, address, lat, lng').eq('id', data.job_id).maybeSingle(),
    admin.from('sites').select('company_name').eq('account_id', data.account_id).maybeSingle(),
  ]);
  const { data: account } = site?.company_name
    ? { data: null }
    : await admin.from('accounts').select('business_name').eq('id', data.account_id).maybeSingle();

  const clientName = (job?.client_name as string | undefined) ?? '';
  const jobLat = Number(job?.lat);
  const jobLng = Number(job?.lng);
  return {
    status: data.status as PublicTracking['status'],
    businessName: (site?.company_name as string | undefined) || (account?.business_name as string | undefined) || 'Your contractor',
    clientFirst: clientName ? clientName.trim().split(/\s+/)[0] : null,
    etaMinutes: data.eta_minutes ?? null,
    enRouteAt: data.en_route_at as string,
    arrivedAt: (data.arrived_at as string | null) ?? null,
    tech: Number.isFinite(Number(data.tech_lat)) && Number.isFinite(Number(data.tech_lng)) ? { lat: Number(data.tech_lat), lng: Number(data.tech_lng) } : null,
    dest: Number.isFinite(jobLat) && Number.isFinite(jobLng) ? { lat: jobLat, lng: jobLng } : null,
    destLabel: (job?.address as string | undefined) ?? null,
    expired: new Date(data.expires_at as string).getTime() < Date.now(),
  };
}
