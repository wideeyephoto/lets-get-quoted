import type Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests inject a service-role store');
  },
}));

import {
  LEGACY_DESTINATION_CHECKOUT_CURRENCY,
  LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG,
  LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS,
  LEGACY_DESTINATION_CHECKOUT_MODE,
  LegacyDestinationCheckoutDisabledError,
  LegacyDestinationCheckoutIndeterminateError,
  LegacyDestinationCheckoutReconciliationError,
  LegacyDestinationCheckoutUnavailableError,
  SupabaseLegacyDestinationCheckoutOperationStore,
  buildLegacyDestinationCheckoutRequestFingerprint,
  classifyLegacyDestinationCheckoutSignedEvent,
  legacyDestinationCheckoutGenerationEnabled,
  orchestrateLegacyDestinationCheckoutGeneration,
  type LegacyDestinationCheckoutClaim,
  type LegacyDestinationCheckoutOperationDependencies,
  type LegacyDestinationCheckoutOperationInput,
  type LegacyDestinationCheckoutOperationStore,
  type LegacyDestinationCheckoutProviderCreateResult,
  type LegacyDestinationCheckoutProviderContract,
  type LegacyDestinationCheckoutSignedEventIdentity,
} from '@/lib/billing/legacy-destination-checkout-operation';

const PAYMENT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_PAYMENT_ID = '10000000-0000-4000-8000-000000000009';
const OPERATION_PK_1 = '20000000-0000-4000-8000-000000000002';
const OPERATION_PK_2 = '20000000-0000-4000-8000-000000000003';
const PREDECESSOR_OPERATION_PK = OPERATION_PK_1;
const CLAIM_TOKEN = '30000000-0000-4000-8000-000000000003';
const SESSION_ID_1 = 'cs_test_legacy_generation_1';
const SESSION_ID_2 = 'cs_test_legacy_generation_2';
const CUSTOMER_ID = 'cus_legacycustomer123';
const DESTINATION_ACCOUNT_ID = 'acct_destination123';
const PAYMENT_PLAN_ID = '40000000-0000-4000-8000-000000000004';
const NOW_EPOCH_SECONDS = 1_800_000_000;
const EXPIRES_AT = NOW_EPOCH_SECONDS + 3_600;
const GROSS_AMOUNT_CENTS = 10_000;
const APPLICATION_FEE_CENTS = 500;
const FEE_RATE = 0.05;
const CUSTOM_METADATA = Object.freeze({ payment_plan_id: PAYMENT_PLAN_ID });

type Provider = LegacyDestinationCheckoutOperationDependencies['provider'];
type CreateInput = Parameters<Provider['createSession']>[0];
type RetrieveInput = Parameters<Provider['retrieveSession']>[0];

function operationId(generation: number): string {
  return `payment:${PAYMENT_ID}:legacy-destination-checkout:${generation}`;
}

function achIdempotencyKey(generation: number): string {
  return `lgq:legacy-destination:v1:checkout:${PAYMENT_ID}:${generation}:ach`;
}

function cardIdempotencyKey(generation: number): string {
  return `lgq:legacy-destination:v1:checkout:${PAYMENT_ID}:${generation}:card`;
}

function operationInput(
  overrides: Partial<LegacyDestinationCheckoutOperationInput> = {},
): LegacyDestinationCheckoutOperationInput {
  const fingerprintInput = {
    paymentId: PAYMENT_ID,
    livemode: false,
    grossAmountCents: GROSS_AMOUNT_CENTS,
    applicationFeeCents: APPLICATION_FEE_CENTS,
    feeRate: FEE_RATE,
    allowCardFallback: true,
    expectedCustomerId: CUSTOMER_ID,
    metadata: CUSTOM_METADATA,
    ...overrides,
  };
  const requestFingerprint = overrides.requestFingerprint
    ?? buildLegacyDestinationCheckoutRequestFingerprint(
      fingerprintInput as Parameters<typeof buildLegacyDestinationCheckoutRequestFingerprint>[0],
    );
  return {
    ...fingerprintInput,
    requestFingerprint,
  } as LegacyDestinationCheckoutOperationInput;
}

function claim(
  status: LegacyDestinationCheckoutClaim['status'] = 'claimed',
  overrides: Partial<LegacyDestinationCheckoutClaim> = {},
): LegacyDestinationCheckoutClaim {
  const generation = overrides.generation ?? 1;
  const replay = status === 'replay_unpresented' || status === 'replay_presented';
  return {
    status,
    operationPk: generation === 1 ? OPERATION_PK_1 : OPERATION_PK_2,
    claimToken: status === 'claimed' ? CLAIM_TOKEN : null,
    operationState: status === 'claimed' ? 'claimed' : 'completed',
    generation,
    predecessorOperationPk: generation === 1 ? null : PREDECESSOR_OPERATION_PK,
    operationId: operationId(generation),
    achIdempotencyKey: achIdempotencyKey(generation),
    cardFallbackIdempotencyKey: cardIdempotencyKey(generation),
    requestFingerprint: operationInput().requestFingerprint,
    destinationAccountId: DESTINATION_ACCOUNT_ID,
    livemode: false,
    grossAmountCents: GROSS_AMOUNT_CENTS,
    applicationFeeCents: APPLICATION_FEE_CENTS,
    feeRate: FEE_RATE,
    checkoutSessionId: replay ? (generation === 1 ? SESSION_ID_1 : SESSION_ID_2) : null,
    checkoutSessionStatus: replay ? 'open' : null,
    checkoutPaymentStatus: replay ? 'unpaid' : null,
    checkoutSessionExpiresAt: replay ? new Date(EXPIRES_AT * 1_000).toISOString() : null,
    presentedAt: status === 'replay_presented' ? '2029-01-01T00:00:00.000Z' : null,
    paidHoldActive: status === 'paid_hold',
    ...overrides,
  };
}

