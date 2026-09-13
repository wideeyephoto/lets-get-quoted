/**
 * Quick Stop Emergency Logistics, Geo Routing & Exclusions Test
 *
 * Targets:
 *   - src/lib/quick-stop-exclusions.ts (screenHardExclusions: gas leaks, CO alarms,
 *     fire, electrical hazard, flooding, structural damage, hazardous materials,
 *     scope-size exclusions)
 *   - src/lib/quick-stop-zones-data.ts (loadPriorityZones, numeric string parsing,
 *     table existence checks with priorityZonesAvailable)
 *   - src/lib/quick-stop-route.ts (loadMultiDayRouteStops, loadRouteStops,
 *     computeQuickStopRoute, lastKnownWorkPoint)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  driveDistances: vi.fn(),
}));

vi.mock('@/lib/drive-time', () => ({
  driveDistances: mocks.driveDistances,
}));

import {
  screenHardExclusions,
  QUICK_STOP_EXCLUSIONS,
} from '@/lib/quick-stop-exclusions';

import {
  loadPriorityZones,
  priorityZonesAvailable,
} from '@/lib/quick-stop-zones-data';

import {
  loadMultiDayRouteStops,
  loadRouteStops,
  computeQuickStopRoute,
  lastKnownWorkPoint,
} from '@/lib/quick-stop-route';

describe('Quick Stop Emergency Logistics & Geo Routing', () => {
  function createMockSupabase(data: any = null, error: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data, error }),
      maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      then: (resolve: any) => Promise.resolve({ data, error }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. quick-stop-exclusions: Safety & Scope screening
  // ───────────────────────────────────────────────────────────────────────────

  describe('quick-stop-exclusions — screenHardExclusions', () => {
    it('detects emergency gas smell and returns life safety copy', () => {
      const result = screenHardExclusions('I smell gas in the basement near the furnace');

      expect(result.unsafe).toBe(true);
      expect(result.labels).toContain('Possible gas leak');
      expect(result.safety).toContain('treat it as an emergency');
    });

    it('detects carbon monoxide alarm activations', () => {
      const result = screenHardExclusions('Our CO detector beeping continuously');

      expect(result.unsafe).toBe(true);
      expect(result.labels).toContain('Carbon monoxide concern');
      expect(result.safety).toContain('fresh air immediately');
    });

    it('detects electrical sparks and live wire hazards', () => {
      const result = screenHardExclusions('Outlet started sparking when plugging in microwave');

      expect(result.unsafe).toBe(true);
      expect(result.labels).toContain('Active electrical hazard');
      expect(result.safety).toContain('shut the power off at the breaker');
    });

    it('detects active uncontrolled flooding', () => {
      const result = screenHardExclusions('Water pouring through ceiling from bathroom upstairs');

      expect(result.unsafe).toBe(true);
      expect(result.labels).toContain('Uncontrolled flooding');
      expect(result.safety).toContain('shut off the water at the main');
    });

    it('detects non-unsafe scope exclusions (large replacements, permits, excavation)', () => {
      const result = screenHardExclusions('We need to dig a trench to replace whole-house sewer line');

      expect(result.unsafe).toBe(false);
      expect(result.safety).toBeNull();
      expect(result.labels).toContain('Excavation');
      expect(result.labels).toContain('Large replacement');
    });

    it('returns empty matched list for safe, scoped quick repairs', () => {
      const result = screenHardExclusions('Fix leaking bathroom sink faucet cartridge');

      expect(result.matched).toEqual([]);
      expect(result.unsafe).toBe(false);
      expect(result.safety).toBeNull();
      expect(result.labels).toEqual([]);
    });

    it('handles null, undefined, or non-string inputs defensively', () => {
      expect(screenHardExclusions(null as any).matched).toEqual([]);
      expect(screenHardExclusions(undefined as any).matched).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. quick-stop-zones-data: priority zones
  // ───────────────────────────────────────────────────────────────────────────

  describe('quick-stop-zones-data — priority zones', () => {
    it('loadPriorityZones parses numeric string columns from PostgREST', async () => {
      const rawRows = [
        {
          id: 'zone-1',
          label: 'Downtown Core',
          center_lat: '32.7767',
          center_lng: '-96.7970',
          radius_miles: '7.5',
          max_detour_miles: '10',
        },
        {
          id: 'zone-corrupt',
          label: 'Corrupted Center',
          center_lat: 'invalid_lat',
          center_lng: '-96.0',
          radius_miles: '5',
          max_detour_miles: '5',
        },
      ];

      const client = createMockSupabase(rawRows);
      const zones = await loadPriorityZones(client, 'acc-1');

      expect(zones).toHaveLength(1);
      expect(zones[0].id).toBe('zone-1');
      expect(zones[0].label).toBe('Downtown Core');
      expect(zones[0].centerLat).toBe(32.7767);
      expect(zones[0].centerLng).toBe(-96.7970);
      expect(zones[0].radiusMiles).toBe(7.5);
      expect(zones[0].maxDetourMiles).toBe(10);
    });

    it('loadPriorityZones returns empty array on database query failure', async () => {
      const client = createMockSupabase(null, { message: 'table quick_stop_priority_zones missing' });
      const zones = await loadPriorityZones(client, 'acc-1');
      expect(zones).toEqual([]);
    });

    it('priorityZonesAvailable detects whether database migration exists', async () => {
      const clientHealthy = createMockSupabase({ count: 2 });
      expect(await priorityZonesAvailable(clientHealthy, 'acc-1')).toBe(true);

      const clientMissing = createMockSupabase(null, { code: '42P01', message: 'relation does not exist' });
      expect(await priorityZonesAvailable(clientMissing, 'acc-1')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. quick-stop-route: multi-day and single-day stops
  // ───────────────────────────────────────────────────────────────────────────

  describe('quick-stop-route — route stops and detours', () => {
    it('loadMultiDayRouteStops groups geocoded stops by date key', async () => {
      const jobRows = [
        {
          scheduled_for: '2026-06-15',
          scheduled_time: '09:00',
          lat: 32.77,
          lng: -96.79,
          status: 'in_progress',
          scope: 'Fix toilet',
          client_name: 'Bob',
          estimated_hours: 1.5,
        },
        {
          scheduled_for: '2026-06-15',
          scheduled_time: '13:00',
          lat: 32.80,
          lng: -96.82,
          status: 'in_progress',
          scope: 'Water heater',
          client_name: 'Sue',
          estimated_hours: 2,
        },
        {
          scheduled_for: '2026-06-16',
          scheduled_time: '10:00',
          lat: 32.85,
          lng: -96.75,
          status: 'in_progress',
          scope: 'AC check',
          client_name: 'Dan',
          estimated_hours: 1,
        },
      ];

      const client = createMockSupabase(jobRows);
      const multiDay = await loadMultiDayRouteStops(client, 'acc-1', {
        days: ['2026-06-15', '2026-06-16', '2026-06-17'],
        timezone: 'America/Chicago',
      });

      expect(multiDay['2026-06-15']).toHaveLength(2);
      expect(multiDay['2026-06-15'][0].timeLabel).toBe('9:00 AM');
      expect(multiDay['2026-06-15'][1].timeLabel).toBe('1:00 PM');
      expect(multiDay['2026-06-16']).toHaveLength(1);
      expect(multiDay['2026-06-17']).toEqual([]);
    });

    it('loadRouteStops extracts stops in chronological order', async () => {
      const jobRows = [
        {
          scheduled_time: '14:30',
          lat: 32.77,
          lng: -96.79,
          scope: 'Pipe inspection',
          client_name: 'Carol',
          estimated_hours: 1,
        },
      ];

      const client = createMockSupabase(jobRows);
      const stops = await loadRouteStops(client, 'acc-1', {
        day: '2026-06-15',
        timezone: 'America/Chicago',
      });

      expect(stops).toHaveLength(1);
      expect(stops[0].timeLabel).toBe('2:30 PM');
      expect(stops[0].lat).toBe(32.77);
      expect(stops[0].clientName).toBe('Carol');
    });

    it('computeQuickStopRoute calculates detour from closest daily stop', async () => {
      const scheduledJobs = [
        {
          scheduled_time: '10:00',
          lat: 32.7767,
          lng: -96.7970, // Dallas Downtown
          status: 'scheduled',
        },
      ];

      const client = createMockSupabase(scheduledJobs);
      const targetCoord = { lat: 32.7850, lng: -96.8000 }; // ~0.6 miles away

      const route = await computeQuickStopRoute(client, 'acc-1', targetCoord, {
        arrivalDate: '2026-06-15',
        visitMinutes: 30,
        driveTime: false,
        timezone: 'America/Chicago',
      });

      expect(route.detourMiles).toBeDefined();
      expect(route.detourMiles).toBeLessThan(5);
      expect(route.anchorLabel).toContain('10:00 AM stop');
      expect(route.routeExtensionMinutes).toBeGreaterThan(30);
      expect(route.recommendedStart).toBeDefined();
      expect(route.recommendedEnd).toBeDefined();
    });

    it('computeQuickStopRoute falls back to business home base when no scheduled stops exist', async () => {
      // First query: jobs -> empty
      // Second query: accounts -> service center coord
      const client = createMockSupabase();
      client.maybeSingle.mockResolvedValueOnce({
        data: { service_center_lat: 32.7767, service_center_lng: -96.7970 },
        error: null,
      });

      const targetCoord = { lat: 32.7850, lng: -96.8000 };
      const route = await computeQuickStopRoute(client, 'acc-1', targetCoord, {
        arrivalDate: '2026-06-15',
        visitMinutes: 45,
        driveTime: false,
        timezone: 'America/Chicago',
      });

      expect(route.anchorLabel).toBe('your home base');
      expect(route.detourMiles).toBeDefined();
    });

    it('computeQuickStopRoute returns empty structure if target is null', async () => {
      const client = createMockSupabase();
      const route = await computeQuickStopRoute(client, 'acc-1', null, {
        driveTime: false,
        timezone: 'America/Chicago',
      });

      expect(route.detourMiles).toBeNull();
      expect(route.anchorLabel).toBeNull();
    });

    it('lastKnownWorkPoint returns most recent geocoded job location', async () => {
      const recentJob = [{ lat: '32.7800', lng: '-96.8050', created_at: '2026-06-01' }];
      const client = createMockSupabase(recentJob);

      const point = await lastKnownWorkPoint(client, 'acc-1');
      expect(point).toEqual({ lat: 32.78, lng: -96.805 });

      const clientEmpty = createMockSupabase([]);
      expect(await lastKnownWorkPoint(clientEmpty, 'acc-1')).toBeNull();
    });
  });
});
