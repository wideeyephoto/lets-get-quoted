import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  event: null as unknown,
  getStripeClient: vi.fn(),
  sendPaymentSmsEvent: vi.fn(),
  createPaymentFeedEvent: vi.fn(),
  createDisputeFeedEvent: vi.fn(),
  handlePlanPaymentSettled: vi.fn(),
  handlePlanPaymentFailed: vi.fn(),
  confirmQuickStopPayment: vi.fn(),
  markInvoicePaidForPayment: vi.fn(),
  logWebhookFailure: vi.fn(),
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
  createDisputeFeedEvent: mocks.createDisputeFeedEvent,
}));

vi.mock('@/lib/payment-plans', () => ({
  handlePlanPaymentSettled: mocks.handlePlanPaymentSettled,
  handlePlanPaymentFailed: mocks.handlePlanPaymentFailed,
}));

vi.mock('@/lib/quick-stop-payments', () => ({
  confirmQuickStopPayment: mocks.confirmQuickStopPayment,
}));

vi.mock('@/lib/invoices', () => ({
  markInvoicePaidForPayment: mocks.markInvoicePaidForPayment,
}));

vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: mocks.logWebhookFailure,
}));

vi.mock('@/lib/card-on-file', () => ({ storeSavedCardFromSetup: vi.fn() }));
vi.mock('@/lib/dunning', () => ({ rescheduleDunningAfterCardUpdate: vi.fn() }));
vi.mock('@/lib/stripe-connect', () => ({ getRecipientTransferStatus: vi.fn() }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn(),
  sendContractorAlertEmail: vi.fn(),
}));

import { POST as legacyStripeWebhook } from '@/app/api/stripe/webhook/route';
import {
  ACH_MIN_AMOUNT,
  cancelPaymentRequest,
  createCheckoutSessionForPayment,
  inspectLegacyDestinationPaymentRail,
  LEGACY_DESTINATION_PAYMENT_RAIL_ERROR,
  markPaymentFailed,
  markPaymentPaidManually,
} from '@/lib/payments';

type DbResponse = {
  data: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
};

function queuedReadClient(responses: DbResponse[]) {
  const selections: string[] = [];
  const table = {
    select: vi.fn((columns: string) => {
      selections.push(columns);
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => responses.shift() ?? { data: null, error: null }),
      };
      return query;
    }),
  };
  return {
    client: { from: vi.fn(() => table) } as unknown as SupabaseClient,
    selections,
  };
}

function guardOnlyClient(chargeModel: unknown) {
  const update = vi.fn(() => {
    throw new Error('a blocked rail must not create an UPDATE');
  });
  const remove = vi.fn(() => {
    throw new Error('a blocked rail must not create a DELETE');
  });
  const row = { id: 'pay_guard', status: 'requested', charge_model: chargeModel };
  const table = {
    select: vi.fn(() => {
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      };
      return query;
    }),
    update,
    delete: remove,
  };
  return {
    client: { from: vi.fn(() => table) } as unknown as SupabaseClient,
    update,
    remove,
  };
}

function mutationClient(input: {
  preMigration?: boolean;
  updateResult: DbResponse;
  deleteResult?: DbResponse;
}) {
  const filters: Array<[string, unknown]> = [];
  const deleteFilters: Array<[string, unknown]> = [];
  const update = vi.fn(() => {
    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      in: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => input.updateResult),
    };
    return query;
  });
  const remove = vi.fn(() => {
    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        deleteFilters.push([column, value]);
        return query;
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => input.deleteResult ?? { data: { id: 'pay_guard' }, error: null }),
    };
    return query;
  });
  const table = {
    select: vi.fn((columns: string) => {
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => (
          input.preMigration && columns.includes('charge_model')
            ? { data: null, error: { code: '42703', message: 'charge_model does not exist' } }
            : {
                data: {
                  id: 'pay_guard',
                  status: 'processing',
                  ...(input.preMigration ? {} : { charge_model: 'destination' }),
                },
                error: null,
              }
        )),
      };
      return query;
    }),
    update,
    delete: remove,
  };
  return {
    client: { from: vi.fn(() => table) } as unknown as SupabaseClient,
    update,
    remove,
    filters,
    deleteFilters,
  };
}