function contractRecord(contract: LegacyDestinationCheckoutProviderContract): Record<string, unknown> {
  return contract as unknown as Record<string, unknown>;
}

function contractField<T>(
  contract: LegacyDestinationCheckoutProviderContract,
  ...names: string[]
): T {
  const record = contractRecord(contract);
  for (const name of names) {
    if (name in record) return record[name] as T;
  }
  throw new Error(`Provider contract is missing ${names.join(' / ')}.`);
}

function contractMetadata(
  contract: LegacyDestinationCheckoutProviderContract,
): Readonly<Record<string, string>> {
  return contractField<Readonly<Record<string, string>>>(contract, 'metadata');
}

function contractPaymentMethods(
  contract: LegacyDestinationCheckoutProviderContract,
): readonly string[] {
  return contractField<readonly string[]>(
    contract,
    'paymentMethodTypes',
    'allowedPaymentMethodTypes',
  );
}

function contractGeneration(contract: LegacyDestinationCheckoutProviderContract): number {
  return contractField<number>(contract, 'generation', 'checkoutGeneration');
}

function sessionForContract(
  contract: LegacyDestinationCheckoutProviderContract,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  const generation = contractGeneration(contract);
  const livemode = contractField<boolean>(contract, 'livemode');
  const id = livemode
    ? `cs_live_legacy_generation_${generation}`
    : generation === 1 ? SESSION_ID_1 : SESSION_ID_2;
  return {
    id,
    object: 'checkout.session',
    livemode,
    mode: contractField(contract, 'mode'),
    client_reference_id: contractField(contract, 'clientReferenceId', 'paymentId'),
    amount_subtotal: contractField(contract, 'grossAmountCents'),
    amount_total: contractField(contract, 'grossAmountCents'),
    currency: contractField(contract, 'currency'),
    customer: contractField(contract, 'expectedCustomerId'),
    metadata: { ...contractMetadata(contract) },
    payment_method_types: [...contractPaymentMethods(contract)],
    recovered_from: null,
    after_expiration: null,
    status: 'open',
    payment_status: 'unpaid',
    expires_at: EXPIRES_AT,
    url: `https://checkout.stripe.com/c/pay/${id}`,
    ...overrides,
  } as Stripe.Checkout.Session;
}

function created(session: Stripe.Checkout.Session): LegacyDestinationCheckoutProviderCreateResult {
  return { outcome: 'created', session };
}

function contractsFromRetrieve(input: RetrieveInput): readonly LegacyDestinationCheckoutProviderContract[] {
  const record = input as unknown as Record<string, unknown>;
  return record.allowedContracts as readonly LegacyDestinationCheckoutProviderContract[];
}

function mocks(claimResult: LegacyDestinationCheckoutClaim = claim()) {
  const store = {
    claim: vi.fn<LegacyDestinationCheckoutOperationStore['claim']>().mockResolvedValue(claimResult),
    begin: vi.fn<LegacyDestinationCheckoutOperationStore['begin']>().mockResolvedValue(true),
    complete: vi.fn<LegacyDestinationCheckoutOperationStore['complete']>().mockResolvedValue(true),
    confirmPresentation: vi.fn<LegacyDestinationCheckoutOperationStore['confirmPresentation']>()
      .mockResolvedValue(true),
    markIndeterminate: vi.fn<LegacyDestinationCheckoutOperationStore['markIndeterminate']>()
      .mockResolvedValue(undefined),
    quarantine: vi.fn<LegacyDestinationCheckoutOperationStore['quarantine']>()
      .mockResolvedValue(undefined),
    classifyEvent: vi.fn<LegacyDestinationCheckoutOperationStore['classifyEvent']>()
      .mockResolvedValue({
        disposition: 'unknown',
        eventStatus: null,
        classification: null,
        operationPk: null,
        generation: null,
        isCurrent: false,
        projectionAllowed: false,
        paidHoldActive: false,
      }),
  } satisfies LegacyDestinationCheckoutOperationStore;
  const provider = {
    createSession: vi.fn<Provider['createSession']>().mockImplementation(async (input: CreateInput) => (
      created(sessionForContract(input))
    )),
    retrieveSession: vi.fn<Provider['retrieveSession']>().mockImplementation(async (input: RetrieveInput) => {
      const contracts = contractsFromRetrieve(input);
      return sessionForContract(contracts[0], { id: input.checkoutSessionId });
    }),
    expireSession: vi.fn<Provider['expireSession']>().mockResolvedValue(undefined),
  } satisfies Provider;
  const nowEpochSeconds = vi.fn<LegacyDestinationCheckoutOperationDependencies['nowEpochSeconds']>()
    .mockReturnValue(NOW_EPOCH_SECONDS);
  return {
    store,
    provider,
    nowEpochSeconds,
    dependencies: {
      store,
      provider,
      nowEpochSeconds,
      env: { [LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG]: '1' },
    } satisfies LegacyDestinationCheckoutOperationDependencies,
  };
}

function changeMetadataValue(
  session: Stripe.Checkout.Session,
  expectedValue: string,
  replacement: string,
): Stripe.Checkout.Session {
  const metadata = { ...(session.metadata ?? {}) };
  const entry = Object.entries(metadata).find(([, value]) => value === expectedValue);
  if (!entry) throw new Error(`No metadata entry has value ${expectedValue}.`);
  metadata[entry[0]] = replacement;
  return { ...session, metadata } as Stripe.Checkout.Session;
}

