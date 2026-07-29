import type { SupabaseClient } from '@supabase/supabase-js';
import { haversineMiles, coordOf, type LatLng } from '@/lib/distance';
import { driveDistances } from '@/lib/drive-time';

// Route cost of inserting an Extra Stop at the END of a day's route. Answers the
// three things the contractor's request card shows: how far the stop is from
// their FINAL scheduled job that day, the extra drive time to reach it, and how
// much the whole route grows once the visit is included.
//
// This is net-new: the existing booking code only measures distance to the
// NEAREST same-day job (to flag "nearby"). Here we specifically anchor on the
// last stop by time — the realistic insertion point for a squeeze-in.
export type ExtraStopRoute = {
  detourMiles: number | null;
  detourMinutes: number | null;
  routeExtensionMinutes: number | null;
  // What we measured from, for the card's label ("from your 3:00 PM stop").
  anchorLabel: string | null;
};

// City-driving fallback when real drive-time isn't enabled: ~30 mph door-to-door.
function minutesFromMiles(miles: number): number {
  return Math.round(miles * 2);
}

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

export async function computeExtraStopRoute(
  supabase: SupabaseClient,
  accountId: string,
  target: LatLng | null,
  opts: { arrivalDate?: string | null; visitMinutes?: number | null; driveTime: boolean; timezone: string },
): Promise<ExtraStopRoute> {
  const empty: ExtraStopRoute = { detourMiles: null, detourMinutes: null, routeExtensionMinutes: null, anchorLabel: null };
  if (!target) return empty;

  const day = opts.arrivalDate || localDateKey(opts.timezone);

  // The scheduled stops on that day that have coordinates. Order by time so the
  // last one is the route's final stop.
  const { data: stops } = await supabase
    .from('jobs')
    .select('scheduled_time, lat, lng, status')
    .eq('account_id', accountId)
    .eq('scheduled_for', day)
    .neq('status', 'archived')
    .not('lat', 'is', null)
    .order('scheduled_time', { ascending: true });

  let anchor: LatLng | null = null;
  let anchorTimeLabel: string | null = null;
  const rows = (stops ?? []) as ScheduledStop[];
  for (const row of rows) {
    const coord = coordOf(row);
    if (coord) {
      anchor = coord;
      anchorTimeLabel = timeLabel(row.scheduled_time);
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

  // Real drive-time when the owner enabled it (one Distance Matrix leg). Falls
  // back silently to the straight-line estimate above on any failure.
  if (opts.driveTime) {
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
