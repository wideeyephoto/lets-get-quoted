import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/public/leads/classify-estimate/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/site-content', () => ({
  getSiteContent: vi.fn(),
}));

vi.mock('@/lib/estimate-posture', () => ({
  estimatePostureBias: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn(),
  clientIpFrom: vi.fn(),
}));

vi.mock('@/lib/billing/ai-intake-usage', () => ({
  aiIntakeUsageGateEnabled: vi.fn(),
  allowAiIntakeProviderAttempt: vi.fn(),
  beginAiIntakeUsage: vi.fn(),
  commitAiIntakeUsage: vi.fn(),
  releaseAiIntakeUsage: vi.fn(),
}));

vi.mock('@/lib/ai-intake-thread', () => ({
  isAiIntakeFlowKind: vi.fn(),
}));

vi.mock('@/lib/estimate-guardrails', () => ({
  applyEstimateGuardrails: vi.fn(),
}));

vi.mock('@/lib/trade-intake-presets', () => ({
  matchTradePreset: vi.fn(),
}));

vi.mock('@/lib/estimate-continuation-token', () => ({
  createContinuationToken: vi.fn(),
  verifyContinuationToken: vi.fn(),
}));

describe('Public Leads Classify Estimate Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitStrictMock: any;
  let clientIpFromMock: any;
  let siteMock: any;
  let accountMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test_key';

    siteMock = vi.fn().mockResolvedValue({ data: { id: 'site_1', account_id: 'acct_1', content: {}, service_area: 'NY' } });
    accountMock = vi.fn().mockResolvedValue({ data: { estimate_posture: 'lean', instant_book_enabled: true } });

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

    const siteContentMock = await import('@/lib/site-content');
    siteContentMock.getSiteContent.mockReturnValue({ serviceAreas: { cities: ['NYC'] }, leadFilters: { exclusions: [] }, estimateRanges: { enabled: true } });

    const presetsMock = await import('@/lib/trade-intake-presets');
    presetsMock.matchTradePreset.mockReturnValue({ name: 'plumbing', equipmentSpecs: [], siteVisitTriggers: [] });

    const tokenMock = await import('@/lib/estimate-continuation-token');
    tokenMock.verifyContinuationToken.mockReturnValue(null);
    tokenMock.createContinuationToken.mockReturnValue('tok_123');

    const guardrailsMock = await import('@/lib/estimate-guardrails');
    guardrailsMock.applyEstimateGuardrails.mockReturnValue({ valid: true, minCents: 10000, maxCents: 20000 });

    const usageMock = await import('@/lib/billing/ai-intake-usage');
    usageMock.aiIntakeUsageGateEnabled.mockReturnValue(false);
    usageMock.beginAiIntakeUsage.mockResolvedValue({ kind: 'allowed' });
    usageMock.allowAiIntakeProviderAttempt.mockResolvedValue(true);
    usageMock.commitAiIntakeUsage.mockResolvedValue(true);

    global.fetch = vi.fn();
  });

  it('fails if rate limited on IP', async () => {
    checkRateLimitStrictMock.mockResolvedValue(false);
    const req = new NextRequest('http://localhost/api/public/leads/classify-estimate', { method: 'POST', body: JSON.stringify({}) });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it('fails if missing description and not continuing', async () => {
    const req = new NextRequest('http://localhost/api/public/leads/classify-estimate', { method: 'POST', body: JSON.stringify({ siteId: 'site_1' }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('fails if site not found', async () => {
    siteMock.mockResolvedValue({ data: null });
    const req = new NextRequest('http://localhost/api/public/leads/classify-estimate', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', description: 'desc' }) });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('returns estimate on valid openai response', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: '{"type":"estimate","min":100,"max":200,"basis":"fixing it","in_area":true,"excluded":false,"requires_site_visit":false}' })
    });
    const req = new NextRequest('http://localhost/api/public/leads/classify-estimate', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', description: 'desc' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('estimate');
    expect(data.min).toBe(100);
    expect(data.max).toBe(200);
  });

  it('returns question if openai returns question', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: '{"type":"question","question":"What color?"}' })
    });
    const req = new NextRequest('http://localhost/api/public/leads/classify-estimate', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', description: 'desc' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('question');
    expect(data.question).toBe('What color?');
  });

  it('returns fallback on fetch failure', async () => {
    (global.fetch as any).mockRejectedValue(new Error('fetch failed'));
    const req = new NextRequest('http://localhost/api/public/leads/classify-estimate', { method: 'POST', body: JSON.stringify({ siteId: 'site_1', description: 'desc' }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.type).toBe('classic_fallback');
    expect(data.min).toBeUndefined();
  });
});