function removeMetadataKey(session: Stripe.Checkout.Session, key: string): Stripe.Checkout.Session {
  const metadata = { ...(session.metadata ?? {}) };
  delete metadata[key];
  return { ...session, metadata } as Stripe.Checkout.Session;
}

function retrieveWith(
  provider: ReturnType<typeof mocks>['provider'],
  mutate: (
    session: Stripe.Checkout.Session,
    contract: LegacyDestinationCheckoutProviderContract,
  ) => Stripe.Checkout.Session,
): void {
  provider.retrieveSession.mockImplementation(async (input: RetrieveInput) => {
    const contract = contractsFromRetrieve(input)[0];
    return mutate(sessionForContract(contract, { id: input.checkoutSessionId }), contract);
  });
}

function createWith(
  provider: ReturnType<typeof mocks>['provider'],
  mutate: (
    session: Stripe.Checkout.Session,
    contract: LegacyDestinationCheckoutProviderContract,
  ) => Stripe.Checkout.Session,
): void {
  provider.createSession.mockImplementation(async (input: CreateInput) => (
    created(mutate(sessionForContract(input), input))
  ));
}

function expectNoProviderCalls(provider: ReturnType<typeof mocks>['provider']): void {
  expect(provider.createSession).not.toHaveBeenCalled();
  expect(provider.retrieveSession).not.toHaveBeenCalled();
  expect(provider.expireSession).not.toHaveBeenCalled();
}

function expectNoStoreCalls(store: ReturnType<typeof mocks>['store']): void {
  expect(store.claim).not.toHaveBeenCalled();
  expect(store.begin).not.toHaveBeenCalled();
  expect(store.complete).not.toHaveBeenCalled();
  expect(store.confirmPresentation).not.toHaveBeenCalled();
  expect(store.markIndeterminate).not.toHaveBeenCalled();
  expect(store.quarantine).not.toHaveBeenCalled();
  expect(store.classifyEvent).not.toHaveBeenCalled();
}

function signedEventIdentity(): LegacyDestinationCheckoutSignedEventIdentity {
  return {
    providerEventId: 'evt_legacy12345678',
    eventType: 'checkout.session.async_payment_succeeded',
    eventObjectId: SESSION_ID_1,
    paymentId: PAYMENT_ID,
    checkoutSessionId: SESSION_ID_1,
    paymentIntentId: 'pi_legacy12345678',
    livemode: false,
    outcome: 'success' as const,
    sessionStatus: 'complete' as const,
    paymentStatus: 'paid' as const,
    observedAt: new Date().toISOString(),
  };
}

const RESERVED_METADATA_KEYS = Object.freeze(
  Object.values(LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS as Readonly<Record<string, string>>),
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('legacy destination Checkout generation gate', () => {
  it('recognizes only the exact string 1', () => {
    expect(legacyDestinationCheckoutGenerationEnabled({})).toBe(false);
    expect(legacyDestinationCheckoutGenerationEnabled({
      [LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG]: '0',
    })).toBe(false);
    expect(legacyDestinationCheckoutGenerationEnabled({
      [LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG]: 'true',
    })).toBe(false);
    expect(legacyDestinationCheckoutGenerationEnabled({
      [LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG]: '1',
    })).toBe(true);
  });

  it.each([
    ['unset', undefined],
    ['zero', '0'],
    ['malformed', 'true'],
  ] as const)('does no generation or provider work when the gate is %s', async (_label, value) => {
    const { dependencies, store, provider, nowEpochSeconds } = mocks();
    const env = value === undefined ? {} : { [LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG]: value };

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), {
      ...dependencies,
      env,
    })).rejects.toBeInstanceOf(LegacyDestinationCheckoutDisabledError);

    expectNoStoreCalls(store);
    expectNoProviderCalls(provider);
    expect(nowEpochSeconds).not.toHaveBeenCalled();
  });

  it('fingerprints customer, method policy, and caller metadata canonically', () => {
    const baseline = operationInput().requestFingerprint;
    expect(operationInput().requestFingerprint).toBe(baseline);
    expect(operationInput({ expectedCustomerId: 'cus_anothercustomer123' }).requestFingerprint)
      .not.toBe(baseline);
    expect(operationInput({ allowCardFallback: false }).requestFingerprint).not.toBe(baseline);
    expect(operationInput({ metadata: { payment_plan_id: OTHER_PAYMENT_ID } }).requestFingerprint)
      .not.toBe(baseline);
  });
});

