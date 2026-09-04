import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  upsert: vi.fn(),
  suppressEmail: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/email-suppression', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email-suppression')>();
  return {
    ...actual,
    suppressEmail: mocks.suppressEmail,
  };
});

vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: mocks.logWebhookFailure,
}));

import { POST } from '@/app/api/resend/webhook/route';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const RECIPIENT = 'client@example.com';
const EVENT_TIME = '2026-09-01T12:00:00.000Z';
const SECRET_BYTES = Buffer.from('resend-route-test-secret');
const WEBHOOK_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

type EventData = Record<string, unknown> & {
  email_id: string;
};

function signedRequest(type: string, data: EventData): Request {
  const rawBody = JSON.stringify({ type, created_at: EVENT_TIME, data });
  const svixId = `msg_${data.email_id}`;
  const svixTimestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac('sha256', SECRET_BYTES)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');

  return new Request('https://letsgetquoted.com/api/resend/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': `v1,${signature}`,
    },
    body: rawBody,
  });
}

function taggedData(emailId: string, extra: Record<string, unknown> = {}): EventData {
  return {
    email_id: emailId,
    to: [RECIPIENT],
    tags: { kind: 'invoice', account_id: ACCOUNT_ID },
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  mocks.upsert.mockResolvedValue({ error: null });
  mocks.suppressEmail.mockResolvedValue(true);
  mocks.logWebhookFailure.mockResolvedValue(undefined);
  mocks.createAdminClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table !== 'email_events') throw new Error(`Unexpected table ${table}`);
      return { upsert: mocks.upsert };
    }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Resend webhook outcome projection', () => {
  it('records email.failed with the provider reason without suppressing the recipient', async () => {
    const response = await POST(signedRequest(
      'email.failed',
      taggedData('email-failed', { failed: { reason: 'reached_daily_quota' } }),
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.upsert).toHaveBeenCalledWith({
      account_id: ACCOUNT_ID,
      kind: 'invoice',
      recipient: RECIPIENT,
      provider_id: 'email-failed',
      status: 'failed',
      error_reason: 'reached_daily_quota',
      occurred_at: EVENT_TIME,
    }, { onConflict: 'provider_id' });
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });

  it('records email.suppressed and mirrors the provider suppression into the tagged workspace', async () => {
    const message = 'Resend suppressed this address because it is on the account-level suppression list.';
    const response = await POST(signedRequest(
      'email.suppressed',
      taggedData('email-suppressed', {
        suppressed: { type: 'OnAccountSuppressionList', message },
      }),
    ));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      provider_id: 'email-suppressed',
      status: 'suppressed',
      error_reason: message,
    }), { onConflict: 'provider_id' });
    expect(mocks.suppressEmail).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      RECIPIENT,
      'provider_suppressed',
    );
  });

  it('does not invent an account scope for an untagged provider suppression', async () => {
    const response = await POST(signedRequest('email.suppressed', {
      email_id: 'email-untagged-suppressed',
      to: [RECIPIENT],
      suppressed: { type: 'OnAccountSuppressionList' },
    }));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      account_id: null,
      kind: 'unknown',
      provider_id: 'email-untagged-suppressed',
      status: 'suppressed',
    }), { onConflict: 'provider_id' });
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('carried no account_id tag'));
  });

  it('returns a retryable 500 when account-scoped suppression persistence returns false', async () => {
    mocks.suppressEmail.mockResolvedValue(false);

    const response = await POST(signedRequest(
      'email.bounced',
      taggedData('email-bounced', {
        bounce: { type: 'Permanent', message: 'Mailbox does not exist' },
      }),
    ));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Webhook handler error.' });
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'resend',
      eventType: 'email.bounced',
      referenceId: 'email-bounced',
      errorMessage: expect.stringContaining('suppression persistence failed'),
    }));
  });

  it('returns a retryable 500 when account-scoped suppression persistence throws', async () => {
    mocks.suppressEmail.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(signedRequest(
      'email.complained',
      taggedData('email-complained'),
    ));

    expect(response.status).toBe(500);
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'resend',
      eventType: 'email.complained',
      referenceId: 'email-complained',
      errorMessage: 'database unavailable',
    }));
  });
});

describe('Resend webhook database ordering guard', () => {
  const migration = readFileSync(
    join(process.cwd(), 'migrations', '20260901010000_resend_webhook_outcome_projection.sql'),
    'utf8',
  ).toLowerCase();

  it('admits the official failed and suppressed outcomes', () => {
    expect(migration).toContain("'failed'");
    expect(migration).toContain("'suppressed'");
    expect(migration).toContain('email_events_status_check');
  });

  it('rejects older, lower-rank, and conflicting terminal updates in one step', () => {
    expect(migration).toContain('before update of status, occurred_at');
    expect(migration).toContain('new.occurred_at < old.occurred_at');
    expect(migration).toContain('v_new_rank < v_old_rank');
    expect(migration).toContain('v_new_rank = v_old_rank and new.status is distinct from old.status');
    expect(migration).toContain('return old;');
  });
});
