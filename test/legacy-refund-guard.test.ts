import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  createRefund: vi.fn(),
  admin: null as unknown,
  event: null as unknown,
  sendPaymentSmsEvent: vi.fn(),
  createPaymentFeedEvent: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mocks.admin,
}));

vi.mock('@/lib/stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe')>();
  return { ...actual, getStripeClient: mocks.getStripeClient };
});

vi.mock('@/lib/sms', () => ({
  sendPaymentSmsEvent: mocks.sendPaymentSmsEvent,
}));

vi.mock('@/lib/job-feed', () => ({
  createPaymentFeedEvent: mocks.createPaymentFeedEvent,
  createDisputeFeedEvent: vi.fn(),
}));

import { POST as legacyStripeWebhook } from '@/app/api/stripe/webhook/route';
import {
  getPaymentForAdmin,
  refundBlockedReason,
  stripePaymentUrl,
  type AdminPaymentDetail,
} from '@/lib/admin-payments';
import {
  isLegacyDestinationPayment,
  isMissingPaymentChargeModelColumnError,
  refundPayment,
} from '@/lib/payments';

const legacyPayment = {
  id: 'pay_legacy_guard',
  account_id: 'acct_workspace',
  amount: 100,
  refunded_amount: 0,
  platform_fee: 3,
  status: 'paid',
  stripe_payment_intent: 'pi_legacy_guard',
  invoice: null,
};

function paymentClient(row: Record<string, unknown>) {
  const updates: Record<string, unknown>[] = [];
  const read = {
    eq: vi.fn(() => read),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };
  const update = {
    eq: vi.fn(() => update),
    is: vi.fn(() => update),
    select: vi.fn(() => update),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  const table = {
    select: vi.fn(() => read),
    update: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return update;
    }),
  };
  return {
    client: { from: vi.fn(() => table) } as unknown as SupabaseClient,
    updates,
  };
}

function adminDetail(overrides: Partial<AdminPaymentDetail> = {}): AdminPaymentDetail {
  return {
    id: 'pay_admin_guard',
    account_id: 'acct_workspace',
    job_id: null,
    invoice_id: null,
    kind: 'final',
    label: 'Final payment',
    amount: 100,
    status: 'paid',
    platform_fee: 3,
    fee_rate: 0.03,
    refunded_amount: 0,
    platform_fee_refunded: 0,
    refunded_at: null,
    stripe_payment_intent: 'pi_admin_guard',
    stripe_checkout_session: 'cs_admin_guard',
    stripe_dispute_id: null,
    disputed_at: null,
    dispute_reason: null,
    dispute_status: null,
    dispute_due_by: null,
    dunning_state: null,
    failure_message: null,
    failed_at: null,
    requested_at: '2026-08-16T00:00:00.000Z',
    paid_at: '2026-08-16T00:01:00.000Z',
    created_at: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

function detailClient(responses: Array<{ data: unknown; error: { code?: string } | null }>) {
  const selections: string[] = [];
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        selections.push(columns);
        const response = responses.shift() ?? { data: null, error: null };
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => response),
        };
        return query;
      }),
    })),
  } as unknown as SupabaseClient;
  return { admin, selections };
}

function webhookAdmin(chargeModel: unknown) {
  const update = vi.fn(() => {
    throw new Error('legacy charge.refunded must not update this payment');
  });
  const row = {
    id: 'pay_webhook_guard',
    invoice_id: null,
    status: 'paid',
    refunded_amount: 0,
    amount: 100,
    platform_fee: 3,
    charge_model: chargeModel,
  };
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        };
        return query;
      }),
      update,
    })),
  };
  return { admin, update };
}

type WebhookReadMode = 'destination' | 'missing-42703' | 'missing-PGRST204' | 'read-error';

