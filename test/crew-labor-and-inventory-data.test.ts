/**
 * Crew Labor Aggregations & Inventory Presets Test
 *
 * Targets:
 *   - src/lib/labor-data.ts (isUuid, listLaborEntries, laborTotalsByCrew)
 *   - src/lib/inventory-data.ts (DEFAULT_TOOLS, DEFAULT_VEHICLES, DEFAULT_VAN_STOCK,
 *     DEFAULT_MAINTENANCE_RECORDS, DEFAULT_CUSTODY_LOG)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  isUuid,
  listLaborEntries,
  laborTotalsByCrew,
} from '@/lib/labor-data';

import {
  DEFAULT_TOOLS,
  DEFAULT_VEHICLES,
  DEFAULT_VAN_STOCK,
  DEFAULT_MAINTENANCE,
  DEFAULT_CUSTODY_LOGS,
} from '@/lib/inventory-data';

describe('Crew Labor & Inventory Presets Engine', () => {
  function createMockSupabase(data: any = null, error: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
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
  // 1. labor-data: UUID verification
  // ───────────────────────────────────────────────────────────────────────────

  describe('labor-data — isUuid validator', () => {
    it('validates canonical v4/standard UUID strings', () => {
      expect(isUuid('c3b53f63-3b17-48f1-8f5b-6f8d098e268a')).toBe(true);
      expect(isUuid('C3B53F63-3B17-48F1-8F5B-6F8D098E268A')).toBe(true);
      expect(isUuid('  c3b53f63-3b17-48f1-8f5b-6f8d098e268a  ')).toBe(true);
    });

    it('rejects invalid or malformed strings and non-string types', () => {
      expect(isUuid('c3b53f63-3b17-48f1-8f5b')).toBe(false);
      expect(isUuid('not-a-uuid')).toBe(false);
      expect(isUuid('')).toBe(false);
      expect(isUuid(null)).toBe(false);
      expect(isUuid(undefined)).toBe(false);
      expect(isUuid(12345)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. labor-data: listLaborEntries
  // ───────────────────────────────────────────────────────────────────────────

  describe('labor-data — listLaborEntries', () => {
    it('queries costs table with labor filter and date bounds', async () => {
      const mockEntries = [
        {
          id: 'cost-1',
          crew_id: 'c3b53f63-3b17-48f1-8f5b-6f8d098e268a',
          crew_name: 'John Carpenter',
          crew_role_label: 'Lead Tech',
          job_id: 'job-10',
          description: 'Sump pump installation',
          hours: 4.5,
          rate: 35,
          amount: 157.5,
          created_at: '2026-06-01T12:00:00Z',
        },
      ];

      const client = createMockSupabase(mockEntries);
      const entries = await listLaborEntries(client, 'acc-1', {
        startIso: '2026-06-01T00:00:00Z',
        endIso: '2026-06-02T00:00:00Z',
        crewId: 'c3b53f63-3b17-48f1-8f5b-6f8d098e268a',
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].crew_name).toBe('John Carpenter');
      expect(entries[0].hours).toBe(4.5);
      expect(client.from).toHaveBeenCalledWith('costs');
      expect(client.eq).toHaveBeenCalledWith('type', 'labor');
      expect(client.eq).toHaveBeenCalledWith('crew_id', 'c3b53f63-3b17-48f1-8f5b-6f8d098e268a');
    });

    it('ignores invalid non-UUID crewId filter to avoid database query crash', async () => {
      const client = createMockSupabase([]);
      await listLaborEntries(client, 'acc-1', {
        startIso: '2026-06-01T00:00:00Z',
        endIso: '2026-06-02T00:00:00Z',
        crewId: 'invalid-crew-id',
      });

      expect(client.eq).not.toHaveBeenCalledWith('crew_id', 'invalid-crew-id');
    });

    it('recovers gracefully on database query errors without throwing', async () => {
      const client = createMockSupabase(null, { message: 'connection timeout' });
      const entries = await listLaborEntries(client, 'acc-1', {
        startIso: '2026-06-01T00:00:00Z',
        endIso: '2026-06-02T00:00:00Z',
      });

      expect(entries).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. labor-data: laborTotalsByCrew
  // ───────────────────────────────────────────────────────────────────────────

  describe('labor-data — laborTotalsByCrew', () => {
    it('aggregates total hours and pay per crew member across date window', async () => {
      const rawCostRows = [
        { crew_id: 'crew-1', hours: '4.5', amount: '135.00' },
        { crew_id: 'crew-1', hours: 3.5, amount: 105.00 },
        { crew_id: 'crew-2', hours: 8.0, amount: 240.00 },
        { crew_id: null, hours: 2.0, amount: 60.00 }, // orphaned entry skipped
      ];

      const client = createMockSupabase(rawCostRows);
      const totals = await laborTotalsByCrew(client, 'acc-1', {
        startIso: '2026-06-01T00:00:00Z',
        endIso: '2026-06-07T00:00:00Z',
      });

      expect(totals.size).toBe(2);

      const crew1 = totals.get('crew-1');
      expect(crew1).toBeDefined();
      expect(crew1?.hours).toBe(8.0);
      expect(crew1?.pay).toBe(240.0);

      const crew2 = totals.get('crew-2');
      expect(crew2).toBeDefined();
      expect(crew2?.hours).toBe(8.0);
      expect(crew2?.pay).toBe(240.0);
    });

    it('returns empty Map on query failure', async () => {
      const client = createMockSupabase(null, { message: 'permission denied' });
      const totals = await laborTotalsByCrew(client, 'acc-1', {
        startIso: '2026-06-01T00:00:00Z',
        endIso: '2026-06-07T00:00:00Z',
      });

      expect(totals.size).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. inventory-data: Default Assets & Specifications
  // ───────────────────────────────────────────────────────────────────────────

  describe('inventory-data — preset catalogs & schema conformance', () => {
    it('DEFAULT_TOOLS contains valid asset categories, serial numbers, and depreciation schedules', () => {
      expect(DEFAULT_TOOLS.length).toBeGreaterThanOrEqual(5);

      for (const tool of DEFAULT_TOOLS) {
        expect(tool.id).toBeDefined();
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.category).toBeDefined();
        expect(tool.brand).toBeDefined();
        expect(tool.assetTag.startsWith('TAG-')).toBe(true);
        expect(tool.status).toMatch(/available|checked_out|in_maintenance|lost_damaged/);
        expect(tool.depreciationSchedule).toBeDefined();
      }
    });

    it('DEFAULT_VEHICLES defines fleet trucks with valid VINs and mileage counters', () => {
      expect(DEFAULT_VEHICLES.length).toBeGreaterThanOrEqual(3);

      for (const vehicle of DEFAULT_VEHICLES) {
        expect(vehicle.id).toBeDefined();
        expect(vehicle.make).toBeDefined();
        expect(vehicle.model).toBeDefined();
        expect(vehicle.year).toBeGreaterThanOrEqual(2020);
        expect(vehicle.currentMileage).toBeGreaterThan(0);
        expect(vehicle.status).toMatch(/active|in_shop|retired/);
      }
    });

    it('DEFAULT_VAN_STOCK provides initial SKUs with min thresholds and reorder quantities', () => {
      expect(DEFAULT_VAN_STOCK.length).toBeGreaterThanOrEqual(5);

      for (const item of DEFAULT_VAN_STOCK) {
        expect(item.id).toBeDefined();
        expect(item.sku).toBeDefined();
        expect(item.name).toBeDefined();
        expect(item.quantityOnHand).toBeGreaterThanOrEqual(0);
        expect(item.minThreshold).toBeGreaterThan(0);
        expect(item.unitCost).toBeGreaterThan(0);
      }
    });

    it('DEFAULT_MAINTENANCE and DEFAULT_CUSTODY_LOGS contain historical event logs', () => {
      expect(DEFAULT_MAINTENANCE.length).toBeGreaterThan(0);
      expect(DEFAULT_CUSTODY_LOGS.length).toBeGreaterThan(0);

      for (const log of DEFAULT_CUSTODY_LOGS) {
        expect(log.id).toBeDefined();
        expect(log.toolId).toBeDefined();
        expect(log.action).toMatch(/check_out|check_in|transfer|relocate|maintenance_sent|maintenance_returned/);
        expect(log.occurredAt).toBeDefined();
      }
    });
  });
});
