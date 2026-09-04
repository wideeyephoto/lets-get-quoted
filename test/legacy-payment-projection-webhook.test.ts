import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PLAN_FLAG = 'LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED';
const QUICK_STOP_FLAG = 'LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED';
const PAYMENT_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = 'cs_test_exact_session';
const PAYMENT_INTENT_ID = 'pi_exact_intent';

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  event: null as unknown,
  effects: [] as string[],
  constructEvent: vi.fn(),
  retrievePaymentIntent: vi.fn(),
  listCheckoutSessions: vi.fn(),
  createAdminClient: vi.fn(),
  coordinate: vi.fn(),
  handlePlanPaymentSettled: vi.fn(),
  handlePlanPaymentFailed: vi.fn(),
  confirmQuickStopPayment: vi.fn(),
  sendPaymentSmsEvent: vi.fn(),
  createPaymentFeedEvent: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return {
    ...actual,
    getStripeClient: () => ({
      webhooks: { constructEvent: mocks.constructEvent },
      paymentIntents: { retrieve: mocks.retrievePaymentIntent },
      checkout: { sessions: { list: mocks.listCheckoutSessions } },
    }),
  };
});

vi.mock('@/lib/billing/legacy-payment-projection-coordinator', () => ({
  LEGACY_PAYMENT_PLAN_PROJECTION_FLAG: 'LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED',
  LEGACY_QUICK_STOP_RECONCILIATION_FLAG: 'LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED',
  legacyPaymentPlanProjectionEnabled: () =>
    process.env.LGQ_LEGACY_PAYMENT_PLAN_PROJECTION_ENABLED === '1',
  legacyQuickStopReconciliationEnabled: () =>
    process.env.LGQ_LEGACY_QUICK_STOP_RECONCILIATION_ENABLED === '1',
  coordinateLegacyDestinationPaymentProjection: mocks.coordinate,
}));

vi.mock('@/lib/payment-plans', () => ({
  handlePlanPaymentSettled: mocks.handlePlanPaymentSettled,
  handlePlanPaymentFailed: mocks.handlePlanPaymentFailed,
}));

vi.mock('@/lib/quick-stop-payments', () => ({
  confirmQuickStopPayment: mocks.confirmQuickStopPayment,
}));

vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: mocks.sendPaymentSmsEvent,
}));

vi.mock('@/lib/job-feed', () => ({
  createPaymentFeedEvent: mocks.createPaymentFeedEvent,
  createDisputeFeedEvent: vi.fn(),
}));

vi.mock('@/lib/invoices', () => ({ markInvoicePaidForPayment: vi.fn() }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: mocks.logWebhookFailure }));
vi.mock('@/lib/card-on-file', () => ({ storeSavedCardFromSetup: vi.fn() }));
vi.mock('@/lib/dunning', () => ({ rescheduleDunningAfterCardUpdate: vi.fn() }));
vi.mock('@/lib/stripe-connect', () => ({ getRecipientTransferStatus: vi.fn() }));
vi.mock('@/lib/business-name', () => ({ loadBusinessName: vi.fn() }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
}));

import { POST as legacyStripeWebhook } from '@/app/api/stripe/webhook/route';

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  status: string;
  charge_model: unknown;
  stripe_checkout_session: string | null;
  stripe_payment_intent: string | null;
};

type RecordedOperation = {
  kind: 'read' | 'update';
  values?: Record<string, unknown>;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  or: string[];
};

function paymentRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: PAYMENT_ID,
    invoice_id: null,
    status: 'processing',
    charge_model: 'destination',
    stripe_checkout_session: SESSION_ID,
    stripe_payment_intent: null,
    ...overrides,
  };
}

