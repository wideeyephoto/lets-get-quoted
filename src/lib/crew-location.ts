import type { SupabaseClient } from '@supabase/supabase-js';
import {
  verifyGeofenceClockIn,
  formatGpsAccuracy,
  formatHeading,
  formatSpeedMph,
  describeGeofenceDistance,
  type GeofenceStatus,
} from '@/lib/crew-geofence';
import type { LatLng } from '@/lib/distance';

export type LocationFreshness = 'live' | 'stale' | 'unavailable';

export type LiveTechnicianStatus =
  | 'on_site'
  | 'off_site'
  | 'en_route'
  | 'location_uncertain'
  | 'job_not_mapped'
  | 'off_duty';

export type CrewLocationStateRow = {
  account_id: string;
  crew_id: string;
  time_entry_id: string | null;
  job_id: string | null;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  heading_deg: number | null;
  speed_mps: number | null;
  captured_at: string;
  received_at: string;
  expires_at: string;
  source: 'shift' | 'arrival' | 'manual_refresh';
  client_sequence: number;
  permission_state: 'granted' | 'denied' | 'prompt';
  created_at: string;
  updated_at: string;
};

export type TechnicianLocationSnapshot = {
  crewId: string;
  crewName: string;
  avatarUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  roleTitle: string;
  canShareWorkLocation: boolean;

  // Real-time status & Freshness
  status: LiveTechnicianStatus;
  statusLabel: string;
  statusTone: 'success' | 'warn' | 'info' | 'neutral';
  freshness: LocationFreshness;
  freshnessLabel: string;
  lastCapturedAt: string | null;

  // Active Job & Coordinates
  activeJobId: string | null;
  activeJobRef?: string | null;
  activeJobLabel: string | null;
  activeJobAddress: string | null;
  jobCoord: LatLng | null;

  // Shift & Timing
  shiftId: string | null;
  shiftStartedAt: string | null;
  elapsedHours: number;
  elapsedLabel: string;

  // Telemetry details
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  accuracyLabel: string;
  headingDeg: number | null;
  headingLabel: string;
  speedMps: number | null;
  speedLabel: string;
  distanceFromSiteFeet: number | null;
  distanceLabel: string | null;
  geofenceStatus: GeofenceStatus | null;

  // Financial details (strictly gated by crew_pay.read)
  hourlyRate: number | null;
  estimatedLaborCost: number | null;
};

export type CrewMapSnapshot = {
  technicians: TechnicianLocationSnapshot[];
  accountPolicy: 'off' | 'ask' | 'during_active_shift';
  geofenceRadiusFeet: number;
  canViewPay: boolean;
  counts: {
    total: number;
    live: number;
    enRoute: number;
    onSite: number;
    offSite: number;
    attention: number;
    staleOrUnavailable: number;
    offDuty: number;
  };
};

/**
 * Resolves location freshness based on seconds elapsed since capture timestamp.
 * - < 120s (2m): live
 * - 120s - 600s (2-10m): stale
 * - > 600s (>10m): unavailable
 */
export function resolveFreshness(
  capturedAtIso: string | null | undefined,
  nowMs = Date.now(),
): {
  freshness: LocationFreshness;
  elapsedSeconds: number;
  label: string;
} {
  if (!capturedAtIso) {
    return { freshness: 'unavailable', elapsedSeconds: Infinity, label: 'No recent signal' };
  }

  const capturedTime = new Date(capturedAtIso).getTime();
  if (!Number.isFinite(capturedTime)) {
    return { freshness: 'unavailable', elapsedSeconds: Infinity, label: 'Unknown timestamp' };
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - capturedTime) / 1000));

  if (elapsedSeconds < 60) {
    return {
      freshness: 'live',
      elapsedSeconds,
      label: elapsedSeconds <= 5 ? 'Updated just now' : `Updated ${elapsedSeconds}s ago`,
    };
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedSeconds < 120) {
    return { freshness: 'live', elapsedSeconds, label: `Updated ${elapsedMinutes}m ago` };
  }

  if (elapsedSeconds <= 600) {
    return { freshness: 'stale', elapsedSeconds, label: `Updated ${elapsedMinutes}m ago (stale)` };
  }

  if (elapsedMinutes < 60) {
    return { freshness: 'unavailable', elapsedSeconds, label: `Last seen ${elapsedMinutes}m ago` };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return { freshness: 'unavailable', elapsedSeconds, label: `Last seen ${elapsedHours}h ago` };
}

