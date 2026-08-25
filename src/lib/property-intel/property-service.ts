// Unified Property Intelligence Service
import { geocodeAddress } from '@/lib/geocode';
import { fetchSolarBuildingInsights } from './google-solar';
import { checkStreetViewAvailability, getSatelliteStaticImageUrl } from './google-streetview';
import { fetchRentCastProperty } from './rentcast';
import type { PropertyIntelligence, PropertyIntelligenceSummary } from './types';

export type PropertyLocationInput =
  | { address: string; lat?: number; lng?: number }
  | { address?: string; lat: number; lng: number };

// In-memory LRU/TTL cache to avoid redundant API billing within the same server instance
type CachedEntry = {
  data: PropertyIntelligence;
  expiresAt: number;
};

const PROPERTY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 500;
const memoryCache = new Map<string, CachedEntry>();

function normalizeAddressKey(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCacheKey(address: string, lat?: number, lng?: number): string {
  if (address) {
    return `addr:${normalizeAddressKey(address)}`;
  }
  if (lat != null && lng != null) {
    return `geo:${lat.toFixed(5)},${lng.toFixed(5)}`;
  }
  return '';
}

/**
 * Fetches comprehensive property intelligence:
 * 1. Google Solar (Roof geometry, pitch, squares, sunshine hours)
 * 2. Google Street View & Satellite (Front-of-house and top-down ortho visual)
 * 3. RentCast (Year built, interior sq ft, lot size, beds/baths, stories, mechanicals)
 *
 * Results are cached in-memory for 1 hour to prevent redundant Google/RentCast billing.
 */
export async function getPropertyIntelligence(
  input: PropertyLocationInput
): Promise<PropertyIntelligence | null> {
  let lat = input.lat;
  let lng = input.lng;
  const address = (input.address ?? '').trim();

  const cacheKey = getCacheKey(address, lat, lng);
  if (cacheKey && memoryCache.has(cacheKey)) {
    const entry = memoryCache.get(cacheKey)!;
    if (Date.now() < entry.expiresAt) {
      return entry.data;
    }
    memoryCache.delete(cacheKey);
  }

  // If coordinates are not provided, geocode the address
  if (lat == null || lng == null) {
    if (!address) return null;
    const geo = await geocodeAddress(address);
    if (!geo) return null;
    lat = geo.lat;
    lng = geo.lng;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  // Parallel fetch Solar insights, Street View, Satellite, and RentCast property specs
  const [roof, streetView, satellite, specs] = await Promise.all([
    fetchSolarBuildingInsights(lat, lng),
    checkStreetViewAvailability(lat, lng),
    Promise.resolve(getSatelliteStaticImageUrl(lat, lng)),
    fetchRentCastProperty({ address, lat, lng }),
  ]);

  const result: PropertyIntelligence = {
    address,
    lat,
    lng,
    streetView,
    satellite,
    roof,
    specs,
    hasSolarCoverage: Boolean(roof),
    hasSpecs: Boolean(specs),
  };

  // Cache result if valid key
  if (cacheKey) {
    if (memoryCache.size >= MAX_CACHE_ENTRIES) {
      // Evict oldest entry
      const firstKey = memoryCache.keys().next().value;
      if (firstKey) memoryCache.delete(firstKey);
    }
    memoryCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + PROPERTY_CACHE_TTL_MS,
    });
  }

  return result;
}

/**
 * Extracts a concise summary of property specs for AI prompt context, crew briefing, or badges.
 */
export function summarizePropertyIntelligence(
  intel: PropertyIntelligence | null
): PropertyIntelligenceSummary | null {
  if (!intel) return null;

  const summary: PropertyIntelligenceSummary = {};

  if (intel.roof) {
    summary.roofingSquares = intel.roof.roofingSquares;
    summary.totalRoofAreaSqFt = intel.roof.totalAreaSqFt;
    summary.groundFootprintSqFt = intel.roof.groundAreaSqFt;
    summary.dominantPitch = intel.roof.dominantPitchRatio;
    summary.isSteep = intel.roof.isSteep;
    summary.complexityLabel = intel.roof.complexityLabel;
    summary.solarPanelCapacity = intel.roof.solarPotentialPanels;
  }

  if (intel.specs) {
    if (intel.specs.yearBuilt) {
      summary.yearBuilt = intel.specs.yearBuilt;
      summary.isPre1978LeadRisk = intel.specs.yearBuilt < 1978;
    }
    if (intel.specs.squareFootage) {
      summary.livingAreaSqFt = intel.specs.squareFootage;
    }
    if (intel.specs.lotSizeAcres) {
      summary.lotSizeAcres = intel.specs.lotSizeAcres;
    }
    if (intel.specs.lotSizeSqFt) {
      summary.lotSizeSqFt = intel.specs.lotSizeSqFt;
    }
    if (intel.specs.stories) {
      summary.stories = intel.specs.stories;
    }
    if (intel.specs.bedrooms) {
      summary.bedrooms = intel.specs.bedrooms;
    }
    if (intel.specs.bathrooms) {
      summary.bathrooms = intel.specs.bathrooms;
    }
    if (typeof intel.specs.ownerOccupied === 'boolean') {
      summary.ownerOccupied = intel.specs.ownerOccupied;
    }
    if (intel.specs.heatingFuel) {
      summary.heatingFuel = intel.specs.heatingFuel;
    }
    if (intel.specs.foundationType) {
      summary.foundationType = intel.specs.foundationType;
    }
    if (typeof intel.specs.hasPool === 'boolean') {
      summary.hasPool = intel.specs.hasPool;
    }
    if (intel.specs.propertyType) {
      summary.propertyType = intel.specs.propertyType;
    }
  }

  return Object.keys(summary).length > 0 ? summary : null;
}