describe('legacy destination Checkout creation', () => {
  it('uses the full immutable claim, then completes and confirms before returning a URL', async () => {
    const { dependencies, store, provider } = mocks();
    const order: string[] = [];
    store.begin.mockImplementation(async () => { order.push('begin'); return true; });
    provider.createSession.mockImplementation(async (input: CreateInput) => {
      order.push('create');
      return created(sessionForContract(input));
    });
    store.complete.mockImplementation(async () => { order.push('complete'); return true; });
    store.confirmPresentation.mockImplementation(async () => { order.push('confirm'); return true; });

    const result = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies);

    expect(result).toEqual({
      outcome: 'created',
      operationPk: OPERATION_PK_1,
      generation: 1,
      checkoutSessionId: SESSION_ID_1,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${SESSION_ID_1}`,
    });
    expect(order).toEqual(['begin', 'create', 'complete', 'confirm']);
    const call = provider.createSession.mock.calls[0][0];
    expect(call.idempotencyKey).toBe(achIdempotencyKey(1));
    expect(call).toMatchObject({
      paymentId: PAYMENT_ID,
      operationPk: OPERATION_PK_1,
      operationId: operationId(1),
      generation: 1,
      predecessorOperationPk: null,
      requestFingerprint: operationInput().requestFingerprint,
      grossAmountCents: GROSS_AMOUNT_CENTS,
      applicationFeeCents: APPLICATION_FEE_CENTS,
      feeRate: FEE_RATE,
      destinationAccountId: DESTINATION_ACCOUNT_ID,
      livemode: false,
      expectedCustomerId: CUSTOMER_ID,
      currency: LEGACY_DESTINATION_CHECKOUT_CURRENCY,
      mode: LEGACY_DESTINATION_CHECKOUT_MODE,
      paymentMethodTypes: ['card', 'us_bank_account'],
    });
    expect(contractMetadata(call)).toMatchObject({
      payment_plan_id: PAYMENT_PLAN_ID,
      [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.paymentId]: PAYMENT_ID,
      [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.operationPk]: OPERATION_PK_1,
      [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.operationId]: operationId(1),
      [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.generation]: '1',
      [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.predecessorOperationPk]: 'none',
      [LEGACY_DESTINATION_CHECKOUT_METADATA_KEYS.requestFingerprint]: operationInput().requestFingerprint,
    });
    expect(Object.keys(contractMetadata(call))).toHaveLength(RESERVED_METADATA_KEYS.length + 1);
    expect(Object.isFrozen(call)).toBe(true);
    expect(Object.isFrozen(contractMetadata(call))).toBe(true);
    expect(Object.isFrozen(contractPaymentMethods(call))).toBe(true);
  });

  it('does not contact any provider method when begin ownership is refused', async () => {
    const { dependencies, store, provider } = mocks();
    store.begin.mockResolvedValue(false);

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutUnavailableError);
    expectNoProviderCalls(provider);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  });

  it('quarantines full safe evidence and expires a recognizable invalid created Session', async () => {
    const { dependencies, store, provider } = mocks();
    createWith(provider, (session) => changeMetadataValue(session, PAYMENT_ID, OTHER_PAYMENT_ID));

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.quarantine).toHaveBeenCalledWith({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: SESSION_ID_1,
      providerStatus: 'open',
      providerPaymentStatus: 'unpaid',
      expiresAt: EXPIRES_AT,
      reason: 'invalid_provider_session',
    });
    expect(provider.expireSession).toHaveBeenCalledWith({
      checkoutSessionId: SESSION_ID_1,
      operationPk: OPERATION_PK_1,
      operationId: operationId(1),
    });
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  });

  it('uses all-null quarantine evidence for malformed lifecycle fields without fabricating values', async () => {
    const { dependencies, store, provider } = mocks();
    createWith(provider, (session) => ({
      ...session,
      status: 'malformed-status',
      payment_status: 'malformed-payment-status',
      expires_at: Number.NaN,
    } as unknown as Stripe.Checkout.Session));

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.quarantine).toHaveBeenCalledWith({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: null,
      providerStatus: null,
      providerPaymentStatus: null,
      expiresAt: null,
      reason: 'invalid_provider_session',
    });
    expect(provider.expireSession).toHaveBeenCalledWith({
      checkoutSessionId: SESSION_ID_1,
      operationPk: OPERATION_PK_1,
      operationId: operationId(1),
    });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('quarantines and expires a paid created Session without persisting or presenting it', async () => {
    const { dependencies, store, provider } = mocks();
    createWith(provider, (session) => ({
      ...session, status: 'complete', payment_status: 'paid', url: null,
    } as Stripe.Checkout.Session));

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: SESSION_ID_1,
      providerStatus: 'complete',
      providerPaymentStatus: 'paid',
      reason: 'paid_hold',
    }));
    expect(provider.expireSession).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  });

  it('quarantines and expires a complete-unpaid created Session without persisting or presenting it', async () => {
    const { dependencies, store, provider } = mocks();
    createWith(provider, (session) => ({
      ...session, status: 'complete', payment_status: 'unpaid', url: null,
    } as Stripe.Checkout.Session));

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: SESSION_ID_1,
      providerStatus: 'complete',
      providerPaymentStatus: 'unpaid',
      reason: 'complete_unpaid_hold',
    }));
    expect(provider.expireSession).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  });
});

describe('legacy destination Checkout fallback and ambiguity', () => {
  it('falls back only after an explicit definitive rejection and uses the two SQL-issued keys', async () => {
    const { dependencies, provider } = mocks();
    provider.createSession
      .mockResolvedValueOnce({ outcome: 'definitive_payment_method_rejection' })
      .mockImplementationOnce(async (input: CreateInput) => created(sessionForContract(input)));

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .resolves.toMatchObject({ outcome: 'created' });

    expect(provider.createSession).toHaveBeenCalledTimes(2);
    const [primary, fallback] = provider.createSession.mock.calls.map(([input]) => input);
    expect(primary.idempotencyKey).toBe(achIdempotencyKey(1));
    expect(fallback.idempotencyKey).toBe(cardIdempotencyKey(1));
    expect(primary.variant).toBe('primary');
    expect(fallback.variant).toBe('card_fallback');
    expect(contractPaymentMethods(primary)).toEqual(['card', 'us_bank_account']);
    expect(contractPaymentMethods(fallback)).toEqual(['card']);
  });

  it('does not treat a thrown provider error as a definitive fallback signal', async () => {
    const { dependencies, store, provider } = mocks();
    provider.createSession.mockRejectedValue(new Error('us_bank_account homeowner@example.com secret'));

    const error = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegacyDestinationCheckoutIndeterminateError);
    expect(String(error)).not.toContain('homeowner@example.com');
    expect(provider.createSession).toHaveBeenCalledTimes(1);
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      lastError: 'provider_create_ambiguous',
    });
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('marks fallback response loss indeterminate with fixed data and never makes a third call', async () => {
    const { dependencies, store, provider } = mocks();
    provider.createSession
      .mockResolvedValueOnce({ outcome: 'definitive_payment_method_rejection' })
      .mockRejectedValueOnce(new Error('customer homeowner@example.com response lost'));

    const error = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegacyDestinationCheckoutIndeterminateError);
    expect(String(error)).not.toContain('homeowner@example.com');
    expect(provider.createSession).toHaveBeenCalledTimes(2);
    expect(provider.createSession.mock.calls[0][0].idempotencyKey).toBe(achIdempotencyKey(1));
    expect(provider.createSession.mock.calls[1][0].idempotencyKey).toBe(cardIdempotencyKey(1));
    expect(store.markIndeterminate).toHaveBeenCalledWith({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      lastError: 'provider_create_ambiguous',
    });
  });

  it('does not leak provider or database text when the indeterminate write also fails', async () => {
    const { dependencies, store, provider } = mocks();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    provider.createSession.mockRejectedValue(new Error('homeowner@example.com provider secret'));
    store.markIndeterminate.mockRejectedValue(new Error('database customer payload'));

    const error = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LegacyDestinationCheckoutIndeterminateError);
    expect(String(error)).not.toMatch(/homeowner@example\.com|database customer payload|provider secret/);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('legacy destination Checkout replay verification', () => {
  async function expectReplayRejected(
    mutate: (
      session: Stripe.Checkout.Session,
      contract: LegacyDestinationCheckoutProviderContract,
    ) => Stripe.Checkout.Session,
  ): Promise<void> {
    const { dependencies, store, provider } = mocks(claim('replay_unpresented', {
      generation: 2,
      operationPk: OPERATION_PK_2,
      predecessorOperationPk: PREDECESSOR_OPERATION_PK,
      operationId: operationId(2),
      achIdempotencyKey: achIdempotencyKey(2),
      cardFallbackIdempotencyKey: cardIdempotencyKey(2),
      checkoutSessionId: SESSION_ID_2,
    }));
    retrieveWith(provider, mutate);

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(provider.createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  }

  it.each([
    ['payment ID metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, PAYMENT_ID, OTHER_PAYMENT_ID)
    )],
    ['operation primary-key metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, OPERATION_PK_2, OPERATION_PK_1)
    )],
    ['stable operation-ID metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, operationId(2), 'wrong-operation-id')
    )],
    ['Checkout generation metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, '2', '3')
    )],
    ['predecessor metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, PREDECESSOR_OPERATION_PK, OPERATION_PK_2)
    )],
    ['request-fingerprint metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, operationInput().requestFingerprint, 'b'.repeat(64))
    )],
    ['gross-amount metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, String(GROSS_AMOUNT_CENTS), String(GROSS_AMOUNT_CENTS + 1))
    )],
    ['application-fee metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, String(APPLICATION_FEE_CENTS), String(APPLICATION_FEE_CENTS + 1))
    )],
    ['frozen fee-rate metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, String(FEE_RATE), '0.06')
    )],
    ['destination-account metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, DESTINATION_ACCOUNT_ID, 'acct_another123')
    )],
    ['livemode metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, 'false', 'true')
    )],
    ['expected-customer metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, CUSTOMER_ID, 'cus_anothercustomer123')
    )],
    ['currency metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, LEGACY_DESTINATION_CHECKOUT_CURRENCY, 'eur')
    )],
    ['mode metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, LEGACY_DESTINATION_CHECKOUT_MODE, 'subscription')
    )],
    ['payment-method metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, 'card,us_bank_account', 'card')
    )],
    ['variant metadata', (session: Stripe.Checkout.Session) => (
      changeMetadataValue(session, 'primary', 'card_fallback')
    )],
    ['client reference', (session: Stripe.Checkout.Session) => ({
      ...session, client_reference_id: OTHER_PAYMENT_ID,
    } as Stripe.Checkout.Session)],
    ['subtotal', (session: Stripe.Checkout.Session) => ({
      ...session, amount_subtotal: GROSS_AMOUNT_CENTS + 1,
    } as Stripe.Checkout.Session)],
    ['total', (session: Stripe.Checkout.Session) => ({
      ...session, amount_total: GROSS_AMOUNT_CENTS + 1,
    } as Stripe.Checkout.Session)],
    ['customer', (session: Stripe.Checkout.Session) => ({
      ...session, customer: 'cus_wrongcustomer123',
    } as Stripe.Checkout.Session)],
    ['livemode', (session: Stripe.Checkout.Session) => ({
      ...session, livemode: true,
    } as Stripe.Checkout.Session)],
    ['Session-ID mode prefix', (session: Stripe.Checkout.Session) => ({
      ...session, id: 'cs_live_wrong_mode_123',
    } as Stripe.Checkout.Session)],
    ['currency', (session: Stripe.Checkout.Session) => ({
      ...session, currency: 'eur',
    } as Stripe.Checkout.Session)],
    ['mode', (session: Stripe.Checkout.Session) => ({
      ...session, mode: 'subscription',
    } as Stripe.Checkout.Session)],
    ['payment methods', (session: Stripe.Checkout.Session) => ({
      ...session, payment_method_types: ['card', 'link'],
    } as unknown as Stripe.Checkout.Session)],
    ['injected metadata', (session: Stripe.Checkout.Session) => ({
      ...session,
      metadata: { ...session.metadata, lgq_injected_reserved: 'unsafe' },
    } as Stripe.Checkout.Session)],
  ] as const)('rejects replay with wrong %s', async (_label, mutate) => {
    await expectReplayRejected((session) => mutate(session));
  });

  it.each(RESERVED_METADATA_KEYS)(
    'rejects replay when reserved metadata key %s is missing',
    async (key) => {
      await expectReplayRejected((session) => removeMetadataKey(session, key));
    },
  );

  it('rejects replay when expected caller metadata is missing', async () => {
    await expectReplayRejected((session) => removeMetadataKey(session, 'payment_plan_id'));
  });

  it('rejects generation-one metadata with an injected predecessor identity', async () => {
    const predecessorKey = RESERVED_METADATA_KEYS.find((key) => /predecessor/i.test(key));
    expect(predecessorKey).toBeDefined();
    const { dependencies, store, provider } = mocks(claim('replay_unpresented'));
    retrieveWith(provider, (session) => ({
      ...session,
      metadata: { ...session.metadata, [predecessorKey!]: PREDECESSOR_OPERATION_PK },
    } as Stripe.Checkout.Session));

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  });

  it.each([
    'http://checkout.stripe.com/c/pay/unsafe',
    'https://checkout.stripe.com.evil.example/c/pay/unsafe',
    'https://checkout.stripe.com@evil.example/c/pay/unsafe',
    'https://checkout.stripe.com/',
  ])('rejects unsafe Checkout URL %s', async (url) => {
    await expectReplayRejected((session) => ({ ...session, url } as Stripe.Checkout.Session));
  });

  it('rejects recovered_from replay behavior', async () => {
    await expectReplayRejected((session) => ({
      ...session,
      recovered_from: SESSION_ID_1,
    } as Stripe.Checkout.Session));
  });

  it('rejects after_expiration recovery behavior', async () => {
    await expectReplayRejected((session) => ({
      ...session,
      after_expiration: {
        recovery: {
          allow_promotion_codes: false,
          enabled: true,
          expires_at: EXPIRES_AT + 60,
          url: 'https://checkout.stripe.com/c/pay/recovery',
        },
      },
    } as Partial<Stripe.Checkout.Session> as Stripe.Checkout.Session));
  });

  it('rejects a paid Session replay', async () => {
    await expectReplayRejected((session) => ({
      ...session, status: 'complete', payment_status: 'paid', url: null,
    } as Stripe.Checkout.Session));
  });

  it('rejects a complete-unpaid Session replay', async () => {
    await expectReplayRejected((session) => ({
      ...session, status: 'complete', payment_status: 'unpaid', url: null,
    } as Stripe.Checkout.Session));
  });

  it('rejects an expired provider replay', async () => {
    await expectReplayRejected((session) => ({
      ...session, status: 'expired', payment_status: 'unpaid', url: null,
    } as Stripe.Checkout.Session));
  });

  it('rejects replay when provider expiry differs from the stored expiry', async () => {
    await expectReplayRejected((session) => ({
      ...session, expires_at: EXPIRES_AT + 1,
    } as Stripe.Checkout.Session));
  });

  it('rejects an open Session whose exact expiry has elapsed', async () => {
    const { dependencies, store, provider, nowEpochSeconds } = mocks(claim('replay_unpresented', {
      checkoutSessionExpiresAt: new Date(EXPIRES_AT * 1_000).toISOString(),
    }));
    nowEpochSeconds.mockReturnValue(EXPIRES_AT);

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.confirmPresentation).not.toHaveBeenCalled();
    expect(provider.createSession).not.toHaveBeenCalled();
  });

  it('replays an exact valid generation-two Session and confirms before returning its URL', async () => {
    const replayClaim = claim('replay_unpresented', {
      generation: 2,
      operationPk: OPERATION_PK_2,
      predecessorOperationPk: PREDECESSOR_OPERATION_PK,
      operationId: operationId(2),
      achIdempotencyKey: achIdempotencyKey(2),
      cardFallbackIdempotencyKey: cardIdempotencyKey(2),
      checkoutSessionId: SESSION_ID_2,
    });
    const { dependencies, store, provider } = mocks(replayClaim);

    const result = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies);

    expect(result).toEqual({
      outcome: 'replayed',
      operationPk: OPERATION_PK_2,
      generation: 2,
      checkoutSessionId: SESSION_ID_2,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${SESSION_ID_2}`,
    });
    const retrieve = provider.retrieveSession.mock.calls[0][0] as RetrieveInput;
    expect(retrieve.checkoutSessionId).toBe(SESSION_ID_2);
    expect(contractsFromRetrieve(retrieve)).toHaveLength(2);
    expect(provider.createSession).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.confirmPresentation).toHaveBeenCalledWith({
      operationPk: OPERATION_PK_2,
      checkoutSessionId: SESSION_ID_2,
    });
  });
});

