import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignedVoiceWebhook: vi.fn(),
  logWebhookFailure: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/voice/auth', () => ({
  verifySignedVoiceWebhook: mocks.verifySignedVoiceWebhook,
}));
vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: mocks.logWebhookFailure,
}));
vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));

function callback(fields: Record<string, string> = {}) {
  return new Request('https://app.letsgetquoted.com/api/voice/provider-status', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-signalwire-signature': 'signed',
    },
    body: new URLSearchParams({
      CallSid: 'call-123',
      CallStatus: 'completed',
      From: '+18105550100',
      To: '+18103192943',
      ...fields,
    }),
  });
}

describe('AI Voice provider number status callback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.verifySignedVoiceWebhook.mockReturnValue({ ok: true, provider: 'signalwire' });
    mocks.logWebhookFailure.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: [{ close_status: 'closed' }], error: null });
  });

  it('accepts a signed number-level CallStatus without treating it as DialCallStatus', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { POST } = await import('@/app/api/voice/provider-status/route');
    const request = callback();
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/xml');
    expect(mocks.verifySignedVoiceWebhook).toHaveBeenCalledWith(
      request,
      expect.stringContaining('CallStatus=completed'),
    );
    expect(info).toHaveBeenCalledWith('AI voice provider status received:', {
      callId: 'call-123', callStatus: 'completed', closeStatus: 'closed',
    });
    expect(mocks.rpc).toHaveBeenCalledWith('close_voice_staff_step_up_from_provider_status', {
      p_provider_call_id: 'call-123',
      p_call_status: 'completed',
    });
    expect(JSON.stringify(info.mock.calls)).not.toContain('+18105550100');
    expect(JSON.stringify(info.mock.calls)).not.toContain('+18103192943');
  });

  it.each(['completed', 'busy', 'failed', 'no-answer', 'canceled'])(
    'closes canonical call state for signed terminal status %s',
    async (status) => {
      mocks.rpc.mockResolvedValue({ data: [{ close_status: 'closed' }], error: null });
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const { POST } = await import('@/app/api/voice/provider-status/route');
      const response = await POST(callback({ CallStatus: status }));
      expect(response.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledWith('close_voice_staff_step_up_from_provider_status', {
        p_provider_call_id: 'call-123', p_call_status: status,
      });
      expect(JSON.stringify(info.mock.calls)).not.toContain('+18105550100');
    },
  );

  it('accepts a terminal-before-admission tombstone and a nonterminal no-op', async () => {
    const { POST } = await import('@/app/api/voice/provider-status/route');
    mocks.rpc.mockResolvedValueOnce({ data: [{ close_status: 'tombstoned' }], error: null });
    await expect(POST(callback())).resolves.toMatchObject({ status: 200 });
    mocks.rpc.mockResolvedValueOnce({ data: [{ close_status: 'nonterminal' }], error: null });
    await expect(POST(callback({ CallStatus: 'ringing' }))).resolves.toMatchObject({ status: 200 });
  });

  it('returns a retryable failure when canonical close persistence fails or is malformed', async () => {
    const { POST } = await import('@/app/api/voice/provider-status/route');
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect((await POST(callback())).status).toBe(500);
    mocks.rpc.mockResolvedValueOnce({ data: [{ close_status: 'surprise' }], error: null });
    expect((await POST(callback())).status).toBe(500);
    const logged = JSON.stringify(mocks.logWebhookFailure.mock.calls);
    expect(logged).not.toContain('+18105550100');
    expect(logged).not.toContain('+18103192943');
  });

  it('rejects a callback before parsing when SignalWire signature verification fails', async () => {
    mocks.verifySignedVoiceWebhook.mockReturnValue({ ok: false, reason: 'mismatch' });
    const { POST } = await import('@/app/api/voice/provider-status/route');
    const response = await POST(callback());

    expect(response.status).toBe(403);
    expect(mocks.logWebhookFailure).toHaveBeenCalledWith(expect.objectContaining({
      source: 'ai_voice',
      eventType: 'provider_status',
      errorMessage: expect.stringContaining('mismatch'),
    }));
  });

  it('rejects malformed signed lifecycle events without logging phone numbers', async () => {
    const { POST } = await import('@/app/api/voice/provider-status/route');
    const response = await POST(callback({ CallSid: '', CallStatus: '???' }));

    expect(response.status).toBe(400);
    const logged = JSON.stringify(mocks.logWebhookFailure.mock.calls);
    expect(logged).toContain('missing call identity or a valid status');
    expect(logged).not.toContain('+18105550100');
    expect(logged).not.toContain('+18103192943');
  });
});