function statefulWebhookAdmin(
  mode: WebhookReadMode,
  options: { initialRefunded?: number | null; staleReadRefunded?: number | null } = {},
) {
  const state = {
    refunded_amount: options.initialRefunded === undefined ? 0 : options.initialRefunded,
    platform_fee_refunded: 0,
    status: 'paid',
  };
  const selections: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const monotonicFilters: string[] = [];
  const chargeModelFilters: unknown[] = [];

  const row = (includeChargeModel: boolean) => ({
    id: 'pay_webhook_guard',
    invoice_id: null,
    status: 'paid',
    // A fixed old value can emulate two concurrent deliveries that both read
    // the same snapshot before either UPDATE reaches Postgres.
    refunded_amount: options.staleReadRefunded === undefined
      ? state.refunded_amount
      : options.staleReadRefunded,
    amount: 50,
    platform_fee: 3,
    ...(includeChargeModel ? { charge_model: 'destination' } : {}),
  });

  const admin = {
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        selections.push(columns);
        const includesModel = columns.includes('charge_model');
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (includesModel && mode === 'missing-42703') {
              return { data: null, error: { code: '42703' } };
            }
            if (includesModel && mode === 'missing-PGRST204') {
              return { data: null, error: { code: 'PGRST204' } };
            }
            if (includesModel && mode === 'read-error') {
              return { data: null, error: { code: '42501' } };
            }
            return { data: row(mode === 'destination'), error: null };
          }),
        };
        return query;
      }),
      update: vi.fn((values: Record<string, unknown>) => {
        updates.push(values);
        let monotonicFilter: string | null = null;
        let chargeModelFilter: unknown;
        const transition = {
          eq: vi.fn((column: string, value: unknown) => {
            if (column === 'charge_model') {
              chargeModelFilter = value;
              chargeModelFilters.push(value);
            }
            return transition;
          }),
          in: vi.fn(() => transition),
          or: vi.fn((filter: string) => {
            monotonicFilter = filter;
            monotonicFilters.push(filter);
            return transition;
          }),
          select: vi.fn(() => transition),
          maybeSingle: vi.fn(async () => {
            const incoming = Number(values.refunded_amount);
            const current = state.refunded_amount;
            const modelMatches = chargeModelFilter === undefined || chargeModelFilter === 'destination';
            const monotonic = monotonicFilter !== null
              && (current === null || Number(current) < incoming);
            if (!modelMatches || !monotonic) return { data: null, error: null };

            state.refunded_amount = incoming;
            state.platform_fee_refunded = Number(values.platform_fee_refunded);
            state.status = String(values.status);
            return { data: { id: 'pay_webhook_guard', invoice_id: null }, error: null };
          }),
        };
        return transition;
      }),
    })),
  };

  return { admin, state, selections, updates, monotonicFilters, chargeModelFilters };
}

function chargeRefundedEvent(amountRefundedCents: number) {
  return {
    type: 'charge.refunded',
    data: {
      object: {
        amount: 5000,
        amount_refunded: amountRefundedCents,
        metadata: { payment_id: 'pay_webhook_guard' },
      },
    },
  };
}

function webhookRequest(): Request {
  return new Request('https://letsgetquoted.com/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=guard' },
    body: '{}',
  });
}

describe('legacy refund charge-model boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRefund.mockResolvedValue({ id: 're_legacy_guard' });
    mocks.getStripeClient.mockReturnValue({
      refunds: { create: mocks.createRefund },
      webhooks: { constructEvent: () => mocks.event },
    });
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_legacy_guard';
  });

  it('allows only an absent pre-migration model or explicit destination', () => {
    expect(isLegacyDestinationPayment({})).toBe(true);
    expect(isLegacyDestinationPayment({ charge_model: 'destination' })).toBe(true);

    expect(isLegacyDestinationPayment({ charge_model: 'direct' })).toBe(false);
    expect(isLegacyDestinationPayment({ charge_model: null })).toBe(false);
    expect(isLegacyDestinationPayment({ charge_model: 'mystery' })).toBe(false);
    expect(isLegacyDestinationPayment({ charge_model: undefined })).toBe(false);
  });

  it('recognizes only the two missing-column errors used for deploy compatibility', () => {
    expect(isMissingPaymentChargeModelColumnError({ code: '42703' })).toBe(true);
    expect(isMissingPaymentChargeModelColumnError({ code: 'PGRST204' })).toBe(true);
    expect(isMissingPaymentChargeModelColumnError({ code: '42501' })).toBe(false);
    expect(isMissingPaymentChargeModelColumnError(null)).toBe(false);
  });

  it.each([
    ['direct', 'direct'],
    ['null', null],
    ['unknown', 'destination_charge_v2'],
  ])('rejects an explicit %s model before constructing a Stripe client', async (_label, chargeModel) => {
    const { client, updates } = paymentClient({ ...legacyPayment, charge_model: chargeModel });

    await expect(refundPayment(client, 'acct_workspace', 'pay_legacy_guard', 25))
      .rejects.toThrow('legacy destination-charge refund path');

    expect(mocks.getStripeClient).not.toHaveBeenCalled();
    expect(mocks.createRefund).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it.each([
    ['pre-migration', {}],
    ['destination', { charge_model: 'destination' }],
  ])('preserves the legacy Stripe refund request for a %s row', async (_label, model) => {
    const { client, updates } = paymentClient({ ...legacyPayment, ...model });

    await expect(refundPayment(client, 'acct_workspace', 'pay_legacy_guard', 25)).resolves.toEqual({
      amount: 25,
      isFull: false,
      refundedTotal: 25,
    });

    expect(mocks.createRefund).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_legacy_guard',
        amount: 2500,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: {
          payment_id: 'pay_legacy_guard',
          reason: 'Refunded by contractor',
        },
      },
      { idempotencyKey: 'refund_pay_legacy_guard_0_2500' },
    );
    expect(updates).toHaveLength(1);
  });

  it.each([
    ['direct', 'direct'],
    ['null', null],
    ['unknown', 'destination_charge_v2'],
  ])('does not let legacy charge.refunded mutate an explicit %s row', async (_label, chargeModel) => {
    const { admin, update } = webhookAdmin(chargeModel);
    mocks.admin = admin;
    mocks.event = {
      type: 'charge.refunded',
      data: {
        object: {
          amount: 10000,
          amount_refunded: 2500,
          metadata: { payment_id: 'pay_webhook_guard' },
        },
      },
    };
    const request = new Request('https://letsgetquoted.com/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=guard' },
      body: '{}',
    });

    const response = await legacyStripeWebhook(request);

    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
  });

  it('keeps explicit destination charge.refunded reconciliation on the legacy path', async () => {
    const db = statefulWebhookAdmin('destination');
    mocks.admin = db.admin;
    mocks.event = chargeRefundedEvent(2500);

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.state).toMatchObject({ refunded_amount: 25, status: 'paid' });
    expect(db.chargeModelFilters).toEqual(['destination']);
    expect(db.monotonicFilters).toEqual(['refunded_amount.is.null,refunded_amount.lt.25']);
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledTimes(1);
  });

  it.each(['missing-42703', 'missing-PGRST204'] as const)(
    'keeps a %s pre-migration charge.refunded row working without naming the missing column on UPDATE',
    async (mode) => {
      const db = statefulWebhookAdmin(mode, { initialRefunded: null });
      mocks.admin = db.admin;
      mocks.event = chargeRefundedEvent(2500);

      const response = await legacyStripeWebhook(webhookRequest());

      expect(response.status).toBe(200);
      expect(db.selections).toHaveLength(2);
      expect(db.selections[0]).toContain('charge_model');
      expect(db.selections[1]).not.toContain('charge_model');
      expect(db.chargeModelFilters).toEqual([]);
      expect(db.state).toMatchObject({ refunded_amount: 25, status: 'paid' });
    },
  );

  it('fails closed when the charge-model read fails for a reason other than a missing column', async () => {
    const db = statefulWebhookAdmin('read-error');
    mocks.admin = db.admin;
    mocks.event = chargeRefundedEvent(2500);

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.selections).toHaveLength(1);
    expect(db.updates).toEqual([]);
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['smaller then larger', [2000, 5000]],
    ['larger then smaller', [5000, 2000]],
  ] as const)('keeps cumulative refunds monotonic when stale deliveries write %s', async (_label, refunds) => {
    const db = statefulWebhookAdmin('destination', {
      initialRefunded: 0,
      staleReadRefunded: 0,
    });
    mocks.admin = db.admin;

    for (const refundCents of refunds) {
      mocks.event = chargeRefundedEvent(refundCents);
      const response = await legacyStripeWebhook(webhookRequest());
      expect(response.status).toBe(200);
    }

    expect(db.state).toMatchObject({
      refunded_amount: 50,
      platform_fee_refunded: 3,
      status: 'refunded',
    });
    expect(db.monotonicFilters).toEqual(refunds.map(
      (refundCents) => `refunded_amount.is.null,refunded_amount.lt.${refundCents / 100}`,
    ));
  });
});

