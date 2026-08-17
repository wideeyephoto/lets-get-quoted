import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('unit tests inject a Stripe client');
  },
}));

import {
  LegacyDestinationCheckoutProviderContractError,
  LegacyDestinationCheckoutStripeProvider,
  isDefinitivePaymentMethodRejection,
} from '@/lib/billing/legacy-destination-checkout-stripe-provider';
import type {
  LegacyDestinationCheckoutProviderContract,
} from '@/lib/billing/legacy-destination-checkout-operation';

const PAYMENT_ID = '10000000-0000-4000-8000-000000000001';
const OPERATION_PK = '20000000-0000-4000-8000-000000000002';
const DESTINATION_ACCOUNT_ID = 'acct_destination123';
const CUSTOMER_ID = 'cus_legacycustomer123';
const SESSION_ID = 'cs_test_legacy_generation_1';
const NOW = 1_800_000_000;
const GROSS = 10_000;
const FEE = 500;
const ACH_KEY = `lgq:legacy-destination:v1:checkout:${PAYMENT_ID}:1:ach`;

function contract(
  overrides: Partial<LegacyDestinationCheckoutProviderContract> = {},
): LegacyDestinationCheckoutProviderContract {
  return {
    variant: 'primary',
    paymentId: PAYMENT_ID,
    operationPk: OPERATION_PK,
    operationId: `payment:${PAYMENT_ID}:legacy-destination-checkout:1`,
    generation: 1,
    predecessorOperationPk: null,
    requestFingerprint: 'a'.repeat(64),
    grossAmountCents: GROSS,
    applicationFeeCents: FEE,
    feeRate: 0.05,
    destinationAccountId: DESTINATION_ACCOUNT_ID,
    livemode: false,
    expectedCustomerId: CUSTOMER_ID,
    currency: 'usd',
    mode: 'payment',
    paymentMethodTypes: ['card', 'us_bank_account'],
    metadata: { lgq_ldc_generation: '1', payment_plan_id: 'plan-1' },
    ...overrides,
  } as LegacyDestinationCheckoutProviderContract;
}

function stripeError(fields: Record<string, unknown>): unknown {
  return { type: 'StripeInvalidRequestError', statusCode: 400, ...fields };
}

function mockStripe() {
  const create = vi.fn().mockResolvedValue({ id: SESSION_ID, object: 'checkout.session' });
  const retrieve = vi.fn().mockResolvedValue({ id: SESSION_ID, object: 'checkout.session' });
  const expire = vi.fn().mockResolvedValue({ id: SESSION_ID });
  return {
    create,
    retrieve,
    expire,
    client: { checkout: { sessions: { create, retrieve, expire } } } as unknown as Stripe,
  };
}

function provider(client: Stripe) {
  return new LegacyDestinationCheckoutStripeProvider({
    stripe: client,
    nowEpochSeconds: () => NOW,
  });
}

let originalAppUrl: string | undefined;

beforeEach(() => {
  originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://letsgetquoted.com';
});

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  vi.restoreAllMocks();
});