function checkoutRaceAdmin(
  existingSessionId: string | null = null,
  finalChargeModel: 'destination' | 'direct' = 'direct',
  paymentPlanId: string | null = null,
  // Default 100 keeps every existing case card-only and their fee maths intact.
  // The ACH cases below raise it past the threshold.
  amount = 100,
) {
  let railReads = 0;
  const update = vi.fn(() => {
    if (finalChargeModel === 'direct') {
      throw new Error('a row that became direct must not persist legacy Checkout state');
    }
    const q = {
      eq: vi.fn(() => q),
      in: vi.fn(() => q),
      select: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: { id: 'pay_guard' }, error: null })),
    };
    return q;
  });
  const publicPayment = {
    id: 'pay_guard',
    account_id: 'acct_guard',
    job_id: 'job_guard',
    payment_plan_id: paymentPlanId,
    invoice_id: null,
    kind: 'final',
    label: 'Final payment',
    amount,
    status: 'requested',
    platform_fee: null,
    fee_rate: null,
    stripe_checkout_session: existingSessionId,
    stripe_payment_intent: null,
    homeowner_phone: null,
    sms_consent: false,
    sms_consent_at: null,
    requested_at: '2026-08-16T00:00:00.000Z',
    paid_at: null,
    refunded_amount: 0,
    disputed_at: null,
    dispute_reason: null,
    dispute_status: null,
    charge_model: 'destination',
    job: { client_name: 'Homeowner', ref: 'J-1' },
    account: {
      business_name: 'Guard Contractor',
      stripe_connect_id: 'acct_stripe_guard',
      connect_onboarded: true,
      payouts_restricted_at: null,
    },
  };

  const query = (response: DbResponse) => {
    const q = {
      eq: vi.fn(() => q),
      is: vi.fn(() => q),
      not: vi.fn(() => q),
      gte: vi.fn(() => q),
      // Real PostgREST returns a thenable builder from .range(), and
      // getTrailingVolume pages with it now -- a read without one is silently
      // capped at 1,000 rows.
      range: vi.fn(() => q),
      maybeSingle: vi.fn(async () => response),
      then: (resolve: (value: DbResponse) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject),
    };
    return q;
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'payments') {
        return {
          select: vi.fn((columns: string) => {
            if (columns === 'id, status, charge_model') {
              railReads += 1;
              return query({
                data: {
                  id: 'pay_guard',
                  status: 'requested',
                  charge_model: railReads === 1 ? 'destination' : finalChargeModel,
                },
                error: null,
              });
            }
            if (columns.includes('job:jobs')) return query({ data: publicPayment, error: null });
            if (columns.startsWith('amount, imported')) return query({ data: null, error: null });
            return query({ data: null, error: null });
          }),
          update,
        };
      }
      if (table === 'sites') return { select: vi.fn(() => query({ data: { company_name: 'Guard Contractor' }, error: null })) };
      if (table === 'extra_stop_requests') return { select: vi.fn(() => query({ data: null, error: null })) };
      // The fee rate follows the plan now, not trailing volume. Flex is 125 bps,
      // which is the same 1.25% the old bracket table charged at tier 1 -- so the
      // expected application_fee_amount in these tests is unchanged, and THIS row
      // is what now produces it. A green 125 is not evidence the rail is untouched.
      if (table === 'workspace_entitlements') {
        return { select: vi.fn(() => query({ data: { plan_code: 'flex', platform_fee_bps: 125 }, error: null })) };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { admin, update };
}

function webhookAdmin(
  row: Record<string, unknown>,
  allowUpdates = false,
  transitionData: Record<string, unknown> | null = { id: row.id as string, invoice_id: null },
) {
  const filters: Array<[string, unknown]> = [];
  const update = vi.fn(() => {
    if (!allowUpdates) throw new Error('a direct/malformed webhook row must not be updated');
    const query = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      in: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: transitionData, error: null })),
    };
    return query;
  });
  const table = {
    select: vi.fn(() => {
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      };
      return query;
    }),
    update,
  };
  return { admin: { from: vi.fn(() => table) }, update, filters };
}

function queuedWebhookMutationAdmin(input: {
  reads: DbResponse[];
  updates: DbResponse[];
}) {
  const reads = [...input.reads];
  const updates = [...input.updates];
  const update = vi.fn(() => chained(updates));

  function chained(queue: DbResponse[]) {
    const query = {
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      limit: vi.fn(() => query),
      or: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => queue.shift() ?? { data: null, error: null }),
    };
    return query;
  }

  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'payments') {
        return {
          select: vi.fn(() => chained(reads)),
          update,
        };
      }

      return {
        select: vi.fn(() => chained([{ data: null, error: null }])),
      };
    }),
  };

  return { admin, update };
}

const transientDbError = { code: '08006', message: 'temporary database failure' };

function destinationRail(status: string): DbResponse {
  return {
    data: { id: 'pay_guard', status, charge_model: 'destination' },
    error: null,
  };
}

function webhookRequest(): Request {
  return new Request('https://letsgetquoted.com/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=rail' },
    body: '{}',
  });
}

