import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createLead: vi.fn(),
  fetchLegacyLsaAccountReport: vi.fn(),
  fetchPmaxLsaDailySpend: vi.fn(),
  discoverGoogleLsaCustomers: vi.fn(),
  listGoogleLsaConversations: vi.fn(),
  listGoogleLsaLeads: vi.fn(),
  activeGoogleLsaConnection: vi.fn(),
  claimGoogleLsaSync: vi.fn(),
  completeGoogleLsaSync: vi.fn(),
  listGoogleLsaConnectedAccountIds: vi.fn(),
  reconcileGoogleLsaCandidates: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/leads', () => ({
  createLead: mocks.createLead,
}));

vi.mock('@/lib/google-lsa/api', () => ({
  fetchLegacyLsaAccountReport: mocks.fetchLegacyLsaAccountReport,
  fetchPmaxLsaDailySpend: mocks.fetchPmaxLsaDailySpend,
  discoverGoogleLsaCustomers: mocks.discoverGoogleLsaCustomers,
  listGoogleLsaConversations: mocks.listGoogleLsaConversations,
  listGoogleLsaLeads: mocks.listGoogleLsaLeads,
}));

vi.mock('@/lib/google-lsa/connection', () => ({
  activeGoogleLsaConnection: mocks.activeGoogleLsaConnection,
  claimGoogleLsaSync: mocks.claimGoogleLsaSync,
  completeGoogleLsaSync: mocks.completeGoogleLsaSync,
  listGoogleLsaConnectedAccountIds: mocks.listGoogleLsaConnectedAccountIds,
  reconcileGoogleLsaCandidates: mocks.reconcileGoogleLsaCandidates,
}));

import {
  syncGoogleLsaAccount,
  syncAllGoogleLsaAccounts,
} from '@/lib/google-lsa/sync';

import {
  buildQuickBooksCsv,
} from '@/lib/quickbooks';

import {
  queryCensusGeocoder,
} from '@/lib/location-context/census-geocoder';

import {
  isGeocodingConfigured,
  areaLabelFor,
  placeNameFor,
  areaRadiusMiles,
  geocodeAddress,
  geocodeArea,
  geocodeColumns,
} from '@/lib/geocode';

