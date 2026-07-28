// Server-side geocoding for route-density. Uses the Google Geocoding API keyed by
// a SERVER env var (GOOGLE_MAPS_API_KEY) — distinct from the browser Places key,
// which is HTTP-referrer-locked and can't be used server-to-server. Note: this
// module is dynamically imported by jobs.ts, which a client calendar component
// also pulls in; GOOGLE_MAPS_API_KEY is NOT NEXT_PUBLIC, so it is undefined in
// any client bundle and every function here no-ops (returns null) there — the key
// never ships to the browser. (No `server-only` guard for that reason: it would
// fail the build via the client import chain.)
//
// Precision guard (see the design review): a lot of free-text contractor
// addresses resolve to a ZIP/city CENTROID, which can sit miles from the real
// place and would silently fake or miss a "nearby" match. We therefore only
// treat ROOFTOP / RANGE_INTERPOLATED results as usable coordinates; anything
// coarser is reported precise:false and callers store null (= "location
// unknown") rather than gate distance on a centroid.

export type GeocodeResult = { lat: number; lng: number; precise: boolean };

export function isGeocodingConfigured(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

export async function geocodeAddress(address: string | null | undefined): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const query = (address ?? '').trim();
  if (!key || query.length < 4) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number }; location_type?: string } }>;
    };
    if (data.status !== 'OK') return null;
    const geometry = data.results?.[0]?.geometry;
    const loc = geometry?.location;
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;
    const precise = geometry?.location_type === 'ROOFTOP' || geometry?.location_type === 'RANGE_INTERPOLATED';
    return { lat: loc.lat, lng: loc.lng, precise };
  } catch (error) {
    console.error('geocodeAddress failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

// Columns to persist when geocoding a record's address at write time. Only stores
// coordinates for a PRECISE hit; an imprecise/failed result still stamps
// geocoded_at (so we don't re-charge Google on every save) but leaves lat/lng
// null so downstream distance code treats it as "no location".
export async function geocodeColumns(address: string | null | undefined): Promise<{ lat: number | null; lng: number | null; geocoded_at: string } | null> {
  if (!isGeocodingConfigured()) return null; // no key → don't stamp; allow a later backfill
  const result = await geocodeAddress(address);
  const at = new Date().toISOString();
  if (result?.precise) return { lat: result.lat, lng: result.lng, geocoded_at: at };
  return { lat: null, lng: null, geocoded_at: at };
}
