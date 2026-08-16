import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('connected payment projector tests inject database dependencies');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('connected payment projector tests inject provider dependencies');
  },
}));

import {
  ConnectedPaymentProjectionProviderError,
  createConnectedPaymentProjectionResolver,
  projectConnectedPaymentEvent,
  type ConnectedPaymentProjectionBinding,
  type ConnectedPaymentProjectionStore,
  type ConnectedPaymentProjectorClaim,
} from '@/lib/billing/connected-payment-event-projector';

const EVENT_ROW_ID = '10000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = '20000000-0000-4000-8000-000000000002';
const WORKSPACE_ID = '30000000-0000-4000-8000-000000000003';
const PAYMENT_ID = '40000000-0000-4000-8000-000000000004';
const OPERATION_PK = '50000000-0000-4000-8000-000000000005';
const EVENT_ID = 'evt_connectedpayment123';
const MERCHANT_ID = 'acct_merchant123';
const SESSION_ID = 'cs_test_connected123';
const PAYMENT_INTENT_ID = 'pi_connected123';
const CHARGE_ID = 'ch_connected123';
const APPLICATION_FEE_ID = 'fee_connected123';
const BALANCE_TRANSACTION_ID = 'txn_connected123';
const OPERATION_ID = `payment:${PAYMENT_ID}:checkout`;
const CHARGE_CREATED = 1_786_838_300;

function metadata(overrides: Record<string, string> = {}) {
  return {
    lgq_charge_model: 'merchant_direct_v1',
    lgq_merchant_account_id: MERCHANT_ID,
    lgq_workspace_id: WORKSPACE_ID,
    lgq_payment_id: PAYMENT_ID,
    lgq_operation_id: OPERATION_ID,
    ...overrides,
  };
}

function claim(overrides: Partial<ConnectedPaymentProjectorClaim> = {}): ConnectedPaymentProjectorClaim {
  return Object.freeze({
    status: 'claimed',
    billingEventId: EVENT_ROW_ID,
    claimToken: CLAIM_TOKEN,
    attemptCount: 1,
    providerEventId: EVENT_ID,
    eventType: 'checkout.session.completed',
    checkoutSessionId: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    merchantAccountId: MERCHANT_ID,
    livemode: false,
    providerCreatedAt: '2026-08-16T02:00:00.000Z',
    ...overrides,
  });
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    payment_method_types: ['card'],
    currency: 'usd',
    amount_subtotal: 25_000,
    amount_total: 25_000,
    payment_intent: PAYMENT_INTENT_ID,
    metadata: metadata(),
    ...overrides,
  } as Stripe.Checkout.Session;
}

function paymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: PAYMENT_INTENT_ID,
    object: 'payment_intent',
    livemode: false,
    status: 'succeeded',
    currency: 'usd',
    amount: 25_000,
    amount_received: 25_000,
    application_fee_amount: 50,
    latest_charge: CHARGE_ID,
    metadata: metadata(),
    ...overrides,
  } as Stripe.PaymentIntent;
}

function charge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: CHARGE_ID,
    object: 'charge',
    livemode: false,
    status: 'succeeded',
    paid: true,
    captured: true,
    disputed: false,
    refunded: false,
    amount: 25_000,
    amount_captured: 25_000,
    amount_refunded: 0,
    currency: 'usd',
    payment_intent: PAYMENT_INTENT_ID,
    application_fee: APPLICATION_FEE_ID,
    application_fee_amount: 50,
    balance_transaction: BALANCE_TRANSACTION_ID,
    created: CHARGE_CREATED,
    metadata: metadata(),
    ...overrides,
  } as Stripe.Charge;
}

function balance(overrides: Partial<Stripe.BalanceTransaction> = {}): Stripe.BalanceTransaction {
  return {
    id: BALANCE_TRANSACTION_ID,
    object: 'balance_transaction',
    type: 'charge',
    status: 'pending',
    currency: 'usd',
    amount: 25_000,
    source: CHARGE_ID,
    fee: 805,
    net: 24_195,
    fee_details: [
      {
        amount: 755,
        application: null,
        currency: 'usd',
        description: 'Stripe processing fee',
        type: 'stripe_fee',
      },
      {
        amount: 50,
        application: 'ca_lgqplatform123',
        currency: 'usd',
        description: 'LGQ application fee',
        type: 'application_fee',
      },
    ],
    ...overrides,
  } as Stripe.BalanceTransaction;
}

function binding(overrides: Partial<ConnectedPaymentProjectionBinding> = {}): ConnectedPaymentProjectionBinding {
  return Object.freeze({
    operationPk: OPERATION_PK,
    workspaceId: WORKSPACE_ID,
    paymentId: PAYMENT_ID,
    operationId: OPERATION_ID,
    checkoutSessionId: SESSION_ID,
    merchantAccountId: MERCHANT_ID,
    livemode: false,
    amountCents: 25_000,
    applicationFeeCents: 50,
    currentPaymentStatus: 'processing',
    reconciliationStatus: 'pending',
    ...overrides,
  });
}

