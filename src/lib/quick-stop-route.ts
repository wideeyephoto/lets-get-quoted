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
  const candidates: Array<{ coord: LatLng; label: string | null }> = [];
  for (const row of rows) {
    const coord = coordOf(row);
    if (coord) candidates.push({ coord, label: timeLabel(row.scheduled_time) });
  }

  // Closest by straight line. That ordering is also what decides which single
  // stop is worth spending a drive-time lookup on below.
  let anchor: LatLng | null = null;
  let anchorTimeLabel: string | null = null;
  let bestMiles = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const miles = haversineMiles(candidate.coord, target);
    if (miles < bestMiles) {
      bestMiles = miles;
      anchor = candidate.coord;
      anchorTimeLabel = candidate.label;
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
    const legs = await driveDistances(target, candidates.map((candidate) => candidate.coord));
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
      }
    }
  } else if (opts.driveTime) {
    const results = await driveDistances(anchor, [target]);
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

  return { detourMiles, detourMinutes, routeExtensionMinutes, anchorLabel };
}
