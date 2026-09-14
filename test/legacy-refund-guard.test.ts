import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  ownerNotice: vi.fn(),
  createRefund: vi.fn(),
  listRefunds: vi.fn(),
  retrieveCharge: vi.fn(),
  admin: null as unknown,
  event: null as unknown,
  sendPaymentSmsEvent: vi.fn(),
  createPaymentFeedEvent: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/owner-event-notices',()=>({runOwnerEventNotices:mocks.ownerNotice}));

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

vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: mocks.logWebhookFailure,
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

function paymentClient(row: Record<string, unknown>, claim = false) {
  const updates: Record<string, unknown>[] = [];
  const filters: Array<[string, unknown]> = [];
  const update = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return update;
    }),
    is: vi.fn(() => update),
    select: vi.fn(() => update),
    maybeSingle: vi.fn(async () => ({ data: claim ? {id:row.id} : null, error: null })),
  };
  const table = {
    select: vi.fn((columns: string) => {
      const read = {
        eq: vi.fn(() => read),
        maybeSingle: vi.fn(async () => (
          columns.includes('charge_model') && !Object.prototype.hasOwnProperty.call(row, 'charge_model')
            ? { data: null, error: { code: '42703', message: 'column charge_model does not exist' } }
            : { data: row, error: null }
        )),
      };
      return read;
    }),
    update: vi.fn((values: Record<string, unknown>) => {
      updates.push(values);
      return update;
    }),
  };
  return {
    client: { from: vi.fn(() => table) } as unknown as SupabaseClient,
    updates,
    filters,
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
    account_id: 'acct_workspace',
    stripe_payment_intent: 'pi_webhook_guard',
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
  const bindingFilters: Array<[string,unknown]> = [];

  const row = (includeChargeModel: boolean) => ({
    id: 'pay_webhook_guard',
    account_id: 'acct_workspace',
    stripe_payment_intent: 'pi_webhook_guard',
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
            bindingFilters.push([column,value]);
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

  return { admin, state, selections, updates, monotonicFilters, chargeModelFilters, bindingFilters };
}

function chargeRefundedEvent(amountRefundedCents: number) {
  return {
    type: 'charge.refunded',
    livemode: false,
    data: {
      object: {
        id: 'ch_webhook_guard',
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

function queuedRefundWebhookAdmin(input: {
  reads: Array<{ data: Record<string, unknown> | null; error: { code?: string; message?: string } | null }>;
  updates: Array<{ data: Record<string, unknown> | null; error: { code?: string; message?: string } | null }>;
}) {
  const reads = [...input.reads];
  const updates = [...input.updates];

  function chained(queue: typeof reads) {
    const query = {
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      or: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => queue.shift() ?? { data: null, error: null }),
    };
    return query;
  }

  const update = vi.fn(() => chained(updates));
  const admin = {
    from: vi.fn((table: string) => {
      if (table !== 'payments') throw new Error(`unexpected table ${table}`);
      return {
        select: vi.fn(() => chained(reads)),
        update,
      };
    }),
  };

  return { admin, update };
}

const destinationRefundRail = {
  data: { id: 'pay_webhook_guard', status: 'paid', charge_model: 'destination' },
  error: null,
};

const destinationRefundPayment = {
  data: {
    id: 'pay_webhook_guard',
    account_id: 'acct_workspace',
    stripe_payment_intent: 'pi_webhook_guard',
    invoice_id: null,
    status: 'paid',
    refunded_amount: 0,
    amount: 50,
    platform_fee: 3,
    charge_model: 'destination',
  },
  error: null,
};

const transientRefundDbError = { code: '08006', message: 'temporary database failure' };

describe('legacy refund charge-model boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRefund.mockResolvedValue({ id: 're_legacy_guard', status: 'succeeded', amount: 2500, currency: 'usd', payment_intent: 'pi_legacy_guard' });
    mocks.getStripeClient.mockReturnValue({
      refunds: { create: mocks.createRefund, list: mocks.listRefunds },
      charges: { retrieve: mocks.retrieveCharge },
      webhooks: { constructEvent: () => mocks.event },
    });
    mocks.retrieveCharge.mockImplementation(async()=>({id:'ch_webhook_guard',payment_intent:'pi_webhook_guard',metadata:{payment_id:'pay_webhook_guard'},livemode:false,currency:'usd',paid:true,captured:true,amount:5000,amount_captured:5000}));
    mocks.listRefunds.mockImplementation(async()=>({has_more:false,data:[{id:'re_webhook_guard',charge:'ch_webhook_guard',payment_intent:'pi_webhook_guard',currency:'usd',status:'succeeded',amount:(mocks.event as {data:{object:{amount_refunded:number}}}).data.object.amount_refunded}]}));
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_legacy_guard';
  });

  it.each(['pending','requires_action','failed','canceled',null,undefined,'unknown'])('does not account for or announce an unconfirmed %s refund',async status=>{
    mocks.createRefund.mockResolvedValueOnce({id:'re_pending',status,amount:2500,currency:'usd',payment_intent:'pi_legacy_guard'});
    const {client,updates}=paymentClient({...legacyPayment,charge_model:'destination'});
    await expect(refundPayment(client,'acct_workspace','pay_legacy_guard',25)).rejects.toThrow('completion could not be confirmed');
    expect(updates).toEqual([]);
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
  });
  it.each([{amount:2400},{currency:'eur'},{payment_intent:'pi_other'},{id:''}])('rejects a succeeded refund with mismatched provider evidence %j',async patch=>{
    mocks.createRefund.mockResolvedValueOnce({id:'re_match',status:'succeeded',amount:2500,currency:'usd',payment_intent:'pi_legacy_guard',...patch});
    const {client,updates}=paymentClient({...legacyPayment,charge_model:'destination'});
    await expect(refundPayment(client,'acct_workspace','pay_legacy_guard',25)).rejects.toThrow('completion could not be confirmed');
    expect(updates).toEqual([]);
  });
  it('binds a saved cancellation attempt to an exact amount and provider key',async()=>{
    mocks.createRefund.mockResolvedValueOnce({id:'re_attempt',status:'succeeded',amount:10000,currency:'usd',payment_intent:'pi_legacy_guard'});
    const {client}=paymentClient({...legacyPayment,charge_model:'destination'});
    const checkpoint=vi.fn();const id='14b2d1c1-a31d-4416-bf4b-1ab0486d79bc';
    await refundPayment(client,'acct_workspace','pay_legacy_guard',100,{id,paymentIntent:'pi_legacy_guard',paymentAmountCents:10000,alreadyRefundedCents:0,requestedCents:10000,onProviderRefund:checkpoint});
    expect(mocks.createRefund).toHaveBeenCalledWith(expect.objectContaining({amount:10000,metadata:expect.objectContaining({lgq_quick_stop_refund_attempt_id:id})}),{idempotencyKey:'quick_stop_cancellation_refund_v1_'+id});
    expect(checkpoint).toHaveBeenCalledTimes(1);
  });
  it('rejects a saved attempt after the payment baseline changes before contacting Stripe',async()=>{
    const {client}=paymentClient({...legacyPayment,charge_model:'destination',refunded_amount:10});
    await expect(refundPayment(client,'acct_workspace','pay_legacy_guard',25,{id:'14b2d1c1-a31d-4416-bf4b-1ab0486d79bc',paymentIntent:'pi_legacy_guard',paymentAmountCents:10000,alreadyRefundedCents:0,requestedCents:2500,onProviderRefund:vi.fn()})).rejects.toThrow('no longer matches');
    expect(mocks.createRefund).not.toHaveBeenCalled();
  });
  it('accepts a matching full refund with an expanded payment intent',async()=>{
    mocks.createRefund.mockResolvedValueOnce({id:'re_full',status:'succeeded',amount:10000,currency:'usd',payment_intent:{id:'pi_legacy_guard'}});
    const {client,updates}=paymentClient({...legacyPayment,charge_model:'destination'});
    await expect(refundPayment(client,'acct_workspace','pay_legacy_guard')).resolves.toEqual({amount:100,isFull:true,refundedTotal:100});
    expect(updates[0]).toMatchObject({status:'refunded',refunded_amount:100});
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
    const { client, updates, filters } = paymentClient({ ...legacyPayment, ...model });

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
    if (Object.prototype.hasOwnProperty.call(model, 'charge_model')) {
      expect(filters).toContainEqual(['charge_model', 'destination']);
    } else {
      expect(filters.some(([column]) => column === 'charge_model')).toBe(false);
    }
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
          id: 'ch_webhook_guard',
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

  it('does not turn a pending refund aggregate into a completion message',async()=>{
    const db=statefulWebhookAdmin('destination');mocks.admin=db.admin;mocks.event=chargeRefundedEvent(5000);
    mocks.listRefunds.mockResolvedValueOnce({has_more:false,data:[{id:'re_pending',charge:'ch_webhook_guard',payment_intent:'pi_webhook_guard',currency:'usd',amount:5000,status:'pending'}]});
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(db.updates).toEqual([]);expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
  });
  it('reconciles a later succeeded refund.updated without creating another refund',async()=>{
    const db=statefulWebhookAdmin('destination');mocks.admin=db.admin;
    mocks.event={id:'evt_refund_updated',type:'refund.updated',livemode:false,data:{object:{id:'re_updated',charge:'ch_webhook_guard'}}};
    mocks.listRefunds.mockResolvedValue({has_more:false,data:[{id:'re_updated',charge:'ch_webhook_guard',payment_intent:'pi_webhook_guard',currency:'usd',amount:5000,status:'succeeded'}]});
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(db.state.refunded_amount).toBe(50);expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledTimes(1);
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledTimes(1);expect(mocks.createRefund).not.toHaveBeenCalled();
  });
  it('returns a retryable error without writes when provider evidence is unavailable',async()=>{
    const db=statefulWebhookAdmin('destination');mocks.admin=db.admin;mocks.event=chargeRefundedEvent(5000);
    mocks.retrieveCharge.mockRejectedValueOnce(new Error('offline'));
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);expect(db.updates).toEqual([]);
  });
  it('flags a lower current provider total for review instead of announcing another refund',async()=>{
    const db=statefulWebhookAdmin('destination',{initialRefunded:50});mocks.admin=db.admin;mocks.event=chargeRefundedEvent(2500);
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);expect(db.updates).toEqual([]);expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();
  });
  it('rejects connected-account events before legacy refund writes',async()=>{
    const db=statefulWebhookAdmin('destination');mocks.admin=db.admin;mocks.event={...chargeRefundedEvent(5000),account:'acct_connected'};
    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);expect(db.updates).toEqual([]);expect(mocks.retrieveCharge).not.toHaveBeenCalled();
  });
  it('dispatches the synchronous refund marker only after its accounting write wins',async()=>{
    const {client,updates}=paymentClient({...legacyPayment,charge_model:'destination'},true);
    await refundPayment(client,'acct_workspace','pay_legacy_guard',25);
    expect(updates[0].refund_notice_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.ownerNotice).toHaveBeenCalledWith(mocks.admin,{accountId:'acct_workspace',sourceId:updates[0].refund_notice_event_id});
  });
  it('preserves a completed refund when immediate owner notice pickup fails',async()=>{
    const {client}=paymentClient({...legacyPayment,charge_model:'destination'},true);
    mocks.ownerNotice.mockRejectedValueOnce(new Error('Pickup unavailable'));
    await expect(refundPayment(client,'acct_workspace','pay_legacy_guard',25)).resolves.toMatchObject({amount:25,refundedTotal:25});
  });
  it('keeps explicit destination charge.refunded reconciliation on the legacy path', async () => {
    const db = statefulWebhookAdmin('destination');
    mocks.admin = db.admin;
    mocks.event = chargeRefundedEvent(2500);

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(200);
    expect(db.state).toMatchObject({ refunded_amount: 25, status: 'paid' });
    expect(db.chargeModelFilters).toEqual(['destination']);
    expect(mocks.ownerNotice).toHaveBeenCalledWith(db.admin,{accountId:'acct_workspace',sourceId:db.updates[0].refund_notice_event_id});
    expect(db.bindingFilters).toEqual(expect.arrayContaining([['account_id','acct_workspace'],['stripe_payment_intent','pi_webhook_guard'],['amount',50]]));
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
      expect(db.selections).toHaveLength(4);
      expect(db.selections[0]).toContain('charge_model');
      expect(db.selections[1]).toBe('charge_model');
      expect(db.selections[2]).not.toContain('charge_model');
      expect(db.selections[3]).not.toContain('charge_model');
      expect(db.chargeModelFilters).toEqual([]);
      expect(db.state).toMatchObject({ refunded_amount: 25, status: 'paid' });
    },
  );

  it('fails closed when the charge-model read fails for a reason other than a missing column', async () => {
    const db = statefulWebhookAdmin('read-error');
    mocks.admin = db.admin;
    mocks.event = chargeRefundedEvent(2500);

    const response = await legacyStripeWebhook(webhookRequest());

    expect(response.status).toBe(500);
    expect(db.selections).toHaveLength(1);
    expect(db.updates).toEqual([]);
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
  });

  it('returns 500 for a refund payment-read error and reconciles on Stripe retry', async () => {
    const db = queuedRefundWebhookAdmin({
      reads: [
        destinationRefundRail,
        { data: null, error: transientRefundDbError },
        destinationRefundRail,
        destinationRefundPayment,
      ],
      updates: [{ data: { id: 'pay_webhook_guard', invoice_id: null }, error: null }],
    });
    mocks.admin = db.admin;
    mocks.event = { id: 'evt_refund_read_retry', ...chargeRefundedEvent(2500) };

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'stripe',
      eventType: 'charge.refunded',
      referenceId: 'evt_refund_read_retry',
    }));

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledTimes(1);
  });

  it('returns 500 for a refund CAS error and reconciles on Stripe retry', async () => {
    const db = queuedRefundWebhookAdmin({
      reads: [
        destinationRefundRail,
        destinationRefundPayment,
        destinationRefundRail,
        destinationRefundPayment,
      ],
      updates: [
        { data: null, error: transientRefundDbError },
        { data: { id: 'pay_webhook_guard', invoice_id: null }, error: null },
      ],
    });
    mocks.admin = db.admin;
    mocks.event = { id: 'evt_refund_cas_retry', ...chargeRefundedEvent(2500) };

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(500);
    expect(mocks.createPaymentFeedEvent).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'stripe',
      eventType: 'charge.refunded',
      referenceId: 'evt_refund_cas_retry',
    }));

    expect((await legacyStripeWebhook(webhookRequest())).status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledTimes(1);
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
      // A code-only missing-column error does not identify which reporting
      // column is absent. The charge-model probe must fail too before the
      // reader may omit the rail discriminator.
      { data: null, error: { code } },
      { data: legacy, error: null },
    ]);

    await expect(getPaymentForAdmin(admin, legacy.id)).resolves.toEqual(legacy);
    expect(selections).toHaveLength(3);
    expect(selections[0]).toContain('charge_model');
    expect(selections[1]).toContain('charge_model');
    expect(selections[1]).not.toContain('reconciliation_status');
    expect(selections[2]).not.toContain('charge_model');
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