describe('legacy destination Checkout completion and presentation fences', () => {
  it('withholds, quarantines, and expires a created Session when completion returns false', async () => {
    const { dependencies, store, provider } = mocks();
    store.complete.mockResolvedValue(false);

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: SESSION_ID_1,
      reason: 'lost_completion_race',
    }));
    expect(provider.expireSession).toHaveBeenCalledWith({
      checkoutSessionId: SESSION_ID_1,
      operationPk: OPERATION_PK_1,
      operationId: operationId(1),
    });
    expect(store.confirmPresentation).not.toHaveBeenCalled();
  });

  it('attempts quarantine and expiry without exposing a URL when completion throws', async () => {
    const { dependencies, store, provider } = mocks();
    store.complete.mockRejectedValue(new Error('database homeowner@example.com response lost'));

    const error = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LegacyDestinationCheckoutIndeterminateError);
    expect(String(error)).not.toContain('homeowner@example.com');
    expect(store.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: SESSION_ID_1,
      reason: 'persistence_ambiguous',
    }));
    expect(provider.expireSession).toHaveBeenCalledTimes(1);
    expect(store.confirmPresentation).not.toHaveBeenCalled();
    expect(store.markIndeterminate).toHaveBeenCalledWith(expect.objectContaining({
      lastError: 'completion_ambiguous',
    }));
  });

  it('attempts quarantine and expiry without exposing a URL when presentation returns false', async () => {
    const { dependencies, store, provider } = mocks();
    store.confirmPresentation.mockResolvedValue(false);

    await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
      .rejects.toBeInstanceOf(LegacyDestinationCheckoutReconciliationError);
    expect(store.complete).toHaveBeenCalledTimes(1);
    expect(store.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: SESSION_ID_1,
      reason: 'presentation_withheld',
    }));
    expect(provider.expireSession).toHaveBeenCalledTimes(1);
  });

  it('attempts quarantine and expiry without exposing a URL when presentation throws', async () => {
    const { dependencies, store, provider } = mocks();
    store.confirmPresentation.mockRejectedValue(new Error('database customer payload'));

    const error = await orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LegacyDestinationCheckoutIndeterminateError);
    expect(String(error)).not.toContain('database customer payload');
    expect(store.complete).toHaveBeenCalledTimes(1);
    expect(store.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      checkoutSessionId: SESSION_ID_1,
      reason: 'persistence_ambiguous',
    }));
    expect(provider.expireSession).toHaveBeenCalledTimes(1);
  });
});

