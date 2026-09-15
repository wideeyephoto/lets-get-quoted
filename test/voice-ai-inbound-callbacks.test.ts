import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  plan: vi.fn(), persist: vi.fn(), verify: vi.fn(), readiness: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: vi.fn() }));
vi.mock('@/lib/voice/admission', () => ({ planInboundCall: mocks.plan }));
vi.mock('@/lib/voice/fallback-context', () => ({ recordFallbackVoiceCall: mocks.persist }));
vi.mock('@/lib/voice/route-readiness', () => ({ recordVoiceRouteVerification: mocks.readiness }));
vi.mock('@/lib/voice/auth', () => ({
  verifySignedVoiceWebhook: mocks.verify,
  signalWireVoiceScope: () => ({ projectId: 'test-project', spaceId: 'test-space' }),
  voiceReceiptAuthorization: () => ({ scheme: 'basic', username: 'test', password: 'fixture' }),
  signVoiceToolToken: () => null,
}));

import { POST } from '@/app/api/voice/ai/route';

function inbound() {
  return new Request('https://lgq.test/api/voice/ai', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ call: { call_id: 'inbound-call', to: '+18105550100', from: '+18105550199' } }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://lgq.test');
  vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'lgq.test');
  mocks.verify.mockReturnValue({ ok: true, provider: 'signalwire' });
  mocks.persist.mockResolvedValue(undefined);
  mocks.readiness.mockResolvedValue(true);
  mocks.plan.mockResolvedValue({ accountId: 'workspace-1', declineReason: 'paused',
    plan: { kind: 'voicemail', message: 'Leave a message.' } });
});
afterEach(() => vi.unstubAllEnvs());

describe('inbound recovery callback setup', () => {
  it('persists fallback context before returning a query-free recording callback', async () => {
    const response = await POST(inbound());
    const body = await response.json();
    expect(mocks.persist).toHaveBeenCalledWith({}, 'workspace-1', {
      providerCallId: 'inbound-call', fromNumber: '+18105550199', toNumber: '+18105550100',
    }, 'voicemail');
    expect(body.sections.main.find((step: Record<string, unknown>) => step.record).record.status_url)
      .toBe('https://lgq.test/api/voice/recording-status');
    const options = mocks.plan.mock.calls[0][2];
    expect(options.forwardActionUrl('workspace-1')).toBe('https://lgq.test/api/voice/ai/status');
    expect(options.recordingStatusUrl('workspace-1')).toBe('https://lgq.test/api/voice/recording-status');
  });

  it('does not start a recording whose workspace context failed to persist', async () => {
    mocks.persist.mockRejectedValueOnce(new Error('Fallback call context persistence failed'));
    const response = await POST(inbound());
    const body = await response.json();
    expect(body.sections.main.some((step: Record<string, unknown>) => step.record || step.connect || step.ai)).toBe(false);
    expect(body.sections.main.some((step: Record<string, unknown>) => step.play)).toBe(true);
    expect(body.sections.main[0]).toEqual({ answer: { max_duration: 598 } });
    expect(body.sections.main.at(-1)).toEqual({ hangup: {} });
  });

  it('bounds the apology call when admission fails before a plan exists', async () => {
    mocks.plan.mockRejectedValueOnce(new Error('Admission dependency unavailable'));
    const response = await POST(inbound());
    const { sections: { main } } = await response.json();
    expect(response.status).toBe(200);
    expect(main).toEqual([
      { answer: { max_duration: 598 } },
      { play: { url: expect.stringContaining('say: ') } },
      { hangup: {} },
    ]);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it('rejects forged inbound calls before persisting context', async () => {
    mocks.verify.mockReturnValueOnce({ ok: false, reason: 'mismatch' });
    const response = await POST(inbound());
    expect(response.status).toBe(403);
    expect((await response.json()).sections.main).toEqual([{ hangup: {} }]);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.plan).not.toHaveBeenCalled();
  });
});
