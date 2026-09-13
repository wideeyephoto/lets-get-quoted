/**
 * Data Export & Arrival Telemetry Coverage Test
 *
 * Targets:
 *   - src/lib/data-export.ts (buildClientsCsv, buildServicesCsv, buildJobsCsv, buildInvoicesCsv)
 *   - src/lib/data-export-sets.ts (parseExportSets, exportArchiveName, EXPORT_SETS)
 *   - src/lib/arrival-analytics-data.ts (loadArrivalAnalytics, fallback on unmigrated db)
 *   - src/lib/arrival-clock.ts (openTravelShift, closeTravelShift, travelClockEnabled, TRAVEL_CATEGORY)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(),
  listServices: vi.fn(),
  clockOut: vi.fn(),
}));

vi.mock('@/lib/jobs', async () => {
  const actual = await vi.importActual<any>('@/lib/jobs');
  return {
    ...actual,
    listJobs: mocks.listJobs,
  };
});

vi.mock('@/lib/services', () => ({
  listServices: mocks.listServices,
}));

vi.mock('@/lib/time-clock-data', () => ({
  clockOut: mocks.clockOut,
}));

import {
  buildClientsCsv,
  buildServicesCsv,
  buildJobsCsv,
  buildInvoicesCsv,
} from '@/lib/data-export';

import {
  parseExportSets,
  exportArchiveName,
  EXPORT_SETS,
} from '@/lib/data-export-sets';

import {
  loadArrivalAnalytics,
} from '@/lib/arrival-analytics-data';

import {
  openTravelShift,
  closeTravelShift,
  travelClockEnabled,
  TRAVEL_CATEGORY,
} from '@/lib/arrival-clock';

describe('Data Export & Arrival Telemetry Engine', () => {
  function createMockSupabase(data: any = null, error: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockImplementation((from: number, to: number) => {
        // Return sliced data if array, otherwise return whatever data was given
        const pageData = Array.isArray(data) ? data.slice(from, to + 1) : data;
        return Promise.resolve({ data: pageData, error });
      }),
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
  // 1. data-export: CSV Generation
  // ───────────────────────────────────────────────────────────────────────────

  describe('data-export — CSV builders', () => {
    it('buildClientsCsv renders correct CSV headers and escaped rows', async () => {
      const clientRows = [
        {
          name: 'John Doe',
          phone: '+15551234567',
          email: 'john@example.com',
          address: '123 Main St, Apt 4',
          notes: 'Friendly dog in backyard',
        },
        {
          name: 'Acme Corp',
          phone: null,
          email: 'office@acme.com',
          address: null,
          notes: null,
        },
      ];

      const client = createMockSupabase(clientRows);
      const csv = await buildClientsCsv(client, 'acc-1');

      expect(csv).toContain('Name,Phone,Email,Address,Notes');
      expect(csv).toContain('John Doe,+15551234567,john@example.com,"123 Main St, Apt 4",Friendly dog in backyard');
      expect(csv).toContain('Acme Corp,,office@acme.com,,');
    });

    it('buildServicesCsv outputs active price-book services with unit prices', async () => {
      mocks.listServices.mockResolvedValue([
        {
          id: 'svc-1',
          name: 'Drain Snaking',
          unit_price: 189.5,
          unit: 'visit',
          description: 'Clears residential line blockages',
          active: true,
        },
        {
          id: 'svc-2',
          name: 'Hourly Plumbing Labor',
          unit_price: 120,
          unit: 'hour',
          description: 'Standard master plumber rate',
          active: false,
        },
      ]);

      const client = createMockSupabase();
      const csv = await buildServicesCsv(client, 'acc-1');

      expect(csv).toContain('Name,Price,Unit,Description,Active');
      expect(csv).toContain('Drain Snaking,189.50,visit,Clears residential line blockages,true');
      expect(csv).toContain('Hourly Plumbing Labor,120,hour,Standard master plumber rate,false');
    });

    it('buildJobsCsv exports job references, status translations, and estimates', async () => {
      mocks.listJobs.mockResolvedValue([
        {
          id: 'job-1',
          ref: 'JOB-2026-001',
          client_name: 'Sarah Connor',
          client_phone: '+15559876543',
          client_email: 'sarah@resistance.org',
          address: '742 Evergreen Terr',
          scope: 'Replace electric water heater with tankless unit',
          status: 'in_progress',
          scheduled_for: '2026-07-04T09:00:00Z',
          estimated_hours: 6.5,
          quoted_amount: 3250,
        },
        {
          id: 'job-2',
          ref: 'JOB-2026-002',
          client_name: 'Bob Vance',
          client_phone: null,
          client_email: null,
          address: null,
          scope: 'Refrigeration check',
          status: 'complete',
          scheduled_for: null,
          estimated_hours: null,
          quoted_amount: 450,
        },
      ]);

      const client = createMockSupabase();
      const csv = await buildJobsCsv(client, 'acc-1');

      expect(csv).toContain('Ref,Customer,Phone,Email,Address,Job / scope,Status,Date,Est. hours,Amount');
      expect(csv).toContain('JOB-2026-001,Sarah Connor,+15559876543,sarah@resistance.org,742 Evergreen Terr,Replace electric water heater with tankless unit,In progress,2026-07-04,6.5,3250');
      expect(csv).toContain('JOB-2026-002,Bob Vance,,,,Refrigeration check,Complete,,,450');
    });

    it('buildInvoicesCsv links invoice totals and statuses to their parent jobs', async () => {
      const invoiceRows = [
        {
          ref: 'INV-1001',
          job_id: 'job-1',
          status: 'paid',
          total: 3250,
          created_at: '2026-07-05T14:30:00Z',
        },
        {
          ref: 'INV-1002',
          job_id: 'job-999', // orphaned or deleted job
          status: 'open',
          total: 500,
          created_at: '2026-07-06T10:00:00Z',
        },
      ];

      mocks.listJobs.mockResolvedValue([
        {
          id: 'job-1',
          client_name: 'Sarah Connor',
          client_phone: '+15559876543',
          client_email: 'sarah@resistance.org',
          address: '742 Evergreen Terr',
          scope: 'Replace electric water heater',
        },
      ]);

      const client = createMockSupabase(invoiceRows);
      const csv = await buildInvoicesCsv(client, 'acc-1');

      expect(csv).toContain('Ref,Customer,Phone,Email,Address,Description,Date,Total,Status');
      expect(csv).toContain('INV-1001,Sarah Connor,+15559876543,sarah@resistance.org,742 Evergreen Terr,Replace electric water heater,2026-07-05,3250,paid');
      expect(csv).toContain('INV-1002,,,,,,2026-07-06,500,open');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. data-export-sets: Sets, Parsing & Archive Naming
  // ───────────────────────────────────────────────────────────────────────────

  describe('data-export-sets — configuration & helpers', () => {
    it('EXPORT_SETS defines the 4 canonical export categories', () => {
      expect(EXPORT_SETS).toHaveLength(4);
      const ids = EXPORT_SETS.map((s) => s.id);
      expect(ids).toEqual(['clients', 'services', 'jobs', 'invoices']);
    });

    it('parseExportSets parses comma-separated lists, filtering unknown entries', () => {
      expect(parseExportSets('clients,invoices')).toEqual(['clients', 'invoices']);
      expect(parseExportSets('jobs, UNKNOWN, services ')).toEqual(['services', 'jobs']);
    });

    it('parseExportSets returns all sets when input is null, empty, or all unknown', () => {
      const all = ['clients', 'services', 'jobs', 'invoices'];
      expect(parseExportSets(null)).toEqual(all);
      expect(parseExportSets('')).toEqual(all);
      expect(parseExportSets('foo,bar,baz')).toEqual(all);
    });

    it('exportArchiveName creates deterministic zip archive names', () => {
      expect(exportArchiveName('2026-08-05')).toBe('letsgetquoted-export-2026-08-05.zip');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. arrival-analytics-data: telemetry queries
  // ───────────────────────────────────────────────────────────────────────────

  describe('arrival-analytics-data — loadArrivalAnalytics', () => {
    it('returns empty fallback structure when database lacks arrival migration', async () => {
      const client = createMockSupabase(null, { message: 'column en_route_at does not exist' });
      const analytics = await loadArrivalAnalytics(client, 'acc-1', 30);

      expect(analytics.available).toBe(false);
      expect(analytics.windowDays).toBe(30);
      expect(analytics.summary.trips).toBe(0);
      expect(analytics.byCrew).toEqual([]);
      expect(analytics.advice).toBeNull();
    });

    it('summarizes arrival metrics across crew members when data exists', async () => {
      const sampleTrips = [
        {
          crew_id: 'crew-1',
          sent_by: 'Alex',
          status: 'arrived',
          arrival_start: '2026-06-01T10:00:00Z',
          arrival_end: '2026-06-01T12:00:00Z',
          arrived_at: '2026-06-01T10:30:00Z',
          en_route_at: '2026-06-01T10:00:00Z',
          eta_minutes: 30,
          suggested_minutes: 30,
          sms_status: 'sent',
          first_viewed_at: '2026-06-01T10:05:00Z',
          view_count: 2,
        },
      ];

      const client = createMockSupabase(sampleTrips);
      const analytics = await loadArrivalAnalytics(client, 'acc-1', 60);

      expect(analytics.available).toBe(true);
      expect(analytics.windowDays).toBe(60);
      expect(analytics.summary.trips).toBe(1);
      expect(analytics.summary.onTime).toBe(1);
      expect(analytics.byCrew).toHaveLength(1);
      expect(analytics.byCrew[0].crewId).toBe('crew-1');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. arrival-clock: shift recording & feature toggles
  // ───────────────────────────────────────────────────────────────────────────

  describe('arrival-clock — drive time automation', () => {
    it('travelClockEnabled inspects account settings accurately', () => {
      expect(travelClockEnabled({ arrival_clock_travel: true })).toBe(true);
      expect(travelClockEnabled({ arrival_clock_travel: false })).toBe(false);
      expect(travelClockEnabled(null)).toBe(false);
      expect(travelClockEnabled(undefined)).toBe(false);
    });

    it('openTravelShift creates a new travel time entry and returns entry ID', async () => {
      const client = createMockSupabase({ id: 'entry-travel-101' });

      const entryId = await openTravelShift(client, {
        accountId: 'acc-1',
        crewId: 'crew-1',
        jobId: 'job-1',
        rate: 28.5,
      });

      expect(entryId).toBe('entry-travel-101');
      expect(client.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          crew_id: 'crew-1',
          job_id: 'job-1',
          rate: 28.5,
          kind: 'travel',
        }),
      );
    });

    it('openTravelShift fails softly and returns null on error (e.g. unique constraint 23505)', async () => {
      const client = createMockSupabase(null, { code: '23505', message: 'duplicate key value' });

      const entryId = await openTravelShift(client, {
        accountId: 'acc-1',
        crewId: 'crew-1',
        jobId: 'job-1',
        rate: 28.5,
      });

      expect(entryId).toBeNull();
    });

    it('closeTravelShift clocks out the active travel shift under TRAVEL_CATEGORY', async () => {
      const activeShift = {
        id: 'shift-open',
        started_at: '2026-06-01T10:00:00Z',
        crew_id: 'crew-1',
        kind: 'travel',
        rate: 30,
      };

      const client = createMockSupabase(activeShift);
      mocks.clockOut.mockResolvedValue({ hours: 0.75 });

      const hours = await closeTravelShift(client, {
        accountId: 'acc-1',
        crewId: 'crew-1',
        crewName: 'Dave Smith',
        endedAt: '2026-06-01T10:45:00Z',
      });

      expect(hours).toBe(0.75);
      expect(mocks.clockOut).toHaveBeenCalledWith(
        client,
        'acc-1',
        activeShift,
        expect.objectContaining({
          endedAt: '2026-06-01T10:45:00Z',
          crewName: 'Dave Smith',
          category: TRAVEL_CATEGORY,
          note: 'Dave Smith — travel to site',
        }),
      );
    });

    it('closeTravelShift returns null if no active travel shift exists for the crew member', async () => {
      const client = createMockSupabase(null);

      const hours = await closeTravelShift(client, {
        accountId: 'acc-1',
        crewId: 'crew-1',
        crewName: 'Dave Smith',
      });

      expect(hours).toBeNull();
      expect(mocks.clockOut).not.toHaveBeenCalled();
    });
  });
});
