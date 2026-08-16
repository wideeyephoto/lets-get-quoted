import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('expiration projector tests inject database dependencies');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('expiration projector tests inject provider dependencies');
  },
}));

import {
  ConnectedCheckoutExpirationProviderError,
  createConnectedCheckoutExpirationResolver,
  projectConnectedCheckoutExpiration,
  type ConnectedCheckoutExpirationBinding,
  type ConnectedCheckoutExpirationClaim,
  type ConnectedCheckoutExpirationStore,
} from '@/lib/billing/connected-checkout-expiration-projector';

const EVENT_ROW_ID = '10000000-0000-4000-8000-000000000001';
const CLAIM_TOKEN = '20000000-0000-4000-8000-000000000002';
const WORKSPACE_ID = '30000000-0000-4000-8000-000000000003';
const PAYMENT_ID = '40000000-0000-4000-8000-000000000004';
const OPERATION_PK = '50000000-0000-4000-8000-000000000005';
const INVOICE_ID = '60000000-0000-4000-8000-000000000006';
const EVENT_ID = 'evt_expiration12345';
const MERCHANT_ID = 'acct_merchant123';
const SESSION_ID = 'cs_test_expiration123';
const OPERATION_ID = `payment:${PAYMENT_ID}:checkout`;
const PROVIDER_CREATED_AT = '2026-08-16T04:00:00.000Z';
const EXPIRES_AT = 1_786_852_740;

function metadata(overrides: Record<string, string> = {}) {
  return {
    source: 'invoice',
    lgq_charge_model: 'merchant_direct_v1',
    lgq_merchant_account_id: MERCHANT_ID,
    lgq_workspace_id: WORKSPACE_ID,
    lgq_payment_id: PAYMENT_ID,
    lgq_operation_id: OPERATION_ID,
    ...overrides,
  };
}

function claim(
  overrides: Partial<ConnectedCheckoutExpirationClaim> = {},
): ConnectedCheckoutExpirationClaim {
  return Object.freeze({
    status: 'claimed',
    billingEventId: EVENT_ROW_ID,
    claimToken: CLAIM_TOKEN,
    attemptCount: 1,
    providerEventId: EVENT_ID,
    eventType: 'checkout.session.expired',
    checkoutSessionId: SESSION_ID,
    workspaceId: WORKSPACE_ID,
    merchantAccountId: MERCHANT_ID,
    livemode: false,
    providerCreatedAt: PROVIDER_CREATED_AT,
    ...overrides,
  });
}

function session(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    object: 'checkout.session',
    livemode: false,
    mode: 'payment',
    status: 'expired',
    payment_status: 'unpaid',
    currency: 'usd',
    amount_subtotal: 25_000,
    amount_total: 25_000,
    payment_method_types: ['card'],
    recovered_from: null,
    payment_intent: null,
    expires_at: EXPIRES_AT,
    metadata: metadata(),
    ...overrides,
  } as Stripe.Checkout.Session;
}

function binding(
  overrides: Partial<ConnectedCheckoutExpirationBinding> = {},
): ConnectedCheckoutExpirationBinding {
  return Object.freeze({
    status: 'ready',
    operationPk: OPERATION_PK,
    workspaceId: WORKSPACE_ID,
    paymentId: PAYMENT_ID,
    operationId: OPERATION_ID,
    invoiceId: INVOICE_ID,
    checkoutSessionId: SESSION_ID,
    merchantAccountId: MERCHANT_ID,
    livemode: false,
    amountCents: 25_000,
    feeBasisAmountCents: 20_000,
    applicationFeeCents: 50,
    feePlanCode: 'growth',
    feeCatalogVersion: '2026-08-15-preview',
    feeRateBps: 25,
    ...overrides,
  });
}

function provider(providerSession: Stripe.Checkout.Session = session()) {
  const assertMode = vi.fn();
  const retrieveCheckoutSession = vi.fn().mockResolvedValue(providerSession);
  return {
    assertMode,
    retrieveCheckoutSession,
    resolver: createConnectedCheckoutExpirationResolver({
      assertMode,
      retrieveCheckoutSession,
    }),
  };
}

