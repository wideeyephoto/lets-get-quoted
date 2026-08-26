// Server-side client for Google Solar API (buildingInsights:findClosest)
import {
  classifyRoofComplexity,
  degreesToCompass,
  isSteepPitch,
  pitchDegreesToRatio,
  sqMetersToSqFt,
  sqFtToRoofingSquares,
} from './pitch-calc';
import type { RoofSegment, RoofStats } from './types';

type SolarBuildingInsightsResponse = {
  name?: string;
  center?: { latitude?: number; longitude?: number };
  imageryDate?: { year?: number; month?: number; day?: number };
  imageryQuality?: string;
  solarPotential?: {
    maxArrayPanelsCount?: number;
    maxArrayAreaMeters2?: number;
    maxSunshineHoursPerYear?: number;
    carbonOffsetFactorKgPerMwh?: number;
    wholeRoofStats?: {
      areaMeters2?: number;
      groundAreaMeters2?: number;
      sunshineQuantiles?: number[];
    };
    roofSegmentStats?: Array<{
      pitchDegrees?: number;
      azimuthDegrees?: number;
      stats?: {
        areaMeters2?: number;
        groundAreaMeters2?: number;
        sunshineQuantiles?: number[];
      };
      planeHeightAtCenterMeters?: number;
    }>;
  };
};

function getApiKey(): string | null {
  return (
    process.env.GOOGLE_SOLAR_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    null
  );
}

export type SolarResult = {
  data: RoofStats | null;
  status: 'ok' | 'forbidden' | 'not_found' | 'unconfigured' | 'error';
};

export async function fetchSolarBuildingInsightsDetailed(
  lat: number,
  lng: number,
  requiredQuality: 'HIGH' | 'MEDIUM' | 'BASE' = 'HIGH'
): Promise<SolarResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { data: null, status: 'unconfigured' };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { data: null, status: 'error' };
  }

  try {
    const url = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest');
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lng));
    url.searchParams.set('requiredQuality', requiredQuality);
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 404) {
      // If HIGH quality wasn't available, try MEDIUM if we haven't already
      if (requiredQuality === 'HIGH') {
        return fetchSolarBuildingInsightsDetailed(lat, lng, 'MEDIUM');
      }
      return { data: null, status: 'not_found' };
    }

    if (res.status === 403) {
      console.warn(`[Google Solar API] 403 Forbidden: Solar API is not authorized/enabled on this API key`);
      return { data: null, status: 'forbidden' };
    }

    if (!res.ok) {
      console.warn(`[Google Solar API] fetch failed with status ${res.status}: ${res.statusText}`);
      return { data: null, status: 'error' };
    }

    const data = (await res.json()) as SolarBuildingInsightsResponse;
    const potential = data.solarPotential;
    const wholeRoof = potential?.wholeRoofStats;

    if (!potential || !wholeRoof) {
      return { data: null, status: 'not_found' };
    }

    const totalAreaSqFt = sqMetersToSqFt(wholeRoof.areaMeters2 ?? 0);
    const groundAreaSqFt = sqMetersToSqFt(wholeRoof.groundAreaMeters2 ?? 0);
    const roofingSquares = sqFtToRoofingSquares(totalAreaSqFt);

    const rawSegments = potential.roofSegmentStats ?? [];
    let dominantPitchDegrees = 0;
    let maxPitchDegrees = 0;
    let largestSegmentArea = 0;

    const segments: RoofSegment[] = rawSegments.map((seg) => {
      const pitchDeg = seg.pitchDegrees ?? 0;
      const azimuthDeg = seg.azimuthDegrees ?? 0;
      const segAreaSqFt = sqMetersToSqFt(seg.stats?.areaMeters2 ?? 0);
      const segGroundSqFt = sqMetersToSqFt(seg.stats?.groundAreaMeters2 ?? 0);

      if (pitchDeg > maxPitchDegrees) {
        maxPitchDegrees = pitchDeg;
      }

      if (segAreaSqFt > largestSegmentArea) {
        largestSegmentArea = segAreaSqFt;
        dominantPitchDegrees = pitchDeg;
      }

      const sunshineQuantiles = seg.stats?.sunshineQuantiles ?? [];
      const medianSunshine = sunshineQuantiles.length >= 6 ? sunshineQuantiles[5] : (potential.maxSunshineHoursPerYear ?? 0);

      return {
        pitchDegrees: Math.round(pitchDeg * 10) / 10,
        pitchRatio: pitchDegreesToRatio(pitchDeg),
        azimuthDegrees: Math.round(azimuthDeg * 10) / 10,
        compassDirection: degreesToCompass(azimuthDeg),
        areaSqFt: segAreaSqFt,
        groundAreaSqFt: segGroundSqFt,
        sunshineHours: Math.round(medianSunshine),
      };
    });

    // If no segments had area, default dominant to max or whole roof
    if (dominantPitchDegrees === 0 && maxPitchDegrees > 0) {
      dominantPitchDegrees = maxPitchDegrees;
    }

    const dominantPitchRatio = pitchDegreesToRatio(dominantPitchDegrees);
    const isSteep = isSteepPitch(dominantPitchDegrees) || isSteepPitch(maxPitchDegrees);
    const { complexity, complexityLabel } = classifyRoofComplexity(segments.length);

    let imageryDate: string | null = null;
    if (data.imageryDate?.year) {
      imageryDate = `${data.imageryDate.year}-${String(data.imageryDate.month ?? 1).padStart(2, '0')}-${String(data.imageryDate.day ?? 1).padStart(2, '0')}`;
    }

    return {
      data: {
        totalAreaSqFt,
        roofingSquares,
        groundAreaSqFt,
        dominantPitchRatio,
        dominantPitchDegrees: Math.round(dominantPitchDegrees * 10) / 10,
        maxPitchDegrees: Math.round(maxPitchDegrees * 10) / 10,
        isSteep,
        complexity,
        complexityLabel,
        segmentCount: segments.length,
        segments,
        maxSunshineHoursPerYear: Math.round(potential.maxSunshineHoursPerYear ?? 0),
        solarPotentialPanels: potential.maxArrayPanelsCount ?? 0,
        imageryDate,
      },
      status: 'ok',
    };
  } catch (error) {
    console.error('[Google Solar API] Error fetching building insights:', error instanceof Error ? error.message : error);
    return { data: null, status: 'error' };
  }
}

/**
 * Convenience helper returning just the RoofStats or null.
 */
export async function fetchSolarBuildingInsights(
  lat: number,
  lng: number,
  requiredQuality: 'HIGH' | 'MEDIUM' | 'BASE' = 'HIGH'
): Promise<RoofStats | null> {
  const result = await fetchSolarBuildingInsightsDetailed(lat, lng, requiredQuality);
  return result.data;
}
