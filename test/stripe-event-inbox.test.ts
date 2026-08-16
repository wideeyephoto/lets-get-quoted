import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('event inbox tests must inject their store');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('event inbox tests must inject signature verification');
  },
}));

import {
  StripeEventInboxValidationError,
  StripeEventInboxVerificationError,
  SupabaseStripeEventInboxStore,
  ingestStripeEventInboxDelivery,
  type StripeBillingEventScope,
  type StripeEventInboxDependencies,
  type StripeEventInboxReceipt,
  type StripeEventInboxStore,
} from '@/lib/billing/stripe-event-inbox';

const BILLING_EVENT_ID = '10000000-0000-4000-8000-000000000001';
const WORKSPACE_ID = '20000000-0000-4000-8000-000000000002';
const CONNECTED_ACCOUNT_ID = 'acct_merchant123';

function stripeEvent(overrides: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: 'evt_directreceipt123',
    object: 'event',
    account: CONNECTED_ACCOUNT_ID,
    api_version: '2026-06-24.dahlia',
    created: 1_775_000_000,
    data: {
      object: {
        id: 'pi_directreceipt123',
        object: 'payment_intent',
        client_secret: 'pi_secret_must_not_persist',
        customer_email: 'homeowner@example.com',
        metadata: { payment_id: 'private-payment-id' },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'payment_intent.succeeded',
    ...overrides,
  } as unknown as Stripe.Event;
}

function delivery(expectedScope: StripeBillingEventScope = 'connected_payment') {
  return {
    rawBody: '{"signed":"raw Stripe body"}',
    signature: 't=1775000000,v1=signature',
    webhookSecret: 'whsec_test_endpoint_secret',
    expectedScope,
  } as const;
}

function dependencies(
  event: Stripe.Event,
  stored: { billingEventId: string; inserted: boolean; workspaceId: string | null } = {
    billingEventId: BILLING_EVENT_ID,
    inserted: true,
    workspaceId: WORKSPACE_ID,
  },
) {
  const insert = vi.fn<StripeEventInboxStore['insert']>().mockResolvedValue(stored);
  const constructEvent = vi.fn().mockReturnValue(event);
  const value: StripeEventInboxDependencies = {
    store: { insert },
    constructEvent,
  };
  return { value, insert, constructEvent };
}

describe('dark Stripe event inbox', () => {
  it('verifies and persists a connected payment with only a redacted canonical envelope', async () => {
    const mocks = dependencies(stripeEvent());

    const result = await ingestStripeEventInboxDelivery(delivery(), mocks.value);

    expect(mocks.constructEvent).toHaveBeenCalledWith(
      delivery().rawBody,
      delivery().signature,
      delivery().webhookSecret,
    );
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const receipt = mocks.insert.mock.calls[0][0];
    expect(receipt).toMatchObject({
      providerEventId: 'evt_directreceipt123',
      eventType: 'payment_intent.succeeded',
      scope: 'connected_payment',
      providerAccountId: CONNECTED_ACCOUNT_ID,
      livemode: false,
      apiVersion: '2026-06-24.dahlia',
      providerCreatedAt: new Date(1_775_000_000_000).toISOString(),
      payload: {
        schema: 'lgq.stripe-event-inbox.v1',
        scope: 'connected_payment',
        event: {
          id: 'evt_directreceipt123',
          type: 'payment_intent.succeeded',
          account: CONNECTED_ACCOUNT_ID,
          livemode: false,
          api_version: '2026-06-24.dahlia',
          created: 1_775_000_000,
        },
        data_object: { id: 'pi_directreceipt123', object: 'payment_intent' },
      },
    });
    const persistedEnvelope = JSON.stringify(receipt.payload);
    for (const forbidden of [
      'client_secret',
      'pi_secret_must_not_persist',
      'customer_email',
      'homeowner@example.com',
      'metadata',
      'private-payment-id',
    ]) {
      expect(persistedEnvelope).not.toContain(forbidden);
    }
    expect(result).toEqual({
      billingEventId: BILLING_EVENT_ID,
      inserted: true,
      workspaceId: WORKSPACE_ID,
      providerEventId: 'evt_directreceipt123',
      eventType: 'payment_intent.succeeded',
      scope: 'connected_payment',
    });
  });

  it('returns a durable database replay without changing classification', async () => {
    const mocks = dependencies(stripeEvent(), {
      billingEventId: BILLING_EVENT_ID,
      inserted: false,
      workspaceId: WORKSPACE_ID,
    });

    await expect(ingestStripeEventInboxDelivery(delivery(), mocks.value)).resolves.toMatchObject({
      billingEventId: BILLING_EVENT_ID,
      inserted: false,
      workspaceId: WORKSPACE_ID,
      scope: 'connected_payment',
    });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it('keeps platform subscription events accountless and in their own scope', async () => {
    const event = stripeEvent({
      id: 'evt_subscription123',
      account: undefined,
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_platform123',
          object: 'subscription',
          customer: 'cus_private123',
          metadata: { workspace_id: WORKSPACE_ID },
        },
      },
    });
    const mocks = dependencies(event, {
      billingEventId: BILLING_EVENT_ID,
      inserted: true,
      workspaceId: null,
    });

    const result = await ingestStripeEventInboxDelivery(delivery('platform_subscription'), mocks.value);

    const receipt = mocks.insert.mock.calls[0][0];
    expect(receipt.scope).toBe('platform_subscription');
    expect(receipt.providerAccountId).toBeNull();
    expect(receipt.payload.event.account).toBeNull();
    expect(receipt.payload.data_object).toEqual({ id: 'sub_platform123', object: 'subscription' });
    expect(JSON.stringify(receipt.payload)).not.toContain('cus_private123');
    expect(JSON.stringify(receipt.payload)).not.toContain('workspace_id');
    expect(result.workspaceId).toBeNull();
  });

  it('fails closed when a connected payment omits event.account', async () => {
    const mocks = dependencies(stripeEvent({ account: undefined }));

    await expect(ingestStripeEventInboxDelivery(delivery(), mocks.value))
      .rejects.toThrow(/require event\.account/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('fails closed when a platform subscription carries a connected account', async () => {
    const mocks = dependencies(stripeEvent({
      type: 'invoice.paid',
      data: { object: { id: 'in_platform123', object: 'invoice' } },
    }));

    await expect(ingestStripeEventInboxDelivery(delivery('platform_subscription'), mocks.value))
      .rejects.toThrow(/must not contain event\.account/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects a correctly shaped event delivered to the wrong endpoint scope', async () => {
    const mocks = dependencies(stripeEvent());

    await expect(ingestStripeEventInboxDelivery(delivery('platform_subscription'), mocks.value))
      .rejects.toThrow(/unsupported Stripe event type/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('hard-disables top-up ingestion until a durable operation proves purpose', async () => {
    const mocks = dependencies(stripeEvent());

    await expect(ingestStripeEventInboxDelivery({
      ...delivery(),
      expectedScope: 'top_up_purchase' as never,
    }, mocks.value)).rejects.toThrow(/endpoint scope is invalid/i);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['event ID', { id: 'not_an_event' }, /event ID is invalid/i],
    ['account ID', { account: 'acct_bad' }, /event\.account is invalid/i],
    ['livemode', { livemode: 'false' }, /livemode must be explicit/i],
    ['created', { created: 1.5 }, /creation time is invalid/i],
    ['object type', { data: { object: { id: 'pi_valid123', object: 'charge' } } }, /does not match data\.object/i],
  ])('rejects an invalid %s before touching the database', async (_label, overrides, pattern) => {
    const mocks = dependencies(stripeEvent(overrides));

    const thrown = await ingestStripeEventInboxDelivery(delivery(), mocks.value).catch((error) => error);

    expect(thrown).toBeInstanceOf(StripeEventInboxValidationError);
    expect(thrown.message).toMatch(pattern);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('wraps signature failures without retaining or echoing the raw body', async () => {
    const store = { insert: vi.fn<StripeEventInboxStore['insert']>() };
    const verificationError = new Error('signature mismatch');
    const deps: StripeEventInboxDependencies = {
      store,
      constructEvent: vi.fn(() => { throw verificationError; }),
    };

    const thrown = await ingestStripeEventInboxDelivery(delivery(), deps).catch((error) => error);

    expect(thrown).toBeInstanceOf(StripeEventInboxVerificationError);
    expect(thrown).not.toHaveProperty('verificationError');
    expect(thrown).not.toHaveProperty('payload');
    expect(thrown.message).not.toContain(delivery().rawBody);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it('rejects empty/oversized delivery inputs before constructing an Event', async () => {
    const mocks = dependencies(stripeEvent());

    await expect(ingestStripeEventInboxDelivery({ ...delivery(), rawBody: '' }, mocks.value))
      .rejects.toThrow(/raw body size/i);
    await expect(ingestStripeEventInboxDelivery({ ...delivery(), webhookSecret: 'not-a-secret' }, mocks.value))
      .rejects.toThrow(/endpoint secret is invalid/i);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it('refuses a connected receipt if the RPC does not prove workspace binding', async () => {
    const mocks = dependencies(stripeEvent(), {
      billingEventId: BILLING_EVENT_ID,
      inserted: true,
      workspaceId: null,
    });

    await expect(ingestStripeEventInboxDelivery(delivery(), mocks.value))
      .rejects.toThrow(/bound workspace/i);
  });

  it('maps the immutable receipt to the narrow Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ billing_event_id: BILLING_EVENT_ID, inserted: false, workspace_id: WORKSPACE_ID }],
      error: null,
    });
    const store = new SupabaseStripeEventInboxStore({ rpc } as never);
    const receipt: StripeEventInboxReceipt = {
      providerEventId: 'evt_directreceipt123',
      eventType: 'payment_intent.succeeded',
      scope: 'connected_payment',
      providerAccountId: CONNECTED_ACCOUNT_ID,
      livemode: false,
      apiVersion: '2026-06-24.dahlia',
      providerCreatedAt: '2026-04-01T00:53:20.000Z',
      payload: {
        schema: 'lgq.stripe-event-inbox.v1',
        scope: 'connected_payment',
        event: {
          id: 'evt_directreceipt123',
          type: 'payment_intent.succeeded',
          account: CONNECTED_ACCOUNT_ID,
          livemode: false,
          api_version: '2026-06-24.dahlia',
          created: 1_775_000_000,
        },
        data_object: { id: 'pi_directreceipt123', object: 'payment_intent' },
      },
    };

    await expect(store.insert(receipt)).resolves.toEqual({
      billingEventId: BILLING_EVENT_ID,
      inserted: false,
      workspaceId: WORKSPACE_ID,
    });
    expect(rpc).toHaveBeenCalledWith('ingest_stripe_event_inbox', {
      p_provider_event_id: receipt.providerEventId,
      p_event_type: receipt.eventType,
      p_event_scope: receipt.scope,
      p_provider_account_id: receipt.providerAccountId,
      p_livemode: receipt.livemode,
      p_api_version: receipt.apiVersion,
      p_provider_created_at: receipt.providerCreatedAt,
      p_payload: receipt.payload,
    });
  });

  it('remains unreferenced by routes and active legacy charge callers', () => {
    const appRoot = join(process.cwd(), 'src', 'app');
    const sourceFiles: string[] = [];
    const visit = (path: string) => {
      for (const entry of readdirSync(path)) {
        const child = join(path, entry);
        if (statSync(child).isDirectory()) visit(child);
        else if (/\.(?:ts|tsx)$/.test(entry)) sourceFiles.push(child);
      }
    };
    visit(appRoot);
    for (const activeCaller of [
      'src/lib/payments.ts',
      'src/lib/recurring.ts',
      'src/lib/payment-plans.ts',
      'src/lib/dunning.ts',
    ]) {
      sourceFiles.push(join(process.cwd(), activeCaller));
    }

    for (const sourceFile of sourceFiles) {
      expect(readFileSync(sourceFile, 'utf8'), sourceFile).not.toContain('stripe-event-inbox');
    }
  });
});
