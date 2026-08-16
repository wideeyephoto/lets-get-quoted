import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('late-success tests inject the task store');
  },
}));

import {
  ConnectedPaymentLateSuccessProviderError,
  SupabaseConnectedPaymentLateSuccessStore,
  reconcileConnectedPaymentLateSuccess,
  type ConnectedPaymentLateSuccessPlan,
  type ConnectedPaymentLateSuccessStore,
} from '@/lib/billing/connected-payment-late-success-reconciler';
import type { ConnectedPaymentProjection } from '@/lib/billing/connected-payment-event-projector';

const EVENT_ID = '10000000-0000-4000-8000-000000000001';
const EVENT_CLAIM = '20000000-0000-4000-8000-000000000002';
const TASK_ID = '30000000-0000-4000-8000-000000000003';
const TASK_CLAIM = '40000000-0000-4000-8000-000000000004';
const WORKSPACE_ID = '50000000-0000-4000-8000-000000000005';
const PAYMENT_ID = '60000000-0000-4000-8000-000000000006';
const PAID_OPERATION_PK = '70000000-0000-4000-8000-000000000007';
const CURRENT_OPERATION_PK = '80000000-0000-4000-8000-000000000008';
const MERCHANT_ID = 'acct_merchant123';
const PAID_SESSION_ID = 'cs_test_predecessor123';
const SUCCESSOR_SESSION_ID = 'cs_test_successor123';
const SUCCESSOR_OPERATION_ID = `payment:${PAYMENT_ID}:checkout:2`;
const SUCCESSOR_EXPIRY = '2026-08-17T02:00:00.000Z';
const NOW = new Date('2026-08-16T03:00:00.000Z');

function plan(): ConnectedPaymentLateSuccessPlan {
  return {
    projectionKind: 'late_predecessor',
    taskId: TASK_ID,
    taskClaimToken: TASK_CLAIM,
    workspaceId: WORKSPACE_ID,
    paymentId: PAYMENT_ID,
    merchantAccountId: MERCHANT_ID,
    livemode: false,
    paidOperationPk: PAID_OPERATION_PK,
    paidOperationId: `payment:${PAYMENT_ID}:checkout:1`,
    paidCheckoutSessionId: PAID_SESSION_ID,
    paidCheckoutGeneration: 1,
    amountCents: 25_000,
    applicationFeeCents: 50,
    reconciliationStatus: 'pending',
  };
}

const projection = {
  schema: 'stripe_connected_payment_projection_v1',
  provider_event_id: 'evt_latesuccess123',
  event_type: 'checkout.session.completed',
  event_created_at: '2026-08-16T02:00:00.000Z',
  workspace_id: WORKSPACE_ID,
  payment_id: PAYMENT_ID,
  operation_id: `payment:${PAYMENT_ID}:checkout:1`,
  checkout_session_id: PAID_SESSION_ID,
  payment_intent_id: 'pi_predecessor123',
  charge_id: 'ch_predecessor123',
  application_fee_id: 'fee_predecessor123',
  balance_transaction_id: 'txn_predecessor123',
  merchant_account_id: MERCHANT_ID,
  livemode: false,
  currency: 'usd',
  amount_cents: 25_000,
  application_fee_cents: 50,
  paid_at: '2026-08-16T01:59:00.000Z',
  reconciliation_status: 'reconciled',
} satisfies ConnectedPaymentProjection;

function successor(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: SUCCESSOR_SESSION_ID,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    currency: 'usd',
    amount_subtotal: 25_000,
    amount_total: 25_000,
    payment_method_types: ['card'],
    expires_at: Date.parse(SUCCESSOR_EXPIRY) / 1_000,
    recovered_from: null,
    after_expiration: null,
    status: 'open',
    payment_status: 'unpaid',
    payment_intent: null,
    metadata: {
      lgq_charge_model: 'merchant_direct_v1',
      lgq_merchant_account_id: MERCHANT_ID,
      lgq_operation_id: SUCCESSOR_OPERATION_ID,
      lgq_workspace_id: WORKSPACE_ID,
      lgq_payment_id: PAYMENT_ID,
      lgq_checkout_generation: '2',
    },
    url: 'https://checkout.stripe.test/private-url',
    ...overrides,
  } as Stripe.Checkout.Session;
}

