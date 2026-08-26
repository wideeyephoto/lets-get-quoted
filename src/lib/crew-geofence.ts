import { haversineMiles, type LatLng } from '@/lib/distance';

export const DEFAULT_GEOFENCE_RADIUS_FT = 200;
export const DEFAULT_GEOFENCE_EXIT_RADIUS_FT = 300; // Hysteresis buffer to avoid boundary flicker
export const FEET_PER_MILE = 5280;
export const FEET_PER_METER = 3.28084;
export const MAX_ACCEPTABLE_ACCURACY_M = 150; // meters (~492 ft)

export type GeofenceStatus =
  | 'verified_on_site'
  | 'off_site_warning'
  | 'location_uncertain'
  | 'coordinates_missing'
  | 'accuracy_too_low'
  | 'job_not_mapped';

export type GeofenceVerificationResult = {
  status: GeofenceStatus;
  distanceFeet: number | null;
  distanceMiles: number | null;
  accuracyFeet: number | null;
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

export function metersToFeet(meters: number): number {
  return Math.round(meters * FEET_PER_METER);
}

export function feetToMeters(feet: number): number {
  return feet / FEET_PER_METER;
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
 * Formats GPS accuracy in meters/feet.
 */
export function formatGpsAccuracy(accuracyMeters: number | null | undefined): string {
  if (accuracyMeters == null || !Number.isFinite(accuracyMeters)) return 'GPS accuracy unknown';
  const ft = Math.round(metersToFeet(accuracyMeters));
  return `±${Math.round(accuracyMeters)}m (±${ft}ft)`;
}

/**
 * Formats device heading to compass direction (N, NE, E, etc.).
 */
export function formatHeading(headingDeg: number | null | undefined): string {
  if (headingDeg == null || !Number.isFinite(headingDeg) || headingDeg < 0) return '';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(headingDeg / 45) % 8;
  return directions[index] || '';
}

/**
 * Formats speed in meters/second to mph.
 */
export function formatSpeedMph(speedMps: number | null | undefined): string {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps <= 0.5) return 'Stationary';
  const mph = Math.round(speedMps * 2.23694);
  return `${mph} mph`;
}

/**
 * Evaluates whether a field technician is within the authorized geofence radius of a job site,
 * incorporating GPS accuracy uncertainty bounds and hysteresis rules.
 */
export function verifyGeofenceClockIn(params: {
  technicianCoord?: LatLng | null;
  jobSiteCoord?: LatLng | null;
  accuracyMeters?: number | null;
  radiusFeet?: number;
  previousOnSite?: boolean;
}): GeofenceVerificationResult {
  const radius = params.radiusFeet && params.radiusFeet > 0
    ? params.radiusFeet
    : DEFAULT_GEOFENCE_RADIUS_FT;

  if (!params.technicianCoord) {
    return {
      status: 'coordinates_missing',
      distanceFeet: null,
      distanceMiles: null,
      accuracyFeet: null,
      isWithinGeofence: false,
      radiusFeet: radius,
      badgeLabel: 'No GPS data',
      badgeTone: 'neutral',
      auditNote: 'Clock-in without GPS coordinates (location permission disabled or device offline).',
    };
  }

  if (!params.jobSiteCoord || params.jobSiteCoord.lat == null || params.jobSiteCoord.lng == null) {
    return {
      status: 'job_not_mapped',
      distanceFeet: null,
      distanceMiles: null,
      accuracyFeet: params.accuracyMeters != null ? metersToFeet(params.accuracyMeters) : null,
      isWithinGeofence: false,
      radiusFeet: radius,
      badgeLabel: 'Job not mapped',
      badgeTone: 'neutral',
      auditNote: 'Job site address does not have geographic coordinates pinned.',
    };
  }

  const accuracyM = params.accuracyMeters ?? 0;
  const accuracyFt = metersToFeet(accuracyM);

  // Check GPS signal accuracy threshold
  if (accuracyM > MAX_ACCEPTABLE_ACCURACY_M) {
    return {
      status: 'accuracy_too_low',
      distanceFeet: null,
      distanceMiles: null,
      accuracyFeet: accuracyFt,
      isWithinGeofence: false,
      radiusFeet: radius,
      badgeLabel: 'Low GPS Accuracy',
      badgeTone: 'warn',
      auditNote: `GPS accuracy too low (${Math.round(accuracyM)}m / ${accuracyFt}ft). Proximity could not be verified reliably.`,
    };
  }

  const distanceFt = haversineFeet(params.technicianCoord, params.jobSiteCoord);
  const distanceMi = Math.round((distanceFt / FEET_PER_MILE) * 100) / 100;

  // Hysteresis calculation: if previously verified on site, allow exit radius before marking off site
  const effectiveRadius = params.previousOnSite ? Math.max(radius, DEFAULT_GEOFENCE_EXIT_RADIUS_FT) : radius;

  // Check on-site with accuracy tolerance
  if (distanceFt <= effectiveRadius) {
    return {
      status: 'verified_on_site',
      distanceFeet: distanceFt,
      distanceMiles: distanceMi,
      accuracyFeet: accuracyFt,
      isWithinGeofence: true,
      radiusFeet: radius,
      badgeLabel: `📍 Verified on site (${describeGeofenceDistance(distanceFt)})`,
      badgeTone: 'success',
      auditNote: `Verified on-site: Technician clocked within ${distanceFt} ft of property (authorized geofence: ${radius} ft).`,
    };
  }

  // If distance - accuracy is still inside radius, position is uncertain
  if (accuracyFt > 0 && distanceFt - accuracyFt <= effectiveRadius) {
    return {
      status: 'location_uncertain',
      distanceFeet: distanceFt,
      distanceMiles: distanceMi,
      accuracyFeet: accuracyFt,
      isWithinGeofence: false,
      radiusFeet: radius,
      badgeLabel: `Location uncertain (±${Math.round(accuracyM)}m)`,
      badgeTone: 'warn',
      auditNote: `Technician is ~${describeGeofenceDistance(distanceFt)} away, but accuracy uncertainty (±${accuracyFt}ft) touches the boundary.`,
    };
  }

  return {
    status: 'off_site_warning',
    distanceFeet: distanceFt,
    distanceMiles: distanceMi,
    accuracyFeet: accuracyFt,
    isWithinGeofence: false,
    radiusFeet: radius,
    badgeLabel: `⚠️ Off-site (${describeGeofenceDistance(distanceFt)})`,
    badgeTone: 'warn',
    auditNote: `Off-site clock-in warning: Technician was ${describeGeofenceDistance(distanceFt)} from job site (authorized radius: ${radius} ft).`,
  };
}