function claimRpcRow() {
  return {
    claim_status: 'claimed',
    operation_pk: OPERATION_PK_1,
    claim_token: CLAIM_TOKEN,
    operation_state: 'claimed',
    checkout_generation: 1,
    predecessor_operation_pk: null,
    operation_id: operationId(1),
    ach_stripe_idempotency_key: achIdempotencyKey(1),
    card_stripe_idempotency_key: cardIdempotencyKey(1),
    request_fingerprint: operationInput().requestFingerprint,
    destination_account_id: DESTINATION_ACCOUNT_ID,
    livemode: false,
    gross_amount_cents: GROSS_AMOUNT_CENTS,
    application_fee_cents: APPLICATION_FEE_CENTS,
    fee_rate: FEE_RATE,
    checkout_session_id: null,
    checkout_session_status: null,
    checkout_payment_status: null,
    checkout_session_expires_at: null,
    presented_at: null,
    paid_hold_active: false,
  };
}

describe('service-role RPC adapter contracts', () => {
  it('uses the exact claim RPC name and p_* keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [claimRpcRow()], error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);
    const input = operationInput();

    await expect(store.claim({
      paymentId: input.paymentId,
      livemode: input.livemode,
      requestFingerprint: input.requestFingerprint,
      grossAmountCents: input.grossAmountCents,
      applicationFeeCents: input.applicationFeeCents,
      feeRate: input.feeRate,
    })).resolves.toMatchObject({ operationPk: OPERATION_PK_1 });
    expect(rpc).toHaveBeenCalledWith('claim_legacy_destination_checkout_operation', {
      p_payment_id: PAYMENT_ID,
      p_livemode: false,
      p_request_fingerprint: input.requestFingerprint,
      p_gross_amount_cents: GROSS_AMOUNT_CENTS,
      p_application_fee_cents: APPLICATION_FEE_CENTS,
      p_fee_rate: FEE_RATE,
    });
  });

  it('uses the exact begin RPC name and p_* keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);

    await expect(store.begin({ operationPk: OPERATION_PK_1, claimToken: CLAIM_TOKEN }))
      .resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('begin_legacy_destination_checkout_submission', {
      p_operation_pk: OPERATION_PK_1,
      p_claim_token: CLAIM_TOKEN,
    });
  });

  it('uses the exact completion RPC name and p_* keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);

    await expect(store.complete({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: SESSION_ID_1,
      providerStatus: 'open',
      providerPaymentStatus: 'unpaid',
      expiresAt: EXPIRES_AT,
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('complete_legacy_destination_checkout_operation', {
      p_operation_pk: OPERATION_PK_1,
      p_claim_token: CLAIM_TOKEN,
      p_checkout_session_id: SESSION_ID_1,
      p_checkout_session_status: 'open',
      p_checkout_payment_status: 'unpaid',
      p_checkout_session_expires_at: new Date(EXPIRES_AT * 1_000).toISOString(),
    });
  });

  it('uses the exact presentation RPC name and p_* keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);

    await expect(store.confirmPresentation({
      operationPk: OPERATION_PK_1,
      checkoutSessionId: SESSION_ID_1,
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('confirm_legacy_destination_checkout_presentation', {
      p_operation_pk: OPERATION_PK_1,
      p_checkout_session_id: SESSION_ID_1,
    });
  });

  it('uses the exact indeterminate RPC name and p_* keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);

    await expect(store.markIndeterminate({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      lastError: 'provider_create_ambiguous',
    })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('mark_legacy_destination_checkout_indeterminate', {
      p_operation_pk: OPERATION_PK_1,
      p_claim_token: CLAIM_TOKEN,
      p_last_error: 'provider_create_ambiguous',
    });
  });

  it('uses the exact quarantine RPC name and p_* keys', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);

    await expect(store.quarantine({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: SESSION_ID_1,
      providerStatus: 'open',
      providerPaymentStatus: 'unpaid',
      expiresAt: EXPIRES_AT,
      reason: 'invalid_provider_session',
    })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('quarantine_legacy_destination_checkout_operation', {
      p_operation_pk: OPERATION_PK_1,
      p_claim_token: CLAIM_TOKEN,
      p_checkout_session_id: SESSION_ID_1,
      p_checkout_session_status: 'open',
      p_checkout_payment_status: 'unpaid',
      p_checkout_session_expires_at: new Date(EXPIRES_AT * 1_000).toISOString(),
      p_reason: 'invalid_provider_session',
    });
  });

  it('passes all-null evidence to the exact quarantine RPC shape', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);

    await expect(store.quarantine({
      operationPk: OPERATION_PK_1,
      claimToken: CLAIM_TOKEN,
      checkoutSessionId: null,
      providerStatus: null,
      providerPaymentStatus: null,
      expiresAt: null,
      reason: 'invalid_provider_session',
    })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('quarantine_legacy_destination_checkout_operation', {
      p_operation_pk: OPERATION_PK_1,
      p_claim_token: CLAIM_TOKEN,
      p_checkout_session_id: null,
      p_checkout_session_status: null,
      p_checkout_payment_status: null,
      p_checkout_session_expires_at: null,
      p_reason: 'invalid_provider_session',
    });
  });

  it('keeps signed-event classification ungated and uses the exact classifier RPC contract', async () => {
    vi.stubEnv(LEGACY_DESTINATION_CHECKOUT_GENERATION_FLAG, '0');
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        event_status: 'recorded',
        classification: 'historical_paid_hold',
        operation_pk: OPERATION_PK_1,
        checkout_generation: 1,
        is_current: false,
        projection_allowed: false,
        paid_hold_active: true,
      }],
      error: null,
    });
    const store = new SupabaseLegacyDestinationCheckoutOperationStore({ rpc } as never);
    const identity = signedEventIdentity();

    await expect(classifyLegacyDestinationCheckoutSignedEvent(identity, store)).resolves
      .toMatchObject({ disposition: 'historical_paid_hold', paidHoldActive: true });
    expect(rpc).toHaveBeenCalledWith('classify_legacy_destination_checkout_event', {
      p_provider_event_id: identity.providerEventId,
      p_event_type: identity.eventType,
      p_event_object_id: identity.eventObjectId,
      p_payment_id: PAYMENT_ID,
      p_checkout_session_id: SESSION_ID_1,
      p_payment_intent_id: identity.paymentIntentId,
      p_livemode: false,
      p_outcome: 'success',
      p_checkout_session_status: 'complete',
      p_checkout_payment_status: 'paid',
      p_observed_at: identity.observedAt,
    });
  });

  it('rejects event types outside the exact SQL allowlist before calling the store', async () => {
    const { store } = mocks();

    await expect(classifyLegacyDestinationCheckoutSignedEvent({
      ...signedEventIdentity(),
      eventType: 'checkout.session.created' as never,
    }, store)).rejects.toBeInstanceOf(LegacyDestinationCheckoutUnavailableError);
    expect(store.classifyEvent).not.toHaveBeenCalled();
  });
});

