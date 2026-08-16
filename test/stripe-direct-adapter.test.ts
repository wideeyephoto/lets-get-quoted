import { beforeEach, describe, expect, it, vi } from 'vitest';

const stripeMocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutExpire: vi.fn(),
  checkoutRetrieve: vi.fn(),
  paymentIntentCreate: vi.fn(),
  paymentIntentRetrieve: vi.fn(),
  refundCreate: vi.fn(),
  refundRetrieve: vi.fn(),
  applicationFeeRefundCreate: vi.fn(),
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: stripeMocks.getStripeClient,
}));

import {
  DIRECT_CHARGE_MODEL,
  buildDirectChargeMetadata,
  buildDirectApplicationFeeRefundCall,
  buildDirectCheckoutSessionCall,
  buildDirectCheckoutSessionExpireCall,
  buildDirectMutationRequestOptions,
  buildDirectPaymentIntentCall,
  buildDirectRequestFingerprint,
  buildDirectReadRequestOptions,
  buildDirectRefundCall,
  createDirectApplicationFeeRefund,
  createDirectCheckoutSession,
  expireDirectCheckoutSession,
  createDirectPaymentIntent,
  createDirectRefund,
  retrieveDirectCheckoutSession,
  retrieveDirectPaymentIntent,
  retrieveDirectRefund,
  type DirectCheckoutSessionInput,
  type DirectRefundInput,
} from '@/lib/billing/stripe-direct';

const MERCHANT_ACCOUNT_ID = 'acct_merchant123';

const checkoutInput = {
  merchantAccountId: MERCHANT_ACCOUNT_ID,
  operationId: 'payment_01J_TEST',
  amountCents: 25_000,
  applicationFeeAmountCents: 313,
  lineItemName: 'Contractor invoice',
  successUrl: 'http://localhost:3010/payment/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'http://localhost:3010/payment/cancel',
  metadata: { lgq_payment_id: 'payment_01J_TEST' },
} satisfies DirectCheckoutSessionInput;

beforeEach(() => {
  vi.clearAllMocks();
  stripeMocks.checkoutCreate.mockResolvedValue({ id: 'cs_test_session123' });
  stripeMocks.checkoutExpire.mockResolvedValue({
    id: 'cs_test_session123',
    status: 'expired',
    payment_status: 'unpaid',
  });
  stripeMocks.checkoutRetrieve.mockResolvedValue({ id: 'cs_test_session123' });
  stripeMocks.paymentIntentCreate.mockResolvedValue({ id: 'pi_test_intent123' });
  stripeMocks.paymentIntentRetrieve.mockResolvedValue({ id: 'pi_test_intent123' });
  stripeMocks.refundCreate.mockResolvedValue({ id: 're_test_refund123' });
  stripeMocks.refundRetrieve.mockResolvedValue({ id: 're_test_refund123' });
  stripeMocks.applicationFeeRefundCreate.mockResolvedValue({ id: 'fr_test_fee_refund123' });
  stripeMocks.getStripeClient.mockReturnValue({
    checkout: {
      sessions: {
        create: stripeMocks.checkoutCreate,
        expire: stripeMocks.checkoutExpire,
        retrieve: stripeMocks.checkoutRetrieve,
      },
    },
    paymentIntents: {
      create: stripeMocks.paymentIntentCreate,
      retrieve: stripeMocks.paymentIntentRetrieve,
    },
    refunds: {
      create: stripeMocks.refundCreate,
      retrieve: stripeMocks.refundRetrieve,
    },
    applicationFees: {
      createRefund: stripeMocks.applicationFeeRefundCreate,
    },
  });
});

