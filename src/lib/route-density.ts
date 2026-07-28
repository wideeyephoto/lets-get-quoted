import type { BookingDay } from '@/lib/booking';

// Route-density ranking for instant booking: given the open booking days and the
// distance to the contractor's nearest existing same-day stop (from EITHER
// straight-line haversine or real Distance-Matrix drive distance), surface the
// days the contractor is already working near the lead — so quick jobs batch into
// neighborhoods already on the route.
//
// This module is distance-source-agnostic: the caller computes `nearestByDate`
// (miles) and optionally `minutesByDate` (drive time, for the badge) and passes
// them in. Honesty + privacy: a day is only `nearby` when a REAL same-day stop is
// within the radius, and the flag carries no other client's name/address. Cold
// start (no lead location or no anchors) ⇒ plain order, no claim, never stranded.

export type RankedBookingDay = BookingDay & { nearby: boolean; driveMinutes?: number };
export type GeoMode = 'prefer' | 'restrict';

export function rankByProximity(opts: {
  days: BookingDay[];
  hasLocation: boolean; // false when the lead address couldn't be geocoded
  nearestByDate: Map<string, number>; // miles to the nearest same-day stop; absent = no anchor that day
  minutesByDate?: Map<string, number>; // optional drive minutes to that stop
  radiusMiles: number;
  mode: GeoMode;
}): RankedBookingDay[] {
  const { days, hasLocation, nearestByDate, minutesByDate, radiusMiles, mode } = opts;

  // No usable lead location ⇒ we can't claim proximity for anyone. Plain order.
  if (!hasLocation) return days.map((day) => ({ ...day, nearby: false }));

  const scored = days.map((day) => {
    const miles = nearestByDate.get(day.dateKey);
    const nearby = miles != null && miles <= radiusMiles;
    return { day, miles: miles ?? null, nearby, driveMinutes: minutesByDate?.get(day.dateKey) };
  });

  const anyNearby = scored.some((s) => s.nearby);

  // Restrict: only offer nearby days — but ONLY when there is at least one, so a
  // sparse/empty calendar never leaves the customer with nothing (cold start).
  const kept = mode === 'restrict' && anyNearby ? scored.filter((s) => s.nearby) : scored;

  // Stable rank: nearby days first, closest first; everything else keeps its
  // original chronological order.
  const ordered = kept
    .map((s, index) => ({ ...s, index }))
    .sort((a, b) => {
      if (a.nearby !== b.nearby) return a.nearby ? -1 : 1;
      if (a.nearby && b.nearby) return (a.miles ?? Infinity) - (b.miles ?? Infinity);
      return a.index - b.index;
    });

  return ordered.map((s) => ({
    ...s.day,
    nearby: s.nearby,
    ...(s.nearby && s.driveMinutes != null ? { driveMinutes: Math.round(s.driveMinutes) } : {}),
  }));
}
