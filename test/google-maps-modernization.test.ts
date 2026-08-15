import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOGLE_MAPS_MAP_ID, googleMapAppearance } from '../src/lib/maps-loader';

const MAP_FILES = [
  'src/components/lead-radius-map.tsx',
  'src/components/pin-map.tsx',
  'src/app/dashboard/clients/ClientsMap.tsx',
  'src/app/dashboard/quick-stops/QuickStopCoverageMap.tsx',
  'src/app/dashboard/recurring/RecurringMap.tsx',
  'src/app/dashboard/schedule/plan/RouteMap.tsx',
];

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Google Maps modernization', () => {
  it('returns the map ID and requested initialization-only color scheme', () => {
    expect(GOOGLE_MAPS_MAP_ID).toBeTruthy();
    expect(googleMapAppearance('dark')).toEqual({
      mapId: GOOGLE_MAPS_MAP_ID,
      colorScheme: 'DARK',
    });
    expect(googleMapAppearance('light')).toEqual({
      mapId: GOOGLE_MAPS_MAP_ID,
      colorScheme: 'LIGHT',
    });
  });

  it('keeps every rendered map on the shared production map ID', () => {
    for (const path of MAP_FILES) {
      expect(source(path), path).toContain('googleMapAppearance(');
    }
    expect(source('src/lib/maps-loader.ts')).toContain('dcb10bb04a8ee6d4b12bca2a');
  });

  it('does not combine inline JSON styles with a map ID', () => {
    for (const path of MAP_FILES) {
      expect(source(path), path).not.toMatch(/\bstyles\s*:/);
    }
  });

  it('does not recreate deprecated Marker instances', () => {
    const mapsSource = MAP_FILES.map(source).join('\n');
    expect(mapsSource).not.toMatch(/\bgoogle\.maps\.Marker\b/);
    expect(mapsSource).not.toMatch(/\b(?:google\.maps|window\.google\.maps|g|markerLibrary)\.Marker\s*\(/);
  });

  it('uses the current Routes API instead of the deprecated Directions service', () => {
    const routeMap = source('src/app/dashboard/schedule/plan/RouteMap.tsx');
    expect(routeMap).toContain('Route.computeRoutes(');
    expect(routeMap).toContain("fields: ['legs']");
    expect(routeMap).toContain("code === 'PERMISSION_DENIED'");
    expect(routeMap).not.toContain('DirectionsService');
  });
});
