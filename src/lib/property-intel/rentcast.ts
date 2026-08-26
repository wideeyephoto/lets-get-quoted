// Client for RentCast API property details (Year built, Sq Ft, Lot size, Beds/Baths, Stories, Mechanicals)
import type { CorePropertySpecs } from './types';

export type RawRentCastProperty = {
  id?: string;
  formattedAddress?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  assessorID?: string;
  legalDescription?: string;
  subdivision?: string;
  zoning?: string;
  lastSaleDate?: string;
  lastSalePrice?: number;
  ownerOccupied?: boolean;
  features?: {
    architectureType?: string;
    cooling?: boolean;
    coolingType?: string;
    heating?: boolean;
    heatingType?: string;
    heatingFuel?: string;
    garage?: boolean;
    garageType?: string;
    garageSpaces?: number;
    pool?: boolean;
    fireplace?: boolean;
    fireplaceType?: string;
    stories?: number;
    roofType?: string;
    foundationType?: string;
    exteriorWallType?: string;
  };
  taxAssessments?: Record<string, { value?: number; land?: number; improvements?: number }>;
  owner?: {
    names?: string[];
    type?: string;
    occupied?: boolean;
  };
};

function getApiKey(): string | null {
  const env = process.env as Record<string, string | undefined>;
  return (
    process.env.RENTCAST_API_KEY ||
    process.env.RENTCAST_PROPERTY_DETAILS ||
    env.RentCast_Property_details ||
    null
  );
}

export type RentCastResult = {
  data: CorePropertySpecs | null;
  status: 'ok' | 'unconfigured' | 'not_found' | 'rate_limited' | 'error';
};

/**
 * Fetches physical building specs, tax assessor data, and lot size from RentCast API.
 */
export async function fetchRentCastPropertyDetailed(
  addressOrCoords: { address?: string; lat?: number; lng?: number }
): Promise<RentCastResult> {
  const apiKey = getApiKey();
  if (!apiKey) return { data: null, status: 'unconfigured' };

  const address = (addressOrCoords.address ?? '').trim();
  const lat = addressOrCoords.lat;
  const lng = addressOrCoords.lng;

  if (!address && (lat == null || lng == null)) return { data: null, status: 'error' };

  try {
    const url = new URL('https://api.rentcast.io/v1/properties');
    if (address) {
      url.searchParams.set('address', address);
    } else if (lat != null && lng != null) {
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lng));
    }

    const res = await fetch(url.toString(), {
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[RentCast API] Rate limit reached (status 429). Skipping enrichment for this request.');
        return { data: null, status: 'rate_limited' };
      }
      if (res.status === 404) {
        return { data: null, status: 'not_found' };
      }
      console.warn(`[RentCast API] request returned status ${res.status}: ${res.statusText}`);
      return { data: null, status: 'error' };
    }

    const data = (await res.json()) as RawRentCastProperty | RawRentCastProperty[];
    const raw = Array.isArray(data) ? data[0] : data;

    if (!raw) return { data: null, status: 'not_found' };

    const lotSqFt = raw.lotSize && raw.lotSize > 0 ? raw.lotSize : null;
    const lotAcres = lotSqFt ? Math.round((lotSqFt / 43560) * 100) / 100 : null;

    let latestAssessmentValue: number | null = null;
    if (raw.taxAssessments) {
      const years = Object.keys(raw.taxAssessments).sort().reverse();
      if (years.length > 0) {
        const val = raw.taxAssessments[years[0]]?.value;
        if (typeof val === 'number') latestAssessmentValue = val;
      }
    }

    const feat = raw.features ?? {};

    return {
      data: {
        propertyType: raw.propertyType ?? null,
        yearBuilt: raw.yearBuilt && raw.yearBuilt > 1700 ? raw.yearBuilt : null,
        squareFootage: raw.squareFootage && raw.squareFootage > 0 ? raw.squareFootage : null,
        lotSizeSqFt: lotSqFt,
        lotSizeAcres: lotAcres,
        bedrooms: raw.bedrooms ?? null,
        bathrooms: raw.bathrooms ?? null,
        stories: feat.stories ?? null,
        ownerOccupied: raw.ownerOccupied ?? raw.owner?.occupied ?? null,
        lastSaleDate: raw.lastSaleDate ? raw.lastSaleDate.split('T')[0] : null,
        lastSalePrice: raw.lastSalePrice ?? null,
        assessedValue: latestAssessmentValue,
        coolingType: feat.coolingType ?? (feat.cooling ? 'Yes' : null),
        heatingType: feat.heatingType ?? (feat.heating ? 'Yes' : null),
        heatingFuel: feat.heatingFuel ?? null,
        garageSpaces: feat.garageSpaces ?? (feat.garage ? 1 : null),
        hasPool: feat.pool ?? null,
        hasFireplace: feat.fireplace ?? null,
        foundationType: feat.foundationType ?? null,
        roofType: feat.roofType ?? null,
        exteriorWallType: feat.exteriorWallType ?? null,
      },
      status: 'ok',
    };
  } catch (error) {
    console.error('[RentCast API] Error fetching property details:', error instanceof Error ? error.message : error);
    return { data: null, status: 'error' };
  }
}

/**
 * Convenience helper returning just CorePropertySpecs or null.
 */
export async function fetchRentCastProperty(
  addressOrCoords: { address?: string; lat?: number; lng?: number }
): Promise<CorePropertySpecs | null> {
  const result = await fetchRentCastPropertyDetailed(addressOrCoords);
  return result.data;
}
