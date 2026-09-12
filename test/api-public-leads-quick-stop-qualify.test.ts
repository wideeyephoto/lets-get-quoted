import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/public/leads/quick-stop-qualify/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/quick-stop', () => ({
  quickStopSettingsFromAccount: vi.fn(),
  QUICK_STOP_SETTINGS_COLUMNS: 'some_cols',
}));

vi.mock('@/lib/quick-stop-qualify', () => ({
  qualifyQuickStop: vi.fn(),
  qualifyOptionsFromSettings: vi.fn(),
  quickStopFollowUps: vi.fn(),
}));

vi.mock('@/lib/quick-stop-verdict', () => ({
  makeQuickStopVerdictToken: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn(),
  clientIpFrom: vi.fn(),
}));

describe('Public Leads Quick Stop Qualify Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitStrictMock: any;
  let clientIpFromMock: any;
  let siteMock: any;
  let accountMock: any;
  let quickStopSettingsFromAccountMock: any;
  let qualifyQuickStopMock: any;
  let quickStopFollowUpsMock: any;
  let makeQuickStopVerdictTokenMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    siteMock = vi.fn().mockResolvedValue({ data: { id: 'site_1', account_id: 'acct_1', company_name: 'Acme', service_area: 'NY' } });
    accountMock = vi.fn().mockResolvedValue({ data: {} });

    const adminMock = {
      from: vi.fn((table: string) => {
        if (table === 'sites') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: siteMock }) }) }) };
        if (table === 'accounts') return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: accountMock }) }) };
        return { select: vi.fn() };
      })
    };

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue(adminMock);

    checkRateLimitStrictMock = (await import('@/lib/rate-limit')).checkRateLimitStrict;
    checkRateLimitStrictMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');

    quickStopSettingsFromAccountMock = (await import('@/lib/quick-stop')).quickStopSettingsFromAccount;
    quickStopSettingsFromAccountMock.mockReturnValue({ enabled: true, requiredPhotos: 0 });

    qualifyQuickStopMock = (await import('@/lib/quick-stop-qualify')).qualifyQuickStop;
    qualifyQuickStopMock.mockResolvedValue({ eligible: true });

    (await import('@/lib/quick-stop-qualify')).qualifyOptionsFromSettings.mockReturnValue({});

    quickStopFollowUpsMock = (await import('@/lib/quick-stop-qualify')).quickStopFollowUps;
    quickStopFollowUpsMock.mockReturnValue([]);

    makeQuickStopVerdictTokenMock = (await import('@/lib/quick-stop-verdict')).makeQuickStopVerdictToken;
    makeQuickStopVerdictTokenMock.mockReturnValue('verdict_123');
  });

  it('fails if rate limited', async () => {
    checkRateLimitStrictMock.mockResolvedValue(false);
    const req = new NextRequest('http://localhost/api/public/leads/quick-stop-qualify', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('fails if missing issue', async () => {
    const req = new NextRequest('http://localhost/api/public/leads/quick-stop-qualify', { method: 'POST', body: JSON.stringify({ siteId: 'site_1' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails if site not found', async () => {
    siteMock.mockResolvedValue({ data: null });
    const req = new NextRequest('http://localhost/api/public/leads/quick-stop-qualify', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', issue: 'broken pipe' }) });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns not enabled if settings disabled', async () => {
    quickStopSettingsFromAccountMock.mockReturnValue({ enabled: false });
    const req = new NextRequest('http://localhost/api/public/leads/quick-stop-qualify', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', issue: 'broken pipe' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enabled).toBe(false);
  });

  it('enforces required photos', async () => {
    quickStopSettingsFromAccountMock.mockReturnValue({ enabled: true, requiredPhotos: 2 });
    const req = new NextRequest('http://localhost/api/public/leads/quick-stop-qualify', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', issue: 'broken pipe', photoCount: 1 }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.needsPhotos).toBe(true);
    expect(data.eligible).toBe(false);
  });

  it('qualifies quick stop', async () => {
    const req = new NextRequest('http://localhost/api/public/leads/quick-stop-qualify', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', issue: 'broken pipe' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.enabled).toBe(true);
    expect(data.eligible).toBe(true);
    expect(data.verdictToken).toBe('verdict_123');
  });
});
