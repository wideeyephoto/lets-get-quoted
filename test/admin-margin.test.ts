import { describe, expect, it, vi } from 'vitest';
import {
  COGS_RATES,
  getAccountUnitEconomics,
  batchGetAccountMargins,
  getPlatformMarginSummary,
  getUnprofitableAccountIds,
} from '../src/lib/admin-margin';

describe('platform unit economics & contractor margin engine', () => {
  it('defines the correct standard baseline COGS rates', () => {
    expect(COGS_RATES.SMS_SEGMENT_DOLLARS).toBe(0.0079);
    expect(COGS_RATES.VOICE_MINUTE_DOLLARS).toBe(0.1666);
    expect(COGS_RATES.AI_THREAD_DOLLARS).toBe(0.0020);
  });

  describe('getAccountUnitEconomics', () => {
    it('calculates positive net margin for a healthy contractor', async () => {
      // Setup mock Supabase client
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [
                          { platform_fee: 15.0, platform_fee_refunded: 0, status: 'paid' },
                          { platform_fee: 25.0, platform_fee_refunded: 5.0, status: 'partially_refunded' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [
                          { id: 'sms-1', context: 'general' },
                          { id: 'sms-2', context: 'automation' },
                          { id: 'sms-3', context: 'intake' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'voice_calls') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'vc-1', billed_minutes: 10, ai_seconds: 600 },
                      { id: 'vc-2', billed_minutes: 5, ai_seconds: 300 },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const profile = await getAccountUnitEconomics(mockClient, 'acct-healthy', '30d');

      // Revenue = (15 - 0) + (25 - 5) = $35.00
      expect(profile.feeRevenueDollars).toBe(35.0);

      // SMS = 3 segments * 0.0079 = $0.0237 -> 0.02
      expect(profile.usageBreakdown.smsCount).toBe(3);
      expect(profile.usageBreakdown.smsCostDollars).toBe(0.02);

      // AI threads = 2 ('automation' and 'intake') * 0.0020 = $0.0040 -> 0.00
      expect(profile.usageBreakdown.aiThreads).toBe(2);

      // Voice = 15 minutes * 0.1666 = $2.499 -> 2.50
      expect(profile.usageBreakdown.voiceMinutes).toBe(15);
      expect(profile.usageBreakdown.voiceCostDollars).toBe(2.5);

      // Total COGS = 0.0237 + 2.499 + 0.0040 = 2.5267 -> 2.53
      expect(profile.totalCogsDollars).toBe(2.53);

      // Net margin = 35.00 - 2.5267 = 32.47
      expect(profile.netMarginDollars).toBe(32.47);
      expect(profile.isUnprofitable).toBe(false);
      expect(profile.isDrain).toBe(false);
      expect(profile.marginPct).toBe(93);
    });

    it('identifies an unprofitable contractor where telephony COGS exceed platform fee revenue', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [{ platform_fee: 1.0, platform_fee_refunded: 0, status: 'paid' }],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: new Array(200).fill({ id: 'sms', context: 'intake' }),
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'voice_calls') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [{ id: 'vc-1', billed_minutes: 30, ai_seconds: 1800 }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const profile = await getAccountUnitEconomics(mockClient, 'acct-loss', '30d');

      // Revenue = $1.00
      expect(profile.feeRevenueDollars).toBe(1.0);

      // SMS = 200 * 0.0079 = $1.58
      expect(profile.usageBreakdown.smsCount).toBe(200);
      expect(profile.usageBreakdown.smsCostDollars).toBe(1.58);

      // Voice = 30 * 0.1666 = $5.00
      expect(profile.usageBreakdown.voiceMinutes).toBe(30);

      // AI = 200 * 0.0020 = $0.40
      expect(profile.usageBreakdown.aiThreads).toBe(200);

      // Total COGS > $6.00
      expect(profile.totalCogsDollars).toBeGreaterThan(6.0);
      expect(profile.isUnprofitable).toBe(true);
      expect(profile.netMarginDollars).toBeLessThan(0);
    });

    it('identifies an account drain where $0 revenue has accumulated significant COGS', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: new Array(100).fill({ id: 'sms', context: 'intake' }),
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'voice_calls') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const profile = await getAccountUnitEconomics(mockClient, 'acct-drain', '30d');
      expect(profile.feeRevenueDollars).toBe(0);
      expect(profile.totalCogsDollars).toBeGreaterThanOrEqual(0.5);
      expect(profile.isDrain).toBe(true);
      expect(profile.isUnprofitable).toBe(true);
      expect(profile.marginPct).toBe(-100);
    });
  });

  describe('batchGetAccountMargins', () => {
    it('returns empty map when given empty account list without running database queries', async () => {
      const mockClient = { from: vi.fn() } as any;
      const result = await batchGetAccountMargins(mockClient, []);
      expect(result.size).toBe(0);
      expect(mockClient.from).not.toHaveBeenCalled();
    });

    it('batches revenue, SMS, and voice queries across multiple accounts in single requests', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [
                          { account_id: 'acct-1', platform_fee: 50.0, platform_fee_refunded: 0 },
                          { account_id: 'acct-2', platform_fee: 1.0, platform_fee_refunded: 0 },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [
                          { account_id: 'acct-1' },
                          { account_id: 'acct-2' },
                          { account_id: 'acct-2' },
                          { account_id: 'acct-2' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'voice_calls') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [
                      { account_id: 'acct-2', billed_minutes: 20, ai_seconds: 1200 },
                    ],
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const margins = await batchGetAccountMargins(mockClient, ['acct-1', 'acct-2', 'acct-3']);

      expect(margins.size).toBe(3);

      // acct-1: $50 rev, 1 SMS (~$0.01) -> Profitable
      const m1 = margins.get('acct-1')!;
      expect(m1.feeRevenueDollars).toBe(50.0);
      expect(m1.isUnprofitable).toBe(false);

      // acct-2: $1 rev, 3 SMS + 20 mins voice (~$3.36) -> Unprofitable
      const m2 = margins.get('acct-2')!;
      expect(m2.feeRevenueDollars).toBe(1.0);
      expect(m2.isUnprofitable).toBe(true);

      // acct-3: $0 rev, 0 cogs
      const m3 = margins.get('acct-3')!;
      expect(m3.feeRevenueDollars).toBe(0);
      expect(m3.totalCogsDollars).toBe(0);
      expect(m3.isUnprofitable).toBe(false);
    });
  });

  describe('getPlatformMarginSummary', () => {
    it('aggregates platform gross take and direct COGS correctly', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({
                      data: [
                        { platform_fee: 1000.0, platform_fee_refunded: 50.0 },
                        { platform_fee: 500.0, platform_fee_refunded: 0 },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({
                      data: new Array(1000).fill({ id: 'sms' }),
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'voice_calls') {
            return {
              select: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [
                    { billed_minutes: 300, ai_seconds: 18000 },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const summary = await getPlatformMarginSummary(mockClient, '30d');

      // Gross fees = (1000 - 50) + 500 = $1450.00
      expect(summary.grossPlatformFees).toBe(1450.0);

      // SMS COGS = 1000 * 0.0079 = $7.90
      // Voice COGS = 300 * 0.1666 = $49.98
      // Total COGS = 57.88
      expect(summary.totalTelephonyAndAiCogs).toBe(57.88);

      // Net take = 1450.00 - 57.88 = $1392.12
      expect(summary.netPlatformTake).toBe(1392.12);
      expect(summary.platformMarginPct).toBe(96);
    });
  });

  describe('getUnprofitableAccountIds', () => {
    it('returns only account IDs that have active usage and negative unit margin', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'sms_events') {
            return {
              select: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  not: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [
                          { account_id: 'acct-loss' },
                          { account_id: 'acct-profitable' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [
                          { account_id: 'acct-loss' },
                          { account_id: 'acct-loss' },
                          { account_id: 'acct-profitable' },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'voice_calls') {
            return {
              select: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ account_id: 'acct-loss' }],
                      error: null,
                    }),
                  }),
                }),
                in: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [{ account_id: 'acct-loss', billed_minutes: 15, ai_seconds: 900 }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'payments') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    in: vi.fn().mockReturnValue({
                      gte: vi.fn().mockResolvedValue({
                        data: [
                          // acct-loss has only $0.50 platform fee
                          { account_id: 'acct-loss', platform_fee: 0.50, platform_fee_refunded: 0 },
                          // acct-profitable has $50.00
                          { account_id: 'acct-profitable', platform_fee: 50.00, platform_fee_refunded: 0 },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {};
        }),
      } as any;

      const unprofIds = await getUnprofitableAccountIds(mockClient);
      expect(unprofIds).toEqual(['acct-loss']);
    });
  });
});
