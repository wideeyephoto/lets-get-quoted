import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests inject the binding store');
  },
}));

import {
  SupabaseLegacyPayoffOwnerBindingStore,
  bindLegacyPaymentPlanPayoffOwner,
  type LegacyPayoffOwnerBindingInput,
} from '@/lib/billing/legacy-payment-plan-payoff-owner-binding';

const PLAN_ID = '20000000-0000-4000-8000-000000000002';
const PAYMENT_ID = '10000000-0000-4000-8000-000000000001';
const LOCKED_AT = '2026-08-16T03:12:45.123Z';

const input: LegacyPayoffOwnerBindingInput = {
  paymentPlanId: PLAN_ID,
  paymentId: PAYMENT_ID,
};

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    binding_status: 'bound',
    payment_plan_id: PLAN_ID,
    payoff_payment_id: PAYMENT_ID,
    locked_at: LOCKED_AT,
    remaining_cents: 125_050,
    ...overrides,
  };
}

function adminReturning(row: Record<string, unknown> = validRow()) {
  const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
  return { rpc, admin: { rpc } as unknown as SupabaseClient };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

beforeEach(() => vi.clearAllMocks());

describe('dark service-only legacy payoff-owner binding adapter', () => {
  it('passes normalized identities only and freezes the parsed result', async () => {
    const { admin, rpc } = adminReturning();
    const store = new SupabaseLegacyPayoffOwnerBindingStore(admin);

    const result = await store.bind({
      paymentPlanId: `  ${PLAN_ID.toUpperCase()}  `,
      paymentId: ` ${PAYMENT_ID.toUpperCase()} `,
    });

    expect(rpc).toHaveBeenCalledWith('bind_legacy_payment_plan_payoff_owner', {
      p_payment_plan_id: PLAN_ID,
      p_payment_id: PAYMENT_ID,
    });
    expect(result).toEqual({
      status: 'bound',
      paymentPlanId: PLAN_ID,
      paymentId: PAYMENT_ID,
      lockedAt: LOCKED_AT,
      remainingCents: 125_050,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('accepts a coherent same-owner idempotent replay', async () => {
    const { admin } = adminReturning(validRow({ binding_status: 'already_bound' }));

    const result = await bindLegacyPaymentPlanPayoffOwner(
      input,
      new SupabaseLegacyPayoffOwnerBindingStore(admin),
    );

    expect(result.status).toBe('already_bound');
    expect(result.paymentId).toBe(PAYMENT_ID);
  });

  it.each([
    [{ paymentPlanId: 'not-a-uuid', paymentId: PAYMENT_ID }, /paymentPlanId/i],
    [{ paymentPlanId: PLAN_ID, paymentId: 'not-a-uuid' }, /paymentId/i],
  ])('rejects malformed identity before the RPC', async (badInput, message) => {
    const { admin, rpc } = adminReturning();
    const store = new SupabaseLegacyPayoffOwnerBindingStore(admin);

    await expect(store.bind(badInput)).rejects.toThrow(message);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown status', { binding_status: 'partially_bound' }, /unsupported status/i],
    ['different plan', {
      payment_plan_id: '30000000-0000-4000-8000-000000000003',
    }, /different plan or payment/i],
    ['different payment', {
      payoff_payment_id: '30000000-0000-4000-8000-000000000003',
    }, /different plan or payment/i],
    ['missing lock', { locked_at: null }, /lockedAt is missing/i],
    ['timezone-less lock', { locked_at: '2026-08-16T03:12:45' }, /iso timestamp/i],
    ['zero cents', { remaining_cents: 0 }, /positive safe integer/i],
    ['fractional cents', { remaining_cents: 12.5 }, /positive safe integer/i],
    ['unsafe cents', { remaining_cents: '9007199254740992' }, /positive safe integer/i],
  ])('fails closed on %s', async (_label, overrides, message) => {
    const { admin } = adminReturning(validRow(overrides));
    const store = new SupabaseLegacyPayoffOwnerBindingStore(admin);

    await expect(store.bind(input)).rejects.toThrow(message);
  });

  it('preserves a database conflict without inventing fallback state', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '55000', message: 'different lock owner' },
    });
    const store = new SupabaseLegacyPayoffOwnerBindingStore(
      { rpc } as unknown as SupabaseClient,
    );

    await expect(store.bind(input)).rejects.toThrow(/different lock owner/i);
  });

  it('rejects empty, scalar, and ambiguous RPC result sets', async () => {
    for (const data of [null, {}, [], [validRow(), validRow()]]) {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const store = new SupabaseLegacyPayoffOwnerBindingStore(
        { rpc } as unknown as SupabaseClient,
      );
      await expect(store.bind(input)).rejects.toThrow(/exactly one result row/i);
    }
  });

  it('stays server-only, unreferenced by active callers, and has no runtime flag', () => {
    const adapter = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'legacy-payment-plan-payoff-owner-binding.ts',
    );
    const adapterSource = readFileSync(adapter, 'utf8');
    expect(adapterSource).toContain("import 'server-only';");
    expect(adapterSource).not.toContain("from 'stripe'");

    const activeFiles = sourceFiles(join(process.cwd(), 'src')).filter(
      (file) => file !== adapter,
    );
    // A silent zero passes every assertion below it. The walk is the thing
    // most likely to break, and its failure looks exactly like success.
    expect(activeFiles.length).toBeGreaterThan(1_000);
    activeFiles.push(join(process.cwd(), '.env.example'), join(process.cwd(), 'vercel.json'));

    for (const file of activeFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('legacy-payment-plan-payoff-owner-binding');
      expect(source).not.toContain('bind_legacy_payment_plan_payoff_owner');
      expect(source).not.toContain('LEGACY_PAYOFF_OWNER_BINDING_ENABLED');
    }
  });
});