function statefulPaymentAdmin(initial: PaymentRow) {
  const row = { ...initial };
  const operations: RecordedOperation[] = [];

  const matchesOr = (expression: string): boolean => expression
    .split(',')
    .some((clause) => {
      const [column, operator, ...rawValue] = clause.split('.');
      const value = rawValue.join('.');
      if (operator === 'is' && value === 'null') return row[column as keyof PaymentRow] == null;
      if (operator === 'eq') return String(row[column as keyof PaymentRow]) === value;
      return false;
    });

  const query = (
    kind: RecordedOperation['kind'],
    values?: Record<string, unknown>,
  ) => {
    const operation: RecordedOperation = {
      kind,
      values,
      eq: [],
      is: [],
      in: [],
      or: [],
    };
    operations.push(operation);

    const q = {
      eq: vi.fn((column: string, value: unknown) => {
        operation.eq.push([column, value]);
        return q;
      }),
      is: vi.fn((column: string, value: unknown) => {
        operation.is.push([column, value]);
        return q;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        operation.in.push([column, values]);
        return q;
      }),
      or: vi.fn((expression: string) => {
        operation.or.push(expression);
        return q;
      }),
      select: vi.fn(() => q),
      maybeSingle: vi.fn(async () => {
        const matches = operation.eq.every(([column, value]) => row[column as keyof PaymentRow] === value)
          && operation.is.every(([column, value]) => row[column as keyof PaymentRow] === value)
          && operation.in.every(([column, values]) => values.includes(row[column as keyof PaymentRow]))
          && operation.or.every(matchesOr);

        if (!matches) return { data: null, error: null };
        if (kind === 'update') {
          mocks.effects.push('payment_cas');
          Object.assign(row, values);
        }
        return { data: { ...row }, error: null };
      }),
    };
    return q;
  };

  const payments = {
    select: vi.fn(() => query('read')),
    update: vi.fn((values: Record<string, unknown>) => query('update', values)),
  };
  const admin = {
    from: vi.fn((table: string) => {
      if (table !== 'payments') throw new Error(`Unexpected table: ${table}`);
      return payments;
    }),
  } as unknown as SupabaseClient;

  return { admin, row, operations, payments };
}

function request(signature = 't=1,v1=valid'): Request {
  return new Request('https://letsgetquoted.com/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body: '{"signed":true}',
  });
}

function completedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_checkout_completed_exact',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: SESSION_ID,
        mode: 'payment',
        payment_status: 'paid',
        metadata: { payment_id: PAYMENT_ID },
        payment_intent: PAYMENT_INTENT_ID,
        customer: 'cus_exact_customer',
        ...overrides,
      },
    },
  };
}

function asyncSucceededEvent() {
  return {
    id: 'evt_checkout_async_succeeded_exact',
    type: 'checkout.session.async_payment_succeeded',
    data: {
      object: {
        id: SESSION_ID,
        metadata: { payment_id: PAYMENT_ID },
        payment_intent: PAYMENT_INTENT_ID,
        customer: 'cus_exact_customer',
      },
    },
  };
}

function asyncFailedEvent() {
  return {
    id: 'evt_checkout_async_failed_exact',
    type: 'checkout.session.async_payment_failed',
    data: {
      object: {
        id: SESSION_ID,
        metadata: { payment_id: PAYMENT_ID },
        payment_intent: PAYMENT_INTENT_ID,
      },
    },
  };
}

function expiredEvent() {
  return {
    id: 'evt_checkout_expired_exact',
    type: 'checkout.session.expired',
    data: {
      object: {
        id: SESSION_ID,
        metadata: { payment_id: PAYMENT_ID },
        payment_intent: null,
      },
    },
  };
}

function chargeFailedEvent() {
  return {
    id: 'evt_charge_failed_exact',
    type: 'charge.failed',
    data: {
      object: {
        id: 'ch_exact_failed',
        metadata: { payment_id: PAYMENT_ID },
        payment_intent: PAYMENT_INTENT_ID,
        failure_message: 'declined',
      },
    },
  };
}

function paymentIntentSucceededEvent(paymentMethod: unknown = 'pm_exact_card') {
  return {
    id: 'evt_payment_intent_succeeded_exact',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: PAYMENT_INTENT_ID,
        metadata: { payment_id: PAYMENT_ID },
        customer: 'cus_exact_customer',
        payment_method: paymentMethod,
      },
    },
  };
}