describe('admin and contractor refund surfaces', () => {
  it.each([
    ['direct', 'direct'],
    ['null', null],
    ['unknown', 'destination_charge_v2'],
  ])('blocks admin refunds and the platform-account Stripe URL for %s', (_label, chargeModel) => {
    const payment = adminDetail({ charge_model: chargeModel });

    expect(refundBlockedReason(payment)).toBeTruthy();
    expect(stripePaymentUrl(payment)).toBeNull();
  });

  it('preserves admin refunds and Stripe URLs for pre-migration and destination rows', () => {
    const preMigration = adminDetail();
    const destination = adminDetail({ charge_model: 'destination' });

    expect(refundBlockedReason(preMigration)).toBeNull();
    expect(refundBlockedReason(destination)).toBeNull();
    expect(stripePaymentUrl(preMigration)).toBe('https://dashboard.stripe.com/payments/pi_admin_guard');
    expect(stripePaymentUrl(destination)).toBe('https://dashboard.stripe.com/payments/pi_admin_guard');
  });

  it.each(['42703', 'PGRST204'])('falls back to the pre-migration admin select on %s only', async (code) => {
    const legacy = adminDetail();
    const { admin, selections } = detailClient([
      { data: null, error: { code } },
      { data: legacy, error: null },
    ]);

    await expect(getPaymentForAdmin(admin, legacy.id)).resolves.toEqual(legacy);
    expect(selections).toHaveLength(2);
    expect(selections[0]).toContain('charge_model');
    expect(selections[1]).not.toContain('charge_model');
  });

  it('does not reinterpret an unrelated admin read failure as a legacy row', async () => {
    const { admin, selections } = detailClient([
      { data: null, error: { code: '42501' } },
    ]);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(getPaymentForAdmin(admin, 'pay_denied')).resolves.toBeNull();
    expect(selections).toHaveLength(1);

    consoleError.mockRestore();
  });

  it('wires the contractor button and webhook to the shared fail-closed predicate', () => {
    const dashboard = readFileSync(
      join(process.cwd(), 'src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx'),
      'utf8',
    );
    const webhook = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'stripe', 'webhook', 'route.ts'),
      'utf8',
    );

    expect(dashboard).toContain('Boolean(payment.stripe_payment_intent) && isLegacyDestinationPayment(payment)');
    expect(webhook).toContain('isLegacyDestinationPayment(payment)');
    expect(webhook).toContain("transition.eq('charge_model', 'destination')");
    expect(`${dashboard}\n${webhook}`).not.toContain('direct-refund-operation');
  });
});
