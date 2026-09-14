import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  upsert: vi.fn(),
  rpc: vi.fn(),
  intentLookup: vi.fn(),
  operationalLookup: vi.fn(),
  quarantine: vi.fn(),
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

it('binds platform callbacks before recording delivery history', async () => {
  mocks.rpc.mockResolvedValue({data:'confirmed',error:null});
  const response = await POST(signedRequest('email.delivered', taggedData('platform-provider', {
    tags:{kind:'auth_link',delivery_scope:'platform_transactional',platform_event_notice_id:'notice-id'},
  })));
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith('confirm_platform_event_notice',expect.objectContaining({p_id:'notice-id',p_provider_id:'platform-provider',p_recipient:RECIPIENT}));
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
});

it('rejects conflicting platform and tenant callback scope without projecting delivery', async () => {
  const response = await POST(signedRequest('email.delivered', taggedData('platform-provider', {
    tags:{kind:'auth_link',delivery_scope:'platform_transactional',platform_event_notice_id:'notice-id',account_id:ACCOUNT_ID},
  })));
  expect(response.status).toBe(500); expect(mocks.upsert).not.toHaveBeenCalled();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);

  mocks.upsert.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.intentLookup.mockResolvedValue({ data: { id: 'existing-intent' }, error: null });
  mocks.operationalLookup.mockResolvedValue({ data: null, error: null });
  mocks.quarantine.mockResolvedValue({ error: null });
  mocks.suppressEmail.mockResolvedValue(true);
  mocks.logWebhookFailure.mockResolvedValue(undefined);
  mocks.createAdminClient.mockReturnValue({
    rpc: mocks.rpc,
    from: vi.fn((table: string) => {
      if (table === 'operational_alert_deliveries') return { select: () => ({ eq: () => ({ maybeSingle: mocks.operationalLookup }) }) };
      if (table === 'document_email_sends') return { select: () => ({ eq: () => ({ maybeSingle: mocks.intentLookup }) }) };
      if (table === 'webhook_failures') return { insert: mocks.quarantine };
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
  const noticeId = '20000000-0000-4000-8000-000000000001';
  const domainData = (extra: Record<string, unknown> = {}) => taggedData('domain-provider', {
    tags: { kind: 'sending_domain_failed', account_id: ACCOUNT_ID, domain_failure_notice_id: noticeId }, ...extra,
  });
  it.each(['email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed','email.delivery_delayed'])('binds signed domain %s evidence before recording events', async type => {
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    expect((await POST(signedRequest(type, domainData()))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_email_domain_failure_notice', expect.objectContaining({
      p_id: noticeId, p_account_id: ACCOUNT_ID, p_recipient: RECIPIENT, p_provider_id: 'domain-provider',
      p_occurred_at: EVENT_TIME, p_event_id: 'msg_domain-provider',
    }));
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });
  it.each([{ data: 'conflict', error: null }, { data: null, error: { message: 'unavailable' } }])('rejects unverified domain binding without side effects', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it.each(['missing','unprepared'])('quarantines a %s notice without assigning delivery or suppression', async result => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(202);
    expect(mocks.quarantine).toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.quarantine.mock.calls)).not.toContain(RECIPIENT);
    mocks.quarantine.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
  });
  it.each([
    { to: [RECIPIENT, 'other@example.com'] }, { cc: ['other@example.com'] }, { bcc: ['other@example.com'] },
    { tags: { kind: 'invoice', account_id: ACCOUNT_ID, domain_failure_notice_id: noticeId } },
    { tags: { kind: 'sending_domain_failed', domain_failure_notice_id: noticeId } },
    { tags: { kind: 'sending_domain_failed', account_id: ACCOUNT_ID, domain_failure_notice_id: noticeId, delivery_scope: 'platform_transactional' } },
    { tags: [{ name: 'kind', value: 'sending_domain_failed' }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'domain_failure_notice_id', value: noticeId }] },
  ])('rejects ambiguous domain callback envelopes', async extra => {
    expect((await POST(signedRequest('email.delivered', domainData(extra)))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not touch domain evidence for an invalid signature', async () => {
    const request = signedRequest('email.delivered', domainData()); request.headers.set('svix-signature', 'v1,invalid');
    expect((await POST(request)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('accepts array tags and retries suppression after callback acceptance was already repaired', async () => {
    const data = domainData({ tags: [
      { name: 'kind', value: 'sending_domain_failed' }, { name: 'account_id', value: ACCOUNT_ID },
      { name: 'domain_failure_notice_id', value: noticeId },
    ] });
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    mocks.suppressEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(500);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledTimes(2);
    expect(mocks.suppressEmail).toHaveBeenLastCalledWith(expect.anything(), ACCOUNT_ID, RECIPIENT, 'complaint');
  });
  it('persists delivery blocks for tagged platform transactional sends and retries failed writes', async () => {
    const data=taggedData('platform-login',{tags:{kind:'magic_link',delivery_scope:'platform_transactional'}});
    expect((await POST(signedRequest('email.complained',data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledWith(expect.anything(),'platform',RECIPIENT,'complaint');
    mocks.suppressEmail.mockResolvedValue(false);
    expect((await POST(signedRequest('email.complained',data))).status).toBe(500);
  });
  it.each(['platform_campaign', 'platform_campaign_test'])('records signed %s delivery blocks in platform scope', async kind => {
    const data = taggedData('platform-complaint', { tags: { kind, account_id: ACCOUNT_ID } });
    expect((await POST(signedRequest('email.complained', data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledWith(expect.anything(), 'platform', RECIPIENT, 'complaint');
    mocks.suppressEmail.mockResolvedValue(false);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(500);
  });
  it('persists custom campaign delivery blocks without an account tag', async () => {
    const data = taggedData('custom-bounce', { tags: { kind: 'platform_campaign' }, bounce: { type: 'Permanent' } });
    expect((await POST(signedRequest('email.bounced', data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledWith(expect.anything(), 'platform', RECIPIENT, 'hard_bounce');
  });
  it('retains a late callback for a deleted document as a routing review', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.intentLookup.mockResolvedValue({ data: null, error: null });
    const data = taggedData('deleted-document', { tags: { kind: 'invoice', account_id: ACCOUNT_ID,
      document_send_id: '30000000-0000-4000-8000-000000000001', send_phase: 'primary' } });
    expect((await POST(signedRequest('email.complained', data))).status).toBe(202);
    expect(mocks.quarantine).toHaveBeenCalledWith(expect.objectContaining({ error_message: expect.stringContaining('DOCUMENT_SEND_QUARANTINE') }));
    expect(mocks.suppressEmail).toHaveBeenCalledWith(expect.anything(), ACCOUNT_ID, RECIPIENT, 'complaint');
    mocks.quarantine.mockResolvedValue({ error: { message: 'offline' } });
    expect((await POST(signedRequest('email.delivered', data))).status).toBe(500);
  });

  it.each(['client_quote', 'invoice'])('recovers %s acceptance with the signed saved phase', async kind => {
    const response = await POST(signedRequest('email.delivered', taggedData('document-provider', {
      tags: { kind, account_id: ACCOUNT_ID, document_send_id: '30000000-0000-4000-8000-000000000001', send_phase: 'fallback' },
    })));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_document_email_send', {
      p_id: '30000000-0000-4000-8000-000000000001', p_account_id: ACCOUNT_ID,
      p_recipient: RECIPIENT, p_provider_id: 'document-provider', p_phase: 'fallback',
    });
  });

  it.each([{ data: false, error: null }, { data: null, error: { message: 'offline' } }])('retries document callbacks until their binding is durably reconciled', async result => {
    mocks.rpc.mockResolvedValue(result);
    const response = await POST(signedRequest('email.sent', taggedData('document-retry', {
      tags: { kind: 'invoice', account_id: ACCOUNT_ID, document_send_id: '30000000-0000-4000-8000-000000000001', send_phase: 'primary' },
    })));
    expect(response.status).toBe(500);
  });

  it('recovers lifecycle acceptance using the signed intent, workspace and recipient', async () => {
    const response = await POST(signedRequest('email.delivered', taggedData('lost-response', {
      tags: { kind: 'contractor_lifecycle', account_id: ACCOUNT_ID, lifecycle_send_id: '20000000-0000-4000-8000-000000000001' },
    })));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_contractor_lifecycle_send', {
      p_id: '20000000-0000-4000-8000-000000000001', p_account_id: ACCOUNT_ID,
      p_recipient: RECIPIENT, p_provider_id: 'lost-response',
    });
  });

  it.each([{ data: false, error: null }, { data: null, error: { message: 'database unavailable' } }])('keeps a lifecycle callback retryable when correlation cannot be persisted', async result => {
    mocks.rpc.mockResolvedValue(result);
    const response = await POST(signedRequest('email.sent', taggedData('retry-callback', {
      tags: { kind: 'contractor_lifecycle', account_id: ACCOUNT_ID, lifecycle_send_id: '20000000-0000-4000-8000-000000000001' },
    })));
    expect(response.status).toBe(500);
  });

  it('durably quarantines a signed foreign-workspace complaint without assigning or suppressing another tenant', async () => {
    mocks.upsert.mockResolvedValue({ error: { code: '23503', message: 'violates foreign key constraint "email_events_account_id_fkey"' } });
    const response = await POST(signedRequest('email.complained', taggedData('foreign-workspace')));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ received: true, quarantined: true });
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.quarantine).toHaveBeenCalledWith(expect.objectContaining({
      reference_id: 'foreign-workspace', event_type: 'email.complained',
      error_message: expect.stringContaining('EMAIL_ACCOUNT_QUARANTINE'),
      payload_excerpt: expect.stringContaining(ACCOUNT_ID),
    }));
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });

  it('keeps retrying if the routing quarantine cannot be persisted', async () => {
    mocks.upsert.mockResolvedValue({ error: { code: '23503', message: 'violates foreign key constraint "email_events_account_id_fkey"' } });
    mocks.quarantine.mockResolvedValue({ error: { message: 'database unavailable' } });
    const response = await POST(signedRequest('email.delivered', taggedData('failed-quarantine')));
    expect(response.status).toBe(500);
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });

  it('does not acknowledge unrelated foreign-key or transient persistence errors', async () => {
    mocks.upsert.mockResolvedValue({ error: { code: '23503', message: 'violates another foreign key' } });
    const response = await POST(signedRequest('email.delivered', taggedData('unrelated-failure')));
    expect(response.status).toBe(500);
    expect(mocks.quarantine).not.toHaveBeenCalled();
  });

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

describe('operational callback recipient binding', () => {
  const providerId = 'ops-provider-id';
  function bound(payload: unknown = { to: [RECIPIENT] }) {
    mocks.operationalLookup.mockResolvedValue({ data: { provider_id: providerId, payload }, error: null });
  }
  it.each([
    ['email.complained', {}, 'complaint'],
    ['email.suppressed', {}, 'provider_suppressed'],
    ['email.bounced', { bounce: { type: 'Permanent' } }, 'hard_bounce'],
  ])('binds signed untagged %s to the saved provider ID and recipient', async (type, extra, reason) => {
    bound();
    const response = await POST(signedRequest(type as string, { email_id: providerId, to: [RECIPIENT], ...extra as object }));
    expect(response.status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledWith(expect.anything(), 'platform', RECIPIENT, reason);
  });
  it.each([{ to: ['other@example.com'] }, { to: [RECIPIENT], bcc: ['hidden@example.com'] },
    { to: [RECIPIENT], tags: [{ name: 'account_id', value: ACCOUNT_ID }] }])('refuses mismatched or tenant-scoped saved payloads', async payload => {
    bound(payload);
    expect((await POST(signedRequest('email.complained', { email_id: providerId, to: [RECIPIENT] }))).status).toBe(500);
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalled();
  });
  it('refuses multiple callback recipients rather than using only the first', async () => {
    bound();
    expect((await POST(signedRequest('email.complained', { email_id: providerId, to: [RECIPIENT, 'other@example.com'] }))).status).toBe(500);
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: 'offline' } }, { data: undefined, error: null }])('returns retryable failure when binding cannot be read', async result => {
    mocks.operationalLookup.mockResolvedValue(result);
    expect((await POST(signedRequest('email.complained', { email_id: providerId, to: [RECIPIENT] }))).status).toBe(500);
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it('does not infer scope from an unknown or not-yet-recorded provider ID', async () => {
    expect((await POST(signedRequest('email.complained', { email_id: providerId, to: [RECIPIENT] }))).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('record_operational_callback_evidence', {
      p_provider_id: providerId, p_recipient: RECIPIENT, p_reason: 'complaint',
      p_event_id: `msg_${providerId}`, p_occurred_at: EVENT_TIME,
    });
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.operationalLookup.mock.invocationCallOrder[0]);
  });
  it.each([{ data: false, error: null }, { data: null, error: { message: 'offline' } }])('does not acknowledge unretained early evidence', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect((await POST(signedRequest('email.bounced', { email_id: providerId, to: [RECIPIENT], bounce: { type: 'Permanent' } }))).status).toBe(500);
    expect(mocks.operationalLookup).not.toHaveBeenCalled();
    expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it('does not record ambiguous bounce classifications in durable block evidence', async () => {
    await POST(signedRequest('email.bounced', { email_id: providerId, to: [RECIPIENT], bounce: { type: 'Transient' } }));
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_operational_callback_evidence', expect.anything());
  });
  it('retries failed suppression persistence after a successful binding', async () => {
    bound(); mocks.suppressEmail.mockResolvedValue(false);
    expect((await POST(signedRequest('email.complained', { email_id: providerId, to: [RECIPIENT] }))).status).toBe(500);
  });
  it.each(['Transient', 'Undetermined'])('does not promote %s bounces or inspect the operations ledger', async type => {
    expect((await POST(signedRequest('email.bounced', { email_id: providerId, to: [RECIPIENT], bounce: { type } }))).status).toBe(200);
    expect(mocks.operationalLookup).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
});

describe('Website notice signed callback binding', () => {
  const noticeId = '20000000-0000-4000-8000-000000000001';
  const domainData = (extra: Record<string, unknown> = {}) => taggedData('domain-provider', {
    tags: { kind: 'custom_domain_connected', account_id: ACCOUNT_ID, website_domain_notice_id: noticeId }, ...extra,
  });
  it.each(['email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed','email.delivery_delayed'])('binds signed website %s evidence before recording events', async type => {
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    expect((await POST(signedRequest(type, domainData()))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_website_domain_connection_notice', expect.objectContaining({
      p_id: noticeId, p_account_id: ACCOUNT_ID, p_recipient: RECIPIENT, p_provider_id: 'domain-provider',
      p_occurred_at: EVENT_TIME, p_event_id: 'msg_domain-provider',
    }));
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });
  it.each([{ data: 'conflict', error: null }, { data: null, error: { message: 'unavailable' } }])('rejects unverified domain binding without side effects', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it.each(['missing','unprepared'])('quarantines a %s notice without assigning delivery or suppression', async result => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(202);
    expect(mocks.quarantine).toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.quarantine.mock.calls)).not.toContain(RECIPIENT);
    mocks.quarantine.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
  });
  it.each([
    { to: [RECIPIENT, 'other@example.com'] }, { cc: ['other@example.com'] }, { bcc: ['other@example.com'] },
    { tags: { kind: 'invoice', account_id: ACCOUNT_ID, website_domain_notice_id: noticeId } },
    { tags: { kind: 'custom_domain_connected', website_domain_notice_id: noticeId } },
    { tags: { kind: 'custom_domain_connected', account_id: ACCOUNT_ID, website_domain_notice_id: noticeId, delivery_scope: 'platform_transactional' } },
    { tags: [{ name: 'kind', value: 'custom_domain_connected' }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'website_domain_notice_id', value: noticeId }] },
  ])('rejects ambiguous website callback envelopes', async extra => {
    expect((await POST(signedRequest('email.delivered', domainData(extra)))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not touch domain evidence for an invalid signature', async () => {
    const request = signedRequest('email.delivered', domainData()); request.headers.set('svix-signature', 'v1,invalid');
    expect((await POST(request)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('accepts array tags and retries suppression after callback acceptance was already repaired', async () => {
    const data = domainData({ tags: [
      { name: 'kind', value: 'custom_domain_connected' }, { name: 'account_id', value: ACCOUNT_ID },
      { name: 'website_domain_notice_id', value: noticeId },
    ] });
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    mocks.suppressEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(500);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledTimes(2);
    expect(mocks.suppressEmail).toHaveBeenLastCalledWith(expect.anything(), ACCOUNT_ID, RECIPIENT, 'complaint');
  });
  it('rejects conflicting notice families', async () => {
    expect((await POST(signedRequest('email.delivered', domainData({ tags: { kind: 'custom_domain_connected', account_id: ACCOUNT_ID, website_domain_notice_id: noticeId, domain_failure_notice_id: noticeId } })))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe('Restoration notice signed callback binding', () => {
  const noticeId = '20000000-0000-4000-8000-000000000001';
  const domainData = (extra: Record<string, unknown> = {}) => taggedData('domain-provider', {
    tags: { kind: 'sending_domain_restored', account_id: ACCOUNT_ID, domain_restoration_notice_id: noticeId }, ...extra,
  });
  it.each(['email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed','email.delivery_delayed'])('binds signed website %s evidence before recording events', async type => {
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    expect((await POST(signedRequest(type, domainData()))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_email_domain_restoration_notice', expect.objectContaining({
      p_id: noticeId, p_account_id: ACCOUNT_ID, p_recipient: RECIPIENT, p_provider_id: 'domain-provider',
      p_occurred_at: EVENT_TIME, p_event_id: 'msg_domain-provider',
    }));
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });
  it.each([{ data: 'conflict', error: null }, { data: null, error: { message: 'unavailable' } }])('rejects unverified domain binding without side effects', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it.each(['missing','unprepared'])('quarantines a %s notice without assigning delivery or suppression', async result => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(202);
    expect(mocks.quarantine).toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.quarantine.mock.calls)).not.toContain(RECIPIENT);
    mocks.quarantine.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
  });
  it.each([
    { to: [RECIPIENT, 'other@example.com'] }, { cc: ['other@example.com'] }, { bcc: ['other@example.com'] },
    { tags: { kind: 'invoice', account_id: ACCOUNT_ID, domain_restoration_notice_id: noticeId } },
    { tags: { kind: 'sending_domain_restored', domain_restoration_notice_id: noticeId } },
    { tags: { kind: 'sending_domain_restored', account_id: ACCOUNT_ID, domain_restoration_notice_id: noticeId, delivery_scope: 'platform_transactional' } },
    { tags: [{ name: 'kind', value: 'sending_domain_restored' }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'domain_restoration_notice_id', value: noticeId }] },
  ])('rejects ambiguous website callback envelopes', async extra => {
    expect((await POST(signedRequest('email.delivered', domainData(extra)))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not touch domain evidence for an invalid signature', async () => {
    const request = signedRequest('email.delivered', domainData()); request.headers.set('svix-signature', 'v1,invalid');
    expect((await POST(request)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('accepts array tags and retries suppression after callback acceptance was already repaired', async () => {
    const data = domainData({ tags: [
      { name: 'kind', value: 'sending_domain_restored' }, { name: 'account_id', value: ACCOUNT_ID },
      { name: 'domain_restoration_notice_id', value: noticeId },
    ] });
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    mocks.suppressEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(500);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledTimes(2);
    expect(mocks.suppressEmail).toHaveBeenLastCalledWith(expect.anything(), ACCOUNT_ID, RECIPIENT, 'complaint');
  });
  it('rejects conflicting notice families', async () => {
    expect((await POST(signedRequest('email.delivered', domainData({ tags: { kind: 'sending_domain_restored', account_id: ACCOUNT_ID, domain_restoration_notice_id: noticeId, domain_failure_notice_id: noticeId } })))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe('Owner event signed callback binding', () => {
  const noticeId = '20000000-0000-4000-8000-000000000001';
  const domainData = (extra: Record<string, unknown> = {}) => taggedData('domain-provider', {
    tags: { kind: 'contractor_alert', account_id: ACCOUNT_ID, owner_event_notice_id: noticeId }, ...extra,
  });
  it.each(['email.sent','email.delivered','email.bounced','email.complained','email.failed','email.suppressed','email.delivery_delayed'])('binds signed website %s evidence before recording events', async type => {
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    expect((await POST(signedRequest(type, domainData()))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_owner_event_notice', expect.objectContaining({
      p_id: noticeId, p_account_id: ACCOUNT_ID, p_recipient: RECIPIENT, p_provider_id: 'domain-provider',
      p_occurred_at: EVENT_TIME, p_event_id: 'msg_domain-provider',
    }));
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.upsert.mock.invocationCallOrder[0]);
  });
  it.each([{ data: 'conflict', error: null }, { data: null, error: { message: 'unavailable' } }])('rejects unverified domain binding without side effects', async result => {
    mocks.rpc.mockResolvedValue(result);
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
  });
  it.each(['missing','unprepared'])('quarantines a %s notice without assigning delivery or suppression', async result => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(202);
    expect(mocks.quarantine).toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.suppressEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.quarantine.mock.calls)).not.toContain(RECIPIENT);
    mocks.quarantine.mockResolvedValue({ error: { message: 'unavailable' } });
    expect((await POST(signedRequest('email.complained', domainData()))).status).toBe(500);
  });
  it.each([
    { to: [RECIPIENT, 'other@example.com'] }, { cc: ['other@example.com'] }, { bcc: ['other@example.com'] },
    { tags: { kind: 'invoice', account_id: ACCOUNT_ID, owner_event_notice_id: noticeId } },
    { tags: { kind: 'contractor_alert', owner_event_notice_id: noticeId } },
    { tags: { kind: 'contractor_alert', account_id: ACCOUNT_ID, owner_event_notice_id: noticeId, delivery_scope: 'platform_transactional' } },
    { tags: [{ name: 'kind', value: 'contractor_alert' }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'account_id', value: ACCOUNT_ID }, { name: 'owner_event_notice_id', value: noticeId }] },
  ])('rejects ambiguous website callback envelopes', async extra => {
    expect((await POST(signedRequest('email.delivered', domainData(extra)))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('does not touch domain evidence for an invalid signature', async () => {
    const request = signedRequest('email.delivered', domainData()); request.headers.set('svix-signature', 'v1,invalid');
    expect((await POST(request)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('accepts array tags and retries suppression after callback acceptance was already repaired', async () => {
    const data = domainData({ tags: [
      { name: 'kind', value: 'contractor_alert' }, { name: 'account_id', value: ACCOUNT_ID },
      { name: 'owner_event_notice_id', value: noticeId },
    ] });
    mocks.rpc.mockResolvedValue({ data: 'confirmed', error: null });
    mocks.suppressEmail.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(500);
    expect((await POST(signedRequest('email.complained', data))).status).toBe(200);
    expect(mocks.suppressEmail).toHaveBeenCalledTimes(2);
    expect(mocks.suppressEmail).toHaveBeenLastCalledWith(expect.anything(), ACCOUNT_ID, RECIPIENT, 'complaint');
  });
  it('rejects conflicting notice families', async () => {
    expect((await POST(signedRequest('email.delivered', domainData({ tags: { kind: 'contractor_alert', account_id: ACCOUNT_ID, owner_event_notice_id: noticeId, domain_failure_notice_id: noticeId } })))).status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
