import { haversineMiles, type LatLng } from '@/lib/distance';

export const DEFAULT_GEOFENCE_RADIUS_FT = 200;
export const FEET_PER_MILE = 5280;
export const FEET_PER_METER = 3.28084;
export const MAX_ACCEPTABLE_ACCURACY_M = 150; // meters (~492 ft)

export type GeofenceStatus =
  | 'verified_on_site'
  | 'off_site_warning'
  | 'coordinates_missing'
  | 'accuracy_too_low';

export type GeofenceVerificationResult = {
  status: GeofenceStatus;
  distanceFeet: number | null;
  distanceMiles: number | null;
  isWithinGeofence: boolean;
  radiusFeet: number;
  badgeLabel: string;
  badgeTone: 'success' | 'warn' | 'neutral';
  auditNote: string;
};

/**
 * Calculates straight-line distance in feet between two lat/lng coordinates.
 */
export function haversineFeet(a: LatLng, b: LatLng): number {
  const miles = haversineMiles(a, b);
  return Math.round(miles * FEET_PER_MILE);
}

/**
 * Formats a distance in feet or miles for human readability.
 */
export function describeGeofenceDistance(feet: number): string {
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = feet / FEET_PER_MILE;
  return `${miles.toFixed(1)} mi`;
}

/**
 * Evaluates whether a field technician is within the authorized geofence radius of a job site.
 */
export function verifyGeofenceClockIn(params: {
  technicianCoord?: LatLng | null;
  jobSiteCoord?: LatLng | null;
  accuracyMeters?: number | null;
  radiusFeet?: number;
}): GeofenceVerificationResult {
  const radius = params.radiusFeet && params.radiusFeet > 0
    ? params.radiusFeet
    : DEFAULT_GEOFENCE_RADIUS_FT;

  if (!params.technicianCoord || !params.jobSiteCoord) {
    return {
      status: 'coordinates_missing',
      distanceFeet: null,
      distanceMiles: null,
      isWithinGeofence: false,
      radiusFeet: radius,
      badgeLabel: 'No GPS data',
      badgeTone: 'neutral',
      auditNote: 'Clock-in without GPS coordinates (location permission disabled or job address unpinned).',
    };
  }

  // Check GPS signal accuracy
  if (params.accuracyMeters && params.accuracyMeters > MAX_ACCEPTABLE_ACCURACY_M) {
    return {
      status: 'accuracy_too_low',
      distanceFeet: null,
      distanceMiles: null,
      isWithinGeofence: false,
      radiusFeet: radius,
      badgeLabel: 'Low GPS Accuracy',
      badgeTone: 'warn',
      auditNote: `GPS accuracy too low (${Math.round(params.accuracyMeters)}m). Could not reliably verify proximity.`,
    };
  }

  const distanceFt = haversineFeet(params.technicianCoord, params.jobSiteCoord);
  const distanceMi = Math.round((distanceFt / FEET_PER_MILE) * 100) / 100;
  const isWithin = distanceFt <= radius;

  if (isWithin) {
    return {
      status: 'verified_on_site',
      distanceFeet: distanceFt,
      distanceMiles: distanceMi,
      isWithinGeofence: true,
      radiusFeet: radius,
      badgeLabel: `📍 Verified on site (${describeGeofenceDistance(distanceFt)})`,
      badgeTone: 'success',
      auditNote: `Verified on-site: Clocked in within ${distanceFt} ft of property (authorized geofence: ${radius} ft).`,
    };
  }

  return {
    status: 'off_site_warning',
    distanceFeet: distanceFt,
    distanceMiles: distanceMi,
    isWithinGeofence: false,
    radiusFeet: radius,
    badgeLabel: `⚠️ Off-site (${describeGeofenceDistance(distanceFt)})`,
    badgeTone: 'warn',
    auditNote: `Off-site clock-in warning: Technician was ${describeGeofenceDistance(distanceFt)} from job site (authorized radius: ${radius} ft).`,
  };
}
