import { describe, expect, it } from 'vitest';
import {
  describeGeofenceDistance,
  haversineFeet,
  verifyGeofenceClockIn,
  formatGpsAccuracy,
  formatHeading,
  formatSpeedMph,
  metersToFeet,
  feetToMeters,
  DEFAULT_GEOFENCE_RADIUS_FT,
} from '@/lib/crew-geofence';
import type { LatLng } from '@/lib/distance';

describe('haversineFeet', () => {
  it('calculates distance in feet between coordinate pairs accurately', () => {
    const jobSite: LatLng = { lat: 40.7312, lng: -74.2731 };
    // A point ~120 ft away
    const techOnSite: LatLng = { lat: 40.7315, lng: -74.2731 };

    const feet = haversineFeet(jobSite, techOnSite);
    expect(feet).toBeGreaterThan(50);
    expect(feet).toBeLessThan(200);
  });
});

describe('verifyGeofenceClockIn', () => {
  const jobSite: LatLng = { lat: 40.7312, lng: -74.2731 };

  it('verifies on-site clock in within 200 ft radius', () => {
    const techNearby: LatLng = { lat: 40.7313, lng: -74.2731 }; // ~36 ft away
    const result = verifyGeofenceClockIn({
      technicianCoord: techNearby,
      jobSiteCoord: jobSite,
      accuracyMeters: 10,
    });

    expect(result.status).toBe('verified_on_site');
    expect(result.isWithinGeofence).toBe(true);
    expect(result.badgeTone).toBe('success');
    expect(result.badgeLabel).toContain('Verified on site');
    expect(result.distanceFeet).toBeLessThanOrEqual(DEFAULT_GEOFENCE_RADIUS_FT);
  });

  it('honors hysteresis when previously verified on site', () => {
    // A technician at ~240 ft (past 200 ft but within 300 ft exit buffer)
    const techInHysteresis: LatLng = { lat: 40.7318, lng: -74.2731 };
    const distanceFt = haversineFeet(techInHysteresis, jobSite);
    expect(distanceFt).toBeGreaterThan(200);
    expect(distanceFt).toBeLessThan(300);

    // Without previous verification => off-site or uncertain
    const freshResult = verifyGeofenceClockIn({
      technicianCoord: techInHysteresis,
      jobSiteCoord: jobSite,
      accuracyMeters: 5,
      previousOnSite: false,
    });
    expect(freshResult.status).toBe('off_site_warning');

    // With previous verification => retains on-site within 300 ft buffer
    const hysteresisResult = verifyGeofenceClockIn({
      technicianCoord: techInHysteresis,
      jobSiteCoord: jobSite,
      accuracyMeters: 5,
      previousOnSite: true,
    });
    expect(hysteresisResult.status).toBe('verified_on_site');
  });

  it('detects location uncertainty when error radius overlaps boundary', () => {
    // Technician at 260 ft away with ±25m (±82ft) accuracy
    const techNearEdge: LatLng = { lat: 40.7319, lng: -74.2731 };
    const result = verifyGeofenceClockIn({
      technicianCoord: techNearEdge,
      jobSiteCoord: jobSite,
      accuracyMeters: 25,
      previousOnSite: false,
    });

    expect(result.status).toBe('location_uncertain');
    expect(result.badgeLabel).toContain('uncertain');
    expect(result.badgeTone).toBe('warn');
  });

  it('handles jobs missing coordinates as job_not_mapped', () => {
    const techNearby: LatLng = { lat: 40.7313, lng: -74.2731 };
    const result = verifyGeofenceClockIn({
      technicianCoord: techNearby,
      jobSiteCoord: null,
    });

    expect(result.status).toBe('job_not_mapped');
    expect(result.badgeLabel).toBe('Job not mapped');
  });

  it('flags off-site warning when technician is far from job location', () => {
    const techFarAway: LatLng = { lat: 40.7450, lng: -74.2731 }; // ~5000 ft away (~1 mile)
    const result = verifyGeofenceClockIn({
      technicianCoord: techFarAway,
      jobSiteCoord: jobSite,
      accuracyMeters: 15,
    });

    expect(result.status).toBe('off_site_warning');
    expect(result.isWithinGeofence).toBe(false);
    expect(result.badgeTone).toBe('warn');
    expect(result.badgeLabel).toContain('Off-site');
    expect(result.distanceFeet).toBeGreaterThan(DEFAULT_GEOFENCE_RADIUS_FT);
    expect(result.auditNote).toContain('Off-site clock-in warning');
  });

  it('handles poor GPS accuracy gracefully', () => {
    const techNearby: LatLng = { lat: 40.7313, lng: -74.2731 };
    const result = verifyGeofenceClockIn({
      technicianCoord: techNearby,
      jobSiteCoord: jobSite,
      accuracyMeters: 250, // >150m accuracy threshold
    });

    expect(result.status).toBe('accuracy_too_low');
    expect(result.isWithinGeofence).toBe(false);
    expect(result.badgeTone).toBe('warn');
    expect(result.badgeLabel).toBe('Low GPS Accuracy');
  });

  it('handles missing GPS coordinates without throwing', () => {
    const result = verifyGeofenceClockIn({
      technicianCoord: null,
      jobSiteCoord: jobSite,
    });

    expect(result.status).toBe('coordinates_missing');
    expect(result.isWithinGeofence).toBe(false);
    expect(result.badgeTone).toBe('neutral');
    expect(result.badgeLabel).toBe('No GPS data');
  });
});

describe('formatting and conversion helpers', () => {
  it('formats distance in feet and miles', () => {
    expect(describeGeofenceDistance(85)).toBe('85 ft');
    expect(describeGeofenceDistance(5280)).toBe('1.0 mi');
    expect(describeGeofenceDistance(10560)).toBe('2.0 mi');
  });

  it('formats accuracy, heading, and speed', () => {
    expect(formatGpsAccuracy(10)).toBe('±10m (±33ft)');
    expect(formatHeading(0)).toBe('N');
    expect(formatHeading(90)).toBe('E');
    expect(formatHeading(180)).toBe('S');
    expect(formatHeading(270)).toBe('W');
    expect(formatSpeedMph(0)).toBe('Stationary');
    expect(formatSpeedMph(10)).toBe('22 mph');
  });

  it('converts meters to feet and vice versa', () => {
    expect(metersToFeet(10)).toBe(33);
    expect(Math.round(feetToMeters(32.8084))).toBe(10);
  });
});
