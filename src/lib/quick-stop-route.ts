import type { SupabaseClient } from '@supabase/supabase-js';
import { haversineMiles, coordOf, minutesFromMiles, type LatLng } from '@/lib/distance';
import { driveDistances } from '@/lib/drive-time';

// Route cost of inserting a Quick Stop at the END of a day's route. Answers the
// three things the contractor's request card shows: how far the stop is from
// their FINAL scheduled job that day, the extra drive time to reach it, and how
// much the whole route grows once the visit is included.
//
// MEASURED AGAINST EVERY STOP LEFT THAT DAY, not just the last one. It used to
// anchor on the final stop by time, on the assumption that a squeeze-in goes on
// the end — which quietly contradicted the rest of the feature: a Quick Stop
// can land mid-day, and a job two streets from the 10am call was being judged on
// how far it sits from the 4pm one. That rejected the cheapest stops to take.
// The detour is now the SMALLEST of the day's stops, and the label names which.
export type QuickStopRoute = {
  detourMiles: number | null;
  detourMinutes: number | null;
  routeExtensionMinutes: number | null;
  // What we measured from, for the card's label ("from your 3:00 PM stop").
  anchorLabel: string | null;
  recommendedStart?: string | null;
  recommendedEnd?: string | null;
};

function localDateKey(timeZone: string, date = new Date()): string {
  // en-CA yields YYYY-MM-DD; anchored in the account tz so "today" is right.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Format a bare "HH:MM[:SS]" time to a friendly label ("3:00 PM").
function timeLabel(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, '0')} ${period}`;
}

type ScheduledStop = { scheduled_time: string | null; lat: number | null; lng: number | null };

/** One geocoded stop on a day's route, in schedule order. */
export type RouteStop = {
  lat: number;
  lng: number;
  timeLabel: string | null;
  scheduledTime?: string | null;
  scope?: string | null;
  clientName?: string | null;
  estimatedHours?: number | null;
};

export type MultiDayRouteMap = Record<string, RouteStop[]>;

/**
 * Every geocoded stop across multiple days, grouped by day key (YYYY-MM-DD).
 */
export async function loadMultiDayRouteStops(
  supabase: SupabaseClient,
  accountId: string,
  opts: { days: string[]; timezone: string },
): Promise<MultiDayRouteMap> {
  const result: MultiDayRouteMap = {};
  for (const day of opts.days) {
    result[day] = [];
  }
  if (opts.days.length === 0) return result;

  const { data } = await supabase
    .from('jobs')
    .select('scheduled_for, scheduled_time, lat, lng, status, scope, client_name, estimated_hours')
    .eq('account_id', accountId)
    .in('scheduled_for', opts.days)
    .neq('status', 'archived')
    .not('lat', 'is', null)
    .order('scheduled_time', { ascending: true });

  for (const row of (data ?? []) as Array<{
    scheduled_for: string;
    scheduled_time: string | null;
    lat: number | null;
    lng: number | null;
    scope: string | null;
    client_name: string | null;
    estimated_hours: number | null;
  }>) {
    const day = row.scheduled_for;
    if (day && result[day]) {
      const coord = coordOf(row);
      if (coord) {
        result[day].push({
          lat: coord.lat,
          lng: coord.lng,
          timeLabel: timeLabel(row.scheduled_time),
          scheduledTime: row.scheduled_time,
          scope: row.scope,
          clientName: row.client_name,
          estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
        });
      }
    }
  }
  return result;
}

/**
 * Every geocoded stop on a given day, in schedule order.
 *
 * Shared with the coverage map in the Quick Stops hero, which has to draw the
 * SAME route this function measures detours against. Two queries would drift —
 * and the way that shows up is a map saying an address is covered while the
 * screener rejects it as too far, with nothing on screen to explain why.
 */
export async function loadRouteStops(
  supabase: SupabaseClient,
  accountId: string,
  opts: { day?: string | null; timezone: string },
): Promise<RouteStop[]> {
  const day = opts.day || localDateKey(opts.timezone);
  const { data } = await supabase
    .from('jobs')
    .select('scheduled_time, lat, lng, status, scope, client_name, estimated_hours')
    .eq('account_id', accountId)
    .eq('scheduled_for', day)
    .neq('status', 'archived')
    .not('lat', 'is', null)
    .order('scheduled_time', { ascending: true });

  const stops: RouteStop[] = [];
  for (const row of (data ?? []) as (ScheduledStop & { scope?: string | null; client_name?: string | null; estimated_hours?: number | null })[]) {
    const coord = coordOf(row);
    if (coord) {
      stops.push({
        lat: coord.lat,
        lng: coord.lng,
        timeLabel: timeLabel(row.scheduled_time),
        scheduledTime: row.scheduled_time,
        scope: row.scope,
        clientName: row.client_name,
        estimatedHours: row.estimated_hours != null ? Number(row.estimated_hours) : null,
      });
    }
  }
  return stops;
}

export async function computeQuickStopRoute(
  supabase: SupabaseClient,
  accountId: string,
  target: LatLng | null,
  opts: { arrivalDate?: string | null; visitMinutes?: number | null; driveTime: boolean; timezone: string },
): Promise<QuickStopRoute> {
  const empty: QuickStopRoute = { detourMiles: null, detourMinutes: null, routeExtensionMinutes: null, anchorLabel: null };
  if (!target) return empty;

  const day = opts.arrivalDate || localDateKey(opts.timezone);

  // Every geocoded stop that day — all of them are candidate neighbours.
  const { data: stops } = await supabase
    .from('jobs')
    .select('scheduled_time, lat, lng, status')
    .eq('account_id', accountId)
    .eq('scheduled_for', day)
    .neq('status', 'archived')
    .not('lat', 'is', null)
    .order('scheduled_time', { ascending: true });

  const rows = (stops ?? []) as ScheduledStop[];
  const candidates: Array<{ coord: LatLng; label: string | null; scheduledTime: string | null }> = [];
  for (const row of rows) {
    const coord = coordOf(row);
    if (coord) candidates.push({ coord, label: timeLabel(row.scheduled_time), scheduledTime: row.scheduled_time });
  }

  // Closest by straight line. That ordering is also what decides which single
  // stop is worth spending a drive-time lookup on below.
  let anchor: LatLng | null = null;
  let anchorTimeLabel: string | null = null;
  let anchorScheduledTime: string | null = null;
  let bestMiles = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const miles = haversineMiles(candidate.coord, target);
    if (miles < bestMiles) {
      bestMiles = miles;
      anchor = candidate.coord;
      anchorTimeLabel = candidate.label;
      anchorScheduledTime = candidate.scheduledTime;
    }
  }

  // No jobs that day → fall back to the business home base if geocoded.
  let anchorLabel = anchorTimeLabel ? `your ${anchorTimeLabel} stop` : null;
  if (!anchor) {
    const { data: account } = await supabase
      .from('accounts')
      .select('service_center_lat, service_center_lng')
      .eq('id', accountId)
      .maybeSingle();
    const lat = account?.service_center_lat;
    const lng = account?.service_center_lng;
    if (lat != null && lng != null) {
      anchor = { lat: Number(lat), lng: Number(lng) };
      anchorLabel = 'your home base';
    }
  }
  if (!anchor) return empty;

  let miles = haversineMiles(anchor, target);
  let minutes = minutesFromMiles(miles);

  // Real drive-time when the owner enabled it. Still ONE Distance Matrix call:
  // the requested job is the origin and every stop that day is a destination, so
  // checking them all costs exactly what checking one used to. Roads reorder
  // things straight lines get wrong — the nearest stop as the crow flies can be
  // the far side of a river — so the winner is re-picked from the real legs.
  // Falls back silently to the straight-line estimate on any failure.
  if (opts.driveTime && candidates.length > 0) {
    const legs = await driveDistances(target, candidates.map((candidate) => candidate.coord), {
      departureTime: 'now',
      trafficModel: 'best_guess',
    });
    if (legs) {
      let bestLeg = -1;
      for (let index = 0; index < legs.length; index += 1) {
        const leg = legs[index];
        if (leg && (bestLeg === -1 || leg.minutes < legs[bestLeg]!.minutes)) bestLeg = index;
      }
      if (bestLeg !== -1) {
        miles = legs[bestLeg]!.miles;
        minutes = legs[bestLeg]!.minutes;
        anchorLabel = candidates[bestLeg].label ? `your ${candidates[bestLeg].label} stop` : anchorLabel;
        anchorScheduledTime = candidates[bestLeg].scheduledTime;
      }
    }
  } else if (opts.driveTime) {
    const results = await driveDistances(anchor, [target], {
      departureTime: 'now',
      trafficModel: 'best_guess',
    });
    const leg = results?.[0];
    if (leg) {
      miles = leg.miles;
      minutes = leg.minutes;
    }
  }

  const detourMiles = Math.round(miles * 10) / 10;
  const detourMinutes = minutes;
  const visit = opts.visitMinutes && opts.visitMinutes > 0 ? opts.visitMinutes : 0;
  const routeExtensionMinutes = detourMinutes + visit;

  // Calculate intelligent recommended arrival window from the anchor stop
  let recommendedStart: string | null = null;
  let recommendedEnd: string | null = null;
  if (anchorScheduledTime) {
    const [h, m] = anchorScheduledTime.split(':').map(Number);
    if (Number.isFinite(h)) {
      const anchorMins = h * 60 + (m || 0);
      const estJobDuration = 60; // standard estimated duration for previous job
      const startMins = Math.min(20 * 60, Math.max(8 * 60, Math.ceil((anchorMins + estJobDuration + detourMinutes) / 15) * 15));
      const endMins = Math.min(21 * 60, startMins + 120);
      const toHHMM = (totalM: number) => {
        const hh = Math.floor(totalM / 60);
        const mm = totalM % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      };
      recommendedStart = toHHMM(startMins);
      recommendedEnd = toHHMM(endMins);
    }
  }

  return { detourMiles, detourMinutes, routeExtensionMinutes, anchorLabel, recommendedStart, recommendedEnd };
}

/**
 * Roughly where this account works, for opening a map when today is empty.
 *
 * The coverage map fits itself to today's route, which on a quiet day is
 * nothing at all — and a map with no center is a map that never renders, which
 * took the priority-area drawing tool down with it. Priority areas are a
 * setting about where you WOULD go, so they cannot depend on what happens to be
 * booked.
 *
 * The most recent geocoded job is the cheapest honest answer: it is a place
 * this contractor has actually been, so the map opens over their patch instead
 * of the middle of the Atlantic. Null when nothing has ever been geocoded, and
 * the caller then says so rather than guessing.
 */
export async function lastKnownWorkPoint(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ lat: number; lng: number } | null> {
  const { data } = await supabase
    .from('jobs')
    .select('lat, lng, scheduled_for, created_at')
    .eq('account_id', accountId)
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const row = (data ?? [])[0];
  if (!row) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
