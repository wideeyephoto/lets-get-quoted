import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  getCurrentMembership: vi.fn(),
  checkRateLimitStrict: vi.fn(),
  verifyContinuationToken: vi.fn(),
  createContinuationToken: vi.fn(),
  getSiteContent: vi.fn(),
  estimatePostureBias: vi.fn(),
  applyEstimateGuardrails: vi.fn(),
  matchTradePreset: vi.fn(),
  qualifyQuickStop: vi.fn(),
  makeQuickStopVerdictToken: vi.fn(),
  sendVerificationCodeSms: vi.fn(),
  leadVerificationToken: vi.fn(),
  loadLeadPhoneVerificationReadiness: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
  getCurrentMembership: mocks.getCurrentMembership,
}));
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: mocks.checkRateLimitStrict,
  clientIpFrom: () => '127.0.0.1',
}));
vi.mock('@/lib/estimate-continuation-token', () => ({
  verifyContinuationToken: mocks.verifyContinuationToken,
  createContinuationToken: mocks.createContinuationToken,
}));
vi.mock('@/lib/site-content', () => ({
  getSiteContent: mocks.getSiteContent,
}));
vi.mock('@/lib/estimate-posture', () => ({
  estimatePostureBias: mocks.estimatePostureBias,
}));
vi.mock('@/lib/estimate-guardrails', () => ({
  applyEstimateGuardrails: mocks.applyEstimateGuardrails,
}));
vi.mock('@/lib/trade-intake-presets', () => ({
  matchTradePreset: mocks.matchTradePreset,
}));
vi.mock('@/lib/quick-stop-qualify', () => ({
  qualifyQuickStop: mocks.qualifyQuickStop,
  qualifyOptionsFromSettings: vi.fn().mockReturnValue({}),
  quickStopFollowUps: vi.fn().mockReturnValue([]),
}));
vi.mock('@/lib/quick-stop-verdict', () => ({
  makeQuickStopVerdictToken: mocks.makeQuickStopVerdictToken,
}));
vi.mock('@/lib/sms', () => ({
  sendVerificationCodeSms: mocks.sendVerificationCodeSms,
}));
vi.mock('@/lib/lead-verification', () => ({
  leadVerificationToken: mocks.leadVerificationToken,
}));
vi.mock('@/lib/lead-phone-verification-readiness', () => ({
  loadLeadPhoneVerificationReadiness: mocks.loadLeadPhoneVerificationReadiness,
}));

import { POST as classifyEstimateRoute } from '@/app/api/public/leads/classify-estimate/route';
import { POST as quickStopQualifyRoute } from '@/app/api/public/leads/quick-stop-qualify/route';
import { POST as verifyPhoneRoute } from '@/app/api/public/leads/verify-phone/route';
import { POST as aiSuggestRoute } from '@/app/api/lead-photos/ai-suggest/route';