describe('Stripe direct-charge request boundary', () => {
  it('creates deterministic mutation keys scoped to one Merchant account and operation', () => {
    const first = buildDirectMutationRequestOptions({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operation: 'payment_intent.create',
      operationId: 'payment_123',
    });
    const retry = buildDirectMutationRequestOptions({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operation: 'payment_intent.create',
      operationId: 'payment_123',
    });
    const differentOperation = buildDirectMutationRequestOptions({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operation: 'refund.create',
      operationId: 'payment_123',
    });
    const differentMerchant = buildDirectMutationRequestOptions({
      merchantAccountId: 'acct_othermerchant9',
      operation: 'payment_intent.create',
      operationId: 'payment_123',
    });

    expect(first).toEqual(retry);
    expect(first.stripeAccount).toBe(MERCHANT_ACCOUNT_ID);
    expect(first.idempotencyKey).toMatch(/^lgq:direct:v1:payment_intent\.create:[a-f0-9]{64}$/);
    expect(differentOperation.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(differentMerchant.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(Object.keys(first).sort()).toEqual(['idempotencyKey', 'stripeAccount']);
    expect(buildDirectReadRequestOptions(MERCHANT_ACCOUNT_ID)).toEqual({
      stripeAccount: MERCHANT_ACCOUNT_ID,
    });
  });

  it('fails closed on malformed acct_ IDs', () => {
    for (const merchantAccountId of ['', 'acct_', 'acct_short', 'ca_merchant123', 'acct_bad id', 'acct_bad-id']) {
      expect(() => buildDirectReadRequestOptions(merchantAccountId)).toThrow(/valid Stripe acct_ ID/);
    }
    expect(buildDirectReadRequestOptions('  acct_merchant123  ')).toEqual({
      stripeAccount: MERCHANT_ACCOUNT_ID,
    });
  });

  it('owns and freezes charge-model and merchant metadata', () => {
    const customMetadata = { source: 'invoice' };
    const metadata = buildDirectChargeMetadata({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'payment_123',
      metadata: customMetadata,
    });
    customMetadata.source = 'changed-after-build';

    expect(metadata).toEqual({
      source: 'invoice',
      lgq_charge_model: DIRECT_CHARGE_MODEL,
      lgq_merchant_account_id: MERCHANT_ACCOUNT_ID,
      lgq_operation_id: 'payment_123',
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(() =>
      buildDirectChargeMetadata({
        merchantAccountId: MERCHANT_ACCOUNT_ID,
        operationId: 'payment_123',
        metadata: { lgq_charge_model: 'destination_charge' },
      }),
    ).toThrow(/reserved/);
  });

  it('builds stable fingerprints independent of object key order', () => {
    const first = buildDirectRequestFingerprint({
      operation: 'payment_intent.create',
      params: { amount: 25_000, metadata: { payment: 'payment_123', source: 'invoice' } },
    });
    const reordered = buildDirectRequestFingerprint({
      params: { metadata: { source: 'invoice', payment: 'payment_123' }, amount: 25_000 },
      operation: 'payment_intent.create',
    });
    const changed = buildDirectRequestFingerprint({
      operation: 'payment_intent.create',
      params: { amount: 25_001, metadata: { payment: 'payment_123', source: 'invoice' } },
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });
});

describe('pure direct-charge call builders', () => {
  it('passes the server-created application fee through Checkout unchanged', () => {
    const call = buildDirectCheckoutSessionCall(checkoutInput);

    expect(call.params.line_items?.[0]?.price_data?.unit_amount).toBe(25_000);
    expect(call.params.payment_intent_data?.application_fee_amount).toBe(313);
    expect(call.params.payment_intent_data?.metadata).toEqual(
      expect.objectContaining({
        lgq_charge_model: DIRECT_CHARGE_MODEL,
        lgq_merchant_account_id: MERCHANT_ACCOUNT_ID,
      }),
    );
    expect(call.params.metadata).toBe(call.params.payment_intent_data?.metadata);
    expect('transfer_data' in (call.params.payment_intent_data ?? {})).toBe(false);
    expect(Object.isFrozen(call.params.payment_intent_data)).toBe(true);
    expect(call.options.stripeAccount).toBe(MERCHANT_ACCOUNT_ID);
    expect(call.options.idempotencyKey).toContain('checkout_session.create');
    expect(call.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('builds an exact connected-account Session expiration with stable identity', () => {
    const input = {
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'late-success:payment_01J_TEST:checkout:2',
      checkoutSessionId: 'cs_test_successor123',
    };
    const first = buildDirectCheckoutSessionExpireCall(input);
    const replay = buildDirectCheckoutSessionExpireCall(input);

    expect(first).toEqual(replay);
    expect(first.checkoutSessionId).toBe('cs_test_successor123');
    expect(first.params).toEqual({});
    expect(first.options).toEqual(expect.objectContaining({
      stripeAccount: MERCHANT_ACCOUNT_ID,
      idempotencyKey: expect.stringMatching(
        /^lgq:direct:v1:checkout_session\.expire:[a-f0-9]{64}$/,
      ),
    }));
    expect(first.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(() => buildDirectCheckoutSessionExpireCall({
      ...input,
      checkoutSessionId: 'cs invalid',
    })).toThrow(/valid Stripe ID/);
  });

  it('passes the server-created application fee through a PaymentIntent unchanged', () => {
    const call = buildDirectPaymentIntentCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'plan_installment_2',
      amountCents: 42_001,
      applicationFeeAmountCents: 42,
      customerId: 'cus_homeowner123',
      paymentMethodId: 'pm_card123',
      confirm: true,
      offSession: true,
      metadata: { lgq_payment_id: 'payment_2' },
    });

    expect(call.params).toEqual(
      expect.objectContaining({
        amount: 42_001,
        application_fee_amount: 42,
        currency: 'usd',
        customer: 'cus_homeowner123',
        payment_method: 'pm_card123',
        confirm: true,
        off_session: true,
      }),
    );
    expect('transfer_data' in call.params).toBe(false);
    expect(call.params.metadata).toEqual(
      expect.objectContaining({
        lgq_charge_model: DIRECT_CHARGE_MODEL,
        lgq_merchant_account_id: MERCHANT_ACCOUNT_ID,
        lgq_operation_id: 'plan_installment_2',
      }),
    );
  });

  it('omits a zero application fee and never recalculates a nonzero one', () => {
    const zeroFee = buildDirectPaymentIntentCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'no_fee_payment',
      amountCents: 50_000,
      applicationFeeAmountCents: 0,
    });
    const exactFee = buildDirectPaymentIntentCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'exact_fee_payment',
      amountCents: 50_000,
      applicationFeeAmountCents: 7,
    });

    expect(zeroFee.params).not.toHaveProperty('application_fee_amount');
    expect(exactFee.params.application_fee_amount).toBe(7);
  });

  it('builds direct refunds without a transfer reversal and makes fee refunding explicit', () => {
    const refundInput = {
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'refund_payment_123_attempt_1',
      paymentIntentId: 'pi_test_intent123',
      refundApplicationFee: true,
      reason: 'requested_by_customer',
    } satisfies DirectRefundInput;
    const call = buildDirectRefundCall(refundInput);

    expect(call.params).toEqual(
      expect.objectContaining({
        payment_intent: 'pi_test_intent123',
        refund_application_fee: true,
      }),
    );
    expect('reverse_transfer' in call.params).toBe(false);
    expect(call.options.stripeAccount).toBe(MERCHANT_ACCOUNT_ID);
    expect(call.options.idempotencyKey).toContain('refund.create');
  });

  it('forces partial refunds to return an exact application-fee amount separately', () => {
    expect(() => buildDirectRefundCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'unsafe_partial_refund',
      paymentIntentId: 'pi_test_intent123',
      amountCents: 5_000,
      refundApplicationFee: true,
    })).toThrow(/exact application fee separately/i);

    const chargeRefund = buildDirectRefundCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'partial_refund_charge',
      paymentIntentId: 'pi_test_intent123',
      amountCents: 5_000,
      refundApplicationFee: false,
    });
    const feeRefund = buildDirectApplicationFeeRefundCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'partial_refund_fee',
      applicationFeeId: 'fee_test_application123',
      amountCents: 37,
      metadata: { lgq_payment_id: 'payment_123' },
    });

    expect(chargeRefund.params).toMatchObject({ amount: 5_000, refund_application_fee: false });
    expect(feeRefund.applicationFeeId).toBe('fee_test_application123');
    expect(feeRefund.params.amount).toBe(37);
    expect(feeRefund.options.idempotencyKey).toContain('application_fee_refund.create');
    expect(feeRefund.options).not.toHaveProperty('stripeAccount');
  });

  it('can bind a refund to the exact connected-account Charge instead of selecting by intent', () => {
    const call = buildDirectRefundCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'refund_exact_charge',
      chargeId: 'ch_test_directcharge123',
      amountCents: 5_000,
      refundApplicationFee: false,
    });

    expect(call.params).toMatchObject({
      charge: 'ch_test_directcharge123',
      amount: 5_000,
      refund_application_fee: false,
    });
    expect(call.params).not.toHaveProperty('payment_intent');

    expect(() => buildDirectRefundCall({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'refund_ambiguous_target',
      chargeId: 'ch_test_directcharge123',
      paymentIntentId: 'pi_test_intent123',
      amountCents: 5_000,
      refundApplicationFee: false,
    } as unknown as DirectRefundInput)).toThrow(/exactly one Charge or PaymentIntent/);
  });

  it('rejects unsafe cent values before any Stripe client is requested', () => {
    for (const amountCents of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 100_000_000]) {
      expect(() => buildDirectCheckoutSessionCall({ ...checkoutInput, amountCents })).toThrow(/amountCents/);
    }
    for (const applicationFeeAmountCents of [-1, 1.5, Number.NaN, 25_001]) {
      expect(() =>
        buildDirectCheckoutSessionCall({ ...checkoutInput, applicationFeeAmountCents }),
      ).toThrow(/applicationFeeAmountCents/);
    }
    expect(() =>
      buildDirectRefundCall({
        merchantAccountId: MERCHANT_ACCOUNT_ID,
        operationId: 'refund_bad_cents',
        paymentIntentId: 'pi_test_intent123',
        amountCents: 12.5,
        refundApplicationFee: false,
      }),
    ).toThrow(/amountCents/);
    expect(stripeMocks.getStripeClient).not.toHaveBeenCalled();
  });

  it('rejects Checkout return URLs outside the configured LGQ app origin', () => {
    expect(() => buildDirectCheckoutSessionCall({
      ...checkoutInput,
      successUrl: 'https://attacker.example/payment/success',
    })).toThrow(/configured LGQ app origin/i);
    expect(() => buildDirectCheckoutSessionCall({
      ...checkoutInput,
      cancelUrl: 'http://localhost.attacker.example:3010/payment/cancel',
    })).toThrow(/configured LGQ app origin/i);
  });

  it('requires a usable off-session confirmation shape', () => {
    const base = {
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'off_session_payment',
      amountCents: 25_000,
      applicationFeeAmountCents: 125,
      offSession: true,
    } as const;

    expect(() => buildDirectPaymentIntentCall(base)).toThrow(/confirmed/);
    expect(() => buildDirectPaymentIntentCall({ ...base, confirm: true })).toThrow(/paymentMethodId/);
  });

  it('does not expose legacy destination-charge or transfer-refund fields in its input types', () => {
    type CheckoutAcceptsTransferData = 'transfer_data' extends keyof DirectCheckoutSessionInput ? true : false;
    type RefundAcceptsReverseTransfer = 'reverse_transfer' extends keyof DirectRefundInput ? true : false;
    const checkoutAcceptsTransferData: CheckoutAcceptsTransferData = false;
    const refundAcceptsReverseTransfer: RefundAcceptsReverseTransfer = false;

    expect(checkoutAcceptsTransferData).toBe(false);
    expect(refundAcceptsReverseTransfer).toBe(false);
  });
});

