import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  hasSignatureHeader: vi.fn(),
  validateWebhookSignature: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/sms-provider', () => ({
  hasSignatureHeader: mocks.hasSignatureHeader,
  validateWebhookSignature: mocks.validateWebhookSignature,
}));
vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: mocks.logWebhookFailure,
}));

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function callback(fields: Record<string, string> = {}) {
  return new Request(`https://lgq.test/api/sms/voice/status?account=${ACCOUNT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-signalwire-signature': 'signed',
    },
    body: new URLSearchParams({
      DialCallStatus: 'no-answer',
      From: '+12485550101',
      CallSid: 'call-123',
      ...fields,
    }),
  });
}

describe('missed-call status callback durability', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createAdminClient.mockReset();
    mocks.hasSignatureHeader.mockReset().mockReturnValue(true);
    mocks.validateWebhookSignature.mockReset().mockReturnValue({
      ok: true, provider: 'signalwire',
    });
    mocks.logWebhookFailure.mockReset().mockResolvedValue(undefined);
  });

  it('acknowledges only after the atomic ingest RPC accepts the call identity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ingest_disposition: 'accepted' }], error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc });
    const { POST } = await import('@/app/api/sms/voice/status/route');
    const response = await POST(callback());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('ingest_sms_missed_call', expect.objectContaining({
      p_provider: 'signalwire',
      p_provider_call_id: 'call-123',
      p_account_id: ACCOUNT,
      p_phone_number: '+12485550101',
      p_dial_status: 'no-answer',
      p_body_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it('returns retryable failure when atomic persistence fails', async () => {
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '40001' } }),
    });
    const { POST } = await import('@/app/api/sms/voice/status/route');
    const response = await POST(callback());
    expect(response.status).toBe(500);
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'sms_voice', referenceId: 'call-123',
    }));
  });

  it('does not accept a missed callback without its stable provider call id', async () => {
    mocks.createAdminClient.mockReturnValue({ rpc: vi.fn() });
    const { POST } = await import('@/app/api/sms/voice/status/route');
    const response = await POST(callback({ CallSid: '' }));
    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('keeps non-missed terminal callbacks as inert acknowledgements', async () => {
    const { POST } = await import('@/app/api/sms/voice/status/route');
    const response = await POST(callback({ DialCallStatus: 'completed' }));
    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