describe('schema-compatible legacy payment rail inspection', () => {
  it.each([
    ['direct', 'direct'],
    ['null', null],
    ['unknown', 'other'],
    ['present undefined', undefined],
  ])('blocks an explicit %s model', async (_label, chargeModel) => {
    const db = queuedReadClient([{ data: { id: 'pay_guard', status: 'requested', charge_model: chargeModel }, error: null }]);
    await expect(inspectLegacyDestinationPaymentRail(db.client, 'pay_guard', 'acct_guard'))
      .resolves.toEqual({ kind: 'blocked' });
    expect(db.selections).toEqual(['id, status, charge_model']);
  });

  it('allows explicit destination and reports that atomic writes can name the column', async () => {
    const db = queuedReadClient([{ data: { id: 'pay_guard', status: 'requested', charge_model: 'destination' }, error: null }]);
    await expect(inspectLegacyDestinationPaymentRail(db.client, 'pay_guard'))
      .resolves.toEqual({ kind: 'allowed', chargeModelColumnPresent: true });
  });

  it.each(['42703', 'PGRST204'])('falls back only after a %s charge_model-only probe also proves a pre-column schema', async (code) => {
    const missing = { data: null, error: { code, message: 'charge_model does not exist' } };
    const db = queuedReadClient([
      missing,
      missing,
      { data: { id: 'pay_guard', status: 'requested' }, error: null },
    ]);

    await expect(inspectLegacyDestinationPaymentRail(db.client, 'pay_guard'))
      .resolves.toEqual({ kind: 'allowed', chargeModelColumnPresent: false });
    expect(db.selections).toEqual(['id, status, charge_model', 'charge_model', 'id, status']);
  });

  it('merges a successful probe into a stale successful full row instead of treating absence as legacy', async () => {
    const db = queuedReadClient([
      { data: { id: 'pay_guard', status: 'requested' }, error: null },
      { data: { charge_model: 'direct' }, error: null },
    ]);
    await expect(inspectLegacyDestinationPaymentRail(db.client, 'pay_guard'))
      .resolves.toEqual({ kind: 'blocked' });
    expect(db.selections).toHaveLength(2);
  });

  it('does not issue a legacy query when the full query failed but the charge_model probe succeeds', async () => {
    const fullError = { code: '42703', message: 'some other selected column is missing' };
    const db = queuedReadClient([
      { data: null, error: fullError },
      { data: { charge_model: 'direct' }, error: null },
    ]);
    await expect(inspectLegacyDestinationPaymentRail(db.client, 'pay_guard')).rejects.toEqual(fullError);
    expect(db.selections).toEqual(['id, status, charge_model', 'charge_model']);
  });

  it('propagates an unrelated full-read error without probing or falling back', async () => {
    const denied = { code: '42501', message: 'permission denied' };
    const db = queuedReadClient([{ data: null, error: denied }]);
    await expect(inspectLegacyDestinationPaymentRail(db.client, 'pay_guard')).rejects.toEqual(denied);
    expect(db.selections).toEqual(['id, status, charge_model']);
  });
});

