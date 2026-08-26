import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { loadCrewContext } from '@/lib/crew-auth';
import { getOpenShift } from '@/lib/time-clock-data';

export const dynamic = 'force-dynamic';

type LocationPayload = {
  lat: number;
  lng: number;
  accuracyMeters?: number | null;
  headingDeg?: number | null;
  speedMps?: number | null;
  capturedAt?: string;
  source?: 'shift' | 'arrival' | 'manual_refresh';
  clientSequence?: number;
  jobId?: string | null;
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const contextResult = await loadCrewContext();
  if (!contextResult.ok) {
    return badRequest('Authentication required', 401);
  }

  const { accountId, crew } = contextResult.context;

  let body: LocationPayload;
  try {
    body = await req.json();
  } catch {
    return badRequest('Invalid JSON payload');
  }

  const { lat, lng, accuracyMeters, headingDeg, speedMps, capturedAt, source = 'shift', clientSequence = 1, jobId } = body;

  // Validate coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return badRequest('Valid latitude and longitude coordinates are required');
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return badRequest('Coordinates out of range');
  }

  if (accuracyMeters != null && (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 2000)) {
    return badRequest('Invalid GPS accuracy');
  }

  const admin = createAdminClient();

  // Verify permission
  if (crew.can_share_work_location === false) {
    return NextResponse.json({ ok: false, reason: 'location_sharing_disabled_for_crew' }, { status: 200 });
  }

  // Check active shift or arrival trip to authorize location ingestion
  const now = new Date();
  const [openShift, activeArrival] = await Promise.all([
    getOpenShift(admin, accountId, crew.id),
    admin
      .from('job_tracking')
      .select('id, job_id, status, share_location')
      .eq('account_id', accountId)
      .in('status', ['en_route', 'delayed'])
      .maybeSingle(),
  ]);

  const hasActiveShift = Boolean(openShift);
  const hasActiveArrival = Boolean(activeArrival?.data && activeArrival.data.share_location);

  if (!hasActiveShift && !hasActiveArrival) {
    return badRequest('Location ingestion requires an active clocked shift or active arrival trip', 403);
  }

  const effectiveJobId = jobId || openShift?.job_id || activeArrival?.data?.job_id || null;
  const sampleCapturedAt = capturedAt ? new Date(capturedAt) : now;
  const capturedAtIso = Number.isFinite(sampleCapturedAt.getTime()) ? sampleCapturedAt.toISOString() : now.toISOString();

  // Reject out-of-order samples (older than currently stored sample)
  const { data: existingState } = await admin
    .from('crew_location_state')
    .select('captured_at, client_sequence')
    .eq('account_id', accountId)
    .eq('crew_id', crew.id)
    .maybeSingle();

  if (existingState?.captured_at) {
    const existingTime = new Date(existingState.captured_at).getTime();
    const sampleTime = new Date(capturedAtIso).getTime();
    if (sampleTime < existingTime && Number(clientSequence) <= Number(existingState.client_sequence || 0)) {
      // Stale out-of-order sample, safely acknowledge without overwriting newer state
      return NextResponse.json({ ok: true, ignored: 'stale_sample' });
    }
  }

  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();

  const { error: upsertError } = await admin
    .from('crew_location_state')
    .upsert({
      account_id: accountId,
      crew_id: crew.id,
      time_entry_id: openShift?.id || null,
      job_id: effectiveJobId,
      lat,
      lng,
      accuracy_m: accuracyMeters != null ? Math.round(accuracyMeters * 10) / 10 : null,
      heading_deg: headingDeg != null ? Math.round(headingDeg * 10) / 10 : null,
      speed_mps: speedMps != null ? Math.round(speedMps * 10) / 10 : null,
      captured_at: capturedAtIso,
      received_at: now.toISOString(),
      expires_at: expiresAt,
      source: source === 'arrival' || source === 'manual_refresh' ? source : 'shift',
      client_sequence: Number(clientSequence) || 1,
      permission_state: 'granted',
      updated_at: now.toISOString(),
    });

  if (upsertError) {
    console.error('Failed to upsert crew location:', upsertError);
    return badRequest('Could not record location telemetry', 500);
  }

  // Realtime Broadcast notification on private topic
  try {
    const channelTopic = `account:${accountId}:crew-locations`;
    const channel = admin.channel(channelTopic);
    void channel.send({
      type: 'broadcast',
      event: 'location_update',
      payload: {
        crewId: crew.id,
        lat,
        lng,
        accuracyMeters: accuracyMeters ?? null,
        headingDeg: headingDeg ?? null,
        speedMps: speedMps ?? null,
        capturedAt: capturedAtIso,
        jobId: effectiveJobId,
        shiftId: openShift?.id || null,
      },
    });
  } catch (err) {
    // Non-blocking: location state is already safely committed to DB
    console.warn('Realtime broadcast failed:', err);
  }

  return NextResponse.json({
    ok: true,
    receivedAt: now.toISOString(),
    expiresAt,
  });
}
