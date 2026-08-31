import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('connected payment webhook tests must inject durable ingest');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('connected payment webhook tests must inject durable ingest');
  },
}));

import {
  STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG,
  STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET,
  handleStripeConnectedPaymentWebhook,
  stripeConnectedPaymentWebhookEnabled,
  type StripeConnectedPaymentWebhookDependencies,
} from '@/lib/billing/stripe-connected-payment-webhook';
import {
  StripeEventInboxValidationError,
  StripeEventInboxVerificationError,
  type StripeEventInboxResult,
} from '@/lib/billing/stripe-event-inbox';

const RAW_BODY = JSON.stringify({
  id: 'evt_connectedroute123',
  account: 'acct_merchant123',
  livemode: false,
  charge_model: 'destination_charge',
  customer_email: 'private@example.com',
});
const SIGNATURE = 't=1775000000,v1=signed';
const SECRET = 'whsec_dedicated_connected_payment_endpoint';
const WORKSPACE_ID = '20000000-0000-4000-8000-000000000002';

function result(inserted = true): StripeEventInboxResult {
  return {
    billingEventId: '10000000-0000-4000-8000-000000000001',
    inserted,
    workspaceId: WORKSPACE_ID,
    providerEventId: 'evt_connectedroute123',
    eventType: 'payment_intent.succeeded',
    scope: 'connected_payment',
  };
}

function enabledEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    [STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG]: '1',
    [STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET]: SECRET,
    ...overrides,
  };
}

function request(signature: string | null = SIGNATURE): Request {
  const headers = new Headers();
  if (signature !== null) headers.set('stripe-signature', signature);
  return new Request('https://letsgetquoted.com/api/stripe/connected-payments/webhook', {
    method: 'POST',
    headers,
    body: RAW_BODY,
  });
}

function unreadRequest(signature: string | null = SIGNATURE) {
  const headers = new Headers();
  if (signature !== null) headers.set('stripe-signature', signature);
  return {
    headers,
    text: vi.fn(async () => RAW_BODY),
  } as unknown as Request;
}

