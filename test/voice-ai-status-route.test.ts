import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  verifySignedVoiceWebhook: vi.fn(),
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/voice/auth', () => ({
  verifySignedVoiceWebhook: mocks.verifySignedVoiceWebhook,
}));
vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: mocks.logWebhookFailure,
}));

const ACCOUNT = '22222222-2222-4222-8222-222222222222';

function callback(fields: Record<string, string> = {}) {
  return new Request(`https://lgq.test/api/voice/ai/status?account=${ACCOUNT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-signalwire-signature': 'signed',
    },
    body: new URLSearchParams({
      DialCallStatus: 'no-answer',
      From: '+18105550199',
      CallSid: 'call-sw-999',
      ...fields,
    }),
  });
}

describe('AI voice fallback status callback', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createAdminClient.mockReset();
    mocks.verifySignedVoiceWebhook.mockReset().mockReturnValue({
      ok: true, provider: 'signalwire',
    });
    mocks.logWebhookFailure.mockReset().mockResolvedValue(undefined);
  });

  it('acknowledges and ingests missed call when dial status is no-answer', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ingest_disposition: 'accepted' }], error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc });
    const { POST } = await import('@/app/api/voice/ai/status/route');
    const response = await POST(callback());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('ingest_sms_missed_call', expect.objectContaining({
      p_provider: 'signalwire',
      p_provider_call_id: 'call-sw-999',
      p_account_id: ACCOUNT,
      p_phone_number: '+18105550199',
      p_dial_status: 'no-answer',
      p_body_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it('ingests missed call for busy, failed, and canceled dial statuses', async () => {
    for (const dialStatus of ['busy', 'failed', 'canceled']) {
      const rpc = vi.fn().mockResolvedValue({
        data: [{ ingest_disposition: 'accepted' }], error: null,
      });
      mocks.createAdminClient.mockReturnValue({ rpc });
      const { POST } = await import('@/app/api/voice/ai/status/route');
      const response = await POST(callback({ DialCallStatus: dialStatus }));

      expect(response.status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('ingest_sms_missed_call', expect.objectContaining({
        p_dial_status: dialStatus,
      }));
    }
  });

  it('keeps completed callbacks as inert acknowledgements without RPC call', async () => {
    const { POST } = await import('@/app/api/voice/ai/status/route');
    const response = await POST(callback({ DialCallStatus: 'completed' }));
    expect(response.status).toBe(200);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 400 when missing required call identity fields on missed call', async () => {
    mocks.createAdminClient.mockReturnValue({ rpc: vi.fn() });
    const { POST } = await import('@/app/api/voice/ai/status/route');
    const response = await POST(callback({ CallSid: '' }));
    expect(response.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'ai_voice',
      errorMessage: expect.stringContaining('missing account, caller, or call identity'),
    }));
  });

  it('returns 500 when RPC ingest fails so provider can retry storage faults', async () => {
    mocks.createAdminClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'db deadlock' } }),
    });
    const { POST } = await import('@/app/api/voice/ai/status/route');
    const response = await POST(callback());
    expect(response.status).toBe(500);
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'ai_voice',
      referenceId: 'call-sw-999',
    }));
  });

  it('rejects with 403 on invalid signature', async () => {
    mocks.verifySignedVoiceWebhook.mockReturnValue({ ok: false, reason: 'bad signature' });
    const { POST } = await import('@/app/api/voice/ai/status/route');
    const response = await POST(callback());
    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('acknowledges and ingests missed call when receiving SWML JSON callback', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ingest_disposition: 'accepted' }], error: null,
    });
    mocks.createAdminClient.mockReturnValue({ rpc });
    const { POST } = await import('@/app/api/voice/ai/status/route');

    const jsonReq = new Request(`https://lgq.test/api/voice/ai/status?account=${ACCOUNT}&from=%2B18105550199&call_id=call-sw-swml-1`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signalwire-signature': 'signed',
      },
      body: JSON.stringify({
        event_type: 'calling.call.state',
        params: {
          call_id: 'call-sw-swml-1',
          call_state: 'ended',
        },
      }),
    });

    const response = await POST(jsonReq);
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('ingest_sms_missed_call', expect.objectContaining({
      p_provider: 'signalwire',
      p_provider_call_id: 'call-sw-swml-1',
      p_account_id: ACCOUNT,
      p_phone_number: '+18105550199',
      p_dial_status: 'ended',
    }));
  });
});