function provider(overrides: {
  session?: Stripe.Checkout.Session;
  paymentIntent?: Stripe.PaymentIntent;
  charge?: Stripe.Charge;
  balance?: Stripe.BalanceTransaction;
} = {}) {
  const assertMode = vi.fn();
  const retrieveCheckoutSession = vi.fn().mockResolvedValue(overrides.session ?? session());
  const retrievePaymentIntent = vi.fn().mockResolvedValue(overrides.paymentIntent ?? paymentIntent());
  const retrieveCharge = vi.fn().mockResolvedValue(overrides.charge ?? charge());
  const retrieveBalanceTransaction = vi.fn().mockResolvedValue(overrides.balance ?? balance());
  const resolver = createConnectedPaymentProjectionResolver({
    assertMode,
    retrieveCheckoutSession,
    retrievePaymentIntent,
    retrieveCharge,
    retrieveBalanceTransaction,
  });
  return {
    resolver,
    assertMode,
    retrieveCheckoutSession,
    retrievePaymentIntent,
    retrieveCharge,
    retrieveBalanceTransaction,
  };
}

describe('dark connected payment event projector', () => {
  it('retrieves every provider object on the exact connected account and builds reconciled evidence', async () => {
    const stripe = provider();
    const evidence = await stripe.resolver.loadProviderEvidence(claim());
    const projection = stripe.resolver.buildProjection(evidence, binding());

    expect(stripe.assertMode).toHaveBeenCalledWith(false);
    expect(stripe.retrieveCheckoutSession).toHaveBeenCalledWith(SESSION_ID, MERCHANT_ID);
    expect(stripe.retrievePaymentIntent).toHaveBeenCalledWith(PAYMENT_INTENT_ID, MERCHANT_ID);
    expect(stripe.retrieveCharge).toHaveBeenCalledWith(CHARGE_ID, MERCHANT_ID);
    expect(stripe.retrieveBalanceTransaction).toHaveBeenCalledWith(BALANCE_TRANSACTION_ID, MERCHANT_ID);
    expect(projection).toMatchObject({
      schema: 'stripe_connected_payment_projection_v1',
      workspace_id: WORKSPACE_ID,
      payment_id: PAYMENT_ID,
      operation_id: OPERATION_ID,
      checkout_session_id: SESSION_ID,
      payment_intent_id: PAYMENT_INTENT_ID,
      charge_id: CHARGE_ID,
      application_fee_id: APPLICATION_FEE_ID,
      balance_transaction_id: BALANCE_TRANSACTION_ID,
      application_fee_cents: 50,
      reconciliation_status: 'reconciled',
    });
  });

  it('keeps reconciliation pending when connected-account fee or balance evidence is incomplete', async () => {
    const missingBalance = provider({ charge: charge({ balance_transaction: null }) });
    const balanceEvidence = await missingBalance.resolver.loadProviderEvidence(claim());
    expect(missingBalance.resolver.buildProjection(balanceEvidence, binding()))
      .toMatchObject({ balance_transaction_id: null, reconciliation_status: 'pending' });
    expect(missingBalance.retrieveBalanceTransaction).not.toHaveBeenCalled();

    const missingFee = provider({ charge: charge({ application_fee: null }) });
    const feeEvidence = await missingFee.resolver.loadProviderEvidence(claim());
    expect(missingFee.resolver.buildProjection(feeEvidence, binding()))
      .toMatchObject({ application_fee_id: null, reconciliation_status: 'pending' });

    const unavailableBalance = provider();
    unavailableBalance.retrieveBalanceTransaction.mockRejectedValue(
      new Error('temporary connected-account read failure'),
    );
    const unavailableEvidence = await unavailableBalance.resolver.loadProviderEvidence(claim());
    expect(unavailableBalance.resolver.buildProjection(unavailableEvidence, binding()))
      .toMatchObject({
        balance_transaction_id: BALANCE_TRANSACTION_ID,
        reconciliation_status: 'pending',
      });
  });

  it('fails closed on metadata, mode, amount, fee, charge, and balance contradictions', async () => {
    const badProviders = [
      provider({ session: session({ livemode: true }) }),
      provider({ session: session({ metadata: metadata({ lgq_workspace_id: PAYMENT_ID }) }) }),
      provider({ paymentIntent: paymentIntent({ amount_received: 24_999 }) }),
      provider({ charge: charge({ refunded: true, amount_refunded: 100 }) }),
      provider({ charge: charge({ metadata: metadata({ lgq_operation_id: 'another-operation' }) }) }),
      provider({ balance: balance({ source: 'ch_someothercharge' }) }),
    ];

    for (const unsafe of badProviders) {
      await expect(unsafe.resolver.loadProviderEvidence(claim())).rejects.toMatchObject({
        code: expect.stringMatching(/provider_(?:metadata|object)_.*mismatch/),
        retryable: false,
      });
    }

    const wrongFee = provider();
    const evidence = await wrongFee.resolver.loadProviderEvidence(claim());
    expect(() => wrongFee.resolver.buildProjection(evidence, binding({ applicationFeeCents: 51 })))
      .toThrow(ConnectedPaymentProjectionProviderError);

    const contradictoryBalance = provider({
      balance: balance({
        fee: 755,
        net: 24_245,
        fee_details: [{
          amount: 755,
          application: null,
          currency: 'usd',
          description: 'Stripe processing fee only',
          type: 'stripe_fee',
        }],
      }),
    });
    const contradictoryEvidence = await contradictoryBalance.resolver.loadProviderEvidence(claim());
    expect(() => contradictoryBalance.resolver.buildProjection(contradictoryEvidence, binding()))
      .toThrow(ConnectedPaymentProjectionProviderError);
  });

  it('accepts a rounded zero fee only when Stripe created no Application Fee', async () => {
    const zero = provider({
      paymentIntent: paymentIntent({ application_fee_amount: null }),
      charge: charge({ application_fee: null, application_fee_amount: null }),
      balance: balance({
        fee: 755,
        net: 24_245,
        fee_details: [{
          amount: 755,
          application: null,
          currency: 'usd',
          description: 'Stripe processing fee',
          type: 'stripe_fee',
        }],
      }),
    });
    const evidence = await zero.resolver.loadProviderEvidence(claim());
    expect(zero.resolver.buildProjection(evidence, binding({ applicationFeeCents: 0 })))
      .toMatchObject({ application_fee_id: null, application_fee_cents: 0, reconciliation_status: 'reconciled' });

    const unexpected = provider({
      paymentIntent: paymentIntent({ application_fee_amount: null }),
      charge: charge({ application_fee_amount: null }),
    });
    const unexpectedEvidence = await unexpected.resolver.loadProviderEvidence(claim());
    expect(() => unexpected.resolver.buildProjection(unexpectedEvidence, binding({ applicationFeeCents: 0 })))
      .toThrow(ConnectedPaymentProjectionProviderError);
  });

  it('stops durable replays before any provider or binding egress', async () => {
    const store = {
      claim: vi.fn().mockResolvedValue(claim({ status: 'processed', claimToken: null })),
      resolveBinding: vi.fn(),
      project: vi.fn(),
      fail: vi.fn(),
    } satisfies ConnectedPaymentProjectionStore;
    const resolver = {
      loadProviderEvidence: vi.fn(),
      buildProjection: vi.fn(),
    };

    await expect(projectConnectedPaymentEvent(EVENT_ROW_ID, {
      store,
      resolver,
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toEqual({ status: 'replay_processed', billingEventId: EVENT_ROW_ID });
    expect(resolver.loadProviderEvidence).not.toHaveBeenCalled();
    expect(store.resolveBinding).not.toHaveBeenCalled();
  });

  it('binds provider metadata through the database before one atomic projection', async () => {
    const stripe = provider();
    const resolveBinding = vi.fn().mockResolvedValue(binding());
    const project = vi.fn().mockResolvedValue({
      status: 'processed',
      paymentId: PAYMENT_ID,
      workspaceId: WORKSPACE_ID,
      applied: true,
      reconciliationStatus: 'reconciled',
    });
    const store = {
      claim: vi.fn().mockResolvedValue(claim()),
      resolveBinding,
      project,
      fail: vi.fn(),
    } satisfies ConnectedPaymentProjectionStore;

    await expect(projectConnectedPaymentEvent(EVENT_ROW_ID, {
      store,
      resolver: stripe.resolver,
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'processed',
      paymentId: PAYMENT_ID,
      reconciliationStatus: 'reconciled',
    });
    expect(resolveBinding).toHaveBeenCalledWith(expect.objectContaining({
      billingEventId: EVENT_ROW_ID,
      claimToken: CLAIM_TOKEN,
      evidence: expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        paymentId: PAYMENT_ID,
        operationId: OPERATION_ID,
      }),
    }));
    expect(project).toHaveBeenCalledTimes(1);
    expect(store.fail).not.toHaveBeenCalled();
  });

  it('persists fixed PII-free failure codes and no provider exception text', async () => {
    const secret = 'homeowner@example.com pm_secret';
    const fail = vi.fn().mockResolvedValue(undefined);
    const store = {
      claim: vi.fn().mockResolvedValue(claim()),
      resolveBinding: vi.fn(),
      project: vi.fn(),
      fail,
    } satisfies ConnectedPaymentProjectionStore;
    const resolver = {
      loadProviderEvidence: vi.fn().mockRejectedValue(new Error(secret)),
      buildProjection: vi.fn(),
    };

    await expect(projectConnectedPaymentEvent(EVENT_ROW_ID, {
      store,
      resolver,
      now: () => new Date('2026-08-16T02:00:00.000Z'),
    })).resolves.toMatchObject({
      status: 'failed_retryable',
      errorCode: 'projection_internal_error',
    });
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'projection_internal_error',
      retryable: true,
    }));
    expect(JSON.stringify(fail.mock.calls)).not.toContain(secret);
  });
});
