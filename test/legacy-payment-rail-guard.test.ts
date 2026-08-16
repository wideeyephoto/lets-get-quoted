import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function checkoutRaceAdmin(existingSessionId: string | null = null) {
  let railReads = 0;
  const update = vi.fn(() => {
    throw new Error('a row that became direct must not persist legacy Checkout state');
  });
  const publicPayment = {
    id: 'pay_guard',
    account_id: 'acct_guard',
    job_id: 'job_guard',
    invoice_id: null,
    kind: 'final',
    label: 'Final payment',
    amount: 100,
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
                  charge_model: railReads === 1 ? 'destination' : 'direct',
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
