import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests inject the projection store');
  },
}));

import {
  SupabaseLegacyPaymentPlanProjectionStore,
  projectLegacyPaymentPlanPayment,
  type LegacyPaymentPlanProjectionInput,
} from '@/lib/billing/legacy-payment-plan-projector';

const PAYMENT_ID = '10000000-0000-4000-8000-000000000001';
const PLAN_ID = '20000000-0000-4000-8000-000000000002';

const input: LegacyPaymentPlanProjectionInput = {
  paymentId: PAYMENT_ID,
  stripeCustomerId: 'cus_saved_customer',
  stripePaymentMethodId: 'pm_saved_card',
  cardBrand: 'visa',
  cardLast4: '4242',
};

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    projection_status: 'activated',
    payment_plan_id: PLAN_ID,
    projected_plan_status: 'active',
    projected_installment_count: 4,
    canceled_payment_count: 0,
    feed_recorded: true,
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

describe('dark service-only legacy payment-plan projector adapter', () => {
  it('passes only normalized identity/card evidence and freezes the result', async () => {
    const { admin, rpc } = adminReturning();
    const store = new SupabaseLegacyPaymentPlanProjectionStore(admin);

    const result = await store.project(input);

    expect(rpc).toHaveBeenCalledWith('project_legacy_payment_plan_payment', {
      p_payment_id: PAYMENT_ID,
      p_stripe_customer_id: 'cus_saved_customer',
      p_stripe_payment_method_id: 'pm_saved_card',
      p_card_brand: 'visa',
      p_card_last4: '4242',
    });
    expect(result).toEqual({
      status: 'activated',
      paymentId: PAYMENT_ID,
      paymentPlanId: PLAN_ID,
      planStatus: 'active',
      installmentCount: 4,
      canceledPaymentCount: 0,
      feedRecorded: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('sends explicit nulls when no saved-card evidence is available', async () => {
    const { admin, rpc } = adminReturning(validRow({
      projection_status: 'activation_replay',
    }));

    await projectLegacyPaymentPlanPayment(
      { paymentId: PAYMENT_ID },
      new SupabaseLegacyPaymentPlanProjectionStore(admin),
    );

    expect(rpc).toHaveBeenCalledWith('project_legacy_payment_plan_payment', {
      p_payment_id: PAYMENT_ID,
      p_stripe_customer_id: null,
      p_stripe_payment_method_id: null,
      p_card_brand: null,
      p_card_last4: null,
    });
  });

  it.each([
    ['activation_repaired', 'active', 4, 0, true],
    ['activation_replay', 'active', 4, 0, true],
    ['payoff_finalized', 'paid_off', 4, 3, true],
    ['payoff_repaired', 'paid_off', 4, 1, true],
    ['payoff_replay', 'paid_off', 4, 0, true],
    ['payoff_lock_released', 'active', 4, 0, false],
    ['payoff_lock_release_replay', 'pending_deposit', 0, 0, false],
    ['stale_payoff_noop', 'active', 4, 0, false],
  ])('accepts coherent %s database outcome', async (
    status,
    planStatus,
    installments,
    canceled,
    feed,
  ) => {
    const { admin } = adminReturning(validRow({
      projection_status: status,
      projected_plan_status: planStatus,
      projected_installment_count: installments,
      canceled_payment_count: canceled,
      feed_recorded: feed,
    }));

    const result = await new SupabaseLegacyPaymentPlanProjectionStore(admin).project({
      paymentId: PAYMENT_ID,
    });

    expect(result.status).toBe(status);
    expect(result.planStatus).toBe(planStatus);
  });

  it.each([
    ['unknown projection status', { projection_status: 'partially_applied' }, /unsupported status/i],
    ['activation without active plan', { projected_plan_status: 'paid_off' }, /internally inconsistent/i],
    ['activation without feed', { feed_recorded: false }, /internally inconsistent/i],
    ['payoff without paid-off plan', {
      projection_status: 'payoff_finalized',
      projected_plan_status: 'active',
    }, /internally inconsistent/i],
    ['lock result with feed', {
      projection_status: 'payoff_lock_released',
      feed_recorded: true,
    }, /internally inconsistent/i],
    ['too many installments', { projected_installment_count: 25 }, /supported maximum/i],
    ['negative cancel count', { canceled_payment_count: -1 }, /nonnegative safe integer/i],
    ['too many canceled rows', { canceled_payment_count: 6 }, /exceeds plan capacity/i],
    ['missing feed boolean', { feed_recorded: null }, /must be explicit/i],
    ['bad plan identity', { payment_plan_id: 'not-a-uuid' }, /paymentPlanId/i],
  ])('fails closed on %s', async (_label, overrides, message) => {
    const { admin } = adminReturning(validRow(overrides));
    const store = new SupabaseLegacyPaymentPlanProjectionStore(admin);

    await expect(store.project({ paymentId: PAYMENT_ID })).rejects.toThrow(message);
  });

  it.each([
    [{ paymentId: 'not-a-uuid' }, /paymentId/i],
    [{ paymentId: PAYMENT_ID, stripeCustomerId: 'acct_wrong' }, /stripeCustomerId/i],
    [{ paymentId: PAYMENT_ID, stripePaymentMethodId: 'card_wrong' }, /stripePaymentMethodId/i],
    [{ paymentId: PAYMENT_ID, cardBrand: '' }, /cardBrand/i],
    [{ paymentId: PAYMENT_ID, cardLast4: '42x2' }, /cardLast4/i],
  ])('rejects malformed evidence before calling the RPC', async (badInput, message) => {
    const { admin, rpc } = adminReturning();
    const store = new SupabaseLegacyPaymentPlanProjectionStore(admin);

    await expect(store.project(badInput)).rejects.toThrow(message);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves a database conflict without synthesizing a fallback result', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '55000', message: 'paid payoff does not own the current lock' },
    });
    const store = new SupabaseLegacyPaymentPlanProjectionStore({ rpc } as unknown as SupabaseClient);

    await expect(store.project({ paymentId: PAYMENT_ID })).rejects.toThrow(/does not own/i);
  });

  it('rejects empty, scalar, or ambiguous RPC result sets', async () => {
    for (const data of [null, {}, [], [validRow(), validRow()]]) {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const store = new SupabaseLegacyPaymentPlanProjectionStore({ rpc } as unknown as SupabaseClient);
      await expect(store.project({ paymentId: PAYMENT_ID })).rejects.toThrow(/exactly one result row/i);
    }
  });

  it('stays server-only and is referenced only by the inactive exact-1 coordinator', () => {
    const adapter = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'legacy-payment-plan-projector.ts',
    );
    const coordinator = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'legacy-payment-projection-coordinator.ts',
    );
    expect(readFileSync(adapter, 'utf8')).toContain("import 'server-only';");
    expect(readFileSync(coordinator, 'utf8')).toContain("import 'server-only';");

    const allowed = new Set([adapter, coordinator]);
    const activeFiles = sourceFiles(join(process.cwd(), 'src')).filter((file) => !allowed.has(file));

    for (const file of activeFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('legacy-payment-plan-projector');
      expect(source).not.toContain('project_legacy_payment_plan_payment');
    }

    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'stripe', 'webhook', 'route.ts'),
      'utf8',
    );
    expect(env).toContain('LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED=0');
    expect(route).not.toContain('legacy-payment-projection-coordinator');
  });
});
