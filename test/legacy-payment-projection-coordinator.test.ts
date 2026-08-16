import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('coordinator tests must not construct an admin client');
  },
}));

import {
  LEGACY_PAYMENT_PLAN_PROJECTION_FLAG,
  LEGACY_QUICK_STOP_RECONCILIATION_FLAG,
  LegacyPaymentProjectionContractError,
  SupabaseLegacyProjectionBindingStore,
  coordinateLegacyDestinationPaymentProjection,
  legacyPaymentPlanProjectionEnabled,
  legacyQuickStopReconciliationEnabled,
  type LegacyDestinationPaymentBinding,
  type LegacyProjectionCoordinatorInput,
  type LegacyProjectionCoordinatorServices,
} from '@/lib/billing/legacy-payment-projection-coordinator';

const PAYMENT_ID = '10000000-0000-4000-8000-000000000001';
const PLAN_ID = '20000000-0000-4000-8000-000000000002';
const SESSION_ID = 'cs_test_exact_session';
const PAYMENT_INTENT_ID = 'pi_exact_intent';

function input(
  overrides: Partial<LegacyProjectionCoordinatorInput['event']> = {},
): LegacyProjectionCoordinatorInput {
  return {
    event: {
      eventId: 'evt_exact_legacy_projection',
      eventType: 'checkout.session.completed',
      eventObjectId: SESSION_ID,
      paymentIntentId: PAYMENT_INTENT_ID,
      paymentId: PAYMENT_ID,
      outcome: 'settled',
      ...overrides,
    },
    savedCard: {
      stripeCustomerId: 'cus_exact_customer',
      stripePaymentMethodId: 'pm_exact_card',
      cardBrand: 'visa',
      cardLast4: '4242',
    },
    legacy: {
      plan: vi.fn(async () => undefined),
      quickStop: vi.fn(async () => undefined),
    },
  };
}

function binding(overrides: Partial<LegacyDestinationPaymentBinding> = {}): LegacyDestinationPaymentBinding {
  return {
    paymentId: PAYMENT_ID,
    paymentPlanId: PLAN_ID,
    kind: 'deposit',
    status: 'paid',
    chargeModel: 'destination',
    imported: false,
    stripeCheckoutSession: SESSION_ID,
    stripePaymentIntent: PAYMENT_INTENT_ID,
    ...overrides,
  };
}

function planResult() {
  return {
    status: 'activated' as const,
    paymentId: PAYMENT_ID,
    paymentPlanId: PLAN_ID,
    planStatus: 'active' as const,
    installmentCount: 4,
    canceledPaymentCount: 0,
    feedRecorded: true,
  };
}

function services(
  payment: LegacyDestinationPaymentBinding = binding(),
): LegacyProjectionCoordinatorServices {
  return {
    loadBinding: vi.fn(async () => payment),
    projectPlan: vi.fn(async () => planResult()),
    reconcileQuickStop: vi.fn(async () => ({
      status: 'confirmed' as const,
      requestId: '30000000-0000-4000-8000-000000000003',
      taskId: null,
      taskState: null,
    })),
  };
}

function enabled(...flags: string[]) {
  return Object.fromEntries(flags.map((flag) => [flag, '1']));
}

