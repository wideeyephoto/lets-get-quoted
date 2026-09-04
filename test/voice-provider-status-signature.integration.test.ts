import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn(async () => ({ data: [{ close_status: 'closed' }], error: null }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@/lib/webhook-failures', () => ({ logWebhookFailure: vi.fn() }));

afterEach(() => vi.unstubAllEnvs());

describe('AI Voice provider status signed boundary', () => {
  it('accepts a real SignalWire signature for the exact allowlisted callback URL', async () => {
    const url = 'https://lgq.test/api/voice/provider-status';
    const body = new URLSearchParams({
      CallSid: 'call-123',
      CallStatus: 'completed',
      From: '+18105550100',
      To: '+18103208001',
    }).toString();
    const signingKey = 'signalwire-status-signing-key';

    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://lgq.test');
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'lgq.test');
    vi.stubEnv('SIGNALWIRE_SIGNING_KEY', signingKey);

    const signature = createHmac('sha1', signingKey)
      .update(url + body, 'utf8')
      .digest('hex');
    const request = new Request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-signalwire-signature': signature,
      },
      body,
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { POST } = await import('@/app/api/voice/provider-status/route');

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/xml');
    expect(await response.text()).toContain('<Response');
    expect(info).toHaveBeenCalledWith('AI voice provider status received:', {
      callId: 'call-123', callStatus: 'completed', closeStatus: 'closed',
    });
  });
});