function setup(options: {
  action?: 'retrieve_then_expire' | 'successor_neutralized' | 'manual_review';
} = {}) {
  const action = options.action ?? 'retrieve_then_expire';
  const store = {
    prepare: vi.fn<ConnectedPaymentLateSuccessStore['prepare']>().mockResolvedValue({
      action,
      taskState: action === 'retrieve_then_expire' ? 'leased' : action,
      reasonCode: action === 'successor_neutralized'
        ? 'successor_never_submitted'
        : action === 'manual_review'
          ? 'successor_provider_state_indeterminate'
          : 'successor_provider_expiration_required',
      currentOperationPk: CURRENT_OPERATION_PK,
      currentOperationId: SUCCESSOR_OPERATION_ID,
      currentCheckoutGeneration: 2,
      currentCheckoutSessionId: action === 'retrieve_then_expire' ? SUCCESSOR_SESSION_ID : null,
      currentCheckoutSessionExpiresAt: action === 'retrieve_then_expire' ? SUCCESSOR_EXPIRY : null,
      expireOperationId:
        `payment:${PAYMENT_ID}:late-success:1:successor:2:expire`,
    }),
    finalize: vi.fn<ConnectedPaymentLateSuccessStore['finalize']>().mockImplementation(
      async (input) => ({
        status: 'manual_reconciliation',
        billingEventId: input.billingEventId,
        taskId: input.plan.taskId,
        taskState: input.outcome,
        reasonCode: input.reasonCode,
      }),
    ),
    fail: vi.fn<ConnectedPaymentLateSuccessStore['fail']>().mockResolvedValue(undefined),
  } satisfies ConnectedPaymentLateSuccessStore;
  const provider = {
    retrieve: vi.fn().mockResolvedValue(successor()),
    expire: vi.fn().mockResolvedValue(successor({
      status: 'expired',
      payment_status: 'unpaid',
      url: null,
    })),
    now: vi.fn().mockReturnValue(NOW),
  };
  return { store, provider };
}

function reconcile(dependencies: ReturnType<typeof setup>) {
  return reconcileConnectedPaymentLateSuccess({
    billingEventId: EVENT_ID,
    eventClaimToken: EVENT_CLAIM,
    plan: plan(),
    projection,
  }, dependencies as never);
}

