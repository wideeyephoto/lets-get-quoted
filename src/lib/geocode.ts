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

import { haversineMiles } from '@/lib/distance';

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

/**
 * A named PLACE — a city, town or ZIP code — resolved to the circle that covers it.
 *
 * The precision guard above is deliberately inverted here, and it matters. For a
 * job address a ZIP/city centroid is a wrong answer dressed as a right one, so
 * geocodeAddress throws it away. For "Birmingham" or "48009" the centroid IS the
 * answer — there is no rooftop to find, and demanding one would reject every
 * query this function exists to serve.
 *
 * The radius is DERIVED, not guessed. Google returns the place's own bounding
 * box, and a circle of equal area to that box is the honest circular reading of
 * it: circumscribing the box would spill a mile or two into the next town on
 * every side, inscribing it would drop the corners of the place the owner just
 * named. The owner can still adjust it afterwards.
 *
 * Restricted to the US because every other place-shaped thing in this product is
 * (state codes, ZIPs, US phone normalisation) and "Birmingham" unrestricted
 * resolves to England.
 */
export type AreaGeocodeResult =
  | { ok: true; label: string; lat: number; lng: number; radiusMiles: number }
  | { ok: false; reason: 'unconfigured' | 'not-found' | 'too-large' };

/** The DB check constraint on quick_stop_priority_zones.radius_miles. */
const MIN_AREA_RADIUS_MILES = 0.25;
const MAX_AREA_RADIUS_MILES = 100;

type GeocodeComponent = { long_name?: string; short_name?: string; types?: string[] };

function componentOf(components: GeocodeComponent[], type: string, short = false): string | null {
  const hit = components.find((component) => (component.types ?? []).includes(type));
  if (!hit) return null;
  return (short ? hit.short_name : hit.long_name) ?? null;
}

/**
 * What to call the area in the owner's own list.
 *
 * Never the raw formatted_address: "Birmingham, MI 48009, USA" is the same place
 * said four times. A ZIP keeps its digits AND its town, because a contractor who
 * typed 48009 still wants to read "Birmingham" back a month later.
 */
export function areaLabelFor(result: { formatted_address?: string; address_components?: GeocodeComponent[] }): string {
  const components = result.address_components ?? [];
  const town =
    componentOf(components, 'locality') ??
    componentOf(components, 'postal_town') ??
    componentOf(components, 'sublocality') ??
    componentOf(components, 'neighborhood') ??
    componentOf(components, 'administrative_area_level_3');
  const state = componentOf(components, 'administrative_area_level_1', true);
  const zip = componentOf(components, 'postal_code');
  const place = [town, state].filter(Boolean).join(', ');

  if (zip && (result.address_components ?? []).some((c) => (c.types ?? []).includes('postal_code'))) {
    return (place ? `${zip} · ${place}` : zip).slice(0, 80);
  }
  if (place) return place.slice(0, 80);
  return (result.formatted_address ?? '').replace(/,\s*USA$/, '').slice(0, 80) || 'Unnamed area';
}

/**
 * The radius of the circle with the same AREA as a place's bounding box.
 *
 * Not the circumscribing circle (which spills ~40% past the box on the
 * diagonal, quietly granting a longer drive to the next town over) and not the
 * inscribed one (which drops the corners of the place the owner just named).
 * Equal area is the reading that is wrong by the least in both directions.
 *
 * Returns null when the box is degenerate, so the caller can fall back rather
 * than save a zero-radius zone that matches nothing.
 */
export function areaRadiusMiles(
  ne: { lat: number; lng: number },
  sw: { lat: number; lng: number },
): number | null {
  const midLat = (ne.lat + sw.lat) / 2;
  const midLng = (ne.lng + sw.lng) / 2;
  const heightMiles = haversineMiles({ lat: sw.lat, lng: midLng }, { lat: ne.lat, lng: midLng });
  const widthMiles = haversineMiles({ lat: midLat, lng: sw.lng }, { lat: midLat, lng: ne.lng });
  if (!(heightMiles > 0) || !(widthMiles > 0)) return null;
  return Math.sqrt((widthMiles * heightMiles) / Math.PI);
}

export async function geocodeArea(query: string | null | undefined): Promise<AreaGeocodeResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const text = (query ?? '').trim();
  if (!key) return { ok: false, reason: 'unconfigured' };
  if (text.length < 3) return { ok: false, reason: 'not-found' };

  try {
    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}` +
      `&components=country:US&key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: 'not-found' };
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        address_components?: GeocodeComponent[];
        geometry?: {
          location?: { lat?: number; lng?: number };
          bounds?: { northeast?: { lat: number; lng: number }; southwest?: { lat: number; lng: number } };
          viewport?: { northeast?: { lat: number; lng: number }; southwest?: { lat: number; lng: number } };
        };
      }>;
    };
    if (data.status !== 'OK') return { ok: false, reason: 'not-found' };

    const result = data.results?.[0];
    const location = result?.geometry?.location;
    if (typeof location?.lat !== 'number' || typeof location?.lng !== 'number') {
      return { ok: false, reason: 'not-found' };
    }

    // `bounds` is the place's actual extent; `viewport` is the box Google would
    // frame it in, which is padded. Prefer the real one.
    const box = result?.geometry?.bounds ?? result?.geometry?.viewport;
    const ne = box?.northeast;
    const sw = box?.southwest;

    // 2 miles when the place has no box at all — a plausible neighbourhood, and
    // the owner sees the number on the row afterwards.
    const radiusMiles = (ne && sw ? areaRadiusMiles(ne, sw) : null) ?? 2;

    // Too big is REJECTED, not clamped. A whole state clamped to 100 miles would
    // save an area that silently isn't the thing they named, and they would read
    // "Michigan" back off their own settings and believe it.
    if (radiusMiles > MAX_AREA_RADIUS_MILES) return { ok: false, reason: 'too-large' };

    return {
      ok: true,
      label: areaLabelFor(result ?? {}),
      lat: location.lat,
      lng: location.lng,
      radiusMiles: Math.max(MIN_AREA_RADIUS_MILES, Math.round(radiusMiles * 100) / 100),
    };
  } catch (error) {
    console.error('geocodeArea failed:', error instanceof Error ? error.message : error);
    return { ok: false, reason: 'not-found' };
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