describe('legacy Checkout and contractor mutation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStripeClient.mockReturnValue({
      webhooks: { constructEvent: () => mocks.event },
    });
  });

  it.each([
    ['direct', 'direct'],
    ['null', null],
    ['unknown', 'other'],
  ])('rejects %s before Stripe, status UPDATE, or DELETE', async (_label, chargeModel) => {
    const checkoutDb = guardOnlyClient(chargeModel);
    mocks.admin = checkoutDb.client;
    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .rejects.toThrow(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
    expect(mocks.getStripeClient).not.toHaveBeenCalled();

    const failDb = guardOnlyClient(chargeModel);
    await expect(markPaymentFailed(failDb.client, 'acct_guard', 'pay_guard'))
      .rejects.toThrow(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
    expect(failDb.update).not.toHaveBeenCalled();

    const manualDb = guardOnlyClient(chargeModel);
    await expect(markPaymentPaidManually(manualDb.client, 'acct_guard', 'pay_guard'))
      .rejects.toThrow(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
    expect(manualDb.update).not.toHaveBeenCalled();

    const cancelDb = guardOnlyClient(chargeModel);
    await expect(cancelPaymentRequest(cancelDb.client, 'acct_guard', 'pay_guard'))
      .rejects.toThrow(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);
    expect(cancelDb.update).not.toHaveBeenCalled();
    expect(cancelDb.remove).not.toHaveBeenCalled();
  });

  it('expires a newly-created legacy Session and withholds its URL when the row becomes direct in flight', async () => {
    const db = checkoutRaceAdmin();
    const createSession = vi.fn(async () => ({ id: 'cs_undisclosed', url: 'https://checkout.stripe.test/undisclosed' }));
    const expireSession = vi.fn(async () => ({ id: 'cs_undisclosed', status: 'expired' }));
    mocks.admin = db.admin;
    mocks.getStripeClient.mockReturnValue({
      checkout: { sessions: { create: createSession, expire: expireSession, retrieve: vi.fn() } },
    });

    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .rejects.toThrow(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(expireSession).toHaveBeenCalledWith('cs_undisclosed');
    expect(db.update).not.toHaveBeenCalled();
  });

  it.each([
    ['one-off', null, { payment_id: 'pay_guard' }],
    ['plan-linked', 'plan_guard', { payment_id: 'pay_guard', payment_plan_id: 'plan_guard' }],
  ] as const)(
    'propagates exact %s payment identity to the PaymentIntent for Charge webhook reconciliation',
    async (_label, paymentPlanId, expectedMetadata) => {
      const db = checkoutRaceAdmin(null, 'destination', paymentPlanId);
      const createSession = vi.fn(async () => ({
        id: 'cs_refund_metadata',
        url: 'https://checkout.stripe.test/refund-metadata',
      }));
      mocks.admin = db.admin;
      mocks.getStripeClient.mockReturnValue({
        checkout: { sessions: { create: createSession, expire: vi.fn(), retrieve: vi.fn() } },
      });

      await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
        .resolves.toBe('https://checkout.stripe.test/refund-metadata');

      expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expectedMetadata,
        payment_intent_data: expect.objectContaining({
          application_fee_amount: 125,
          transfer_data: { destination: 'acct_stripe_guard' },
          metadata: expectedMetadata,
        }),
      }));
    },
  );

  it('does not return an existing open legacy Session after the row re-proves as direct', async () => {
    const db = checkoutRaceAdmin('cs_existing');
    const retrieveSession = vi.fn(async () => ({
      id: 'cs_existing',
      status: 'open',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe.test/existing',
    }));
    mocks.admin = db.admin;
    mocks.getStripeClient.mockReturnValue({
      checkout: { sessions: { create: vi.fn(), expire: vi.fn(), retrieve: retrieveSession } },
    });

    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .rejects.toThrow(LEGACY_DESTINATION_PAYMENT_RAIL_ERROR);

    expect(retrieveSession).toHaveBeenCalledWith('cs_existing');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('adds a destination CAS to a current-schema status transition', async () => {
    const db = mutationClient({ updateResult: { data: { id: 'pay_guard' }, error: null } });
    await expect(markPaymentFailed(db.client, 'acct_guard', 'pay_guard')).resolves.toBeUndefined();
    expect(db.filters).toContainEqual(['charge_model', 'destination']);
  });

  it('preserves a proven pre-column status transition without naming charge_model', async () => {
    const db = mutationClient({
      preMigration: true,
      updateResult: { data: { id: 'pay_guard' }, error: null },
    });
    await expect(markPaymentFailed(db.client, 'acct_guard', 'pay_guard')).resolves.toBeUndefined();
    expect(db.filters.some(([column]) => column === 'charge_model')).toBe(false);
  });

  it('does not turn an unrelated cancel UPDATE error into a DELETE', async () => {
    const denied = { code: '42501', message: 'permission denied' };
    const db = mutationClient({ updateResult: { data: null, error: denied } });
    await expect(cancelPaymentRequest(db.client, 'acct_guard', 'pay_guard')).rejects.toEqual(denied);
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('keeps the exact pre-canceled-enum DELETE compatibility path destination-scoped', async () => {
    const db = mutationClient({
      updateResult: {
        data: null,
        error: { code: '22P02', message: 'invalid input value for enum payment_status: "canceled"' },
      },
      deleteResult: { data: { id: 'pay_guard' }, error: null },
    });
    await expect(cancelPaymentRequest(db.client, 'acct_guard', 'pay_guard')).resolves.toBeUndefined();
    expect(db.remove).toHaveBeenCalledTimes(1);
    expect(db.deleteFilters).toContainEqual(['charge_model', 'destination']);
  });
});

describe('legacy platform webhook rail boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_rail';
    mocks.getStripeClient.mockReturnValue({
      webhooks: { constructEvent: () => mocks.event },
    });
  });

  const directEvents = [
    ['checkout completed', { type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } } }, 'requested'],
    ['async checkout succeeded', { type: 'checkout.session.async_payment_succeeded', data: { object: { metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } } }, 'processing'],
    ['async checkout failed', { type: 'checkout.session.async_payment_failed', data: { object: { metadata: { payment_id: 'pay_guard' } } } }, 'processing'],
    ['checkout expired', { type: 'checkout.session.expired', data: { object: { id: 'cs_guard', metadata: { payment_id: 'pay_guard' } } } }, 'processing'],
    ['charge failed', { type: 'charge.failed', data: { object: { metadata: { payment_id: 'pay_guard' }, failure_message: 'declined' } } }, 'processing'],
    ['payment intent failed', { type: 'payment_intent.payment_failed', data: { object: { metadata: { payment_id: 'pay_guard' }, last_payment_error: null } } }, 'processing'],
    ['payment intent succeeded', { type: 'payment_intent.succeeded', data: { object: { id: 'pi_guard', metadata: { payment_id: 'pay_guard' } } } }, 'processing'],
    ['dispute created', { type: 'charge.dispute.created', data: { object: { id: 'dp_guard', payment_intent: 'pi_guard', amount: 1000, reason: 'fraudulent', status: 'needs_response', evidence_details: {} } } }, 'paid'],
    ['dispute won', { type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_guard', status: 'won' } } }, 'disputed'],
    ['dispute lost', { type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_guard', status: 'lost' } } }, 'disputed'],
  ] as const;

  it.each(directEvents)('does not let %s mutate a direct row', async (_label, event, status) => {
    const db = webhookAdmin({
      id: 'pay_guard',
      account_id: 'acct_guard',
      job_id: 'job_guard',
      invoice_id: null,
      status,
      charge_model: 'direct',
    });
    mocks.admin = db.admin;
    mocks.event = event;

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.createDisputeFeedEvent).not.toHaveBeenCalled();
    expect(mocks.handlePlanPaymentSettled).not.toHaveBeenCalled();
    expect(mocks.handlePlanPaymentFailed).not.toHaveBeenCalled();
    expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();
  });

  it('preserves destination checkout settlement with a destination CAS and transitioned-only effects', async () => {
    const db = webhookAdmin({
      id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', status: 'requested', charge_model: 'destination',
    }, true);
    mocks.admin = db.admin;
    mocks.event = {
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
    };

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.filters).toContainEqual(['charge_model', 'destination']);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('pay_guard', 'payment_paid');
    expect(mocks.handlePlanPaymentSettled).toHaveBeenCalledWith(db.admin, 'pay_guard');
    expect(mocks.confirmQuickStopPayment).toHaveBeenCalledWith(db.admin, 'pay_guard');
  });

  it('repairs Quick Stop on an already-paid destination webhook replay without repeating payment effects', async () => {
    const db = webhookAdmin({
      id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', status: 'paid', charge_model: 'destination',
    }, true, null);
    mocks.admin = db.admin;
    mocks.event = {
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
    };

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.filters).toContainEqual(['charge_model', 'destination']);
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.handlePlanPaymentSettled).not.toHaveBeenCalled();
    expect(mocks.confirmQuickStopPayment).toHaveBeenCalledWith(db.admin, 'pay_guard');
  });

  it('preserves destination failure with a destination CAS and transitioned-only effects', async () => {
    const db = webhookAdmin({
      id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', status: 'processing', charge_model: 'destination',
    }, true);
    mocks.admin = db.admin;
    mocks.event = {
      type: 'checkout.session.async_payment_failed',
      data: { object: { metadata: { payment_id: 'pay_guard' } } },
    };

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.filters).toContainEqual(['charge_model', 'destination']);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('pay_guard', 'payment_failed');
    expect(mocks.handlePlanPaymentFailed).toHaveBeenCalledWith(db.admin, 'pay_guard');
  });

  const retryableTransitionCases = [
    {
      label: 'checkout completed',
      status: 'requested',
      event: {
        id: 'evt_checkout_completed_retry',
        type: 'checkout.session.completed',
        data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
      },
      transitioned: { id: 'pay_guard', invoice_id: null },
    },
    {
      label: 'async checkout succeeded',
      status: 'processing',
      event: {
        id: 'evt_checkout_async_succeeded_retry',
        type: 'checkout.session.async_payment_succeeded',
        data: { object: { metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
      },
      transitioned: { id: 'pay_guard', invoice_id: null },
    },
    {
      label: 'payment intent succeeded',
      status: 'processing',
      event: {
        id: 'evt_payment_intent_succeeded_retry',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_guard', metadata: { payment_id: 'pay_guard' } } },
      },
      transitioned: { id: 'pay_guard', invoice_id: null },
    },
    {
      label: 'async checkout failed',
      status: 'processing',
      event: {
        id: 'evt_checkout_async_failed_retry',
        type: 'checkout.session.async_payment_failed',
        data: { object: { metadata: { payment_id: 'pay_guard' } } },
      },
      transitioned: { id: 'pay_guard' },
    },
    {
      label: 'checkout expired',
      status: 'processing',
      event: {
        id: 'evt_checkout_expired_retry',
        type: 'checkout.session.expired',
        data: { object: { id: 'cs_guard', metadata: { payment_id: 'pay_guard' } } },
      },
      transitioned: { id: 'pay_guard' },
    },
    {
      label: 'charge failed',
      status: 'processing',
      event: {
        id: 'evt_charge_failed_retry',
        type: 'charge.failed',
        data: { object: { metadata: { payment_id: 'pay_guard' }, failure_message: 'declined' } },
      },
      transitioned: { id: 'pay_guard' },
    },
    {
      label: 'payment intent failed',
      status: 'processing',
      event: {
        id: 'evt_payment_intent_failed_retry',
        type: 'payment_intent.payment_failed',
        data: { object: { metadata: { payment_id: 'pay_guard' }, last_payment_error: null } },
      },
      transitioned: { id: 'pay_guard' },
    },
  ] as const;

  it.each(retryableTransitionCases)(
    'returns 500 for a $label payment transition error and succeeds on Stripe retry',
    async ({ event, status, transitioned }) => {
      const db = queuedWebhookMutationAdmin({
        reads: [destinationRail(status), destinationRail(status)],
        updates: [
          { data: null, error: transientDbError },
          { data: transitioned, error: null },
        ],
      });
      mocks.admin = db.admin;
      mocks.event = event;

      const failed = await legacyStripeWebhook(webhookRequest());

      expect(failed.status).toBe(500);
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        source: 'stripe',
        eventType: event.type,
        referenceId: event.id,
      }));
      expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
      expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
      expect(mocks.handlePlanPaymentSettled).not.toHaveBeenCalled();
      expect(mocks.handlePlanPaymentFailed).not.toHaveBeenCalled();
      expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();

      const retried = await legacyStripeWebhook(webhookRequest());

      expect(retried.status).toBe(200);
      expect(db.update).toHaveBeenCalledTimes(2);
    },
  );

  it('returns 500 when the already-paid verification read fails and repairs Quick Stop on retry', async () => {
    const db = queuedWebhookMutationAdmin({
      reads: [
        destinationRail('paid'),
        { data: null, error: transientDbError },
        destinationRail('paid'),
        { data: { id: 'pay_guard' }, error: null },
      ],
      updates: [
        { data: null, error: null },
        { data: null, error: null },
      ],
    });
    mocks.admin = db.admin;
    mocks.event = {
      id: 'evt_paid_replay_read_retry',
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
    };

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);
    expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'stripe',
      eventType: 'checkout.session.completed',
      referenceId: 'evt_paid_replay_read_retry',
    }));

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(mocks.confirmQuickStopPayment).toHaveBeenCalledWith(db.admin, 'pay_guard');
  });

  const disputeCases = [
    {
      label: 'created',
      event: {
        id: 'evt_dispute_created_retry',
        type: 'charge.dispute.created',
        data: { object: { id: 'dp_guard', payment_intent: 'pi_guard', amount: 1000, reason: 'fraudulent', status: 'needs_response', evidence_details: {} } },
      },
      payment: { id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', status: 'paid' },
    },
    {
      label: 'won',
      event: {
        id: 'evt_dispute_won_retry',
        type: 'charge.dispute.closed',
        data: { object: { payment_intent: 'pi_guard', status: 'won' } },
      },
      payment: { id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', invoice_id: null, status: 'disputed' },
    },
    {
      label: 'lost',
      event: {
        id: 'evt_dispute_lost_retry',
        type: 'charge.dispute.closed',
        data: { object: { payment_intent: 'pi_guard', status: 'lost' } },
      },
      payment: { id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', invoice_id: null, status: 'disputed' },
    },
  ] as const;

  it.each(disputeCases)(
    'returns 500 for a dispute-$label payment lookup error and succeeds on retry',
    async ({ event, payment }) => {
      const db = queuedWebhookMutationAdmin({
        reads: [
          { data: null, error: transientDbError },
          { data: payment, error: null },
          destinationRail(payment.status),
        ],
        updates: [{ data: { id: 'pay_guard' }, error: null }],
      });
      mocks.admin = db.admin;
      mocks.event = event;

      expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);
      expect(db.update).not.toHaveBeenCalled();
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        source: 'stripe',
        eventType: event.type,
        referenceId: event.id,
      }));

      expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
      expect(db.update).toHaveBeenCalledTimes(1);
    },
  );

  it.each(disputeCases)(
    'returns 500 for a dispute-$label payment CAS error and succeeds on retry',
    async ({ event, payment }) => {
      const db = queuedWebhookMutationAdmin({
        reads: [
          { data: payment, error: null },
          destinationRail(payment.status),
          { data: payment, error: null },
          destinationRail(payment.status),
        ],
        updates: [
          { data: null, error: transientDbError },
          { data: { id: 'pay_guard' }, error: null },
        ],
      });
      mocks.admin = db.admin;
      mocks.event = event;

      expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);
      expect(mocks.createDisputeFeedEvent).not.toHaveBeenCalled();
      expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
        source: 'stripe',
        eventType: event.type,
        referenceId: event.id,
      }));

      expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
      expect(db.update).toHaveBeenCalledTimes(2);
    },
  );

  it('keeps no-metadata and terminal destination events as acknowledged no-ops', async () => {
    mocks.admin = {
      from: vi.fn(() => {
        throw new Error('an event without LGQ metadata must not query the database');
      }),
    };
    mocks.event = {
      id: 'evt_no_metadata',
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: {}, payment_intent: 'pi_guard' } },
    };
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);

    const terminal = queuedWebhookMutationAdmin({
      reads: [destinationRail('refunded'), { data: null, error: null }],
      updates: [{ data: null, error: null }],
    });
    mocks.admin = terminal.admin;
    mocks.event = {
      id: 'evt_terminal_payment',
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
    };

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();
  });
});

