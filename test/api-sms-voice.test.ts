import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/sms/voice/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/sms-provider', () => ({
  hasSignatureHeader: vi.fn(),
  validateWebhookSignature: vi.fn(),
}));

vi.mock('@/lib/webhook-failures', () => ({
  logWebhookFailure: vi.fn(),
}));

vi.mock('@/lib/app-origin', () => ({
  trustedProviderCallbackOrigin: vi.fn(),
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: vi.fn(),
}));

describe('SMS Voice Route', () => {
  let createAdminClientMock: any;
  let hasSignatureHeaderMock: any;
  let validateWebhookSignatureMock: any;
  let logWebhookFailureMock: any;
  let trustedProviderCallbackOriginMock: any;
  let normalizeUsPhoneMock: any;
  let accountMock: any;
  let voiceSettingsMock: any;
  let updateMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    accountMock = vi.fn().mockResolvedValue({ data: { id: 'acct_1', call_forward_number: '+123', call_tracking_verified_at: null } });
    voiceSettingsMock = vi.fn().mockResolvedValue({ data: { transfer_number: '+456' } });
    updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({}) }) });

    const adminMock = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: accountMock }) }),
            update: updateMock,
          };
        }
        if (table === 'voice_settings') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: voiceSettingsMock }) }),
          };
        }
        return { select: vi.fn() };
      })
    };

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue(adminMock);

    hasSignatureHeaderMock = (await import('@/lib/sms-provider')).hasSignatureHeader;
    hasSignatureHeaderMock.mockReturnValue(true);

    validateWebhookSignatureMock = (await import('@/lib/sms-provider')).validateWebhookSignature;
    validateWebhookSignatureMock.mockReturnValue({ ok: true });

    logWebhookFailureMock = (await import('@/lib/webhook-failures')).logWebhookFailure;
    logWebhookFailureMock.mockResolvedValue(undefined);

    trustedProviderCallbackOriginMock = (await import('@/lib/app-origin')).trustedProviderCallbackOrigin;
    trustedProviderCallbackOriginMock.mockReturnValue('https://example.com');

    normalizeUsPhoneMock = (await import('@/lib/phone')).normalizeUsPhone;
    normalizeUsPhoneMock.mockReturnValue('+100');
  });

  const makeReq = () => {
    const formData = new FormData();
    formData.append('To', '+100');
    formData.append('CallSid', 'sid_1');
    return new NextRequest('https://example.com/api/sms/voice', { method: 'POST', body: formData });
  };

  it('fails if no signature header', async () => {
    hasSignatureHeaderMock.mockReturnValue(false);
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(logWebhookFailureMock).toHaveBeenCalled();
  });

  it('fails if bad signature', async () => {
    validateWebhookSignatureMock.mockReturnValue({ ok: false, reason: 'bad' });
    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    expect(logWebhookFailureMock).toHaveBeenCalled();
  });

  it('handles account not found', async () => {
    accountMock.mockResolvedValue({ data: null });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<Say voice="man">Sorry, we can&apos;t take your call right now.');
  });

  it('handles missing forward number in both places', async () => {
    accountMock.mockResolvedValue({ data: { id: 'acct_1' } });
    voiceSettingsMock.mockResolvedValue({ data: null });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<Say voice="man">Sorry, we can&apos;t take your call right now.');
  });

  it('backs fills forward number if missing from account but found in voice_settings', async () => {
    accountMock.mockResolvedValue({ data: { id: 'acct_1', call_forward_number: null, call_tracking_verified_at: '2023-01-01' } });
    voiceSettingsMock.mockResolvedValue({ data: { transfer_number: '+456' } });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<Number>+456</Number>');
    expect(updateMock).toHaveBeenCalledWith({ call_forward_number: '+456' });
  });

  it('updates verification if missing', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<Number>+123</Number>');
    expect(updateMock).toHaveBeenCalledWith({ call_tracking_verified_at: expect.any(String) });
  });

  it('handles bad path', async () => {
    const formData = new FormData();
    formData.append('To', '+100');
    const req = new NextRequest('https://example.com/api/bad/path', { method: 'POST', body: formData });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<Say voice="man">Sorry, we can&apos;t take your call right now.');
    expect(logWebhookFailureMock).toHaveBeenCalled();
  });

  it('returns valid dial xml', async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('action="https://example.com/api/sms/voice/status?account=acct_1"');
    expect(xml).toContain('<Number>+123</Number>');
  });
});
