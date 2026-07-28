import type { LatLng } from '@/lib/distance';

// Real road distance + drive time via the Google Distance Matrix API (server
// GOOGLE_MAPS_API_KEY), for the "nearby" upgrade over straight-line haversine.
// One batched call per booking evaluation (lead origin × all anchor
// destinations). Returns null for the whole batch on ANY failure — no key, the
// Distance Matrix API not enabled (REQUEST_DENIED), a non-OK response — so the
// caller transparently falls back to haversine and nothing breaks if the owner
// hasn't enabled that specific API.

const METERS_PER_MILE = 1609.344;

export type DriveResult = { miles: number; minutes: number };

export async function driveDistances(origin: LatLng, destinations: LatLng[]): Promise<(DriveResult | null)[] | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || destinations.length === 0) return null;
  // Distance Matrix caps elements per request; one origin × up to 25 destinations
  // is safe and covers a full booking window.
  const dests = destinations.slice(0, 25);
  try {
    const destParam = dests.map((d) => `${d.lat},${d.lng}`).join('|');
    const url =
      `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${origin.lat},${origin.lng}&destinations=${encodeURIComponent(destParam)}&units=imperial&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      rows?: Array<{ elements?: Array<{ status?: string; distance?: { value?: number }; duration?: { value?: number } }> }>;
    };
    if (data.status !== 'OK') return null;
    const elements = data.rows?.[0]?.elements;
    if (!Array.isArray(elements)) return null;
    return elements.map((el) => {
      if (el?.status !== 'OK' || typeof el.distance?.value !== 'number' || typeof el.duration?.value !== 'number') return null;
      return { miles: el.distance.value / METERS_PER_MILE, minutes: el.duration.value / 60 };
    });
  } catch (error) {
    console.error('driveDistances failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