describe('API Routes: Public Leads & Intake Wizard', () => {
  let fakeAdmin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    };
    mocks.createAdminClient.mockReturnValue(fakeAdmin);
    mocks.checkRateLimitStrict.mockResolvedValue(true);
    mocks.getSiteContent.mockReturnValue({
      serviceAreas: { cities: ['Austin', 'Round Rock'] },
      leadFilters: { exclusions: ['commercial'], phoneVerification: true },
    });
    mocks.estimatePostureBias.mockReturnValue({ multiplier: 1.0 });
  });

  describe('POST /api/public/leads/classify-estimate', () => {
    it('returns 429 when rate limit is exceeded', async () => {
      mocks.checkRateLimitStrict.mockResolvedValue(false);
      const req = new NextRequest('http://localhost:3010/api/public/leads/classify-estimate', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', description: 'Fix sink' }),
      });

      const res = await classifyEstimateRoute(req);
      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data).toEqual({ error: 'Too many requests.' });
    });

    it('returns 400 when description or siteId is missing', async () => {
      const req = new NextRequest('http://localhost:3010/api/public/leads/classify-estimate', {
        method: 'POST',
        body: JSON.stringify({ siteId: '' }),
      });

      const res = await classifyEstimateRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: 'Missing description.' });
    });

    it('returns 404 when site is not found or not published', async () => {
      const req = new NextRequest('http://localhost:3010/api/public/leads/classify-estimate', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', description: 'Replace water heater' }),
      });

      const res = await classifyEstimateRoute(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({ error: 'Site not found.' });
    });

    it('gracefully degrades to fallback when OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      fakeAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'sites'
            ? { id: 'site-1', account_id: 'acc-1', content: {}, service_area: 'Austin' }
            : { estimate_posture: 'lean', instant_book_enabled: true },
          error: null,
        }),
      }));

      const req = new NextRequest('http://localhost:3010/api/public/leads/classify-estimate', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', description: 'Replace toilet seal' }),
      });

      const res = await classifyEstimateRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ type: 'estimate' });
    });
  });

  describe('POST /api/public/leads/quick-stop-qualify', () => {
    it('returns 400 when issue is missing', async () => {
      const req = new NextRequest('http://localhost:3010/api/public/leads/quick-stop-qualify', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', issue: '' }),
      });

      const res = await quickStopQualifyRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: 'Describe the issue first.' });
    });

    it('returns disabled verdict when quick stop is disabled for account', async () => {
      fakeAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'sites'
            ? { id: 'site-1', account_id: 'acc-1', company_name: 'Plumbing Pro', published: true }
            : { quick_stop_enabled: false },
          error: null,
        }),
      }));

      const req = new NextRequest('http://localhost:3010/api/public/leads/quick-stop-qualify', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', issue: 'Emergency pipe burst' }),
      });

      const res = await quickStopQualifyRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ enabled: false, eligible: false });
    });

    it('qualifies quick stop request when enabled', async () => {
      fakeAdmin.from.mockImplementation((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === 'sites'
            ? { id: 'site-1', account_id: 'acc-1', company_name: 'Plumbing Pro', published: true }
            : { extra_stop_enabled: true, extra_stop_required_photos: 0 },
          error: null,
        }),
      }));

      mocks.qualifyQuickStop.mockResolvedValue({ eligible: true, tier: 'emergency', baseFeeDollars: 150 });
      mocks.makeQuickStopVerdictToken.mockReturnValue('verdict-token-123');

      const req = new NextRequest('http://localhost:3010/api/public/leads/quick-stop-qualify', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', issue: 'Emergency pipe burst' }),
      });

      const res = await quickStopQualifyRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.eligible).toBe(true);
      expect(data.verdictToken).toBe('verdict-token-123');
    });
  });

  describe('POST /api/public/leads/verify-phone', () => {
    it('returns 400 when phone number is missing or invalid', async () => {
      const req = new NextRequest('http://localhost:3010/api/public/leads/verify-phone', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', phone: '123' }),
      });

      const res = await verifyPhoneRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data).toEqual({ error: 'Enter a valid phone number first.' });
    });

    it('sends verification code SMS and returns HMAC token', async () => {
      fakeAdmin.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { id: 'site-1', account_id: 'acc-1', company_name: 'Super Plumbing', content: {} },
          error: null,
        }),
      }));

      mocks.loadLeadPhoneVerificationReadiness.mockResolvedValue({
        kind: 'ready',
        senderId: 'sender-1',
      });
      mocks.sendVerificationCodeSms.mockResolvedValue({ ok: true });
      mocks.leadVerificationToken.mockReturnValue('hmac-verification-token');

      const req = new NextRequest('http://localhost:3010/api/public/leads/verify-phone', {
        method: 'POST',
        body: JSON.stringify({ siteId: 'site-1', phone: '5125550100' }),
      });

      const res = await verifyPhoneRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        token: 'hmac-verification-token',
        expiresAt: expect.any(Number),
      });
      expect(mocks.sendVerificationCodeSms).toHaveBeenCalled();
    });
  });

  describe('POST /api/lead-photos/ai-suggest', () => {
    it('requires authenticated user and account membership', async () => {
      mocks.createSupabaseServerClient.mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      });

      const req = new NextRequest('http://localhost:3010/api/lead-photos/ai-suggest', {
        method: 'POST',
        body: JSON.stringify({ photoUrl: 'https://example.com/photo.jpg' }),
      });

      const res = await aiSuggestRoute(req);
      expect(res.status).toBe(401);
    });

    it('returns default suggestion message when GEMINI_API_KEY is not set', async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      mocks.createSupabaseServerClient.mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr-1' } } }) },
      });
      mocks.getCurrentMembership.mockResolvedValue({ accountId: 'acc-1' });

      const req = new NextRequest('http://localhost:3010/api/lead-photos/ai-suggest', {
        method: 'POST',
        body: JSON.stringify({ photoUrl: 'https://example.com/photo.jpg' }),
      });

      const res = await aiSuggestRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.summary).toMatch(/AI vision engine ready/);
    });
  });
});