/**
 * Calculates human-readable elapsed shift time.
 */
export function formatElapsedShift(startedAtIso: string | null | undefined, nowMs = Date.now()): {
  hours: number;
  label: string;
} {
  if (!startedAtIso) return { hours: 0, label: '0m' };
  const start = new Date(startedAtIso).getTime();
  if (!Number.isFinite(start)) return { hours: 0, label: '0m' };

  const totalMinutes = Math.max(0, Math.floor((nowMs - start) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const decimalHours = Math.round((totalMinutes / 60) * 10) / 10;

  const label = hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return { hours: decimalHours, label };
}

/**
 * Evaluates the authoritative operational status of a technician.
 */
export function resolveTechnicianStatus(params: {
  isOnShift: boolean;
  isEnRoute: boolean;
  locationState?: CrewLocationStateRow | null;
  jobCoord?: LatLng | null;
  geofenceRadiusFeet?: number;
  freshness: LocationFreshness;
}): {
  status: LiveTechnicianStatus;
  statusLabel: string;
  statusTone: 'success' | 'warn' | 'info' | 'neutral';
  geofenceResult: ReturnType<typeof verifyGeofenceClockIn> | null;
} {
  if (!params.isOnShift && !params.isEnRoute) {
    return {
      status: 'off_duty',
      statusLabel: 'Off Duty',
      statusTone: 'neutral',
      geofenceResult: null,
    };
  }

  if (params.isEnRoute && !params.isOnShift) {
    return {
      status: 'en_route',
      statusLabel: 'En Route',
      statusTone: 'info',
      geofenceResult: null,
    };
  }

  // On Shift: verify geofence if location coordinates exist
  const loc = params.locationState;
  if (!loc || loc.lat == null || loc.lng == null) {
    return {
      status: 'location_uncertain',
      statusLabel: 'No GPS Signal',
      statusTone: 'warn',
      geofenceResult: null,
    };
  }

  if (!params.jobCoord || params.jobCoord.lat == null || params.jobCoord.lng == null) {
    return {
      status: 'job_not_mapped',
      statusLabel: 'Job Not Mapped',
      statusTone: 'neutral',
      geofenceResult: null,
    };
  }

  const geofence = verifyGeofenceClockIn({
    technicianCoord: { lat: loc.lat, lng: loc.lng },
    jobSiteCoord: params.jobCoord,
    accuracyMeters: loc.accuracy_m,
    radiusFeet: params.geofenceRadiusFeet,
  });

  if (geofence.status === 'verified_on_site') {
    return {
      status: 'on_site',
      statusLabel: `On Site (${describeGeofenceDistance(geofence.distanceFeet ?? 0)})`,
      statusTone: 'success',
      geofenceResult: geofence,
    };
  }

  if (geofence.status === 'location_uncertain' || geofence.status === 'accuracy_too_low') {
    return {
      status: 'location_uncertain',
      statusLabel: 'Location Uncertain',
      statusTone: 'warn',
      geofenceResult: geofence,
    };
  }

  if (geofence.status === 'off_site_warning') {
    return {
      status: 'off_site',
      statusLabel: `Off Site (${describeGeofenceDistance(geofence.distanceFeet ?? 0)})`,
      statusTone: 'warn',
      geofenceResult: geofence,
    };
  }

  return {
    status: 'location_uncertain',
    statusLabel: 'Signal Unverified',
    statusTone: 'warn',
    geofenceResult: geofence,
  };
}

/**
 * Loads the complete Live Crew Map snapshot from Supabase database tables.
 */
export async function loadCrewLocationMapSnapshot(
  supabase: SupabaseClient,
  accountId: string,
  options: {
    canViewPay: boolean;
  },
): Promise<CrewMapSnapshot> {
  const nowMs = Date.now();

  try {
    // 1. Fetch account settings
    const { data: accountRow } = await supabase
      .from('accounts')
      .select('work_location_policy, geofence_radius_feet')
      .eq('id', accountId)
      .maybeSingle();

    const accountPolicy = (accountRow?.work_location_policy as CrewMapSnapshot['accountPolicy']) || 'during_active_shift';
    const geofenceRadiusFeet = Number(accountRow?.geofence_radius_feet) || 200;

    // 2. Fetch active crew members
    const { data: crewRows, error: crewError } = await supabase
      .from('crew')
      .select('id, name, phone, email, role_label, photo_path, hourly_rate, active, can_share_work_location')
      .eq('account_id', accountId)
      .eq('active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (crewError || !crewRows || crewRows.length === 0) {
      return {
        technicians: [],
        accountPolicy,
        geofenceRadiusFeet,
        canViewPay: options.canViewPay,
        counts: { total: 0, live: 0, enRoute: 0, onSite: 0, offSite: 0, attention: 0, staleOrUnavailable: 0, offDuty: 0 },
      };
    }

    const crewIds = crewRows.map((c) => c.id as string);

    // 3. Parallel fetch of open shifts, active arrivals, and latest location states
    const [shiftsRes, arrivalsRes, locationsRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('id, crew_id, job_id, started_at, rate')
        .eq('account_id', accountId)
        .is('ended_at', null)
        .in('crew_id', crewIds),
      supabase
        .from('job_tracking')
        .select('id, job_id, status, share_location, tech_lat, tech_lng')
        .eq('account_id', accountId)
        .in('status', ['en_route', 'delayed']),
      supabase
        .from('crew_location_state')
        .select('*')
        .eq('account_id', accountId)
        .in('crew_id', crewIds),
    ]);

    const openShifts = shiftsRes.data ?? [];
    const openShiftByCrewId = new Map(openShifts.map((s) => [s.crew_id as string, s]));

    const activeArrivals = arrivalsRes.data ?? [];
    const activeArrivalByJobId = new Map(activeArrivals.map((a) => [a.job_id as string, a]));

    const locationRows = (locationsRes.data as CrewLocationStateRow[]) ?? [];
    const locationByCrewId = new Map(locationRows.map((l) => [l.crew_id, l]));

    // 4. Fetch jobs involved in shifts or arrivals
    const referencedJobIds = [
      ...new Set([
        ...openShifts.map((s) => s.job_id as string),
        ...activeArrivals.map((a) => a.job_id as string),
      ]),
    ].filter(Boolean);

    const { data: jobRows } = referencedJobIds.length > 0
      ? await supabase
          .from('jobs')
          .select('id, ref, client_name, address, lat, lng')
          .eq('account_id', accountId)
          .in('id', referencedJobIds)
      : { data: [] };

    const jobById = new Map((jobRows ?? []).map((j) => [j.id as string, j]));

    // 5. Transform crew into TechnicianLocationSnapshot list
    const technicians: TechnicianLocationSnapshot[] = crewRows.map((member) => {
      const crewId = member.id as string;
      const shift = openShiftByCrewId.get(crewId) ?? null;
      const loc = locationByCrewId.get(crewId) ?? null;

      const jobId = shift?.job_id || loc?.job_id || null;
      const job = jobId ? jobById.get(jobId) ?? null : null;
      const arrival = jobId ? activeArrivalByJobId.get(jobId) ?? null : null;

      const isOnShift = Boolean(shift);
      const isEnRoute = Boolean(arrival && arrival.share_location);

      const jobCoord: LatLng | null =
        job?.lat != null && job?.lng != null ? { lat: Number(job.lat), lng: Number(job.lng) } : null;

      const { freshness, label: freshnessLabel } = resolveFreshness(loc?.captured_at, nowMs);
      const { hours: elapsedHours, label: elapsedLabel } = formatElapsedShift(shift?.started_at, nowMs);

      const { status, statusLabel, statusTone, geofenceResult } = resolveTechnicianStatus({
        isOnShift,
        isEnRoute,
        locationState: loc,
        jobCoord,
        geofenceRadiusFeet,
        freshness,
      });

      const hourlyRate = options.canViewPay ? (Number(shift?.rate) || Number(member.hourly_rate) || null) : null;
      const estimatedLaborCost = hourlyRate != null ? Math.round(elapsedHours * hourlyRate * 100) / 100 : null;

      return {
        crewId,
        crewName: (member.name as string) || 'Crew member',
        avatarUrl: (member.photo_path as string) || null,
        phone: (member.phone as string) || null,
        email: (member.email as string) || null,
        roleTitle: (member.role_label as string) || 'Field Technician',
        canShareWorkLocation: member.can_share_work_location !== false,

        status,
        statusLabel,
        statusTone,
        freshness,
        freshnessLabel,
        lastCapturedAt: loc?.captured_at || null,

        activeJobId: job?.id || null,
        activeJobRef: job?.ref || null,
        activeJobLabel: job ? `${job.ref} · ${job.client_name}` : null,
        activeJobAddress: job?.address || null,
        jobCoord,

        shiftId: shift?.id || null,
        shiftStartedAt: shift?.started_at || null,
        elapsedHours,
        elapsedLabel,

        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        accuracyMeters: loc?.accuracy_m ?? null,
        accuracyLabel: formatGpsAccuracy(loc?.accuracy_m),
        headingDeg: loc?.heading_deg ?? null,
        headingLabel: formatHeading(loc?.heading_deg),
        speedMps: loc?.speed_mps ?? null,
        speedLabel: formatSpeedMph(loc?.speed_mps),
        distanceFromSiteFeet: geofenceResult?.distanceFeet ?? null,
        distanceLabel: geofenceResult?.distanceFeet != null ? describeGeofenceDistance(geofenceResult.distanceFeet) : null,
        geofenceStatus: geofenceResult?.status ?? null,

        hourlyRate,
        estimatedLaborCost,
      };
    });

    // 6. Compute counts
    const counts = {
      total: technicians.length,
      live: technicians.filter((t) => t.freshness === 'live' && (t.status === 'on_site' || t.status === 'en_route')).length,
      enRoute: technicians.filter((t) => t.status === 'en_route').length,
      onSite: technicians.filter((t) => t.status === 'on_site').length,
      offSite: technicians.filter((t) => t.status === 'off_site').length,
      attention: technicians.filter((t) => t.status === 'off_site' || t.status === 'location_uncertain').length,
      staleOrUnavailable: technicians.filter((t) => t.status !== 'off_duty' && t.freshness !== 'live').length,
      offDuty: technicians.filter((t) => t.status === 'off_duty').length,
    };

    return {
      technicians,
      accountPolicy,
      geofenceRadiusFeet,
      canViewPay: options.canViewPay,
      counts,
    };
  } catch (err) {
    console.error('loadCrewLocationMapSnapshot error:', err);
    return {
      technicians: [],
      accountPolicy: 'during_active_shift',
      geofenceRadiusFeet: 200,
      canViewPay: options.canViewPay,
      counts: { total: 0, live: 0, enRoute: 0, onSite: 0, offSite: 0, attention: 0, staleOrUnavailable: 0, offDuty: 0 },
    };
  }
}