describe('Integrations & Sync Engines Core Logic', () => {
  let fakeAdmin: any;
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  const createFluentBuilder = (dataResult: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: dataResult, error: null }).then(resolve),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    fakeAdmin = {
      from: vi.fn(() => createFluentBuilder([])),
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('Google LSA Sync Engine (google-lsa/sync)', () => {
    it('returns busy state when sync lease is already claimed by another worker', async () => {
      mocks.claimGoogleLsaSync.mockResolvedValue(null);

      const res = await syncGoogleLsaAccount('acc-1');
      expect(res.ok).toBe(false);
      expect(res.busy).toBe(true);
      expect(res.message).toContain('already running');
    });

    it('handles missing or expired connection credentials gracefully', async () => {
      mocks.claimGoogleLsaSync.mockResolvedValue('2026-06-15T12:00:00Z');
      mocks.activeGoogleLsaConnection.mockResolvedValue(null);

      const res = await syncGoogleLsaAccount('acc-1');
      expect(res.ok).toBe(false);
      expect(res.busy).toBe(false);
      expect(res.message).toContain('Google access needs to be renewed');
      expect(mocks.completeGoogleLsaSync).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          error: expect.stringContaining('Google access needs to be renewed'),
        }),
      );
    });

    it('performs full rescan, candidate reconciliation, lead linking, and spend sync for PMax', async () => {
      mocks.claimGoogleLsaSync.mockResolvedValue('2026-06-15T12:00:00Z');
      mocks.activeGoogleLsaConnection.mockResolvedValue({
        accessToken: 'mock-access-token',
        customerId: '1234567890',
        customerName: 'Top Tier Roofing',
        customerTimeZone: 'America/Chicago',
        loginCustomerId: '9876543210',
        campaignId: 'camp-1',
        campaignMode: 'pmax',
        lastFullRescanAt: null, // Triggers full rescan
      });

      mocks.discoverGoogleLsaCustomers.mockResolvedValue([
        {
          customerId: '1234567890',
          descriptiveName: 'Top Tier Roofing',
          timeZone: 'America/Chicago',
          loginCustomerId: '9876543210',
          campaign: { id: 'camp-1' },
          campaignKind: 'pmax',
        },
      ]);

      mocks.reconcileGoogleLsaCandidates.mockResolvedValue({
        customerId: '1234567890',
        customerName: 'Top Tier Roofing',
        timeZone: 'America/Chicago',
        loginCustomerId: '9876543210',
        campaignId: 'camp-1',
        campaignMode: 'pmax',
      });

      mocks.listGoogleLsaLeads.mockResolvedValue([
        {
          resourceName: 'customers/1234567890/localServicesLeads/lead-999',
          contactDetails: { phoneNumber: '+15125550199' },
          category: 'roofing',
          chargeStatus: 'CHARGED',
          leadType: 'PHONE_CALL',
        },
      ]);

      mocks.createLead.mockResolvedValue({ id: 'crm-lead-1' });

      mocks.listGoogleLsaConversations.mockResolvedValue([]);

      mocks.fetchPmaxLsaDailySpend.mockResolvedValue([
        {
          date: '2026-06-14',
          campaignId: 'camp-1',
          costMicros: 45000000,
          currencyCode: 'USD',
        },
      ]);

      const res = await syncGoogleLsaAccount('acc-1');
      expect(res.ok).toBe(true);
      expect(res.fullRescan).toBe(true);
      expect(res.leadsSeen).toBe(1);
      expect(res.leadsLinked).toBe(1);
      expect(res.spendRows).toBe(1);
      expect(mocks.completeGoogleLsaSync).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          fullRescan: true,
          error: null,
        }),
      );
    });

    it('syncAllGoogleLsaAccounts coordinates multiple account syncs with concurrency limit', async () => {
      mocks.listGoogleLsaConnectedAccountIds.mockResolvedValue(['acc-1', 'acc-2', 'acc-3']);

      mocks.claimGoogleLsaSync
        .mockResolvedValueOnce(null) // acc-1 busy
        .mockResolvedValueOnce('2026-06-15T12:00:00Z') // acc-2 success
        .mockRejectedValueOnce(new Error('DB failure')); // acc-3 error

      mocks.activeGoogleLsaConnection.mockResolvedValue({
        accessToken: 'token',
        customerId: '111',
        customerTimeZone: 'America/Chicago',
        campaignMode: 'pmax',
        lastFullRescanAt: new Date().toISOString(), // incremental
      });

      mocks.listGoogleLsaLeads.mockResolvedValue([]);
      mocks.listGoogleLsaConversations.mockResolvedValue([]);
      mocks.fetchPmaxLsaDailySpend.mockResolvedValue([]);

      const totals = await syncAllGoogleLsaAccounts();
      expect(totals.processed).toBe(3);
      expect(totals.busy).toBe(1);
      expect(totals.succeeded).toBe(1);
      expect(totals.failed).toBe(1);
    });
  });

  describe('QuickBooks Export Engine (quickbooks)', () => {
    it('generates valid QuickBooks CSV with invoice line items and expenses', async () => {
      const mockSupabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'invoices') {
            return createFluentBuilder([
              {
                ref: 'INV-1001',
                status: 'paid',
                created_at: '2026-06-10T14:30:00Z',
                job: { client_name: 'Alice Johnson' },
                invoice_items: [
                  { description: 'Roof repair, shingles & labor', amount: 1250 },
                  { description: 'Flashing replacement', amount: 350 },
                ],
              },
            ]);
          }
          if (table === 'costs') {
            return createFluentBuilder([
              {
                category: 'Materials',
                description: '3 bundles of architectural "heavy" shingles',
                amount: 450,
                job: { ref: 'JOB-500', client_name: 'Alice Johnson' },
              },
            ]);
          }
          return createFluentBuilder([]);
        }),
      };

      const csv = await buildQuickBooksCsv(mockSupabase, 'acc-1');
      const lines = csv.split('\n');

      expect(lines[0]).toBe('InvoiceNo,Customer,InvoiceDate,ItemDescription,ItemAmount,JobStatus');
      // Invoice items
      expect(lines[1]).toContain('INV-1001,Alice Johnson');
      expect(lines[1]).toContain('"Roof repair, shingles & labor",1250,Paid');
      expect(lines[2]).toContain('INV-1001,Alice Johnson');
      expect(lines[2]).toContain('"Flashing replacement",350,Paid');
      // Expense item
      expect(lines[3]).toContain('EXP-JOB-500,Alice Johnson,,"Materials: 3 bundles of architectural ""heavy"" shingles",-450,Expense');
    });

    it('throws when supabase returns an error during export', async () => {
      const errorSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('Postgres query failure') }),
        })),
      };

      await expect(buildQuickBooksCsv(errorSupabase, 'acc-1')).rejects.toThrow('Postgres query failure');
    });
  });

  describe('US Census Geocoder (location-context/census-geocoder)', () => {
    it('returns null for empty or whitespace address queries', async () => {
      const res = await queryCensusGeocoder('');
      expect(res).toBeNull();

      const resWhitespace = await queryCensusGeocoder('   ');
      expect(resWhitespace).toBeNull();
    });

    it('parses Census Bureau geographies and coordinates correctly on 200 response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            addressMatches: [
              {
                matchedAddress: '1600 Pennsylvania Ave NW, Washington, DC, 20500',
                coordinates: { x: -77.0365, y: 38.8977 },
                geographies: {
                  Counties: [{ STATE: '11', COUNTY: '001', BASENAME: 'District of Columbia' }],
                  'Incorporated Places': [{ STATE: '11', BASENAME: 'Washington' }],
                  'Census Tracts': [{ TRACT: '006202' }],
                  '2020 Census Blocks': [{ BLOCK: '1000' }],
                  'County Subdivisions': [{ BASENAME: 'District 1' }],
                },
              },
            ],
          },
        }),
      } as any);

      const result = await queryCensusGeocoder('1600 Pennsylvania Ave NW, Washington DC');
      expect(result).not.toBeNull();
      expect(result?.matchedAddress).toContain('1600 Pennsylvania Ave');
      expect(result?.coordinates).toEqual({ lat: 38.8977, lng: -77.0365, accuracy: 'exact' });
      expect(result?.stateFips).toBe('11');
      expect(result?.countyFips).toBe('001');
      expect(result?.countyName).toBe('District of Columbia');
      expect(result?.tract).toBe('006202');
      expect(result?.block).toBe('1000');
      expect(result?.incorporatedPlace).toBe('Washington');
      expect(result?.minorCivilDivision).toBe('District 1');
    });

    it('returns null when Census API encounters an HTTP error or no match', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      } as any);

      const result = await queryCensusGeocoder('Unknown road in the middle of nowhere');
      expect(result).toBeNull();
    });
  });

  describe('Server Geocoding Engine (geocode)', () => {
    it('isGeocodingConfigured checks presence of GOOGLE_MAPS_API_KEY', () => {
      delete process.env.GOOGLE_MAPS_API_KEY;
      expect(isGeocodingConfigured()).toBe(false);

      process.env.GOOGLE_MAPS_API_KEY = 'valid-key-xyz';
      expect(isGeocodingConfigured()).toBe(true);
    });

    it('areaLabelFor and placeNameFor format address components cleanly', () => {
      const sample = {
        formatted_address: '48009, Birmingham, MI, USA',
        address_components: [
          { long_name: '48009', short_name: '48009', types: ['postal_code'] },
          { long_name: 'Birmingham', short_name: 'Birmingham', types: ['locality'] },
          { long_name: 'Michigan', short_name: 'MI', types: ['administrative_area_level_1'] },
        ],
      };

      expect(areaLabelFor(sample)).toBe('48009 · Birmingham, MI');
      expect(placeNameFor(sample)).toBe('Birmingham, MI');
    });

    it('areaRadiusMiles computes accurate circle radius from bounding box', () => {
      const ne = { lat: 42.55, lng: -83.20 };
      const sw = { lat: 42.50, lng: -83.25 };

      const radius = areaRadiusMiles(ne, sw);
      expect(radius).toBeGreaterThan(1);
      expect(radius).toBeLessThan(10);

      const degenerate = areaRadiusMiles({ lat: 40.0, lng: -80.0 }, { lat: 40.0, lng: -80.0 });
      expect(degenerate).toBeNull();
    });

    it('geocodeAddress differentiates ROOFTOP precision from centroids', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      // Precise ROOFTOP
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              geometry: {
                location: { lat: 30.2672, lng: -97.7431 },
                location_type: 'ROOFTOP',
              },
            },
          ],
        }),
      } as any);

      const rooftop = await geocodeAddress('100 Congress Ave, Austin, TX');
      expect(rooftop).toEqual({ lat: 30.2672, lng: -97.7431, precise: true });

      // Imprecise APPROXIMATE (centroid)
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              geometry: {
                location: { lat: 30.2672, lng: -97.7431 },
                location_type: 'APPROXIMATE',
              },
            },
          ],
        }),
      } as any);

      const approx = await geocodeAddress('Austin, TX');
      expect(approx).toEqual({ lat: 30.2672, lng: -97.7431, precise: false });
    });

    it('geocodeArea handles area bounding boxes and rejects overly large regions', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [
            {
              formatted_address: 'Birmingham, MI 48009, USA',
              address_components: [
                { long_name: 'Birmingham', short_name: 'Birmingham', types: ['locality'] },
                { long_name: 'Michigan', short_name: 'MI', types: ['administrative_area_level_1'] },
              ],
              geometry: {
                location: { lat: 42.5467, lng: -83.2113 },
                bounds: {
                  northeast: { lat: 42.56, lng: -83.19 },
                  southwest: { lat: 42.53, lng: -83.23 },
                },
              },
            },
          ],
        }),
      } as any);

      const area = await geocodeArea('Birmingham, MI');
      expect(area.ok).toBe(true);
      if (area.ok) {
        expect(area.label).toBe('Birmingham, MI');
        expect(area.place).toBe('Birmingham, MI');
        expect(area.radiusMiles).toBeGreaterThan(0.5);
      }
    });

    it('geocodeColumns yields coordinates only when geocode result is precise', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'test-key';

      // Precise
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 30.0, lng: -97.0 }, location_type: 'ROOFTOP' } }],
        }),
      } as any);

      const preciseCols = await geocodeColumns('123 Main St');
      expect(preciseCols?.lat).toBe(30.0);
      expect(preciseCols?.lng).toBe(-97.0);
      expect(preciseCols?.geocoded_at).toBeDefined();

      // Centroid / imprecise: lat/lng should be null
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: [{ geometry: { location: { lat: 30.0, lng: -97.0 }, location_type: 'GEOMETRIC_CENTER' } }],
        }),
      } as any);

      const impreciseCols = await geocodeColumns('Austin TX');
      expect(impreciseCols?.lat).toBeNull();
      expect(impreciseCols?.lng).toBeNull();
      expect(impreciseCols?.geocoded_at).toBeDefined();
    });
  });
});
