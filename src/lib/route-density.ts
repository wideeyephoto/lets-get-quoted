import type { BookingDay } from '@/lib/booking';
import { nearestMiles, type LatLng } from '@/lib/distance';

// Route-density ranking for instant booking: given the open booking days and the
// contractor's existing same-day stops (anchors) with coordinates, surface the
// days the contractor is ALREADY working near the lead — so quick jobs batch into
// neighborhoods already on the route.
//
// Honesty + privacy: a day is only marked `nearby` when a REAL same-day anchor
// falls within the radius; we never invent proximity, and the flag carries no
// other client's name/address (the UI shows a generic "we'll be in your area").
// Cold start: no lead coordinates or no anchors ⇒ plain availability, no claim,
// never strand the customer.

export type RankedBookingDay = BookingDay & { nearby: boolean };
export type GeoMode = 'prefer' | 'restrict';

export function rankByProximity(opts: {
  days: BookingDay[];
  leadCoord: LatLng | null;
  anchorsByDate: Map<string, LatLng[]>;
  radiusMiles: number;
  mode: GeoMode;
}): RankedBookingDay[] {
  const { days, leadCoord, anchorsByDate, radiusMiles, mode } = opts;

  // No usable lead location ⇒ we can't claim proximity for anyone. Plain order.
  if (!leadCoord) return days.map((day) => ({ ...day, nearby: false }));

  const scored = days.map((day) => {
    const anchors = anchorsByDate.get(day.dateKey) ?? [];
    const nearestMi = anchors.length ? nearestMiles(leadCoord, anchors) : null;
    const nearby = nearestMi != null && nearestMi <= radiusMiles;
    return { day, nearestMi, nearby };
  });

  const anyNearby = scored.some((s) => s.nearby);

  // Restrict: only offer nearby days — but ONLY when there is at least one, so a
  // sparse/empty calendar never leaves the customer with nothing (cold start).
  const kept = mode === 'restrict' && anyNearby ? scored.filter((s) => s.nearby) : scored;

  // Stable rank: nearby days first, closest anchor first; everything else keeps
  // its original chronological order.
  const ordered = kept
    .map((s, index) => ({ ...s, index }))
    .sort((a, b) => {
      if (a.nearby !== b.nearby) return a.nearby ? -1 : 1;
      if (a.nearby && b.nearby) return (a.nearestMi ?? Infinity) - (b.nearestMi ?? Infinity);
      return a.index - b.index;
    });

  return ordered.map((s) => ({ ...s.day, nearby: s.nearby }));
}