describe('legacy destination Checkout Stripe provider creation', () => {
  it('pins the exact claim-authorized payment methods and never widens them', async () => {
    const { client, create } = mockStripe();
    await provider(client).createSession({ ...contract(), idempotencyKey: ACH_KEY });

    const [params] = create.mock.calls[0];
    // The regression this guards: the platform account has klarna/link/cashapp/
    // amazon_pay enabled, so an automatic set would return methods the immutable
    // claim never authorized and every Session would be quarantined.
    expect(params.payment_method_types).toEqual(['card', 'us_bank_account']);
    expect(params).not.toHaveProperty('automatic_payment_methods');
    expect(params).not.toHaveProperty('after_expiration');

    const { client: c2, create: create2 } = mockStripe();
    await provider(c2).createSession({
      ...contract({ variant: 'card_fallback', paymentMethodTypes: ['card'] }),
      idempotencyKey: ACH_KEY,
    });
    expect(create2.mock.calls[0][0].payment_method_types).toEqual(['card']);
  });

  it('disables adaptive pricing so the customer cannot be presented another amount', async () => {
    const { client, create } = mockStripe();
    await provider(client).createSession({ ...contract(), idempotencyKey: ACH_KEY });
    expect(create.mock.calls[0][0].adaptive_pricing).toEqual({ enabled: false });
  });

  it('binds destination, application fee, amount, metadata, and idempotency exactly', async () => {
    const { client, create } = mockStripe();
    await provider(client).createSession({ ...contract(), idempotencyKey: ACH_KEY });

    const [params, options] = create.mock.calls[0];
    expect(params.mode).toBe('payment');
    expect(params.client_reference_id).toBe(PAYMENT_ID);
    expect(params.customer).toBe(CUSTOMER_ID);
    expect(params.line_items).toEqual([{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: GROSS,
        product_data: { name: 'Payment' },
      },
    }]);
    expect(params.payment_intent_data.application_fee_amount).toBe(FEE);
    expect(params.payment_intent_data.transfer_data).toEqual({
      destination: DESTINATION_ACCOUNT_ID,
    });
    expect(params.metadata).toEqual(contract().metadata);
    expect(params.payment_intent_data.metadata).toEqual(contract().metadata);
    expect(params.expires_at).toBe(NOW + 24 * 60 * 60);
    // The SQL-issued key is the only creation identity.
    expect(options).toEqual({ idempotencyKey: ACH_KEY });
  });

  it('omits customer when the claim expects none', async () => {
    const { client, create } = mockStripe();
    await provider(client).createSession({
      ...contract({ expectedCustomerId: null }),
      idempotencyKey: ACH_KEY,
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty('customer');
  });

  it.each([
    ['non-payment mode', { mode: 'subscription' }],
    ['non-USD currency', { currency: 'eur' }],
    ['zero gross', { grossAmountCents: 0 }],
    ['fee above gross', { applicationFeeCents: GROSS + 1 }],
    ['empty payment methods', { paymentMethodTypes: [] }],
    ['missing destination', { destinationAccountId: '' }],
  ] as const)('refuses a contract with %s before contacting Stripe', async (_label, override) => {
    const { client, create } = mockStripe();
    await expect(provider(client).createSession({
      ...contract(override as Partial<LegacyDestinationCheckoutProviderContract>),
      idempotencyKey: ACH_KEY,
    })).rejects.toBeInstanceOf(LegacyDestinationCheckoutProviderContractError);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an empty idempotency key before contacting Stripe', async () => {
    const { client, create } = mockStripe();
    await expect(provider(client).createSession({ ...contract(), idempotencyKey: '' }))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutProviderContractError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('legacy destination Checkout definitive rejection classification', () => {
  it.each([
    ['param', stripeError({ param: 'payment_method_types[1]' })],
    ['code', stripeError({ code: 'payment_method_not_available' })],
    ['message', stripeError({
      message: 'The payment method type provided: us_bank_account is invalid',
    })],
  ] as const)('treats an explicit %s refusal as definitive', (_label, error) => {
    expect(isDefinitivePaymentMethodRejection(error)).toBe(true);
  });

  it.each([
    ['connection error', { type: 'StripeConnectionError', statusCode: undefined }],
    ['rate limit', { type: 'StripeRateLimitError', statusCode: 429 }],
    ['api error', { type: 'StripeAPIError', statusCode: 500 }],
    ['idempotency conflict', { type: 'StripeIdempotencyError', statusCode: 400 }],
    ['unrelated 400', stripeError({ param: 'line_items[0]', message: 'amount too small' })],
    ['plain error', new Error('boom')],
    ['null', null],
  ] as const)('never treats a %s as definitive', (_label, error) => {
    expect(isDefinitivePaymentMethodRejection(error)).toBe(false);
  });

  it('returns the definitive outcome instead of throwing for a real refusal', async () => {
    const { client, create } = mockStripe();
    create.mockRejectedValue(stripeError({ param: 'payment_method_types[1]' }));

    await expect(provider(client).createSession({ ...contract(), idempotencyKey: ACH_KEY }))
      .resolves.toEqual({ outcome: 'definitive_payment_method_rejection' });
  });

  it('rethrows every ambiguous failure so the caller records indeterminate work', async () => {
    const { client, create } = mockStripe();
    create.mockRejectedValue({ type: 'StripeConnectionError', message: 'socket hang up' });

    await expect(provider(client).createSession({ ...contract(), idempotencyKey: ACH_KEY }))
      .rejects.toMatchObject({ type: 'StripeConnectionError' });
  });
});

describe('legacy destination Checkout provider retrieval and expiry', () => {
  it('returns only the exact requested Session', async () => {
    const { client, retrieve } = mockStripe();
    await expect(provider(client).retrieveSession({
      checkoutSessionId: SESSION_ID,
      allowedContracts: [contract()],
    })).resolves.toMatchObject({ id: SESSION_ID });
    expect(retrieve).toHaveBeenCalledWith(SESSION_ID);

    retrieve.mockResolvedValue({ id: 'cs_test_someone_elses', object: 'checkout.session' });
    await expect(provider(client).retrieveSession({
      checkoutSessionId: SESSION_ID,
      allowedContracts: [contract()],
    })).rejects.toBeInstanceOf(LegacyDestinationCheckoutProviderContractError);
  });

  it('refuses retrieval without an allowed contract', async () => {
    const { client, retrieve } = mockStripe();
    await expect(provider(client).retrieveSession({
      checkoutSessionId: SESSION_ID,
      allowedContracts: [],
    })).rejects.toBeInstanceOf(LegacyDestinationCheckoutProviderContractError);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('expires only a fully identified Session', async () => {
    const { client, expire } = mockStripe();
    await provider(client).expireSession({
      checkoutSessionId: SESSION_ID,
      operationPk: OPERATION_PK,
      operationId: 'payment:x:legacy-destination-checkout:1',
    });
    expect(expire).toHaveBeenCalledWith(SESSION_ID);

    await expect(provider(client).expireSession({
      checkoutSessionId: '',
      operationPk: OPERATION_PK,
      operationId: 'payment:x:legacy-destination-checkout:1',
    })).rejects.toBeInstanceOf(LegacyDestinationCheckoutProviderContractError);
    expect(expire).toHaveBeenCalledTimes(1);
  });
});
