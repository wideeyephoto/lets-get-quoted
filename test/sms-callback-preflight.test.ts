import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSendRequest, sendProviderMessage, smsProviderConfig, smsProviderSummary } from '@/lib/sms-provider';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(), commit: vi.fn(), release: vi.fn(), admin: vi.fn(),
}));
vi.mock('@/lib/circuit-breaker', () => ({ checkCircuitBreaker: vi.fn().mockResolvedValue({ blocked: false }) }));
vi.mock('@/lib/auth', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/billing/text-credit-usage', () => ({
  textCreditMode: () => 'enforce',
  beginTextCreditUsage: mocks.begin,
  commitTextCreditUsage: mocks.commit,
  releaseTextCreditUsage: mocks.release,
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const [name, value] of Object.entries({
    VITEST: '', NODE_ENV: 'production', VERCEL_ENV: 'production',
    LGQ_DISABLE_OUTBOUND_SMS: '', LGQ_SMS_PROVIDER: 'signalwire',
    SIGNALWIRE_SPACE_URL: 'example.signalwire.com', SIGNALWIRE_PROJECT_ID: 'test-project',
    SIGNALWIRE_API_TOKEN: 'test-token', SIGNALWIRE_SIGNING_KEY: 'test-signing-key',
    SIGNALWIRE_FROM_NUMBER: '+15550002222', SIGNALWIRE_NUMBER_GROUP_ID: '',
    SIGNALWIRE_WEBHOOK_ORIGIN: '', PROVIDER_CALLBACK_ORIGIN: '',
    NEXT_PUBLIC_APP_URL: 'https://letsgetquoted.com', NEXT_PUBLIC_ROOT_DOMAIN: 'letsgetquoted.com',
  })) vi.stubEnv(name, value);
  // Undefined override values let the normal public app origin be considered.
  vi.stubEnv('SIGNALWIRE_WEBHOOK_ORIGIN', undefined);
  vi.stubEnv('PROVIDER_CALLBACK_ORIGIN', undefined);
  mocks.admin.mockReturnValue({});
  mocks.begin.mockResolvedValue({ outcome: 'allowed', lease: { reservationId: 'reservation-1', finalizationKey: 'finalize-1' } });
  mocks.commit.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: 'provider-accepted-1' }), { status: 201 })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const context = { accountId: '11111111-1111-4111-8111-111111111111', category: 'customer_message' } as const;

describe('production SMS callback preflight', () => {
  it.each(['+447700900123', '+12425550140', '+17875550140', '+15555550140'])
    ('blocks an unsupported direct or legacy queued destination before billing: %s', async (phone) => {
      const beforeRequest = vi.fn();
      await expect(sendProviderMessage(phone, 'Test', context, { beforeRequest }))
        .rejects.toThrow('SMS destinations are limited to supported US and Canada numbers.');
      expect(fetch).not.toHaveBeenCalled();
      expect(beforeRequest).not.toHaveBeenCalled();
      expect(mocks.begin).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    });

  it.each(['', 'http://localhost:3010', 'not a URL', 'https://attacker.example',
    'https://user:secret@letsgetquoted.com', 'https://letsgetquoted.com/unexpected',
    'https://letsgetquoted.com?next=elsewhere', 'https://letsgetquoted.com#fragment',
  ])('refuses an unusable callback origin before credits or request state: %s', async (origin) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', origin);
    expect(smsProviderSummary().statusCallbacksEnabled).toBe(false);
    const beforeRequest = vi.fn();
    await expect(sendProviderMessage('+12485550140', 'A test notification.', context, { beforeRequest }))
      .rejects.toThrow('SMS delivery tracking is not configured');
    expect(fetch).not.toHaveBeenCalled();
    expect(beforeRequest).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it.each(['twilio', 'signalwire'] as const)('refuses request construction for %s without a trusted callback', (provider) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(() => buildSendRequest({ ...smsProviderConfig()!, id: provider }, '+12485550140', 'Test'))
      .toThrow('SMS delivery tracking is not configured');
  });

  it('fails closed on an invalid explicit override even if the public URL is valid', async () => {
    vi.stubEnv('PROVIDER_CALLBACK_ORIGIN', 'https://attacker.example');
    await expect(sendProviderMessage('+12485550140', 'Test', context)).rejects.toThrow('SMS delivery tracking is not configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends with the explicit trusted callback and finalizes credits once', async () => {
    vi.stubEnv('SIGNALWIRE_WEBHOOK_ORIGIN', 'https://app.letsgetquoted.com');
    expect(smsProviderSummary().statusCallbacksEnabled).toBe(true);
    const beforeRequest = vi.fn();
    await expect(sendProviderMessage('+12485550140', 'Test', context, { beforeRequest })).resolves.toBe('provider-accepted-1');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect((request!.body as URLSearchParams).get('StatusCallback')).toBe('https://app.letsgetquoted.com/api/sms/status');
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