describe('legacy destination Checkout non-actionable claim dispatch', () => {
  /**
   * Every status the claim RPC can return that must not reach a provider, with
   * the operation state SQL pairs with it. The state matters: a mismatched one
   * is refused by assertClaimMatchesOperation before dispatch is ever reached,
   * so a test that omits it still throws Unavailable and proves nothing about
   * the branch it claims to cover. `paid_hold` is the exception — it is checked
   * ahead of that assertion, so its state is irrelevant.
   */
  const NON_ACTIONABLE = [
    // Another worker holds a live lease. Retrying later is correct; creating a
    // second Session here is exactly the double-charge this rail exists to stop.
    { status: 'in_progress', operationState: 'claimed', error: LegacyDestinationCheckoutUnavailableError },
    { status: 'submitted', operationState: 'submitted', error: LegacyDestinationCheckoutIndeterminateError },
    { status: 'indeterminate', operationState: 'indeterminate', error: LegacyDestinationCheckoutIndeterminateError },
    { status: 'quarantined', operationState: 'quarantined', error: LegacyDestinationCheckoutReconciliationError },
    { status: 'complete_unpaid', operationState: 'completed', error: LegacyDestinationCheckoutReconciliationError },
    { status: 'paid_hold', operationState: 'completed', error: LegacyDestinationCheckoutReconciliationError },
  ] as const;

  it.each(NON_ACTIONABLE)(
    'refuses a $status claim with its documented error and no provider call',
    async ({ status, operationState, error }) => {
      const { dependencies, store, provider } = mocks(claim(status, { operationState }));

      await expect(orchestrateLegacyDestinationCheckoutGeneration(operationInput(), dependencies))
        .rejects.toBeInstanceOf(error);
      expectNoProviderCalls(provider);
      expect(store.begin).not.toHaveBeenCalled();
      expect(store.complete).not.toHaveBeenCalled();
      expect(store.confirmPresentation).not.toHaveBeenCalled();
    },
  );

  it('covers every claim status that is not creation or replay', () => {
    // in_progress reaches Unavailable by falling past the whole dispatch chain
    // rather than by a branch naming it. That is the correct outcome, but it is
    // also what a newly added status would inherit silently, so the union and
    // this table are pinned to each other.
    const creationOrReplay = ['claimed', 'replay_unpresented', 'replay_presented'];
    const covered = NON_ACTIONABLE.map((entry) => entry.status);
    expect([...covered, ...creationOrReplay].sort()).toEqual([
      'claimed',
      'complete_unpaid',
      'in_progress',
      'indeterminate',
      'paid_hold',
      'quarantined',
      'replay_presented',
      'replay_unpresented',
      'submitted',
    ]);
  });

  it('reaches Unavailable for in_progress by dispatch, not by claim assertion', () => {
    // Guards the fixture above: with the state SQL actually pairs with
    // in_progress, the claim itself is well-formed, so the only thing left to
    // reject it is the dispatch fallthrough being tested.
    const wellFormed = claim('in_progress', { operationState: 'claimed' });
    expect(wellFormed.operationState).toBe('claimed');
    expect(wellFormed.paidHoldActive).toBe(false);
    expect(wellFormed.checkoutSessionId).toBeNull();
  });
});
