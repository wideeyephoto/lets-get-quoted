import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadVoiceEntitlement } from '@/lib/voice/entitlement';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

let entitlement: Record<string, unknown> | null;
let entitlementError: unknown;
let purchased: unknown;
let purchasedError: unknown;
let creditBalance: unknown;
let creditBalanceError: unknown;

const admin = {
  from(table: string) {
    if (table === 'workspace_usage_credit_balances') {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({
        data: creditBalance !== null && creditBalance !== undefined ? { available_units: creditBalance } : null,
        error: creditBalanceError,
      });
      return chain;
    }
    if (table !== 'workspace_entitlements') throw new Error(`unexpected table ${table}`);
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data: entitlement, error: entitlementError });
    return chain;
  },
  rpc(name: string, args: Record<string, unknown>) {
    expect(name).toBe('workspace_purchased_capacity_units');
    expect(args).toEqual({ p_account_id: ACCOUNT, p_resource_code: 'voice_minutes' });
    return Promise.resolve({ data: purchased, error: purchasedError });
  },
} as never;

beforeEach(() => {
  entitlement = {
    entitlement_state: 'active',
    feature_limits: {
      voice_included_minutes: 0,
      voice_concurrent_calls: 1,
      voice_history_days: 30,
    },
    feature_flags: { voice_included: false, voice_advanced_routing: false },
  };
  entitlementError = null;
  purchased = 0;
  purchasedError = null;
  creditBalance = 0;
  creditBalanceError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('explicit AI Voice entitlement', () => {
  it('does not treat a concurrency limit as entitlement', async () => {
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toEqual({
      available: true, enabled: false, source: 'none', concurrentCalls: 0, historyDays: 0, advancedRouting: false,
    });
  });

  it('accepts explicit base-plan inclusion', async () => {
    entitlement = {
      ...(entitlement ?? {}),
      feature_limits: {
        voice_included_minutes: 100, voice_concurrent_calls: 3, voice_history_days: 90,
      },
      feature_flags: { voice_included: true, voice_advanced_routing: true },
    };
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toEqual({
      available: true, enabled: true, source: 'included', concurrentCalls: 3, historyDays: 90, advancedRouting: true,
    });
  });

  it('accepts active purchased voice capacity for a non-included plan', async () => {
    purchased = 100;
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toEqual({
      available: true, enabled: true, source: 'add_on', concurrentCalls: 1, historyDays: 30, advancedRouting: false,
    });
  });

  it('accepts available voice minutes balance for a non-included plan', async () => {
    creditBalance = 100;
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toEqual({
      available: true, enabled: true, source: 'add_on', concurrentCalls: 1, historyDays: 30, advancedRouting: false,
    });
  });

  it('fails closed for a restricted workspace', async () => {
    entitlement = { ...(entitlement ?? {}), entitlement_state: 'restricted' };
    purchased = 100;
    expect((await loadVoiceEntitlement(admin, ACCOUNT)).enabled).toBe(false);
  });

  it('keeps included voice when only the optional add-on lookup fails', async () => {
    entitlement = {
      ...(entitlement ?? {}),
      feature_limits: {
        voice_included_minutes: 100, voice_concurrent_calls: 3, voice_history_days: 90,
      },
      feature_flags: { voice_included: true, voice_advanced_routing: true },
    };
    purchasedError = { message: 'rpc unavailable' };
    expect((await loadVoiceEntitlement(admin, ACCOUNT)).enabled).toBe(true);
  });

  it('distinguishes an unreadable entitlement from a verified no-entitlement state', async () => {
    entitlementError = { message: 'workspace read unavailable' };
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toMatchObject({ available: false, enabled: false });

    entitlementError = null;
    entitlement = null;
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toMatchObject({ available: true, enabled: false });
  });

  it('does not call an unreadable add-on ledger a verified no-purchase', async () => {
    purchasedError = { message: 'capacity RPC unavailable' };
    expect(await loadVoiceEntitlement(admin, ACCOUNT)).toMatchObject({ available: false, enabled: false });
  });

  it('guarantees real live concurrency floors of at least 3 for Solo and 5 for Growth', async () => {
    creditBalance = 100;
    entitlement = {
      entitlement_state: 'active',
      plan_code: 'solo',
      feature_limits: { voice_concurrent_calls: 1 },
      feature_flags: { voice_included: false },
    };
    expect((await loadVoiceEntitlement(admin, ACCOUNT)).concurrentCalls).toBe(3);

    entitlement = {
      entitlement_state: 'active',
      plan_code: 'growth',
      feature_limits: { voice_concurrent_calls: 1 },
      feature_flags: { voice_included: false },
    };
    expect((await loadVoiceEntitlement(admin, ACCOUNT)).concurrentCalls).toBe(5);

    entitlement = {
      entitlement_state: 'active',
      plan_code: 'scale',
      feature_limits: { voice_concurrent_calls: 3 },
      feature_flags: { voice_included: true },
    };
    expect((await loadVoiceEntitlement(admin, ACCOUNT)).concurrentCalls).toBe(10);
  });
});
