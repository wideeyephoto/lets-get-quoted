import { describe, expect, it } from 'vitest';
import {
  describeGeofenceDistance,
  haversineFeet,
  verifyGeofenceClockIn,
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

describe('describeGeofenceDistance', () => {
  it('formats under 1000 ft as feet and above 1000 ft as miles', () => {
    expect(describeGeofenceDistance(85)).toBe('85 ft');
    expect(describeGeofenceDistance(5280)).toBe('1.0 mi');
    expect(describeGeofenceDistance(10560)).toBe('2.0 mi');
  });
});
