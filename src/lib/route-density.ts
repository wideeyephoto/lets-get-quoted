import type { BookingDay } from '@/lib/booking';
import { haversineMiles, minutesFromMiles, type LatLng } from '@/lib/distance';

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

export type GeoStop = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  durationMinutes?: number;
};

export type CrewCluster = {
  crewId: string;
  crewName: string;
  stops: GeoStop[];
  totalMiles: number;
  totalDriveMinutes: number;
};

export function estimateRouteDistance(stops: GeoStop[], startPoint?: LatLng): { totalMiles: number; totalDriveMinutes: number } {
  if (stops.length === 0) return { totalMiles: 0, totalDriveMinutes: 0 };
  let totalMiles = 0;
  let current: LatLng = startPoint || { lat: stops[0].lat, lng: stops[0].lng };
  const startIndex = startPoint ? 0 : 1;

  for (let i = startIndex; i < stops.length; i++) {
    const next = { lat: stops[i].lat, lng: stops[i].lng };
    totalMiles += haversineMiles(current, next) * 1.25; // 1.25 winding factor for road network
    current = next;
  }

  const roundedMiles = Math.round(totalMiles * 10) / 10;
  return {
    totalMiles: roundedMiles,
    totalDriveMinutes: minutesFromMiles(roundedMiles),
  };
}

function orderStopsNearestNeighbor(stops: GeoStop[], startPoint?: LatLng): GeoStop[] {
  if (stops.length <= 1) return [...stops];
  const remaining = [...stops];
  const route: GeoStop[] = [];
  let currentPos: LatLng = startPoint || { lat: stops[0].lat, lng: stops[0].lng };

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let shortestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMiles(currentPos, { lat: remaining[i].lat, lng: remaining[i].lng });
      if (d < shortestDist) {
        shortestDist = d;
        nearestIndex = i;
      }
    }
    const [nextStop] = remaining.splice(nearestIndex, 1);
    route.push(nextStop);
    currentPos = { lat: nextStop.lat, lng: nextStop.lng };
  }

  return route;
}

export function clusterStopsByCrew(opts: {
  stops: GeoStop[];
  crews: { id: string; name: string; startLocation?: LatLng }[];
}): CrewCluster[] {
  const { stops, crews } = opts;
  if (crews.length === 0) return [];
  if (stops.length === 0) {
    return crews.map((c) => ({
      crewId: c.id,
      crewName: c.name,
      stops: [],
      totalMiles: 0,
      totalDriveMinutes: 0,
    }));
  }

  // If 1 crew, assign all stops in nearest-neighbor order
  if (crews.length === 1) {
    const singleCrew = crews[0];
    const ordered = orderStopsNearestNeighbor(stops, singleCrew.startLocation);
    const { totalMiles, totalDriveMinutes } = estimateRouteDistance(ordered, singleCrew.startLocation);
    return [
      {
        crewId: singleCrew.id,
        crewName: singleCrew.name,
        stops: ordered,
        totalMiles,
        totalDriveMinutes,
      },
    ];
  }

  // Multi-crew K-means style clustering
  const clusters: Map<string, GeoStop[]> = new Map(crews.map((c) => [c.id, []]));

  // Assign each stop to the nearest crew anchor / centroid
  for (const stop of stops) {
    let closestCrewId = crews[0].id;
    let shortestDist = Infinity;
    for (const crew of crews) {
      const origin = crew.startLocation || { lat: stops[0].lat, lng: stops[0].lng };
      const dist = haversineMiles({ lat: stop.lat, lng: stop.lng }, origin);
      if (dist < shortestDist) {
        shortestDist = dist;
        closestCrewId = crew.id;
      }
    }
    clusters.get(closestCrewId)?.push(stop);
  }

  return crews.map((crew) => {
    const unassigned = clusters.get(crew.id) || [];
    const ordered = orderStopsNearestNeighbor(unassigned, crew.startLocation);
    const { totalMiles, totalDriveMinutes } = estimateRouteDistance(ordered, crew.startLocation);
    return {
      crewId: crew.id,
      crewName: crew.name,
      stops: ordered,
      totalMiles,
      totalDriveMinutes,
    };
  });
}