describe('legacy Stripe webhook projection cutover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[PLAN_FLAG];
    delete process.env[QUICK_STOP_FLAG];
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_exact_legacy_endpoint';
    mocks.effects.length = 0;
    mocks.constructEvent.mockImplementation(() => mocks.event);
    mocks.createAdminClient.mockImplementation(() => mocks.admin);
    mocks.listCheckoutSessions.mockResolvedValue({
      data: [{
        id: SESSION_ID,
        mode: 'payment',
        payment_intent: PAYMENT_INTENT_ID,
        metadata: { payment_id: PAYMENT_ID },
      }],
    });
    mocks.sendPaymentSmsEvent.mockImplementation(async () => {
      mocks.effects.push('sms');
    });
    mocks.createPaymentFeedEvent.mockImplementation(async () => {
      mocks.effects.push('feed');
    });
    mocks.handlePlanPaymentSettled.mockImplementation(async () => {
      mocks.effects.push('legacy_plan');
    });
    mocks.handlePlanPaymentFailed.mockImplementation(async () => {
      mocks.effects.push('legacy_plan');
    });
    mocks.confirmQuickStopPayment.mockImplementation(async () => {
      mocks.effects.push('legacy_quick_stop');
    });
    mocks.coordinate.mockImplementation(async (input) => {
      if (process.env[PLAN_FLAG] === '1') mocks.effects.push('projected_plan');
      else if (input.legacy.plan) await input.legacy.plan();

      if (input.legacy.quickStop) {
        if (process.env[QUICK_STOP_FLAG] === '1') mocks.effects.push('reconciled_quick_stop');
        else await input.legacy.quickStop();
      }
    });
  });

  it('does no database or coordinator work before exact signature verification', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('bad signature');
    });

    const response = await legacyStripeWebhook(request('invalid'));

    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.coordinate).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '0', 'true', ' 1', '1 '])(
    'preserves the exact disabled CAS and plan-then-Quick-Stop order for %s',
    async (configured) => {
      process.env[PLAN_FLAG] = configured;
      process.env[QUICK_STOP_FLAG] = configured;
      const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
      mocks.admin = db.admin;
      mocks.event = completedEvent();

      const response = await legacyStripeWebhook(request());

      expect(response.status).toBe(200);
      expect(db.row.status).toBe('paid');
      expect(mocks.effects).toEqual([
        'payment_cas',
        'sms',
        'feed',
        'legacy_plan',
        'legacy_quick_stop',
      ]);
      expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
      expect(mocks.retrievePaymentIntent).not.toHaveBeenCalled();
      expect(mocks.listCheckoutSessions).not.toHaveBeenCalled();

      const mutation = db.operations.find((operation) => operation.kind === 'update');
      expect(mutation?.or).toEqual([]);
      expect(mutation?.eq).not.toContainEqual(['stripe_checkout_session', SESSION_ID]);
      expect(mutation?.eq).not.toContainEqual(['stripe_payment_intent', PAYMENT_INTENT_ID]);
    },
  );

  it('cuts the plan and Quick Stop callbacks over independently without layering', async () => {
    const cases = [
      { plan: '1', quick: '0', effects: ['payment_cas', 'sms', 'feed', 'projected_plan', 'legacy_quick_stop'] },
      { plan: '0', quick: '1', effects: ['payment_cas', 'sms', 'feed', 'legacy_plan', 'reconciled_quick_stop'] },
      { plan: '1', quick: '1', effects: ['payment_cas', 'sms', 'feed', 'projected_plan', 'reconciled_quick_stop'] },
    ];

    for (const configured of cases) {
      vi.clearAllMocks();
      mocks.effects.length = 0;
      process.env[PLAN_FLAG] = configured.plan;
      process.env[QUICK_STOP_FLAG] = configured.quick;
      const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
      mocks.admin = db.admin;
      mocks.event = completedEvent();
      mocks.constructEvent.mockImplementation(() => mocks.event);
      mocks.createAdminClient.mockImplementation(() => mocks.admin);
      mocks.sendPaymentSmsEvent.mockImplementation(async () => { mocks.effects.push('sms'); });
      mocks.createPaymentFeedEvent.mockImplementation(async () => { mocks.effects.push('feed'); });
      mocks.handlePlanPaymentSettled.mockImplementation(async () => { mocks.effects.push('legacy_plan'); });
      mocks.confirmQuickStopPayment.mockImplementation(async () => { mocks.effects.push('legacy_quick_stop'); });
      mocks.coordinate.mockImplementation(async (input) => {
        if (process.env[PLAN_FLAG] === '1') mocks.effects.push('projected_plan');
        else if (input.legacy.plan) await input.legacy.plan();
        if (process.env[QUICK_STOP_FLAG] === '1') mocks.effects.push('reconciled_quick_stop');
        else if (input.legacy.quickStop) await input.legacy.quickStop();
      });

      expect((await legacyStripeWebhook(request())).status).toBe(200);
      expect(mocks.effects).toEqual(configured.effects);
    }
  });

  it.each(['direct', null, 'other'])(
    'keeps an enabled cutover outside the %s payment rail',
    async (chargeModel) => {
      process.env[PLAN_FLAG] = '1';
      process.env[QUICK_STOP_FLAG] = '1';
      const db = statefulPaymentAdmin(paymentRow({
        status: 'requested',
        charge_model: chargeModel,
      }));
      mocks.admin = db.admin;
      mocks.event = completedEvent({ payment_intent: null });

      expect((await legacyStripeWebhook(request())).status).toBe(200);
      expect(db.row.status).toBe('requested');
      expect(db.payments.update).not.toHaveBeenCalled();
      expect(mocks.coordinate).not.toHaveBeenCalled();
    },
  );

  it('does no reverse provider lookup for an enabled direct-rail charge failure', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({ charge_model: 'direct' }));
    mocks.admin = db.admin;
    mocks.event = chargeFailedEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.row.status).toBe('processing');
    expect(mocks.listCheckoutSessions).not.toHaveBeenCalled();
    expect(db.payments.update).not.toHaveBeenCalled();
    expect(mocks.coordinate).not.toHaveBeenCalled();
  });

  const projectedEvents = [
    {
      label: 'completed Checkout',
      event: completedEvent(),
      row: paymentRow({ status: 'requested' }),
      expected: {
        eventType: 'checkout.session.completed',
        eventObjectId: SESSION_ID,
        paymentIntentId: PAYMENT_INTENT_ID,
        outcome: 'settled',
      },
    },
    {
      label: 'async Checkout success',
      event: asyncSucceededEvent(),
      row: paymentRow(),
      expected: {
        eventType: 'checkout.session.async_payment_succeeded',
        eventObjectId: SESSION_ID,
        paymentIntentId: PAYMENT_INTENT_ID,
        outcome: 'settled',
      },
    },
    {
      label: 'async Checkout failure',
      event: asyncFailedEvent(),
      row: paymentRow(),
      expected: {
        eventType: 'checkout.session.async_payment_failed',
        eventObjectId: SESSION_ID,
        paymentIntentId: PAYMENT_INTENT_ID,
        outcome: 'failed',
      },
    },
    {
      label: 'expired Checkout',
      event: expiredEvent(),
      row: paymentRow(),
      expected: {
        eventType: 'checkout.session.expired',
        eventObjectId: SESSION_ID,
        paymentIntentId: null,
        outcome: 'failed',
      },
    },
    {
      label: 'failed charge',
      event: chargeFailedEvent(),
      row: paymentRow(),
      expected: {
        eventType: 'charge.failed',
        eventObjectId: 'ch_exact_failed',
        paymentIntentId: PAYMENT_INTENT_ID,
        outcome: 'failed',
      },
    },
    {
      label: 'succeeded PaymentIntent',
      event: paymentIntentSucceededEvent(),
      row: paymentRow(),
      expected: {
        eventType: 'payment_intent.succeeded',
        eventObjectId: PAYMENT_INTENT_ID,
        paymentIntentId: PAYMENT_INTENT_ID,
        outcome: 'settled',
      },
    },
  ] as const;

  it.each(projectedEvents)(
    'hands the exact signed $label binding over only after its primary CAS',
    async ({ event, row, expected }) => {
      process.env[PLAN_FLAG] = '1';
      process.env[QUICK_STOP_FLAG] = '1';
      const db = statefulPaymentAdmin(row);
      mocks.admin = db.admin;
      mocks.event = event;

      expect((await legacyStripeWebhook(request())).status).toBe(200);

      expect(mocks.coordinate).toHaveBeenCalledTimes(1);
      expect(mocks.coordinate).toHaveBeenCalledWith(expect.objectContaining({
        event: {
          eventId: event.id,
          paymentId: PAYMENT_ID,
          ...expected,
        },
      }));
      expect(mocks.effects[0]).toBe('payment_cas');
      expect(mocks.effects).toContain('projected_plan');
      expect(mocks.handlePlanPaymentSettled).not.toHaveBeenCalled();
      expect(mocks.handlePlanPaymentFailed).not.toHaveBeenCalled();
    },
  );

  it('binds a failed Checkout PI from NULL in a single transaction and retries the RPC on the exact replay', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow());
    mocks.admin = db.admin;
    mocks.event = asyncFailedEvent();
    mocks.coordinate
      .mockRejectedValueOnce(new Error('transactional projector unavailable'))
      .mockImplementationOnce(async () => {
        mocks.effects.push('projected_plan');
      });

    const first = await legacyStripeWebhook(request());

    expect(first.status).toBe(500);
    expect(db.row).toMatchObject({
      status: 'failed',
      stripe_checkout_session: SESSION_ID,
      stripe_payment_intent: PAYMENT_INTENT_ID,
    });
    const firstMutation = db.operations.find((operation) => operation.kind === 'update');
    expect(firstMutation?.values).toMatchObject({
      status: 'failed',
      stripe_payment_intent: PAYMENT_INTENT_ID,
    });
    expect(firstMutation?.eq).toContainEqual(['stripe_checkout_session', SESSION_ID]);
    expect(firstMutation?.or).toEqual([]);
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'checkout.session.async_payment_failed',
      referenceId: 'evt_checkout_async_failed_exact',
    }));

    const second = await legacyStripeWebhook(request());

    expect(second.status).toBe(200);
    expect(mocks.coordinate).toHaveBeenCalledTimes(2);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledTimes(1);
    expect(mocks.handlePlanPaymentFailed).not.toHaveBeenCalled();
  });

  it('rejects an async Checkout failure with no PI before its payment CAS', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({ stripe_payment_intent: 'pi_predecessor' }));
    mocks.admin = db.admin;
    const event = asyncFailedEvent();
    mocks.event = {
      ...event,
      data: { object: { ...event.data.object, payment_intent: null } },
    };

    expect((await legacyStripeWebhook(request())).status).toBe(500);
    expect(db.row).toMatchObject({
      status: 'processing',
      stripe_payment_intent: 'pi_predecessor',
    });
    expect(db.payments.update).not.toHaveBeenCalled();
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: 'legacy_payment_provider_binding_missing',
    }));
  });

  it('lets the exact current Checkout Session replace a predecessor PI on failure', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({ stripe_payment_intent: 'pi_conflicting' }));
    mocks.admin = db.admin;
    mocks.event = chargeFailedEvent();

    const response = await legacyStripeWebhook(request());

    expect(response.status).toBe(200);
    expect(db.row).toMatchObject({
      status: 'failed',
      stripe_payment_intent: PAYMENT_INTENT_ID,
    });
    expect(mocks.listCheckoutSessions).toHaveBeenCalledWith({
      payment_intent: PAYMENT_INTENT_ID,
      limit: 2,
    });
    expect(mocks.coordinate).toHaveBeenCalledTimes(1);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledTimes(1);
  });

  it('lets a successor Checkout settlement replace its predecessor PI', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({
      status: 'requested',
      stripe_payment_intent: 'pi_predecessor',
    }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.row).toMatchObject({
      status: 'paid',
      stripe_checkout_session: SESSION_ID,
      stripe_payment_intent: PAYMENT_INTENT_ID,
    });
    const mutation = db.operations.find((operation) => operation.kind === 'update');
    expect(mutation?.eq).toContainEqual(['stripe_checkout_session', SESSION_ID]);
    expect(mutation?.or).toEqual([]);
    expect(mocks.coordinate).toHaveBeenCalledTimes(1);
  });

  it('lets an exact successor expiration clear its predecessor PI', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({ stripe_payment_intent: 'pi_predecessor' }));
    mocks.admin = db.admin;
    mocks.event = expiredEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.row).toMatchObject({
      status: 'failed',
      stripe_checkout_session: SESSION_ID,
      stripe_payment_intent: null,
    });
    const mutation = db.operations.find((operation) => operation.kind === 'update');
    expect(mutation?.values).toMatchObject({ status: 'failed', stripe_payment_intent: null });
    expect(mutation?.eq).toContainEqual(['stripe_checkout_session', SESSION_ID]);
    expect(mutation?.or).toEqual([]);
    expect(mocks.coordinate).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a delayed predecessor charge failure without touching its successor', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({
      stripe_checkout_session: 'cs_test_successor',
      stripe_payment_intent: null,
    }));
    mocks.admin = db.admin;
    mocks.event = chargeFailedEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.row).toMatchObject({
      status: 'processing',
      stripe_checkout_session: 'cs_test_successor',
      stripe_payment_intent: null,
    });
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).not.toHaveBeenCalled();
  });

  it('binds a true off-session charge only to a row with no Checkout Session', async () => {
    process.env[PLAN_FLAG] = '1';
    mocks.listCheckoutSessions.mockResolvedValue({ data: [] });
    const db = statefulPaymentAdmin(paymentRow({
      stripe_checkout_session: null,
      stripe_payment_intent: null,
    }));
    mocks.admin = db.admin;
    mocks.event = chargeFailedEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.row).toMatchObject({ status: 'failed', stripe_payment_intent: PAYMENT_INTENT_ID });
    const mutation = db.operations.find((operation) => operation.kind === 'update');
    expect(mutation?.is).toContainEqual(['stripe_checkout_session', null]);
    expect(mutation?.or).toContain(
      `stripe_payment_intent.is.null,stripe_payment_intent.eq.${PAYMENT_INTENT_ID}`,
    );
    expect(mocks.coordinate).toHaveBeenCalledTimes(1);
  });

  it('binds and replays a true off-session PI settlement only on a no-Session row', async () => {
    process.env[PLAN_FLAG] = '1';
    mocks.listCheckoutSessions.mockResolvedValue({ data: [] });
    const db = statefulPaymentAdmin(paymentRow({
      stripe_checkout_session: null,
      stripe_payment_intent: null,
    }));
    mocks.admin = db.admin;
    mocks.event = paymentIntentSucceededEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.row).toMatchObject({ status: 'paid', stripe_payment_intent: PAYMENT_INTENT_ID });
    const mutation = db.operations.find((operation) => operation.kind === 'update');
    expect(mutation?.is).toContainEqual(['stripe_checkout_session', null]);
    expect(mutation?.or).toContain(
      `stripe_payment_intent.is.null,stripe_payment_intent.eq.${PAYMENT_INTENT_ID}`,
    );

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(mocks.coordinate).toHaveBeenCalledTimes(2);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledTimes(1);
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledTimes(1);
  });

  it('fails an off-session PI settlement closed on a conflicting persisted PI', async () => {
    process.env[PLAN_FLAG] = '1';
    mocks.listCheckoutSessions.mockResolvedValue({ data: [] });
    const db = statefulPaymentAdmin(paymentRow({
      stripe_checkout_session: null,
      stripe_payment_intent: 'pi_conflicting',
    }));
    mocks.admin = db.admin;
    mocks.event = paymentIntentSucceededEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(500);
    expect(db.row).toMatchObject({ status: 'processing', stripe_payment_intent: 'pi_conflicting' });
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: 'legacy_payment_provider_binding_contradiction',
    }));
  });

  it.each([
    ['ambiguous', [
      {
        id: SESSION_ID,
        mode: 'payment',
        payment_intent: PAYMENT_INTENT_ID,
        metadata: { payment_id: PAYMENT_ID },
      },
      {
        id: 'cs_test_duplicate',
        mode: 'payment',
        payment_intent: PAYMENT_INTENT_ID,
        metadata: { payment_id: PAYMENT_ID },
      },
    ]],
    ['malformed', [{
      id: SESSION_ID,
      mode: 'payment',
      payment_intent: PAYMENT_INTENT_ID,
      metadata: { payment_id: 'different-payment' },
    }]],
    ['missing for a Checkout-bound row', []],
  ] as const)(
    'fails a %s PaymentIntent-to-Session lookup closed',
    async (_label, sessions) => {
      process.env[PLAN_FLAG] = '1';
      mocks.listCheckoutSessions.mockResolvedValue({ data: [...sessions] });
      const db = statefulPaymentAdmin(paymentRow());
      mocks.admin = db.admin;
      mocks.event = chargeFailedEvent();

      expect((await legacyStripeWebhook(request())).status).toBe(500);
      expect(db.row).toMatchObject({ status: 'processing', stripe_payment_intent: null });
      expect(mocks.coordinate).not.toHaveBeenCalled();
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        errorMessage: 'legacy_payment_provider_binding_contradiction',
      }));
    },
  );

  it('returns a retryable 500 when the PaymentIntent-to-Session lookup fails', async () => {
    process.env[PLAN_FLAG] = '1';
    mocks.listCheckoutSessions.mockRejectedValue(new Error('provider lookup unavailable'));
    const db = statefulPaymentAdmin(paymentRow());
    mocks.admin = db.admin;
    mocks.event = chargeFailedEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(500);
    expect(db.row.status).toBe('processing');
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: 'legacy_payment_provider_binding_lookup_failed',
    }));
  });

  it('normalizes plain database errors without logging their raw message', async () => {
    process.env[PLAN_FLAG] = '1';
    const privateMarker = 'customer-private-marker';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();
    mocks.coordinate.mockRejectedValue({ code: '42501', message: privateMarker });

    try {
      expect((await legacyStripeWebhook(request())).status).toBe(500);
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        errorMessage: 'legacy_payment_database_error_42501',
      }));
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateMarker);
      expect(JSON.stringify(mocks.logWebhookFailure.mock.calls)).not.toContain(privateMarker);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('collapses arbitrary Error messages to a closed webhook failure code', async () => {
    process.env[PLAN_FLAG] = '1';
    const privateMarker = 'wrapped-private-database-message';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();
    mocks.coordinate.mockRejectedValue(new Error(privateMarker));

    try {
      expect((await legacyStripeWebhook(request())).status).toBe(500);
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        errorMessage: 'legacy_payment_webhook_handler_error',
      }));
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateMarker);
      expect(JSON.stringify(mocks.logWebhookFailure.mock.calls)).not.toContain(privateMarker);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('keeps a historical Session-less settlement operator-visible', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({
      stripe_checkout_session: 'cs_test_successor',
      stripe_payment_intent: null,
    }));
    mocks.admin = db.admin;
    mocks.event = paymentIntentSucceededEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(500);
    expect(db.row).toMatchObject({
      status: 'processing',
      stripe_checkout_session: 'cs_test_successor',
      stripe_payment_intent: null,
    });
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: 'legacy_payment_provider_binding_contradiction',
    }));
  });

  it('fails a historical Checkout Session closed at the primary enabled CAS', async () => {
    process.env[PLAN_FLAG] = '1';
    process.env[QUICK_STOP_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({
      status: 'requested',
      stripe_checkout_session: 'cs_test_current_session',
    }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();

    const response = await legacyStripeWebhook(request());

    expect(response.status).toBe(500);
    expect(db.row.status).toBe('requested');
    expect(db.row.stripe_payment_intent).toBeNull();
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      errorMessage: 'legacy_payment_provider_binding_contradiction',
    }));
  });

  it.each([
    ['paid settlement', 'paid', completedEvent()],
    ['failed failure', 'failed', chargeFailedEvent()],
  ] as const)(
    'returns an operator-visible 500 for a conflicting PI on a current $s row',
    async (_label, status, event) => {
      process.env[PLAN_FLAG] = '1';
      const db = statefulPaymentAdmin(paymentRow({
        status,
        stripe_payment_intent: 'pi_conflicting',
      }));
      mocks.admin = db.admin;
      mocks.event = event;

      expect((await legacyStripeWebhook(request())).status).toBe(500);
      expect(db.row.status).toBe(status);
      expect(db.row.stripe_payment_intent).toBe('pi_conflicting');
      expect(mocks.coordinate).not.toHaveBeenCalled();
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        errorMessage: 'legacy_payment_provider_binding_contradiction',
      }));
    },
  );

  it.each([
    ['refunded settlement', 'refunded', completedEvent()],
    ['paid failure', 'paid', chargeFailedEvent()],
    ['refunded failure', 'refunded', chargeFailedEvent()],
  ] as const)(
    'acknowledges a stale $s fact against a legitimate terminal row',
    async (_label, status, event) => {
      process.env[PLAN_FLAG] = '1';
      const db = statefulPaymentAdmin(paymentRow({
        status,
        stripe_payment_intent: 'pi_terminal_other',
      }));
      mocks.admin = db.admin;
      mocks.event = event;

      expect((await legacyStripeWebhook(request())).status).toBe(200);
      expect(db.row.status).toBe(status);
      expect(db.row.stripe_payment_intent).toBe('pi_terminal_other');
      expect(mocks.coordinate).not.toHaveBeenCalled();
      expect(mocks.logWebhookFailure).not.toHaveBeenCalled();
    },
  );

  it('repairs an already-paid exact Checkout replay without repeating payment effects', async () => {
    process.env[PLAN_FLAG] = '1';
    process.env[QUICK_STOP_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({
      status: 'paid',
      stripe_payment_intent: PAYMENT_INTENT_ID,
    }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();

    expect((await legacyStripeWebhook(request())).status).toBe(200);

    expect(mocks.coordinate).toHaveBeenCalledTimes(1);
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.handlePlanPaymentSettled).not.toHaveBeenCalled();
    expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();
    expect(mocks.effects).toEqual(['projected_plan', 'reconciled_quick_stop']);
  });

  it('preserves exact saved-card evidence behind the lazy enabled callback', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();
    mocks.retrievePaymentIntent.mockResolvedValue({
      id: PAYMENT_INTENT_ID,
      customer: 'cus_verified_customer',
      payment_method: {
        id: 'pm_verified_card',
        card: { brand: 'visa', last4: '4242' },
      },
    });
    let evidence: unknown;
    mocks.coordinate.mockImplementation(async (input) => {
      evidence = await input.savedCard();
      mocks.effects.push('projected_plan');
    });

    expect((await legacyStripeWebhook(request())).status).toBe(200);

    expect(mocks.retrievePaymentIntent).toHaveBeenCalledWith(PAYMENT_INTENT_ID, {
      expand: ['payment_method'],
    });
    expect(evidence).toEqual({
      stripeCustomerId: 'cus_verified_customer',
      stripePaymentMethodId: 'pm_verified_card',
      cardBrand: 'visa',
      cardLast4: '4242',
    });
  });

  it('keeps saved-card lookup failures best-effort and redacted', async () => {
    process.env[PLAN_FLAG] = '1';
    const privateMarker = 'provider-private-marker';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
    mocks.admin = db.admin;
    mocks.event = completedEvent();
    mocks.retrievePaymentIntent.mockRejectedValue(new Error(privateMarker));
    let evidence: unknown;
    mocks.coordinate.mockImplementation(async (input) => {
      evidence = await input.savedCard();
      mocks.effects.push('projected_plan');
    });

    try {
      expect((await legacyStripeWebhook(request())).status).toBe(200);
      expect(evidence).toEqual({ stripeCustomerId: 'cus_exact_customer' });
      expect(consoleError).toHaveBeenCalledWith('Legacy payment-plan saved-card lookup failed.');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(privateMarker);
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(PAYMENT_INTENT_ID);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('expands an unexpanded saved card from the signed PaymentIntent event', async () => {
    process.env[PLAN_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow({ status: 'requested' }));
    mocks.admin = db.admin;
    mocks.event = paymentIntentSucceededEvent('pm_signed_card');
    mocks.retrievePaymentIntent.mockResolvedValue({
      id: PAYMENT_INTENT_ID,
      customer: 'cus_verified_customer',
      payment_method: {
        id: 'pm_signed_card',
        card: { brand: 'mastercard', last4: '4444' },
      },
    });
    let evidence: unknown;
    mocks.coordinate.mockImplementation(async (input) => {
      evidence = await input.savedCard();
      mocks.effects.push('projected_plan');
    });

    expect((await legacyStripeWebhook(request())).status).toBe(200);

    expect(mocks.retrievePaymentIntent).toHaveBeenCalledWith(PAYMENT_INTENT_ID, {
      expand: ['payment_method'],
    });
    expect(evidence).toEqual({
      stripeCustomerId: 'cus_verified_customer',
      stripePaymentMethodId: 'pm_signed_card',
      cardBrand: 'mastercard',
      cardLast4: '4444',
    });
  });

  it('does not route the legacy PaymentIntent failure no-op through the coordinator', async () => {
    process.env[PLAN_FLAG] = '1';
    process.env[QUICK_STOP_FLAG] = '1';
    const db = statefulPaymentAdmin(paymentRow());
    mocks.admin = db.admin;
    mocks.event = {
      id: 'evt_payment_intent_failed_legacy_noop',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: PAYMENT_INTENT_ID,
          metadata: {
            payment_id: PAYMENT_ID,
            payment_plan_id: '20000000-0000-4000-8000-000000000002',
          },
          last_payment_error: null,
        },
      },
    };

    expect((await legacyStripeWebhook(request())).status).toBe(200);
    expect(db.payments.update).not.toHaveBeenCalled();
    expect(mocks.coordinate).not.toHaveBeenCalled();
  });
});
