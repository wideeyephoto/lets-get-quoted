// Street View and Satellite visual helpers for property intelligence

import type { SatelliteInfo, StreetViewInfo } from './types';

const GMP_SOLUTION_ID = 'gmp_git_agentskills_v1';

type StreetViewMetadataResponse = {
  status?: string;
  pano_id?: string;
  date?: string;
  copyright?: string;
  location?: { lat?: number; lng?: number };
};

/**
 * Server-only key used exclusively for server-to-server metadata and geocoding requests.
 * MUST NEVER be returned to the client browser in JSON responses or embedded in static URLs.
 */
function getServerApiKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

/**
 * Client-safe restricted public key used for browser-rendered static map / Street View URLs.
 */
function getClientApiKey(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

/**
 * Checks if Street View imagery is available at the specified location and retrieves metadata.
 */
export async function checkStreetViewAvailability(
  lat: number,
  lng: number,
): Promise<StreetViewInfo> {
  const serverKey = getServerApiKey() || getClientApiKey();
  if (!serverKey || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { available: false, imageUrl: null };
  }

  try {
    const metaUrl = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
    metaUrl.searchParams.set('location', `${lat},${lng}`);
    metaUrl.searchParams.set('key', serverKey);
    metaUrl.searchParams.set('solution_id', GMP_SOLUTION_ID);

    const res = await fetch(metaUrl.toString(), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { available: false, imageUrl: null };
    }

    const data = (await res.json()) as StreetViewMetadataResponse;
    if (data.status !== 'OK') {
      return { available: false, imageUrl: null };
    }

    // Build the static Street View image URL using strictly the client-safe public key
    const clientKey = getClientApiKey();
    let imageUrl: string | null = null;
    if (clientKey) {
      const staticUrl = new URL('https://maps.googleapis.com/maps/api/streetview');
      staticUrl.searchParams.set('size', '600x350');
      staticUrl.searchParams.set('location', `${lat},${lng}`);
      staticUrl.searchParams.set('fov', '90');
      staticUrl.searchParams.set('pitch', '10');
      staticUrl.searchParams.set('key', clientKey);
      staticUrl.searchParams.set('solution_id', GMP_SOLUTION_ID);
      imageUrl = staticUrl.toString();
    }

    return {
      available: true,
      imageUrl,
      date: data.date ?? null,
      panoId: data.pano_id ?? null,
    };
  } catch (error) {
    console.error('[Google Street View] Metadata check failed:', error instanceof Error ? error.message : error);
    return { available: false, imageUrl: null };
  }
}

/**
 * Generates an aerial satellite image URL for a given lat/lng using the public client key.
 */
export function getSatelliteStaticImageUrl(
  lat: number,
  lng: number,
  zoom = 20,
): SatelliteInfo {
  const clientKey = getClientApiKey();
  if (!clientKey) {
    return {
      imageUrl: '',
      zoom,
    };
  }

  const satUrl = new URL('https://maps.googleapis.com/maps/api/staticmap');
  satUrl.searchParams.set('center', `${lat},${lng}`);
  satUrl.searchParams.set('zoom', String(zoom));
  satUrl.searchParams.set('size', '600x350');
  satUrl.searchParams.set('maptype', 'satellite');
  satUrl.searchParams.set('key', clientKey);
  satUrl.searchParams.set('solution_id', GMP_SOLUTION_ID);

  return {
    imageUrl: satUrl.toString(),
    zoom,
  };
}
