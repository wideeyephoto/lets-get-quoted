import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('billing webhook route tests must inject durable ingest');
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => {
    throw new Error('billing webhook route tests must inject durable ingest');
  },
}));

import {
  STRIPE_BILLING_WEBHOOK_FLAG,
  STRIPE_BILLING_WEBHOOK_SECRET,
  handleStripeBillingWebhook,
  stripeBillingWebhookEnabled,
  type StripeBillingWebhookDependencies,
} from '@/lib/billing/stripe-billing-webhook';
import {
  StripeEventInboxValidationError,
  StripeEventInboxVerificationError,
  type StripeEventInboxResult,
} from '@/lib/billing/stripe-event-inbox';

const RAW_BODY = '{"id":"evt_billingroute123","customer_email":"private@example.com"}';
const SIGNATURE = 't=1775000000,v1=signed';
const SECRET = 'whsec_dedicated_billing_endpoint';

function result(inserted = true): StripeEventInboxResult {
  return {
    billingEventId: '10000000-0000-4000-8000-000000000001',
    inserted,
    workspaceId: null,
    providerEventId: 'evt_billingroute123',
    eventType: 'invoice.paid',
    scope: 'platform_subscription',
  };
}

function enabledEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    [STRIPE_BILLING_WEBHOOK_FLAG]: '1',
    [STRIPE_BILLING_WEBHOOK_SECRET]: SECRET,
    ...overrides,
  };
}

function request(signature: string | null = SIGNATURE): Request {
  const headers = new Headers();
  if (signature !== null) headers.set('stripe-signature', signature);
  return new Request('https://letsgetquoted.com/api/stripe/billing/webhook', {
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
    ? vi.fn<NonNullable<StripeBillingWebhookDependencies['ingest']>>().mockRejectedValue(outcome)
    : vi.fn<NonNullable<StripeBillingWebhookDependencies['ingest']>>().mockResolvedValue(outcome);
  return { env, ingest };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('dedicated Stripe Billing webhook route', () => {
  it.each([
    [undefined],
    [''],
    ['0'],
    ['true'],
    ['1 '],
  ])('is disabled unless the server flag is exactly 1 (%s)', async (configured) => {
    const req = unreadRequest();
    const deps = dependencies({
      [STRIPE_BILLING_WEBHOOK_FLAG]: configured,
      [STRIPE_BILLING_WEBHOOK_SECRET]: SECRET,
    });

    const response = await handleStripeBillingWebhook(req, deps);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('recognizes only the exact-1 flag value', () => {
    expect(stripeBillingWebhookEnabled({ [STRIPE_BILLING_WEBHOOK_FLAG]: '1' })).toBe(true);
    expect(stripeBillingWebhookEnabled({ [STRIPE_BILLING_WEBHOOK_FLAG]: 'true' })).toBe(false);
    expect(stripeBillingWebhookEnabled({ [STRIPE_BILLING_WEBHOOK_FLAG]: ' 1' })).toBe(false);
  });

  it('fails retryably before reading the body when the dedicated secret is absent', async () => {
    const req = unreadRequest();
    const deps = dependencies(enabledEnv({ [STRIPE_BILLING_WEBHOOK_SECRET]: undefined }));

    const response = await handleStripeBillingWebhook(req, deps);

    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ received: false, error: 'Webhook unavailable.' });
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('fails retryably before reading the body when Billing reuses the legacy endpoint secret', async () => {
    const req = unreadRequest();
    const deps = dependencies(enabledEnv({ STRIPE_WEBHOOK_SECRET: SECRET }));

    const response = await handleStripeBillingWebhook(req, deps);

    expect(response.status).toBe(503);
    expect(await body(response)).toEqual({ received: false, error: 'Webhook unavailable.' });
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('rejects a missing signature before reading the body or touching durable ingest', async () => {
    const req = unreadRequest(null);
    const deps = dependencies();

    const response = await handleStripeBillingWebhook(req, deps);

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ received: false, error: 'Invalid signature.' });
    expect(req.text).not.toHaveBeenCalled();
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('passes the untouched body, signature, dedicated secret, and platform-only scope to the safe inbox', async () => {
    const deps = dependencies();

    const response = await handleStripeBillingWebhook(request(), deps);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ received: true, duplicate: false });
    expect(deps.ingest).toHaveBeenCalledTimes(1);
    expect(deps.ingest).toHaveBeenCalledWith({
      rawBody: RAW_BODY,
      signature: SIGNATURE,
      webhookSecret: SECRET,
      expectedScope: 'platform_subscription',
    });
  });

  it('acknowledges a durable duplicate without invoking downstream work', async () => {
    const deps = dependencies(enabledEnv(), result(false));

    const response = await handleStripeBillingWebhook(request(), deps);

    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ received: true, duplicate: true });
    expect(deps.ingest).toHaveBeenCalledTimes(1);
  });

  it.each([
    new StripeEventInboxVerificationError(),
    new StripeEventInboxValidationError('Unsupported or malformed platform event.'),
  ])('returns a fixed PII-free rejection and never logs adapter errors (%s)', async (failure) => {
    const deps = dependencies(enabledEnv(), failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const response = await handleStripeBillingWebhook(request(), deps);
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

    const response = await handleStripeBillingWebhook(request(), deps);

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

    const response = await handleStripeBillingWebhook(req, deps);

    expect(response.status).toBe(400);
    expect(await body(response)).toEqual({ received: false, error: 'Invalid request body.' });
    expect(deps.ingest).not.toHaveBeenCalled();
  });

  it('keeps the new route isolated from the legacy webhook and synchronous projector/provider work', () => {
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'stripe', 'billing', 'webhook', 'route.ts'),
      'utf8',
    );
    const boundary = readFileSync(
      join(process.cwd(), 'src', 'lib', 'billing', 'stripe-billing-webhook.ts'),
      'utf8',
    );

    expect(route).toContain("export const dynamic = 'force-dynamic'");
    expect(route).toContain("export const runtime = 'nodejs'");
    expect(route).toContain('handleStripeBillingWebhook(request)');
    expect(boundary).toContain("expectedScope: 'platform_subscription'");
    expect(boundary).toContain('STRIPE_BILLING_WEBHOOK_SECRET');
    expect(boundary).toContain('webhookSecret === legacyWebhookSecret');
    expect(`${route}\n${boundary}`).not.toContain('subscription-event-projector');
    expect(`${route}\n${boundary}`).not.toContain('subscriptions.retrieve');
    expect(`${route}\n${boundary}`).not.toContain('/api/stripe/webhook');
  });
});
