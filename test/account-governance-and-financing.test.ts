/**
 * Account Governance, Audit & Financing Coverage Test
 *
 * Targets:
 *   - src/lib/acorn-financing.ts (provider constants, feature flags, prequal URLs)
 *   - src/lib/ad-wallet-predictor.ts (burn rate prediction, weekend surge, refill URLs)
 *   - src/lib/account-flags.ts (whitelisted account settings switches)
 *   - src/lib/account-notes.ts (staff notes and categorization tags)
 *   - src/lib/account-events.ts (settings audit trail recording and queries)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  ACORN_PROVIDER_ID,
  ACORN_PROVIDER_NAME,
  ACORN_MIN_LOAN_AMOUNT,
  ACORN_BASE_URL,
  ACORN_STANDARD_DISCLOSURE,
  isHomeownerFinancingFeatureEnabled,
  isHomeownerFinancingCustomerSurfacesEnabled,
  buildAcornApplyUrl,
} from '@/lib/acorn-financing';

import {
  predictAdWalletDepletion,
} from '@/lib/ad-wallet-predictor';

import {
  ACCOUNT_FLAGS,
  isAccountFlag,
  accountFlag,
} from '@/lib/account-flags';

import {
  listAccountNotes,
  addAccountNote,
  listAccountTags,
  addAccountTag,
} from '@/lib/account-notes';

import {
  recordAccountEvent,
  listAccountEvents,
} from '@/lib/account-events';

describe('Account Governance & Financing Engine', () => {
  let mockSupabase: any;

  function createQueryChain(resultData: any = null, resultError: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      maybeSingle: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      then: (resolve: any) => Promise.resolve({ data: resultData, error: resultError }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createQueryChain();
    mocks.createAdminClient.mockReturnValue(mockSupabase);
  });

  // ── acorn-financing ─────────────────────────────────────────────────────────

  describe('acorn-financing — provider constants & flags', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    it('exports standard Acorn network constants', () => {
      expect(ACORN_PROVIDER_ID).toBe('acorn');
      expect(ACORN_PROVIDER_NAME).toBe('Acorn Finance');
      expect(ACORN_MIN_LOAN_AMOUNT).toBe(1000);
      expect(ACORN_BASE_URL).toContain('acornfinance.com');
      expect(ACORN_STANDARD_DISCLOSURE).toContain('independent lending marketplace');
    });

    it('evaluates isHomeownerFinancingFeatureEnabled based on env flag', () => {
      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '1';
      expect(isHomeownerFinancingFeatureEnabled()).toBe(true);

      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '0';
      expect(isHomeownerFinancingFeatureEnabled()).toBe(false);

      delete process.env.LGQ_HOMEOWNER_FINANCING_ENABLED;
      expect(isHomeownerFinancingFeatureEnabled()).toBe(false);
    });

    it('requires feature flag 1 to be enabled for customer surfaces flag 2 to be active', () => {
      // Flag 1 disabled, Flag 2 enabled -> should return false
      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '0';
      process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED = '1';
      expect(isHomeownerFinancingCustomerSurfacesEnabled()).toBe(false);

      // Both enabled -> returns true
      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '1';
      process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED = '1';
      expect(isHomeownerFinancingCustomerSurfacesEnabled()).toBe(true);

      // Flag 1 enabled, Flag 2 disabled -> returns false
      process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED = '0';
      expect(isHomeownerFinancingCustomerSurfacesEnabled()).toBe(false);
    });
  });

  describe('acorn-financing — buildAcornApplyUrl', () => {
    it('builds URL with dealer code and partner attribution', () => {
      const urlString = buildAcornApplyUrl({
        dealerCode: 'DEALER-456',
        docRef: 'INV-1001',
        amount: 3500,
      });

      const parsed = new URL(urlString);
      expect(parsed.searchParams.get('d')).toBe('DEALER-456');
      expect(parsed.searchParams.get('utm_source')).toBe('letsgetquoted');
      expect(parsed.searchParams.get('utm_content')).toBe('INV-1001');
      expect(parsed.searchParams.get('amount')).toBe('3500');
    });

    it('falls back to env partner code when dealerCode is omitted', () => {
      process.env.ACORN_FINANCE_PARTNER_CODE = 'FALLBACK-PARTNER';
      const urlString = buildAcornApplyUrl({ docRef: 'QUOTE-202' });
      const parsed = new URL(urlString);
      expect(parsed.searchParams.get('d')).toBe('FALLBACK-PARTNER');
    });

    it('omits amount parameter when below ACORN_MIN_LOAN_AMOUNT', () => {
      const urlString = buildAcornApplyUrl({ amount: 500 });
      const parsed = new URL(urlString);
      expect(parsed.searchParams.get('amount')).toBeNull();
    });

    it('rounds float amounts to nearest whole dollar', () => {
      const urlString = buildAcornApplyUrl({ amount: 2499.75 });
      const parsed = new URL(urlString);
      expect(parsed.searchParams.get('amount')).toBe('2500');
    });
  });

  // ── ad-wallet-predictor ─────────────────────────────────────────────────────

  describe('ad-wallet-predictor — predictAdWalletDepletion', () => {
    it('calculates depletion with default history when spend is empty', () => {
      const result = predictAdWalletDepletion({
        accountId: 'acc-1',
        currentBalanceDollars: 350,
        recentDailySpend: [],
        now: new Date('2026-06-02T12:00:00Z'), // Tuesday (no weekend surge)
      });

      expect(result.accountId).toBe('acc-1');
      expect(result.averageDailyBurnDollars).toBe(35);
      expect(result.isWeekendSurgeImpending).toBe(false);
      expect(result.estimatedDaysRemaining).toBe(10);
      expect(result.urgency).toBe('healthy');
      expect(result.oneTapRefillUrl).toContain('acc-1');
    });

    it('applies 1.35x weekend surge multiplier on Friday', () => {
      const friday = new Date('2026-06-05T12:00:00Z'); // Friday (day 5)
      const result = predictAdWalletDepletion({
        accountId: 'acc-surge',
        currentBalanceDollars: 100,
        recentDailySpend: [50, 50],
        now: friday,
      });

      expect(result.isWeekendSurgeImpending).toBe(true);
      // Daily burn 50 * 1.35 = 67.5 -> 100 / 67.5 = ~1.5 days
      expect(result.estimatedDaysRemaining).toBeLessThan(2);
      expect(result.urgency).toBe('critical');
    });

    it('marks urgency critical when days remaining <= 1.5', () => {
      const result = predictAdWalletDepletion({
        accountId: 'acc-low',
        currentBalanceDollars: 20,
        recentDailySpend: [25, 25],
        now: new Date('2026-06-03T12:00:00Z'), // Wednesday
      });

      expect(result.estimatedDaysRemaining).toBeLessThanOrEqual(1.5);
      expect(result.urgency).toBe('critical');
    });

    it('marks urgency warning when days remaining <= 3.5', () => {
      const result = predictAdWalletDepletion({
        accountId: 'acc-warn',
        currentBalanceDollars: 60,
        recentDailySpend: [20, 20],
        now: new Date('2026-06-03T12:00:00Z'), // Wednesday
      });

      expect(result.estimatedDaysRemaining).toBe(3);
      expect(result.urgency).toBe('warning');
    });
  });

  // ── account-flags ───────────────────────────────────────────────────────────

  describe('account-flags — whitelist validation', () => {
    it('defines the 7 supported account feature switches', () => {
      expect(ACCOUNT_FLAGS).toHaveLength(7);
      const keys = ACCOUNT_FLAGS.map((f) => f.key);
      expect(keys).toContain('instant_book_enabled');
      expect(keys).toContain('extra_stop_enabled');
      expect(keys).toContain('deposit_on_approval');
      expect(keys).toContain('quote_followups_enabled');
      expect(keys).toContain('appointment_reminders_enabled');
      expect(keys).toContain('daily_digest_enabled');
      expect(keys).toContain('auto_review_request');
    });

    it('isAccountFlag returns true for valid flags', () => {
      expect(isAccountFlag('instant_book_enabled')).toBe(true);
      expect(isAccountFlag('extra_stop_enabled')).toBe(true);
      expect(isAccountFlag('deposit_on_approval')).toBe(true);
    });

    it('isAccountFlag returns false for dangerous or non-existent columns', () => {
      expect(isAccountFlag('connect_onboarded')).toBe(false);
      expect(isAccountFlag('is_admin')).toBe(false);
      expect(isAccountFlag('stripe_account_id')).toBe(false);
      expect(isAccountFlag('random_string')).toBe(false);
      expect(isAccountFlag('')).toBe(false);
    });

    it('accountFlag returns descriptor object for valid key', () => {
      const flag = accountFlag('instant_book_enabled');
      expect(flag.label).toBe('Instant booking');
      expect(flag.help).toBeDefined();
    });
  });

  // ── account-notes ───────────────────────────────────────────────────────────

  describe('account-notes — staff notes & tags', () => {
    it('listAccountNotes returns notes ordered by created_at descending', async () => {
      const mockNotes = [
        { id: 'n-1', account_id: 'acc-1', body: 'Called owner regarding renewal', created_by: 'staff@example.com', created_at: '2026-03-01T10:00:00Z' },
      ];
      mockSupabase = createQueryChain(mockNotes);

      const result = await listAccountNotes(mockSupabase, 'acc-1');
      expect(result).toHaveLength(1);
      expect(result[0].body).toBe('Called owner regarding renewal');
      expect(mockSupabase.from).toHaveBeenCalledWith('account_notes');
    });

    it('listAccountNotes returns empty array on query error without throwing', async () => {
      mockSupabase = createQueryChain(null, new Error('Relation does not exist'));

      const result = await listAccountNotes(mockSupabase, 'acc-1');
      expect(result).toEqual([]);
    });

    it('addAccountNote inserts note into account_notes', async () => {
      mockSupabase = createQueryChain(null);

      await addAccountNote(mockSupabase, 'acc-1', 'staff@example.com', 'Follow-up needed');
      expect(mockSupabase.from).toHaveBeenCalledWith('account_notes');
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        account_id: 'acc-1',
        body: 'Follow-up needed',
        created_by: 'staff@example.com',
      });
    });

    it('listAccountTags returns tags ordered by created_at ascending', async () => {
      const mockTags = [
        { id: 't-1', account_id: 'acc-1', tag: 'vip', created_by: 'staff@example.com', created_at: '2026-01-01T00:00:00Z' },
      ];
      mockSupabase = createQueryChain(mockTags);

      const result = await listAccountTags(mockSupabase, 'acc-1');
      expect(result).toHaveLength(1);
      expect(result[0].tag).toBe('vip');
      expect(mockSupabase.from).toHaveBeenCalledWith('account_tags');
    });

    it('addAccountTag normalizes tag by trimming and lowercasing', async () => {
      mockSupabase = createQueryChain(null);

      await addAccountTag(mockSupabase, 'acc-1', 'staff@example.com', '  High-Value-Client  ');
      expect(mockSupabase.from).toHaveBeenCalledWith('account_tags');
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 'acc-1',
          tag: 'high-value-client',
          created_by: 'staff@example.com',
        }),
      );
    });
  });

  // ── account-events ──────────────────────────────────────────────────────────

  describe('account-events — audit logging', () => {
    it('recordAccountEvent inserts audit event via admin client', async () => {
      mockSupabase = createQueryChain(null);
      mocks.createAdminClient.mockReturnValue(mockSupabase);

      await recordAccountEvent({
        accountId: 'acc-1',
        kind: 'automation_toggled',
        summary: 'Instant book toggled on',
        actorEmail: 'owner@example.com',
        meta: { switch: 'instant_book_enabled', value: true },
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('account_events');
      expect(mockSupabase.insert).toHaveBeenCalledWith({
        account_id: 'acc-1',
        kind: 'automation_toggled',
        summary: 'Instant book toggled on',
        actor_email: 'owner@example.com',
        meta: { switch: 'instant_book_enabled', value: true },
      });
    });

    it('recordAccountEvent catches errors silently to never fail business action', async () => {
      mockSupabase = createQueryChain(null, new Error('Insert failed'));
      mocks.createAdminClient.mockReturnValue(mockSupabase);

      await expect(
        recordAccountEvent({
          accountId: 'acc-1',
          kind: 'weather_morning_alert',
          summary: 'Morning alert delivered',
        }),
      ).resolves.not.toThrow();
    });

    it('listAccountEvents returns events in descending order', async () => {
      const mockEvents = [
        { id: 'ev-1', kind: 'plan_change_applied', summary: 'Upgraded to Pro', actor_email: null, created_at: '2026-03-01T12:00:00Z' },
      ];
      mockSupabase = createQueryChain(mockEvents);

      const result = await listAccountEvents(mockSupabase, 'acc-1', 5);
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Upgraded to Pro');
      expect(mockSupabase.from).toHaveBeenCalledWith('account_events');
      expect(mockSupabase.limit).toHaveBeenCalledWith(5);
    });

    it('listAccountEvents returns empty array on error without throwing', async () => {
      mockSupabase = createQueryChain(null, new Error('Table does not exist'));

      const result = await listAccountEvents(mockSupabase, 'acc-1');
      expect(result).toEqual([]);
    });
  });
});