describe('connected payment late-success reconciliation', () => {
  it('terminalizes an already-expired successor without another provider mutation', async () => {
    const dependencies = setup();
    dependencies.provider.retrieve.mockResolvedValue(successor({
      status: 'expired',
      payment_status: 'unpaid',
      url: null,
    }));

    await expect(reconcile(dependencies)).resolves.toMatchObject({
      status: 'manual_reconciliation',
      taskState: 'successor_neutralized',
    });
    expect(dependencies.provider.expire).not.toHaveBeenCalled();
    expect(dependencies.store.finalize).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'successor_neutralized',
      reasonCode: 'successor_expired_unpaid',
      observation: expect.objectContaining({
        source: 'retrieve',
        checkout_session_id: SUCCESSOR_SESSION_ID,
      }),
    }));
    expect(JSON.stringify(dependencies.store.finalize.mock.calls)).not.toContain('private-url');
  });

  it('expires only an exact open-unpaid successor and confirms fresh provider state', async () => {
    const dependencies = setup();
    dependencies.provider.retrieve
      .mockResolvedValueOnce(successor())
      .mockResolvedValueOnce(successor({
        status: 'expired',
        payment_status: 'unpaid',
        url: null,
      }));

    await expect(reconcile(dependencies)).resolves.toMatchObject({
      taskState: 'successor_neutralized',
    });
    expect(dependencies.provider.expire).toHaveBeenCalledWith({
      merchantAccountId: MERCHANT_ID,
      checkoutSessionId: SUCCESSOR_SESSION_ID,
      operationId: `payment:${PAYMENT_ID}:late-success:1:successor:2:expire`,
    });
    expect(dependencies.provider.retrieve).toHaveBeenCalledTimes(2);
  });

  it('re-reads after an expire error and preserves a winning successor payment', async () => {
    const dependencies = setup();
    dependencies.provider.expire.mockRejectedValue(new Error('private provider text'));
    dependencies.provider.retrieve
      .mockResolvedValueOnce(successor())
      .mockResolvedValueOnce(successor({
        status: 'complete',
        payment_status: 'paid',
        payment_intent: 'pi_successor123',
        url: null,
      }));

    await expect(reconcile(dependencies)).resolves.toMatchObject({
      taskState: 'manual_review',
      reasonCode: 'successor_additional_paid_truth',
    });
    expect(dependencies.store.finalize).toHaveBeenCalledWith(expect.objectContaining({
      outcome: 'manual_review',
      observation: expect.objectContaining({
        source: 'post_error_retrieve',
        payment_intent_id: 'pi_successor123',
      }),
    }));
    expect(JSON.stringify(dependencies.store.finalize.mock.calls)).not.toContain('private provider text');
  });

  it('keeps an exact still-open successor retryable after an expiry attempt', async () => {
    const dependencies = setup();
    dependencies.provider.expire.mockRejectedValue(new Error('transient 429'));
    dependencies.provider.retrieve
      .mockResolvedValueOnce(successor())
      .mockResolvedValueOnce(successor());

    await expect(reconcile(dependencies)).rejects.toMatchObject({
      name: 'ConnectedPaymentLateSuccessProviderError',
      code: 'late_success_successor_expire_indeterminate',
      retryable: true,
    } satisfies Partial<ConnectedPaymentLateSuccessProviderError>);
    expect(dependencies.store.finalize).not.toHaveBeenCalled();
  });

  it('never expires a successor whose immutable identity is contradictory', async () => {
    const dependencies = setup();
    dependencies.provider.retrieve.mockResolvedValue(successor({
      metadata: { ...successor().metadata, lgq_payment_id: WORKSPACE_ID },
    }));

    await expect(reconcile(dependencies)).resolves.toMatchObject({
      taskState: 'manual_review',
      reasonCode: 'successor_contract_mismatch',
    });
    expect(dependencies.provider.expire).not.toHaveBeenCalled();
    expect(dependencies.store.finalize).toHaveBeenCalledWith(expect.objectContaining({
      observation: null,
    }));
  });

  it('rejects an expanded recovered-from Session instead of normalizing it to null', async () => {
    const dependencies = setup();
    dependencies.provider.retrieve.mockResolvedValue(successor({
      recovered_from: { id: PAID_SESSION_ID } as unknown as Stripe.Checkout.Session['recovered_from'],
    }));

    await expect(reconcile(dependencies)).resolves.toMatchObject({
      taskState: 'manual_review',
      reasonCode: 'successor_contract_mismatch',
    });
    expect(dependencies.provider.expire).not.toHaveBeenCalled();
  });

  it('keeps provider ambiguity retryable and free of raw error details', async () => {
    const dependencies = setup();
    dependencies.provider.retrieve.mockRejectedValue(new Error('customer@example.com'));

    await expect(reconcile(dependencies)).rejects.toMatchObject({
      name: 'ConnectedPaymentLateSuccessProviderError',
      code: 'late_success_successor_retrieve_failed',
      retryable: true,
    } satisfies Partial<ConnectedPaymentLateSuccessProviderError>);
    expect(dependencies.store.finalize).not.toHaveBeenCalled();
  });

  it('performs no provider work for a database-neutralized or manual successor', async () => {
    for (const action of ['successor_neutralized', 'manual_review'] as const) {
      const dependencies = setup({ action });
      await expect(reconcile(dependencies)).resolves.toMatchObject({
        taskState: action,
      });
      expect(dependencies.provider.retrieve).not.toHaveBeenCalled();
      expect(dependencies.provider.expire).not.toHaveBeenCalled();
    }
  });

  it('validates the exact Supabase prepare and finalize RPC contracts', async () => {
    const expireOperationId =
      `payment:${PAYMENT_ID}:late-success:1:successor:2:expire`;
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{
          resolution_action: 'retrieve_then_expire',
          task_state: 'leased',
          reason_code: 'successor_provider_expiration_required',
          current_operation_pk: CURRENT_OPERATION_PK,
          current_operation_id: SUCCESSOR_OPERATION_ID,
          current_checkout_generation: 2,
          current_checkout_session_id: SUCCESSOR_SESSION_ID,
          current_checkout_session_expires_at: SUCCESSOR_EXPIRY,
          expire_operation_id: expireOperationId,
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          processing_status: 'processed',
          billing_event_id: EVENT_ID,
          task_id: TASK_ID,
          task_state: 'successor_neutralized',
          reason_code: 'successor_expired_unpaid',
          projection_applied: false,
          projection_result: 'direct_payment_late_success_resolution_pending',
        }],
        error: null,
      });
    const store = new SupabaseConnectedPaymentLateSuccessStore({ rpc } as never);

    await expect(store.prepare({
      billingEventId: EVENT_ID,
      eventClaimToken: EVENT_CLAIM,
      plan: plan(),
      projection,
    })).resolves.toMatchObject({ expireOperationId });
    await expect(store.finalize({
      billingEventId: EVENT_ID,
      eventClaimToken: EVENT_CLAIM,
      plan: plan(),
      outcome: 'successor_neutralized',
      reasonCode: 'successor_expired_unpaid',
      observation: null,
    })).resolves.toMatchObject({
      taskState: 'successor_neutralized',
      reasonCode: 'successor_expired_unpaid',
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'prepare_stripe_connected_checkout_late_success_resolution',
      'finalize_stripe_connected_checkout_late_success_resolution',
    ]);
  });

  it('rejects a privileged finalize row that claims provider truth was applied', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        processing_status: 'processed',
        billing_event_id: EVENT_ID,
        task_id: TASK_ID,
        task_state: 'manual_review',
        reason_code: 'successor_contract_mismatch',
        projection_applied: true,
        projection_result: 'direct_payment_late_success_manual_review',
      }],
      error: null,
    });
    const store = new SupabaseConnectedPaymentLateSuccessStore({ rpc } as never);

    await expect(store.finalize({
      billingEventId: EVENT_ID,
      eventClaimToken: EVENT_CLAIM,
      plan: plan(),
      outcome: 'manual_review',
      reasonCode: 'successor_contract_mismatch',
      observation: null,
    })).rejects.toThrow(/disposition changed/i);
  });
});
