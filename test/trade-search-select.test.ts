import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferTradeFromBusinessName, resolveTradeAutoSuggest } from '@/components/trade-search-select';
import { matchTrades } from '@/lib/trade-matching';


const mocks = vi.hoisted(() => ({
  basePlanSubscriptionCheckoutEnabled: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  planUsageDashboardEnabled: vi.fn(),
  recordAccountEvent: vi.fn(),
  requireOwnerContext: vi.fn(),
  revalidatePath: vi.fn(),
  select: vi.fn(),
  sendContractorWelcomeEmail: vi.fn(),
  sendFounderSignupAlert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: mocks.requireOwnerContext,
}));

vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: mocks.recordAccountEvent,
}));

vi.mock('@/lib/billing/base-plan-subscription-entrypoint', () => ({
  basePlanSubscriptionCheckoutEnabled: mocks.basePlanSubscriptionCheckoutEnabled,
}));

vi.mock('@/lib/billing/plan-usage', () => ({
  planUsageDashboardEnabled: mocks.planUsageDashboardEnabled,
}));

vi.mock('@/lib/founder-alerts', () => ({
  sendFounderSignupAlert: mocks.sendFounderSignupAlert,
}));

vi.mock('@/lib/contractor-lifecycle-emails', () => ({
  sendContractorWelcomeEmail: mocks.sendContractorWelcomeEmail,
}));

import { completeFirstRunAction } from '@/app/welcome/actions';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000002';

function ownerContext(account: Record<string, unknown> | null) {
  return {
    supabase: { from: mocks.from },
    accountId: ACCOUNT_ID,
    userId: USER_ID,
    account,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: { id: ACCOUNT_ID }, error: null });

  mocks.requireOwnerContext.mockResolvedValue(ownerContext({ terms_accepted_at: null }));
  mocks.recordAccountEvent.mockResolvedValue(undefined);
  mocks.sendContractorWelcomeEmail.mockResolvedValue(undefined);
  mocks.sendFounderSignupAlert.mockResolvedValue(undefined);
  mocks.planUsageDashboardEnabled.mockReturnValue(false);
  mocks.basePlanSubscriptionCheckoutEnabled.mockReturnValue(false);
});