function dependencies(
  env: Readonly<Record<string, string | undefined>> = enabledEnv(),
  outcome: StripeEventInboxResult | Error = result(),
) {
  const ingest = outcome instanceof Error
    ? vi.fn<NonNullable<StripeConnectedPaymentWebhookDependencies['ingest']>>()
      .mockRejectedValue(outcome)
    : vi.fn<NonNullable<StripeConnectedPaymentWebhookDependencies['ingest']>>()
      .mockResolvedValue(outcome);
  return { env, ingest };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('dedicated Stripe connected-payment webhook route', () => {
  it.each([
    [undefined],
    [''],
    ['0'],
    ['true'],
    ['1 '],
  ])('is disabled before body/client/ingest unless the server flag is exactly 1 (%s)', async (configured) => {
    const req = unreadRequest();
    const deps = dependencies({
      [STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG]: configured,
      [STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET]: SECRET,
    });

    const response = await handleStripeConnectedPaymentWebhook(req, deps);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('recognizes only the exact-1 dark-launch flag', () => {
    expect(stripeConnectedPaymentWebhookEnabled({
      [STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG]: '1',
    })).toBe(true);
    expect(stripeConnectedPaymentWebhookEnabled({
      [STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG]: 'true',
    })).toBe(false);
    expect(stripeConnectedPaymentWebhookEnabled({
      [STRIPE_CONNECTED_PAYMENT_WEBHOOK_FLAG]: ' 1',
    })).toBe(false);
  });

  it('fails retryably before reading the body when the dedicated secret is absent', async () => {
    const req = unreadRequest();
    const deps = dependencies(enabledEnv({
      [STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET]: undefined,
    }));

    const response = await handleStripeConnectedPaymentWebhook(req, deps);

    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ received: false, error: 'Webhook unavailable.' });
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it.each([
    ['legacy payment', 'STRIPE_WEBHOOK_SECRET'],
    ['platform Billing', 'STRIPE_BILLING_WEBHOOK_SECRET'],
  ])('refuses reuse of the %s endpoint secret before reading the body', async (_label, key) => {
    const req = unreadRequest();
    const deps = dependencies(enabledEnv({ [key]: SECRET }));

    const response = await handleStripeConnectedPaymentWebhook(req, deps);

    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ received: false, error: 'Webhook unavailable.' });
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('rejects a missing signature before reading the body or touching durable ingest', async () => {
    const req = unreadRequest(null);
    const deps = dependencies();

    const response = await handleStripeConnectedPaymentWebhook(req, deps);

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ received: false, error: 'Invalid signature.' });
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('passes the untouched body and a server-owned direct-payment scope to the safe inbox', async () => {
    const deps = dependencies();

    const response = await handleStripeConnectedPaymentWebhook(request(), deps);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ received: true, duplicate: false });
    expect(deps.ingest).toHaveBeenCalledTimes(1);
    expect(deps.ingest).toHaveBeenCalledWith({
      rawBody: RAW_BODY,
      signature: SIGNATURE,
      webhookSecret: SECRET,
      expectedScope: 'connected_payment',
    });
    // A body field cannot switch this route back to the legacy charge model.
    expect(deps.ingest.mock.calls[0][0]).not.toHaveProperty('charge_model');
  });

  it('acknowledges an exact durable duplicate without downstream work', async () => {
    const deps = dependencies(enabledEnv(), result(false));

    const response = await handleStripeConnectedPaymentWebhook(request(), deps);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ received: true, duplicate: true });
    expect(deps.ingest).toHaveBeenCalledTimes(1);
  });

  it.each([
    new StripeEventInboxVerificationError(),
    new StripeEventInboxValidationError('Unsupported connected event.'),
  ])('returns a fixed PII-free rejection and never logs adapter errors (%s)', async (failure) => {
    const deps = dependencies(enabledEnv(), failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await handleStripeConnectedPaymentWebhook(request(), deps);
    const responseBody = await body(response);

    expect(response.status).toBe(400);
    expect(responseBody).toEqual({ received: false, error: 'Invalid webhook.' });
    expect(JSON.stringify(responseBody)).not.toContain('private@example.com');
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();

    consoleError.mockRestore();
    consoleWarn.mockRestore();
    consoleLog.mockRestore();
  });

  it('returns a retryable fixed response when durable ingest fails', async () => {
    const deps = dependencies(enabledEnv(), new Error(`database rejected ${RAW_BODY}`));

    const response = await handleStripeConnectedPaymentWebhook(request(), deps);

    expect(response.status).toBe(500);
    expect(await body(response)).toEqual({
      received: false,
      error: 'Webhook temporarily unavailable.',
    });
  });

  it('does not let an unreadable body reach signature verification or storage', async () => {
    const req = unreadRequest();
    vi.mocked(req.text).mockRejectedValue(new Error('stream unavailable'));
    const deps = dependencies();

    const response = await handleStripeConnectedPaymentWebhook(req, deps);

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ received: false, error: 'Invalid request body.' });
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('keeps the route isolated from legacy rails and synchronous provider/projector work', () => {
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'stripe', 'connected-payments', 'webhook', 'route.ts'),
      'utf8',
    );
    const boundary = readFileSync(
      join(process.cwd(), 'src', 'lib', 'billing', 'stripe-connected-payment-webhook.ts'),
      'utf8',
    );
    const combined = `${route}\n${boundary}`;

    expect(route).toContain("export const dynamic = 'force-dynamic'");
    expect(route).toContain("export const runtime = 'nodejs'");
    expect(route).toContain('handleStripeConnectedPaymentWebhook(request)');
    expect(boundary).toContain("expectedScope: 'connected_payment'");
    expect(boundary).toContain('STRIPE_CONNECTED_PAYMENT_WEBHOOK_SECRET');
    expect(boundary).toContain('STRIPE_BILLING_WEBHOOK_SECRET');
    expect(boundary).toContain('STRIPE_WEBHOOK_SECRET');
    expect(combined).not.toContain('/api/stripe/webhook');
    expect(combined).not.toContain('subscription-event-projector');
    expect(combined).not.toContain('payments.retrieve');
    expect(combined).not.toContain('paymentIntents.retrieve');
    expect(combined).not.toContain('charges.retrieve');
    expect(combined).not.toContain('refunds.create');
  });
});