describe('DARK legacy destination-payment projection coordinator', () => {
  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'keeps both cutovers off for every non-exact-1 value (%s)',
    async (configured) => {
      const legacy = input({
        // Prove the disabled branch does not validate the new event contract.
        paymentId: 'pre-cutover-legacy-id',
      });
      const injected = services();

      const result = await coordinateLegacyDestinationPaymentProjection(legacy, {
        env: {
          [LEGACY_PAYMENT_PLAN_PROJECTION_FLAG]: configured,
          [LEGACY_QUICK_STOP_RECONCILIATION_FLAG]: configured,
        },
        services: injected,
      });

      expect(result).toEqual({
        bindingChecked: false,
        plan: 'legacy',
        quickStop: 'legacy',
        planProjection: null,
        quickStopReconciliation: null,
      });
      expect(legacy.legacy.plan).toHaveBeenCalledTimes(1);
      expect(legacy.legacy.quickStop).toHaveBeenCalledTimes(1);
      expect(injected.loadBinding).not.toHaveBeenCalled();
      expect(injected.projectPlan).not.toHaveBeenCalled();
      expect(injected.reconcileQuickStop).not.toHaveBeenCalled();
    },
  );

  it('recognizes the two exact-1 server flags independently', () => {
    expect(legacyPaymentPlanProjectionEnabled(enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG)))
      .toBe(true);
    expect(legacyPaymentPlanProjectionEnabled({ [LEGACY_PAYMENT_PLAN_PROJECTION_FLAG]: 'true' }))
      .toBe(false);
    expect(legacyQuickStopReconciliationEnabled(enabled(LEGACY_QUICK_STOP_RECONCILIATION_FLAG)))
      .toBe(true);
    expect(legacyQuickStopReconciliationEnabled({ [LEGACY_QUICK_STOP_RECONCILIATION_FLAG]: '1 ' }))
      .toBe(false);
  });

  it('does not construct the default service-role client while both gates are off', async () => {
    const savedCard = vi.fn(async () => ({ stripeCustomerId: 'cus_must_not_load' }));
    const request = {
      ...input({ paymentId: 'old-path-does-not-validate-this' }),
      savedCard,
    };

    await expect(coordinateLegacyDestinationPaymentProjection(request, { env: {} }))
      .resolves.toMatchObject({ bindingChecked: false, plan: 'legacy', quickStop: 'legacy' });
    expect(request.legacy.plan).toHaveBeenCalledTimes(1);
    expect(request.legacy.quickStop).toHaveBeenCalledTimes(1);
    expect(savedCard).not.toHaveBeenCalled();
  });

  it('does not let the independent Quick Stop flag add work to a non-Quick-Stop callback', async () => {
    const request = input();
    const injected = services();
    const savedCard = vi.fn(async () => ({ stripeCustomerId: 'cus_must_not_load' }));

    await expect(coordinateLegacyDestinationPaymentProjection({
      ...request,
      savedCard,
      legacy: { plan: request.legacy.plan },
    }, {
      env: enabled(LEGACY_QUICK_STOP_RECONCILIATION_FLAG),
      services: injected,
    })).resolves.toMatchObject({ bindingChecked: false, plan: 'legacy', quickStop: 'not_requested' });

    expect(request.legacy.plan).toHaveBeenCalledTimes(1);
    expect(injected.loadBinding).not.toHaveBeenCalled();
    expect(injected.projectPlan).not.toHaveBeenCalled();
    expect(injected.reconcileQuickStop).not.toHaveBeenCalled();
    expect(savedCard).not.toHaveBeenCalled();
  });

  it('replaces rather than duplicates enabled plan and Quick Stop transitions', async () => {
    const request = input();
    const injected = services();

    const result = await coordinateLegacyDestinationPaymentProjection(request, {
      env: enabled(
        LEGACY_PAYMENT_PLAN_PROJECTION_FLAG,
        LEGACY_QUICK_STOP_RECONCILIATION_FLAG,
      ),
      services: injected,
    });

    expect(result).toMatchObject({
      bindingChecked: true,
      plan: 'projected',
      quickStop: 'reconciled',
      planProjection: planResult(),
      quickStopReconciliation: { status: 'confirmed' },
    });
    expect(injected.loadBinding).toHaveBeenCalledTimes(1);
    expect(injected.loadBinding).toHaveBeenCalledWith(PAYMENT_ID);
    expect(injected.projectPlan).toHaveBeenCalledWith({
      paymentId: PAYMENT_ID,
      stripeCustomerId: 'cus_exact_customer',
      stripePaymentMethodId: 'pm_exact_card',
      cardBrand: 'visa',
      cardLast4: '4242',
    });
    expect(injected.reconcileQuickStop).toHaveBeenCalledWith(PAYMENT_ID);
    expect(request.legacy.plan).not.toHaveBeenCalled();
    expect(request.legacy.quickStop).not.toHaveBeenCalled();
  });

  it('cannot let an untyped saved-card object override the verified payment identity', async () => {
    const base = input();
    const request = {
      ...base,
      savedCard: {
        ...base.savedCard,
        paymentId: '90000000-0000-4000-8000-000000000009',
      },
    } as LegacyProjectionCoordinatorInput;
    const injected = services();

    await coordinateLegacyDestinationPaymentProjection(request, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: injected,
    });

    expect(injected.projectPlan).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: PAYMENT_ID,
    }));
  });

  it('resolves saved-card evidence lazily only for an enabled bound deposit', async () => {
    const request = input();
    const injected = services();
    const savedCard = vi.fn(async () => ({
      stripeCustomerId: 'cus_lazy_customer',
      stripePaymentMethodId: 'pm_lazy_card',
      cardBrand: 'visa',
      cardLast4: '4242',
    }));

    await coordinateLegacyDestinationPaymentProjection({ ...request, savedCard }, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: injected,
    });

    expect(savedCard).toHaveBeenCalledTimes(1);
    expect(injected.projectPlan).toHaveBeenCalledWith({
      paymentId: PAYMENT_ID,
      stripeCustomerId: 'cus_lazy_customer',
      stripePaymentMethodId: 'pm_lazy_card',
      cardBrand: 'visa',
      cardLast4: '4242',
    });

    const payoffRequest = input();
    const payoffServices = services(binding({ kind: 'final' }));
    const payoffSavedCard = vi.fn(async () => ({ stripeCustomerId: 'cus_must_not_load' }));
    await coordinateLegacyDestinationPaymentProjection({
      ...payoffRequest,
      savedCard: payoffSavedCard,
    }, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: payoffServices,
    });
    expect(payoffSavedCard).not.toHaveBeenCalled();
    expect(payoffServices.projectPlan).toHaveBeenCalledWith({ paymentId: PAYMENT_ID });
  });

  it('cuts over either side independently without layering its legacy callback', async () => {
    const planOnly = input();
    const planServices = services();
    await expect(coordinateLegacyDestinationPaymentProjection(planOnly, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: planServices,
    })).resolves.toMatchObject({ plan: 'projected', quickStop: 'legacy' });
    expect(planOnly.legacy.plan).not.toHaveBeenCalled();
    expect(planOnly.legacy.quickStop).toHaveBeenCalledTimes(1);
    expect(planServices.reconcileQuickStop).not.toHaveBeenCalled();

    const quickOnly = input();
    const quickServices = services();
    await expect(coordinateLegacyDestinationPaymentProjection(quickOnly, {
      env: enabled(LEGACY_QUICK_STOP_RECONCILIATION_FLAG),
      services: quickServices,
    })).resolves.toMatchObject({ plan: 'legacy', quickStop: 'reconciled' });
    expect(quickOnly.legacy.plan).toHaveBeenCalledTimes(1);
    expect(quickOnly.legacy.quickStop).not.toHaveBeenCalled();
    expect(quickServices.projectPlan).not.toHaveBeenCalled();
  });

  it('keeps ordinary installment completion on its existing callback', async () => {
    const request = input();
    const injected = services(binding({ kind: 'plan_installment' }));

    const result = await coordinateLegacyDestinationPaymentProjection(request, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: injected,
    });

    expect(result.plan).toBe('legacy');
    expect(request.legacy.plan).toHaveBeenCalledTimes(1);
    expect(injected.projectPlan).not.toHaveBeenCalled();
  });

  it('projects an exactly bound failed payoff but never runs Quick Stop reconciliation', async () => {
    const request = input({
      eventType: 'checkout.session.expired',
      eventObjectId: SESSION_ID,
      paymentIntentId: null,
      outcome: 'failed',
    });
    const injected = services(binding({
      kind: 'final',
      status: 'failed',
      stripePaymentIntent: null,
    }));

    const result = await coordinateLegacyDestinationPaymentProjection(request, {
      env: enabled(
        LEGACY_PAYMENT_PLAN_PROJECTION_FLAG,
        LEGACY_QUICK_STOP_RECONCILIATION_FLAG,
      ),
      services: injected,
    });

    expect(result).toMatchObject({ plan: 'projected', quickStop: 'not_requested' });
    expect(injected.projectPlan).toHaveBeenCalledWith(expect.objectContaining({ paymentId: PAYMENT_ID }));
    expect(injected.reconcileQuickStop).not.toHaveBeenCalled();
    expect(request.legacy.quickStop).not.toHaveBeenCalled();
  });

  it.each([
    ['event null / payment non-null', null, PAYMENT_INTENT_ID],
    ['event non-null / payment null', PAYMENT_INTENT_ID, null],
  ])('rejects contradictory expired-Session PaymentIntent binding: %s', async (
    _label,
    eventPaymentIntent,
    storedPaymentIntent,
  ) => {
    const request = input({
      eventType: 'checkout.session.expired',
      paymentIntentId: eventPaymentIntent,
      outcome: 'failed',
    });
    const injected = services(binding({
      kind: 'final',
      status: 'failed',
      stripePaymentIntent: storedPaymentIntent,
    }));

    await expect(coordinateLegacyDestinationPaymentProjection(request, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: injected,
    })).rejects.toMatchObject({ code: 'payment_intent_binding_mismatch' });
    expect(injected.projectPlan).not.toHaveBeenCalled();
  });

  it.each([
    ['direct rail', binding({ chargeModel: 'other' }), {}, 'payment_rail_invalid'],
    ['imported payment', binding({ imported: true }), {}, 'payment_rail_invalid'],
    ['unsettled payment', binding({ status: 'other' }), {}, 'payment_settlement_truth_invalid'],
    ['different Session', binding({ stripeCheckoutSession: 'cs_test_other' }), {}, 'payment_checkout_binding_mismatch'],
    ['different PaymentIntent', binding({ stripePaymentIntent: 'pi_other' }), {}, 'payment_intent_binding_mismatch'],
    ['wrong event outcome', binding(), { outcome: 'failed' as const }, 'event_outcome_mismatch'],
  ])('fails closed on %s before a projector RPC', async (_label, payment, eventOverrides, code) => {
    const request = input(eventOverrides);
    const injected = services(payment);

    await expect(coordinateLegacyDestinationPaymentProjection(request, {
      env: enabled(
        LEGACY_PAYMENT_PLAN_PROJECTION_FLAG,
        LEGACY_QUICK_STOP_RECONCILIATION_FLAG,
      ),
      services: injected,
    })).rejects.toMatchObject({ code });

    expect(injected.projectPlan).not.toHaveBeenCalled();
    expect(injected.reconcileQuickStop).not.toHaveBeenCalled();
    expect(request.legacy.plan).not.toHaveBeenCalled();
    expect(request.legacy.quickStop).not.toHaveBeenCalled();
  });

  it('requires exact PaymentIntent identity for PI and Charge events', async () => {
    const piRequest = input({
      eventType: 'payment_intent.succeeded',
      eventObjectId: PAYMENT_INTENT_ID,
      paymentIntentId: 'pi_other',
    });
    await expect(coordinateLegacyDestinationPaymentProjection(piRequest, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: services(),
    })).rejects.toMatchObject({ code: 'event_payment_intent_mismatch' });

    const chargeRequest = input({
      eventType: 'charge.failed',
      eventObjectId: 'ch_failed_charge',
      paymentIntentId: PAYMENT_INTENT_ID,
      outcome: 'failed',
    });
    await expect(coordinateLegacyDestinationPaymentProjection(chargeRequest, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: services(binding({ kind: 'final', status: 'failed' })),
    })).resolves.toMatchObject({ plan: 'projected' });
  });

  it('propagates binding and RPC errors without a legacy fallback', async () => {
    const databaseError = { code: 'PGRST000', message: 'database unavailable' };
    const bindingFailure = input();
    const bindingServices = services();
    vi.mocked(bindingServices.loadBinding).mockRejectedValue(databaseError);
    await expect(coordinateLegacyDestinationPaymentProjection(bindingFailure, {
      env: enabled(LEGACY_PAYMENT_PLAN_PROJECTION_FLAG),
      services: bindingServices,
    })).rejects.toBe(databaseError);
    expect(bindingFailure.legacy.plan).not.toHaveBeenCalled();

    const projectionFailure = new Error('transactional projector failed');
    const projectionRequest = input();
    const projectionServices = services();
    vi.mocked(projectionServices.projectPlan).mockRejectedValue(projectionFailure);
    await expect(coordinateLegacyDestinationPaymentProjection(projectionRequest, {
      env: enabled(
        LEGACY_PAYMENT_PLAN_PROJECTION_FLAG,
        LEGACY_QUICK_STOP_RECONCILIATION_FLAG,
      ),
      services: projectionServices,
    })).rejects.toBe(projectionFailure);
    expect(projectionServices.reconcileQuickStop).not.toHaveBeenCalled();
    expect(projectionRequest.legacy.plan).not.toHaveBeenCalled();
    expect(projectionRequest.legacy.quickStop).not.toHaveBeenCalled();

    const reconciliationFailure = new Error('transactional reconciliation failed');
    const reconciliationRequest = input();
    const reconciliationServices = services();
    vi.mocked(reconciliationServices.reconcileQuickStop).mockRejectedValue(reconciliationFailure);
    await expect(coordinateLegacyDestinationPaymentProjection(reconciliationRequest, {
      env: enabled(
        LEGACY_PAYMENT_PLAN_PROJECTION_FLAG,
        LEGACY_QUICK_STOP_RECONCILIATION_FLAG,
      ),
      services: reconciliationServices,
    })).rejects.toBe(reconciliationFailure);
    expect(reconciliationServices.projectPlan).toHaveBeenCalledTimes(1);
    expect(reconciliationRequest.legacy.quickStop).not.toHaveBeenCalled();
  });

  it('loads the exact payment binding and preserves PostgREST errors', async () => {
    const eq = vi.fn();
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: PAYMENT_ID,
        payment_plan_id: PLAN_ID,
        kind: 'deposit',
        status: 'paid',
        charge_model: 'destination',
        imported: false,
        stripe_checkout_session: SESSION_ID,
        stripe_payment_intent: PAYMENT_INTENT_ID,
      },
      error: null,
    }));
    const query = {
      select: vi.fn(),
      eq,
      maybeSingle,
    };
    query.select.mockReturnValue(query);
    eq.mockReturnValue(query);
    const admin = { from: vi.fn(() => query) } as unknown as SupabaseClient;
    const store = new SupabaseLegacyProjectionBindingStore(admin);

    await expect(store.load(PAYMENT_ID)).resolves.toEqual(binding());
    expect(admin.from).toHaveBeenCalledWith('payments');
    expect(eq).toHaveBeenCalledWith('id', PAYMENT_ID);
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    const databaseError = { code: '42501', message: 'denied' };
    maybeSingle.mockResolvedValueOnce({ data: null, error: databaseError } as never);
    await expect(store.load(PAYMENT_ID)).rejects.toBe(databaseError);
  });

  it('is server-only, wired behind dark exact-1 gates, and documents both gates as zero', () => {
    const coordinator = readFileSync(join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'legacy-payment-projection-coordinator.ts',
    ), 'utf8');
    const webhook = readFileSync(join(
      process.cwd(),
      'src',
      'app',
      'api',
      'stripe',
      'webhook',
      'route.ts',
    ), 'utf8');
    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(coordinator.startsWith("import 'server-only';")).toBe(true);
    expect(webhook).toContain('legacy-payment-projection-coordinator');
    expect(webhook).toContain('coordinateLegacyDestinationPaymentProjection');
    expect(webhook).toContain('legacyPaymentPlanProjectionEnabled');
    expect(webhook).toContain('legacyQuickStopReconciliationEnabled');
    expect(env).toContain('signed legacy webhook is the gated caller');
    expect(env).not.toContain('No active caller exists yet');
    expect(env).toContain(`${LEGACY_PAYMENT_PLAN_PROJECTION_FLAG}=0`);
    expect(env).toContain(`${LEGACY_QUICK_STOP_RECONCILIATION_FLAG}=0`);
    expect(new LegacyPaymentProjectionContractError('fixed').message).toBe('fixed');
  });
});