describe('Stripe direct-charge wrappers', () => {
  it('scopes every create and retrieve call to the Merchant connected account', async () => {
    await createDirectCheckoutSession(checkoutInput);
    await retrieveDirectCheckoutSession({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      checkoutSessionId: 'cs_test_session123',
      params: { expand: ['payment_intent'] },
    });
    await expireDirectCheckoutSession({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'late-success:payment_01J_TEST:checkout:2',
      checkoutSessionId: 'cs_test_session123',
    });
    await createDirectPaymentIntent({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'payment_intent_123',
      amountCents: 25_000,
      applicationFeeAmountCents: 313,
    });
    await retrieveDirectPaymentIntent({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      paymentIntentId: 'pi_test_intent123',
      params: { expand: ['latest_charge'] },
    });
    await createDirectRefund({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'refund_123',
      paymentIntentId: 'pi_test_intent123',
      refundApplicationFee: false,
    });
    await createDirectApplicationFeeRefund({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      operationId: 'fee_refund_123',
      applicationFeeId: 'fee_test_application123',
      amountCents: 31,
    });
    await retrieveDirectRefund({
      merchantAccountId: MERCHANT_ACCOUNT_ID,
      refundId: 're_test_refund123',
      params: { expand: ['payment_intent'] },
    });

    expect(stripeMocks.checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'payment' }),
      expect.objectContaining({ stripeAccount: MERCHANT_ACCOUNT_ID, idempotencyKey: expect.any(String) }),
    );
    expect(stripeMocks.checkoutRetrieve).toHaveBeenCalledWith(
      'cs_test_session123',
      { expand: ['payment_intent'] },
      { stripeAccount: MERCHANT_ACCOUNT_ID },
    );
    expect(stripeMocks.checkoutExpire).toHaveBeenCalledWith(
      'cs_test_session123',
      {},
      expect.objectContaining({
        stripeAccount: MERCHANT_ACCOUNT_ID,
        idempotencyKey: expect.stringContaining('checkout_session.expire'),
      }),
    );
    expect(stripeMocks.paymentIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25_000 }),
      expect.objectContaining({ stripeAccount: MERCHANT_ACCOUNT_ID, idempotencyKey: expect.any(String) }),
    );
    expect(stripeMocks.paymentIntentRetrieve).toHaveBeenCalledWith(
      'pi_test_intent123',
      { expand: ['latest_charge'] },
      { stripeAccount: MERCHANT_ACCOUNT_ID },
    );
    expect(stripeMocks.refundCreate).toHaveBeenCalledWith(
      expect.not.objectContaining({ reverse_transfer: expect.anything() }),
      expect.objectContaining({ stripeAccount: MERCHANT_ACCOUNT_ID, idempotencyKey: expect.any(String) }),
    );
    expect(stripeMocks.refundRetrieve).toHaveBeenCalledWith(
      're_test_refund123',
      { expand: ['payment_intent'] },
      { stripeAccount: MERCHANT_ACCOUNT_ID },
    );
    expect(stripeMocks.applicationFeeRefundCreate).toHaveBeenCalledWith(
      'fee_test_application123',
      expect.objectContaining({ amount: 31 }),
      expect.not.objectContaining({ stripeAccount: expect.anything() }),
    );
  });
});