describe('legacy destination settlement handover to the generation ledger', () => {
  const FLAG = 'LGQ_LEGACY_DESTINATION_CHECKOUT_PROJECTION_ENABLED';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_rail';
    process.env[FLAG] = '1';
    mocks.getStripeClient.mockReturnValue({
      webhooks: { constructEvent: () => mocks.event },
    });
  });

  afterEach(() => {
    delete process.env[FLAG];
  });

  /**
   * The route handles seven of the eight event types the classifier claims;
   * charge.succeeded is not one of its branches. Each of these settles or fails
   * a payment today, so each must stop doing so once the ledger owns the rail.
   */
  const handedOver = [
    ['checkout completed', { type: 'checkout.session.completed', data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } } }, 'requested'],
    ['async checkout succeeded', { type: 'checkout.session.async_payment_succeeded', data: { object: { metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } } }, 'processing'],
    ['async checkout failed', { type: 'checkout.session.async_payment_failed', data: { object: { metadata: { payment_id: 'pay_guard' } } } }, 'processing'],
    ['checkout expired', { type: 'checkout.session.expired', data: { object: { id: 'cs_guard', metadata: { payment_id: 'pay_guard' } } } }, 'processing'],
    ['charge failed', { type: 'charge.failed', data: { object: { metadata: { payment_id: 'pay_guard' }, failure_message: 'declined' } } }, 'processing'],
    ['payment intent failed', { type: 'payment_intent.payment_failed', data: { object: { metadata: { payment_id: 'pay_guard' }, last_payment_error: null } } }, 'processing'],
    ['payment intent succeeded', { type: 'payment_intent.succeeded', data: { object: { id: 'pi_guard', metadata: { payment_id: 'pay_guard' } } } }, 'processing'],
  ] as const;

  it.each(handedOver)(
    'stops %s from settling a destination row while the ledger owns it',
    async (_label, event, status) => {
      // allowUpdates stays false, so any write attempt throws rather than being
      // asserted after the fact: two authorities on this rail is the whole bug.
      const db = webhookAdmin({
        id: 'pay_guard',
        account_id: 'acct_guard',
        job_id: 'job_guard',
        invoice_id: null,
        status,
        charge_model: 'destination',
      });
      mocks.admin = db.admin;
      mocks.event = event;

      const response = await legacyStripeWebhook(webhookRequest());

      // Still acknowledged: standing down is not a delivery failure, and a 500
      // here would make Stripe retry forever once the flag is on.
      expect(response.status).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
      expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
      expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
      expect(mocks.handlePlanPaymentSettled).not.toHaveBeenCalled();
      expect(mocks.handlePlanPaymentFailed).not.toHaveBeenCalled();
      expect(mocks.confirmQuickStopPayment).not.toHaveBeenCalled();
      expect(mocks.markInvoicePaidForPayment).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['won', 'won'],
    ['lost', 'lost'],
  ])('still resolves a dispute closed as %s, which the ledger does not own', async (_label, status) => {
    // The classifier covers eight event types and no dispute is among them, so
    // over-applying the stand-down here would leave disputes open forever --
    // the same silent-stall shape as the ACH gap, just self-inflicted.
    const db = webhookAdmin({
      id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', invoice_id: null,
      status: 'disputed', charge_model: 'destination',
    }, true);
    mocks.admin = db.admin;
    mocks.event = { type: 'charge.dispute.closed', data: { object: { payment_intent: 'pi_guard', status } } };

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.update).toHaveBeenCalled();
    expect(mocks.createDisputeFeedEvent).toHaveBeenCalled();
  });

  // charge.refunded is deliberately not covered here. It is outside the
  // classifier's eight event types like the disputes above, and it reaches its
  // own untouched rail guard rather than either stand-down, so this flag cannot
  // affect it. Driving it through this harness needs provider mocks the file
  // does not set up, and a fixture bent until it returns 200 would assert the
  // fixture rather than the guard.

  it('settles normally again the moment the flag is not exactly 1', async () => {
    process.env[FLAG] = 'true';
    const db = webhookAdmin({
      id: 'pay_guard', account_id: 'acct_guard', job_id: 'job_guard', status: 'requested', charge_model: 'destination',
    }, true);
    mocks.admin = db.admin;
    mocks.event = {
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', payment_status: 'paid', metadata: { payment_id: 'pay_guard' }, payment_intent: 'pi_guard' } },
    };

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.filters).toContainEqual(['charge_model', 'destination']);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('pay_guard', 'payment_paid');
  });
});

