import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const LIVE_MAP_TSX = read('src', 'app', 'dashboard', 'crew', 'LiveCrewMap.tsx');
const CREW_PAGE_TSX = read('src', 'app', 'dashboard', 'crew', 'page.tsx');
const LOCATION_API_TS = read('src', 'app', 'api', 'field', 'location', 'route.ts');
const FIELD_CLOCK_TSX = read('src', 'app', 'field', 'jobs', '[id]', 'FieldClock.tsx');
const CREW_ROSTER_TSX = read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx');
const CREW_ACTIONS_TS = read('src', 'app', 'dashboard', 'crew', 'actions.ts');
const TRACKER_HOOK_TS = read('src', 'hooks', 'use-work-location-tracker.ts');

describe('Live Crew Map truth and correctness', () => {
  it('has removed fake sample technicians fallback from production code', () => {
    expect(LIVE_MAP_TSX).not.toContain('SAMPLE_TECHNICIANS');
    expect(LIVE_MAP_TSX).not.toContain('Lead Plumber');
    expect(LIVE_MAP_TSX).not.toContain('Jake Martinez');
    expect(LIVE_MAP_TSX).not.toContain('Water Heater Replacement');
  });

  it('loads real mapSnapshot when tab is map in crew page.tsx', () => {
    expect(CREW_PAGE_TSX).toMatch(/tab === 'map'[\s\S]*?loadCrewLocationMapSnapshot/);
    expect(CREW_PAGE_TSX).toContain('initialSnapshot={mapSnapshot}');
  });

  it('removes hardcoded elapsed hours, distance, and rates from page.tsx', () => {
    expect(CREW_PAGE_TSX).not.toContain('elapsedHours: shift ? 3.5 : 0');
    expect(CREW_PAGE_TSX).not.toContain('hourlyRate: 35');
    expect(CREW_PAGE_TSX).not.toContain('distanceFromSiteFeet: isOnSite ? (isOffSite ? 3200 : 45) : null');
  });

  it('strictly gates labor cost and hourly rates behind canViewPay', () => {
    expect(LIVE_MAP_TSX).toContain('canViewPay && selectedTechnician.hourlyRate');
    expect(CREW_PAGE_TSX).toMatch(/loadCrewLocationMapSnapshot\([^)]*canViewPay/);
  });

  it('includes interactive map controls: satellite toggle, fit-all, and geocoding', () => {
    expect(LIVE_MAP_TSX).toContain('toggleMapType');
    expect(LIVE_MAP_TSX).toContain('fitAllCrew');
    expect(LIVE_MAP_TSX).toContain('handleGeocodeJob');
    expect(CREW_ACTIONS_TS).toContain('geocodeJobAction');
  });
});

describe('Roster worker privacy and permissions', () => {
  it('includes canShareWorkLocation permission in roster edit form and action', () => {
    expect(CREW_ROSTER_TSX).toContain('canShareWorkLocation');
    expect(CREW_ACTIONS_TS).toContain('canShareWorkLocation: formData.get(\'canShareWorkLocation\') === \'on\'');
  });
});

describe('Field telemetry and device optimizations', () => {
  it('ingestion route handler authenticates and validates coordinates', () => {
    expect(LOCATION_API_TS).toContain('loadCrewContext()');
    expect(LOCATION_API_TS).toContain('lat < -90 || lat > 90');
    expect(LOCATION_API_TS).toContain('crew_location_state');
    expect(LOCATION_API_TS).toContain('account:${accountId}:crew-locations');
  });

  it('field clock integrates GPS acquisition, geofence verification, and pre-clock badge', () => {
    expect(FIELD_CLOCK_TSX).toContain('useWorkLocationTracker');
    expect(FIELD_CLOCK_TSX).toContain('verifyGeofenceClockIn');
    expect(FIELD_CLOCK_TSX).toContain('acquireLocation');
    expect(FIELD_CLOCK_TSX).toContain('Work location sharing active');
    expect(FIELD_CLOCK_TSX).toContain('offSiteReason');
  });

  it('tracker hook incorporates wakeLock and adaptive motion throttling', () => {
    expect(TRACKER_HOOK_TS).toContain('wakeLock');
    expect(TRACKER_HOOK_TS).toContain('targetHeartbeatMs');
    expect(TRACKER_HOOK_TS).toContain('targetMinMoveMeters');
  });
});