describe('Trade Search & Auto-Suggest', () => {
  describe('inferTradeFromBusinessName', () => {
    it('infers Glass & Mirror Companies from Midwest Glass Company', () => {
      const match = inferTradeFromBusinessName('Midwest Glass Company');
      expect(match).not.toBeNull();
      expect(match?.slug).toBe('glass-and-mirrors');
    });

    it('infers Plumbers from Brookhaven Plumbing', () => {
      const match = inferTradeFromBusinessName('Brookhaven Plumbing');
      expect(match).not.toBeNull();
      expect(match?.slug).toBe('plumbers');
    });

    it('infers Roofers from Summit Roofing & Gutters LLC', () => {
      const match = inferTradeFromBusinessName('Summit Roofing & Gutters LLC');
      expect(match).not.toBeNull();
      expect(match?.slug).toBe('roofers');
    });

    it('infers Electricians from Apex Electrical Solutions', () => {
      const match = inferTradeFromBusinessName('Apex Electrical Solutions');
      expect(match).not.toBeNull();
      expect(match?.slug).toBe('electricians');
    });

    it('returns null for generic names with no trade indicators', () => {
      expect(inferTradeFromBusinessName('Smith & Sons Enterprises')).toBeNull();
      expect(inferTradeFromBusinessName('')).toBeNull();
      expect(inferTradeFromBusinessName(null)).toBeNull();
    });
  });

  describe('resolveTradeAutoSuggest logic', () => {
    it('auto-fills trade from business name when trade is empty and untouched', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Brookhaven Plumbing',
        currentValue: '',
        isAutoFilled: false,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'set', slug: 'plumbers', name: 'Plumbers' });
    });

    it('does not fill after the trade field has been touched by the user', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Brookhaven Plumbing',
        currentValue: '',
        isAutoFilled: false,
        userTouched: true,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'none' });
    });

    it('does not fill over an initial trade (e.g. from URL ?trade= or account)', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Brookhaven Plumbing',
        currentValue: 'electricians',
        isAutoFilled: false,
        userTouched: false,
        hasInitialTrade: true,
      });
      expect(decision).toEqual({ action: 'none' });
    });

    it('never overwrites an already chosen manual trade', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Apex Roofing LLC',
        currentValue: 'electricians',
        isAutoFilled: false,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'none' });
    });

    it('does not fill when business name has no trade indicators', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Smith & Sons Enterprises',
        currentValue: '',
        isAutoFilled: false,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'none' });
    });

    it('clears an auto-filled trade when business name is cleared', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: '',
        currentValue: 'plumbers',
        isAutoFilled: true,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'clear' });
    });

    it('does NOT clear a manually chosen trade when business name is cleared', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: '',
        currentValue: 'plumbers',
        isAutoFilled: false,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'none' });
    });

    it('updates auto-fill when business name changes to another trade', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Brookhaven Roofing',
        currentValue: 'plumbers',
        isAutoFilled: true,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'set', slug: 'roofers', name: 'Roofers' });
    });

    it('clears auto-fill when business name changes to a name without a trade', () => {
      const decision = resolveTradeAutoSuggest({
        businessName: 'Smith & Sons',
        currentValue: 'plumbers',
        isAutoFilled: true,
        userTouched: false,
        hasInitialTrade: false,
      });
      expect(decision).toEqual({ action: 'clear' });
    });

    it('includes accessible .welcome-guess live region in component source', () => {
      const source = readFileSync('src/components/trade-search-select.tsx', 'utf8');
      expect(source).toContain('welcome-guess');
      expect(source).toContain('aria-live="polite"');
      expect(source).toContain('Guessed from your business name. Not right?');
      expect(source).toContain('Pick your trade above.');
    });
  });


  describe('matchTrades querying', () => {
    it('finds glass-related trades when searching "glass"', () => {
      const matches = matchTrades('glass', { limit: 5 });
      const slugs = matches.map((m) => m.slug);
      expect(slugs).toContain('glass-and-mirrors');
    });

    it('finds plumbers when given typos like "plumbr"', () => {
      const matches = matchTrades('plumbr', { limit: 3 });
      expect(matches[0]?.slug).toBe('plumbers');
    });

    it('finds electricians when given phonetic variants like "electrishun"', () => {
      const matches = matchTrades('electrishun', { limit: 3 });
      expect(matches[0]?.slug).toBe('electricians');
    });
  });

  describe('completeFirstRunAction trade resolution', () => {
    it('accepts valid trade slug directly', async () => {
      const result = await completeFirstRunAction({
        businessName: 'Midwest Glass Company',
        trade: 'glass-and-mirrors',
        postalCode: '48226',
        accepted: true,
      });

      expect(result.ok).toBe(true);
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: 'glass-and-mirrors',
        }),
      );
    });

    it('gracefully resolves trade name to canonical slug', async () => {
      const result = await completeFirstRunAction({
        businessName: 'Midwest Glass Company',
        trade: 'Glass & Mirror Companies',
        postalCode: '48226',
        accepted: true,
      });

      expect(result.ok).toBe(true);
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: 'glass-and-mirrors',
        }),
      );
    });

    it('gracefully resolves colloquial trade alias to slug', async () => {
      const result = await completeFirstRunAction({
        businessName: 'Apex Sparky Services',
        trade: 'electrician',
        postalCode: '10001',
        accepted: true,
      });

      expect(result.ok).toBe(true);
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: 'electricians',
        }),
      );
    });

    it('stores null for empty string or "Something else"', async () => {
      const result1 = await completeFirstRunAction({
        businessName: 'Custom Crafts Co.',
        trade: '',
        postalCode: '10001',
        accepted: true,
      });
      expect(result1.ok).toBe(true);
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: null,
        }),
      );

      const result2 = await completeFirstRunAction({
        businessName: 'Custom Crafts Co.',
        trade: 'Something else',
        postalCode: '10001',
        accepted: true,
      });
      expect(result2.ok).toBe(true);
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          trade: null,
        }),
      );
    });

    it('fails closed for completely unrecognised trade string', async () => {
      const result = await completeFirstRunAction({
        businessName: 'Test Business',
        trade: 'xyznonexistenttrade12345',
        postalCode: '10001',
        accepted: true,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('Pick a trade from the list, or choose "Something else".');
      }
    });
  });
});