describe('contractor and homeowner surfaces do not advertise the legacy rail for direct rows', () => {
  const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

  it('gates public Checkout and shows a plain unavailable message', () => {
    const page = read('src', 'app', 'pay', '[id]', 'page.tsx');
    expect(page).toContain('legacyDestinationPayment');
    expect(page).toContain('directCheckoutUnavailable');
    expect(page).toContain('Online checkout cannot be started or retried from this link.');
  });

  it('gates row actions, timeline cancel, copy-link, and retry-SMS controls', () => {
    const buttons = read('src', 'app', 'dashboard', 'jobs', '[id]', 'PaymentActionButtons.tsx');
    const page = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
    expect(buttons).toContain("status === 'requested' && canUseLegacyRail");
    expect(buttons).toContain("canUseLegacyRail && (status === 'processing' || status === 'failed')");
    expect(page).toContain('canUseLegacyRail={isLegacyDestinationPayment(payment)}');
    expect(page).toContain("&& isLegacyDestinationPayment(linkedPayment)");
    expect(page).toContain("&& isLegacyDestinationPayment(payment) ? (");
    expect(page).toContain("isLegacyDestinationPayment(payment) && payment.sms_events?.some");
  });
});

describe('the ACH branch of the live payment rail', () => {
  // Until now nothing tested this. Every us_bank_account assertion in the suite
  // belongs to legacy-destination-checkout, a module behind a disabled gate. The
  // rail that actually takes money offers ACH on any one-off payment at or above
  // ACH_MIN_AMOUNT, with no flag and no capability read, and the largest payment
  // this platform has ever taken is $125 — so this branch has never executed in
  // production, and nothing here could tell you whether it would.
  // The params have to be typed for mock.calls to be indexable — an untyped
  // vi.fn() gives calls the empty tuple, so every assertion below would be a
  // compile error rather than a check.
  type SessionParams = Stripe.Checkout.SessionCreateParams;
  const stripeCreating = (create: (params: SessionParams) => Promise<unknown>) => {
    mocks.getStripeClient.mockReturnValue({
      checkout: { sessions: { create, expire: vi.fn(), retrieve: vi.fn() } },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers bank debit alongside card at the threshold', async () => {
    const db = checkoutRaceAdmin(null, 'destination', null, ACH_MIN_AMOUNT);
    const createSession = vi.fn(async (_params: SessionParams) => ({ id: 'cs_ach', url: 'https://checkout.stripe.test/ach' }));
    mocks.admin = db.admin;
    stripeCreating(createSession);

    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .resolves.toBe('https://checkout.stripe.test/ach');

    // Card is always offered alongside ACH — never bank-only.
    expect(createSession.mock.calls[0][0].payment_method_types).toEqual(['card', 'us_bank_account']);
  });

  it('stays card-only one dollar below the threshold', async () => {
    const db = checkoutRaceAdmin(null, 'destination', null, ACH_MIN_AMOUNT - 1);
    const createSession = vi.fn(async (_params: SessionParams) => ({ id: 'cs_card', url: 'https://checkout.stripe.test/card' }));
    mocks.admin = db.admin;
    stripeCreating(createSession);

    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .resolves.toBe('https://checkout.stripe.test/card');

    // The key is omitted entirely rather than set to ['card'], which lets Stripe
    // apply the account's own enabled methods.
    expect(createSession.mock.calls[0][0]).not.toHaveProperty('payment_method_types');
  });

  it('falls back to card-only when the platform refuses us_bank_account', async () => {
    // The fallback exists so a large payment is never left un-payable. It has
    // never fired in production; this is the only place it has ever run.
    const db = checkoutRaceAdmin(null, 'destination', null, 1200);
    const createSession = vi.fn(async (_params: SessionParams) => (
      { id: 'cs_fallback', url: 'https://checkout.stripe.test/fallback' }
    ));
    // First call refuses the way Stripe refuses an unactivated method; the retry
    // falls through to the implementation above.
    createSession.mockRejectedValueOnce(new Error('The payment method type provided: us_bank_account is invalid'));
    mocks.admin = db.admin;
    stripeCreating(createSession);

    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .resolves.toBe('https://checkout.stripe.test/fallback');

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createSession.mock.calls[1][0].payment_method_types).toEqual(['card']);
    // The retry must be the same charge otherwise: same destination, same fee.
    expect(createSession.mock.calls[1][0].payment_intent_data).toEqual(
      createSession.mock.calls[0][0].payment_intent_data,
    );
  });

  it('rethrows an unrelated failure instead of quietly retrying card-only', async () => {
    // The fallback is keyed on the TEXT of a Stripe error. A retry on anything
    // else would turn an unrelated fault into a second charge attempt.
    const db = checkoutRaceAdmin(null, 'destination', null, 1200);
    const createSession = vi.fn(async (_params: SessionParams): Promise<unknown> => {
      throw new Error('Amount must be no more than $999,999.99');
    });
    mocks.admin = db.admin;
    stripeCreating(createSession);

    await expect(createCheckoutSessionForPayment('pay_guard', 'https://letsgetquoted.com'))
      .rejects.toThrow('Amount must be no more than');

    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
