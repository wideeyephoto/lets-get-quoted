import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadPriorityZones, priorityZonesAvailable } from '@/lib/quick-stop-zones-data';

describe('Quick Stop Zones Data Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn(),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };
  });

  describe('loadPriorityZones', () => {
    it('returns empty array on error', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: new Error('db error') }));
      const res = await loadPriorityZones(supabaseMock, 'acct1');
      expect(res).toEqual([]);
    });

    it('returns empty array on throw', async () => {
      queryMock.then = vi.fn((resolve, reject) => reject(new Error('crash')));
      const res = await loadPriorityZones(supabaseMock, 'acct1');
      expect(res).toEqual([]);
    });

    it('filters out invalid numeric columns', async () => {
      queryMock.then = vi.fn((resolve) => resolve({
        data: [
          { id: 'z1', center_lat: 'invalid', center_lng: -80, radius_miles: 5, max_detour_miles: 10 }, // skipped
          { id: 'z2', center_lat: 40, center_lng: -80, radius_miles: 5, max_detour_miles: 10 } // ok
        ],
        error: null
      }));

      const res = await loadPriorityZones(supabaseMock, 'acct1');
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('z2');
    });

    it('parses valid numeric columns and provides defaults', async () => {
      queryMock.then = vi.fn((resolve) => resolve({
        data: [
          { id: 'z1', label: null, center_lat: '40.5', center_lng: '-80.5', radius_miles: '5.5', max_detour_miles: '10' },
        ],
        error: null
      }));

      const res = await loadPriorityZones(supabaseMock, 'acct1');
      expect(res).toHaveLength(1);
      expect(res[0]).toEqual({
        id: 'z1',
        label: 'Priority area',
        centerLat: 40.5,
        centerLng: -80.5,
        radiusMiles: 5.5,
        maxDetourMiles: 10,
      });
    });
  });

  describe('priorityZonesAvailable', () => {
    it('returns false on error', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: new Error('table not found') }));
      const res = await priorityZonesAvailable(supabaseMock, 'acct1');
      expect(res).toBe(false);
    });

    it('returns false on throw', async () => {
      queryMock.then = vi.fn((resolve, reject) => reject(new Error('crash')));
      const res = await priorityZonesAvailable(supabaseMock, 'acct1');
      expect(res).toBe(false);
    });

    it('returns true on success', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: null }));
      const res = await priorityZonesAvailable(supabaseMock, 'acct1');
      expect(res).toBe(true);
    });
  });
});
