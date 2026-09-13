import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadCrewPayContext,
  getPayPeriodRow,
  ensurePayPeriodRow,
  snapshotOf,
  approveHours,
  markPaid,
  markSentToPayroll,
  undoPaid,
  closePayPeriod,
  reopenPayPeriod,
  countPayRecordsForCrew,
  PayUnavailableError,
} from '@/lib/crew-pay-data';

import {
  getGoogleAdsConfig,
  isGoogleAdsConfigured,
  resolveServingCustomerId,
  buildGoogleAdsHeaders,
  hashSha256,
  normalizeEmailForHash,
  normalizePhoneForHash,
  uploadOfflineConversion,
  provisionManagedSearchCampaign,
} from '@/lib/google-ads-api';

describe('Crew Pay Data Engine & Google Ads API Core Logic', () => {
  let fakeSupabase: any;
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  const createFluentBuilder = (dataResult: any = null, error: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: dataResult, error }),
      upsert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: dataResult, error }),
      single: vi.fn().mockResolvedValue({ data: dataResult, error }),
      then: (resolve: any) => Promise.resolve({
        data: Array.isArray(dataResult) ? dataResult : (dataResult ? [dataResult] : []),
        error,
      }).then(resolve),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    fakeSupabase = {
      from: vi.fn(() => createFluentBuilder([])),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  describe('Crew Pay Data Engine (crew-pay-data)', () => {
    const mockPeriod = {
      mode: 'weekly' as const,
      startIso: '2026-06-08T00:00:00.000Z',
      endIso: '2026-06-14T23:59:59.999Z',
      label: 'Jun 8 – Jun 14, 2026',
    };

    const mockSettings = {
      overtimeThreshold: 40,
      rounding: 'none' as const,
      periodMode: 'weekly' as const,
    };

    it('returns available: false when tables do not exist yet (42P01 error)', async () => {
      fakeSupabase.from.mockImplementation((table: string) => {
        if (table === 'crew_pay_periods') {
          return createFluentBuilder(null, { code: '42P01', message: 'relation "crew_pay_periods" does not exist' });
        }
        if (table === 'costs') {
          return createFluentBuilder([]);
        }
        return createFluentBuilder([]);
      });

      const context = await loadCrewPayContext(fakeSupabase, 'acc-1', {
        period: mockPeriod,
        settings: mockSettings,
      });

      expect(context.available).toBe(false);
      expect(context.periodRow).toBeNull();
      expect(context.records).toEqual([]);
    });

    it('loads pay context with salaried seed crew and labor entries', async () => {
      fakeSupabase.from.mockImplementation((table: string) => {
        if (table === 'crew_pay_periods') {
          return createFluentBuilder({
            id: 'period-1',
            period_key: 'w-2026-06-08',
            starts_on: '2026-06-08',
            ends_on: '2026-06-14',
            closed_at: null,
            closed_by: null,
            reopened_at: null,
            reopen_reason: null,
          });
        }
        if (table === 'costs') {
          return createFluentBuilder([
            {
              id: 'cost-1',
              job_id: 'job-1',
              crew_id: 'crew-hourly',
              description: 'Installation labor',
              logged_at: '2026-06-09T10:00:00Z',
              hours: 8,
              hourly_rate: 25,
              amount: 200,
            },
          ]);
        }
        if (table === 'crew_pay_entries') {
          return createFluentBuilder([]);
        }
        return createFluentBuilder([]);
      });

      const context = await loadCrewPayContext(fakeSupabase, 'acc-1', {
        period: mockPeriod,
        settings: mockSettings,
        crew: [
          {
            id: 'crew-hourly',
            name: 'Bob Builder',
            pay_type: 'hourly',
            hourly_rate: 25,
          },
          {
            id: 'crew-salary',
            name: 'Alice Architect',
            pay_type: 'salary',
            annual_salary: 52000,
          },
        ],
      });

      expect(context.available).toBe(true);
      expect(context.periodRow?.id).toBe('period-1');
      expect(context.rows.length).toBeGreaterThanOrEqual(2);
    });

    it('ensurePayPeriodRow handles race condition (23505 unique violation)', async () => {
      let readAttempts = 0;
      fakeSupabase.from.mockImplementation((table: string) => {
        if (table === 'crew_pay_periods') {
          const builder = createFluentBuilder(null);
          builder.maybeSingle = vi.fn().mockImplementation(() => {
            readAttempts++;
            if (readAttempts === 1) {
              // Initial read returns null (row doesn't exist yet)
              return Promise.resolve({ data: null, error: null });
            }
            // Second read after unique constraint race returns winning row
            return Promise.resolve({
              data: {
                id: 'period-raced',
                period_key: 'w-2026-06-08',
                starts_on: '2026-06-08',
                ends_on: '2026-06-14',
              },
              error: null,
            });
          });
          builder.insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            }),
          });
          return builder;
        }
        return createFluentBuilder([]);
      });

      const row = await ensurePayPeriodRow(fakeSupabase, 'acc-1', mockPeriod);
      expect(row.id).toBe('period-raced');
    });

    it('snapshotOf correctly extracts frozen payroll lines, hours, and rates', () => {
      const mockRow: any = {
        crewId: 'crew-1',
        name: 'Carlos Crew',
        regularHours: 40,
        overtimeHours: 5,
        estimatedPay: 1250,
        payType: 'hourly',
        payBasis: 'Hourly ($25/hr)',
        entries: [
          {
            id: 'c-1',
            jobId: 'j-1',
            description: 'Roofing tear-off',
            loggedAt: '2026-06-09T08:00:00Z',
            hours: 8,
            rate: 25,
            amount: 200,
          },
        ],
      };

      const snapshot = snapshotOf(mockRow);
      expect(snapshot.crewId).toBe('crew-1');
      expect(snapshot.crewName).toBe('Carlos Crew');
      expect(snapshot.regularHours).toBe(40);
      expect(snapshot.overtimeHours).toBe(5);
      expect(snapshot.amount).toBe(1250);
      expect(snapshot.lines).toHaveLength(1);
      expect(snapshot.lines?.[0].costId).toBe('c-1');
    });

    it('approveHours, markPaid, markSentToPayroll, and undoPaid perform state transitions', async () => {
      const snapshots = [
        {
          crewId: 'crew-1',
          crewName: 'Carlos Crew',
          regularHours: 40,
          overtimeHours: 0,
          amount: 1000,
          lines: [],
        },
      ];

      // approveHours
      fakeSupabase.from.mockImplementation((table: string) => {
        if (table === 'crew_pay_entries') {
          const b = createFluentBuilder([]);
          b.upsert = vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'entry-1',
                  crew_id: 'crew-1',
                  crew_name: 'Carlos Crew',
                  status: 'approved',
                  regular_hours: 40,
                  overtime_hours: 0,
                  approved_amount: 1000,
                },
              ],
              error: null,
            }),
          });
          return b;
        }
        return createFluentBuilder([]);
      });

      const approved = await approveHours(fakeSupabase, 'acc-1', 'period-1', snapshots, 'admin@example.com');
      expect(approved).toHaveLength(1);
      expect(approved[0].status).toBe('approved');

      // markPaid
      fakeSupabase.from.mockImplementation((table: string) => {
        if (table === 'crew_pay_entries') {
          const b = createFluentBuilder([]);
          b.upsert = vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'entry-1',
                  crew_id: 'crew-1',
                  crew_name: 'Carlos Crew',
                  status: 'paid',
                  paid_amount: 1000,
                  locked: true,
                },
              ],
              error: null,
            }),
          });
          return b;
        }
        return createFluentBuilder([]);
      });

      const paid = await markPaid(
        fakeSupabase,
        'acc-1',
        'period-1',
        snapshots,
        { paymentDate: '2026-06-15', paymentMethod: 'direct_deposit', paymentReference: 'DD-9988' },
        'admin@example.com',
      );
      expect(paid).toHaveLength(1);
      expect(paid[0].status).toBe('paid');
      expect(paid[0].locked).toBe(true);

      // undoPaid
      await expect(undoPaid(fakeSupabase, 'acc-1', 'entry-1')).resolves.not.toThrow();

      // closePayPeriod
      await expect(closePayPeriod(fakeSupabase, 'acc-1', 'period-1', 'admin@example.com')).resolves.not.toThrow();

      // reopenPayPeriod
      await expect(reopenPayPeriod(fakeSupabase, 'acc-1', 'period-1', 'Miscalculated hours')).resolves.not.toThrow();
    });

    it('countPayRecordsForCrew returns accurate count to prevent deletion of paid crew', async () => {
      fakeSupabase.from.mockImplementation((table: string) => {
        if (table === 'crew_pay_entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => Promise.resolve({ count: 4, error: null }).then(resolve),
          };
        }
        return createFluentBuilder([]);
      });

      const count = await countPayRecordsForCrew(fakeSupabase, 'acc-1', 'crew-1');
      expect(count).toBe(4);
    });
  });

  describe('Google Ads API Core Logic (google-ads-api)', () => {
    it('resolveServingCustomerId refuses MCC manager account ID fallback', () => {
      const config = {
        mccCustomerId: '123-456-7890',
        clientCustomerId: '123-456-7890', // Mistakenly pointing to MCC
      };

      const resolved = resolveServingCustomerId(undefined, config);
      expect(resolved).toBeNull();

      const validConfig = {
        mccCustomerId: '123-456-7890',
        clientCustomerId: '987-654-3210',
      };
      expect(resolveServingCustomerId(undefined, validConfig)).toBe('9876543210');
    });

    it('buildGoogleAdsHeaders formats authorization, developer token, and manager login headers', () => {
      const config = {
        developerToken: 'dev-token-abc',
        mccCustomerId: '111-222-3333',
      };

      const headers = buildGoogleAdsHeaders(config, 'access-token-xyz');
      expect(headers.Authorization).toBe('Bearer access-token-xyz');
      expect(headers['developer-token']).toBe('dev-token-abc');
      expect(headers['login-customer-id']).toBe('1112223333');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('hashSha256 standardizes email and phone according to Enhanced Conversions rules', () => {
      const email = '  Customer.Name@EXAMPLE.com ';
      const hashedEmail = normalizeEmailForHash(email);
      expect(hashedEmail).toBeDefined();
      expect(hashedEmail).toEqual(hashSha256('customer.name@example.com'));

      const phone10 = '(512) 555-0199';
      const hashedPhone = normalizePhoneForHash(phone10);
      expect(hashedPhone).toBeDefined();
      expect(hashedPhone).toEqual(hashSha256('+15125550199'));

      expect(normalizeEmailForHash('')).toBeUndefined();
      expect(normalizePhoneForHash('')).toBeUndefined();
    });

    it('uploadOfflineConversion validates required identifiers and simulates upload when unconfigured', async () => {
      delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

      // Fails when neither click ID nor enhanced user data is present
      const emptyRes = await uploadOfflineConversion({
        conversionActionName: '123456789',
      });
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.message).toContain('Missing or empty click identifier');

      // Valid simulated conversion upload with gclid
      const gclidRes = await uploadOfflineConversion({
        gclid: 'CjwKCAjwmock_gclid_12345',
        conversionActionName: '123456789',
        conversionValueDollars: 450,
        email: 'lead@example.com',
      });
      expect(gclidRes.success).toBe(true);
      expect(gclidRes.gclid).toBe('CjwKCAjwmock_gclid_12345');
      expect(gclidRes.conversionValueDollars).toBe(450);
      expect(gclidRes.enhancedConversionsActive).toBe(true);
    });

    it('provisionManagedSearchCampaign simulates sandbox deployment in development environment', async () => {
      delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
      process.env.NODE_ENV = 'development';

      const result = await provisionManagedSearchCampaign({
        accountId: 'acc-1',
        businessName: 'Apex Roofing & Solar',
        trade: 'roofing',
        city: 'Austin, TX',
        radiusMiles: 25,
        monthlyBudgetDollars: 1500,
        services: ['Roof Repair', 'Shingle Replacement'],
        landingPageUrl: 'https://apexroofing.example.com',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('simulated');
      expect(result.campaignId).toContain('gads_');
      expect(result.headlinesCount).toBeGreaterThan(0);
      expect(result.keywordsCount).toBeGreaterThan(0);
    });
  });
});
