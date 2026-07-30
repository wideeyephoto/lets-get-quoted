// Straight-line (haversine) distance between two lat/lng points, in miles. The
// MVP proximity metric for instant-booking route-density — free, no API call,
// good enough to batch "same neighborhood" work. A true drive-time upgrade
// (Google Distance Matrix) can replace this later without changing callers.

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_MI = 3958.7613;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Nearest of a set of anchor points to `from`, in miles, or null when there are
// no anchors with coordinates.
export function nearestMiles(from: LatLng, anchors: LatLng[]): number | null {
  let best: number | null = null;
  for (const anchor of anchors) {
    const d = haversineMiles(from, anchor);
    if (best === null || d < best) best = d;
  }
  return best;
}

// City-driving fallback when real drive-time isn't enabled: ~30 mph door-to-door.
// Shared so every straight-line estimate in the app tells the contractor the same
// story (Extra Stop detours, day-route planning).
export function minutesFromMiles(miles: number): number {
  return Math.round(miles * 2);
}

// A usable lat/lng from possibly-null numeric columns, or null.
export function coordOf(row: { lat?: number | null; lng?: number | null }): LatLng | null {
  return typeof row.lat === 'number' && typeof row.lng === 'number' ? { lat: row.lat, lng: row.lng } : null;
}