function storeHarness(overrides: Partial<ConnectedCheckoutExpirationStore> = {}) {
  const value: ConnectedCheckoutExpirationStore = {
    claim: vi.fn().mockResolvedValue(claim()),
    resolveBinding: vi.fn().mockResolvedValue(binding()),
    project: vi.fn().mockImplementation(async ({ billingEventId, projection }) => ({
      status: 'processed' as const,
      errorCode: null,
      billingEventId,
      paymentId: projection.payment_id,
      workspaceId: projection.workspace_id,
      applied: true,
    })),
    fail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return value;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('dark connected Checkout expiration projector', () => {
  it('retrieves the exact Session on event.account and builds PII-free expiration evidence', async () => {
    const stripe = provider();
    const evidence = await stripe.resolver.loadProviderEvidence(claim());
    const projection = stripe.resolver.buildProjection(evidence, binding());

    expect(stripe.assertMode).toHaveBeenCalledWith(false);
    expect(stripe.retrieveCheckoutSession).toHaveBeenCalledWith(SESSION_ID, MERCHANT_ID);
    expect(projection).toEqual({
      schema: 'stripe_connected_checkout_expiration_v1',
      provider_event_id: EVENT_ID,
      event_type: 'checkout.session.expired',
      provider_created_at: PROVIDER_CREATED_AT,
      workspace_id: WORKSPACE_ID,
      payment_id: PAYMENT_ID,
      operation_id: OPERATION_ID,
      operation_pk: OPERATION_PK,
      invoice_id: INVOICE_ID,
      checkout_session_id: SESSION_ID,
      merchant_account_id: MERCHANT_ID,
      livemode: false,
      currency: 'usd',
      amount_cents: 25_000,
      session_expires_at: new Date(EXPIRES_AT * 1_000).toISOString(),
      mode: 'payment',
      session_status: 'expired',
      payment_status: 'unpaid',
      payment_method_types: ['card'],
      recovered_from: null,
      payment_intent_id: null,
      fee_plan_code: 'growth',
      fee_catalog_version: '2026-08-15-preview',
      fee_rate_bps: 25,
      fee_basis_amount_cents: 20_000,
      application_fee_cents: 50,
    });
    expect(JSON.stringify(projection)).not.toMatch(/customer|email|phone|address|client_secret/i);
  });

  it.each([
    ['object', { object: 'payment_intent' }],
    ['id', { id: 'cs_test_another' }],
    ['livemode', { livemode: true }],
    ['mode', { mode: 'subscription' }],
    ['status', { status: 'complete' }],
    ['payment status', { payment_status: 'paid' }],
    ['currency', { currency: 'cad' }],
    ['amount', { amount_total: 24_999 }],
    ['card-only', { payment_method_types: ['card', 'link'] }],
    ['recovery', { recovered_from: 'cs_test_original' }],
    ['after-expiration recovery', { after_expiration: { recovery: { enabled: true } } }],
    ['PaymentIntent', { payment_intent: 'pi_existing123' }],
    ['future expiration', { expires_at: 1_786_852_900 }],
  ])('fails closed on a contradictory provider %s', async (_label, override) => {
    const stripe = provider(session(override as Partial<Stripe.Checkout.Session>));
    await expect(stripe.resolver.loadProviderEvidence(claim())).rejects.toMatchObject({
      code: 'expiration_provider_contract_mismatch',
      retryable: false,
    });
  });

  it('fails closed on every immutable metadata identity', async () => {
    const metadataContradictions: Array<Record<string, string>> = [
      { lgq_charge_model: 'destination' },
      { lgq_merchant_account_id: 'acct_other12345' },
      { lgq_workspace_id: PAYMENT_ID },
      { lgq_payment_id: 'not-a-uuid' },
      { lgq_operation_id: 'line\nbreak' },
    ];
    for (const override of metadataContradictions) {
      const stripe = provider(session({ metadata: metadata(override) }));
      await expect(stripe.resolver.loadProviderEvidence(claim())).rejects.toMatchObject({
        code: 'expiration_metadata_mismatch',
        retryable: false,
      });
    }
  });

  it('classifies provider retrieval failures as retryable without exposing the provider error', async () => {
    const retrieveCheckoutSession = vi.fn().mockRejectedValue(
      new Error('customer@example.com unavailable'),
    );
    const resolver = createConnectedCheckoutExpirationResolver({
      assertMode: vi.fn(),
      retrieveCheckoutSession,
    });

    const error = await resolver.loadProviderEvidence(claim()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConnectedCheckoutExpirationProviderError);
    expect(error).toMatchObject({
      message: 'expiration_provider_retrieve_failed',
      code: 'expiration_provider_retrieve_failed',
      retryable: true,
    });
    expect(String(error)).not.toContain('customer@example.com');
  });

  it('refuses a database binding that differs in Session, cents, fee, or identity', async () => {
    const stripe = provider();
    const evidence = await stripe.resolver.loadProviderEvidence(claim());
    for (const mismatch of [
      binding({ checkoutSessionId: 'cs_test_other' }),
      binding({ paymentId: WORKSPACE_ID }),
      binding({ amountCents: 24_999 }),
      binding({ applicationFeeCents: 51 }),
      binding({ merchantAccountId: 'acct_other12345' }),
    ]) {
      expect(() => stripe.resolver.buildProjection(evidence, mismatch)).toThrow(
        ConnectedCheckoutExpirationProviderError,
      );
    }
  });

  it('projects one claimed expiration and never asks the store to release or replace it', async () => {
    const stripe = provider();
    const store = storeHarness();
    const result = await projectConnectedCheckoutExpiration(EVENT_ROW_ID, {
      store,
      resolver: stripe.resolver,
      now: () => new Date('2026-08-16T04:01:00.000Z'),
    });

    expect(result).toMatchObject({
      status: 'processed',
      billingEventId: EVENT_ROW_ID,
      paymentId: PAYMENT_ID,
      workspaceId: WORKSPACE_ID,
      applied: true,
    });
    expect(store.resolveBinding).toHaveBeenCalledOnce();
    expect(store.project).toHaveBeenCalledOnce();
    expect(store.fail).not.toHaveBeenCalled();
    expect(Object.keys(store).sort()).toEqual(['claim', 'fail', 'project', 'resolveBinding']);
  });

  it('stops after an atomic manual-reconciliation binding result', async () => {
    const stripe = provider();
    const store = storeHarness({
      resolveBinding: vi.fn().mockResolvedValue({
        status: 'manual_reconciliation',
        errorCode: 'expiration_payment_binding_conflict',
      }),
    });

    await expect(projectConnectedCheckoutExpiration(EVENT_ROW_ID, {
      store,
      resolver: stripe.resolver,
      now: () => new Date('2026-08-16T04:01:00.000Z'),
    })).resolves.toEqual({
      status: 'failed_terminal',
      billingEventId: EVENT_ROW_ID,
      errorCode: 'expiration_payment_binding_conflict',
    });
    expect(store.project).not.toHaveBeenCalled();
    expect(store.fail).not.toHaveBeenCalled();
  });

  it('retries transient provider reads with bounded backoff and terminalizes attempt eight', async () => {
    const resolver = createConnectedCheckoutExpirationResolver({
      assertMode: vi.fn(),
      retrieveCheckoutSession: vi.fn().mockRejectedValue(new Error('temporary')),
    });
    const now = new Date('2026-08-16T04:01:00.000Z');
    const retryStore = storeHarness();

    await expect(projectConnectedCheckoutExpiration(EVENT_ROW_ID, {
      store: retryStore,
      resolver,
      now: () => now,
    })).resolves.toEqual({
      status: 'failed_retryable',
      billingEventId: EVENT_ROW_ID,
      errorCode: 'expiration_provider_retrieve_failed',
    });
    expect(retryStore.fail).toHaveBeenCalledWith({
      billingEventId: EVENT_ROW_ID,
      claimToken: CLAIM_TOKEN,
      errorCode: 'expiration_provider_retrieve_failed',
      retryable: true,
      nextAttemptAt: '2026-08-16T04:06:00.000Z',
    });

    const terminalStore = storeHarness({
      claim: vi.fn().mockResolvedValue(claim({ attemptCount: 8 })),
    });
    await expect(projectConnectedCheckoutExpiration(EVENT_ROW_ID, {
      store: terminalStore,
      resolver,
      now: () => now,
    })).resolves.toEqual({
      status: 'failed_terminal',
      billingEventId: EVENT_ROW_ID,
      errorCode: 'expiration_retry_attempt_limit',
    });
    expect(terminalStore.fail).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'expiration_retry_attempt_limit',
      retryable: false,
      nextAttemptAt: null,
    }));
  });

  it('terminalizes immutable provider contradictions with a fixed PII-free code', async () => {
    const stripe = provider(session({ payment_status: 'paid' }));
    const store = storeHarness();

    await expect(projectConnectedCheckoutExpiration(EVENT_ROW_ID, {
      store,
      resolver: stripe.resolver,
      now: () => new Date('2026-08-16T04:01:00.000Z'),
    })).resolves.toEqual({
      status: 'failed_terminal',
      billingEventId: EVENT_ROW_ID,
      errorCode: 'expiration_provider_contract_mismatch',
    });
    expect(store.fail).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'expiration_provider_contract_mismatch',
      retryable: false,
      nextAttemptAt: null,
    }));
  });

  it('returns durable replay/in-progress outcomes before provider setup', async () => {
    for (const [claimStatus, expectedStatus] of [
      ['processed', 'replay_processed'],
      ['ignored', 'replay_ignored'],
      ['in_progress', 'in_progress'],
      ['failed_terminal', 'failed_terminal'],
    ] as const) {
      const store = storeHarness({
        claim: vi.fn().mockResolvedValue(claim({
          status: claimStatus,
          claimToken: null,
        })),
      });
      const loadProviderEvidence = vi.fn();
      await expect(projectConnectedCheckoutExpiration(EVENT_ROW_ID, {
        store,
        resolver: {
          loadProviderEvidence,
          buildProjection: vi.fn(),
        },
        now: () => new Date(),
      })).resolves.toMatchObject({ status: expectedStatus, billingEventId: EVENT_ROW_ID });
      expect(loadProviderEvidence).not.toHaveBeenCalled();
    }
  });

  it('remains isolated from active application, webhook, cron, and worker imports', () => {
    const target = 'connected-checkout-expiration-projector';
    const own = join(
      process.cwd(),
      'src',
      'lib',
      'billing',
      'connected-checkout-expiration-projector.ts',
    );
    const importers = sourceFiles(join(process.cwd(), 'src'))
      .filter((path) => path !== own)
      .filter((path) => readFileSync(path, 'utf8').includes(target));
    expect(importers).toEqual([]);
  });
});
