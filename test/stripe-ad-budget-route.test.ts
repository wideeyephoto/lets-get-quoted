import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/stripe/ad-budget/route';

import { requireOfficeContext, createAdminClient } from '@/lib/auth';
import { checkRateLimitStrict } from '@/lib/rate-limit';

import * as adBilling from '@/lib/ad-billing';
import * as adBillingShared from '@/lib/ad-billing-shared';
import * as googleAdsApi from '@/lib/google-ads-api';

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn(),
}));

vi.mock('@/lib/ad-billing', () => ({
  createAdBudgetCheckoutSession: vi.fn(),
  createAdBudgetBillingPortalSession: vi.fn(),
  pauseAdCampaign: vi.fn(),
  resumeAdCampaign: vi.fn(),
  cancelAdCampaign: vi.fn(),
  updateAccountAdBudgetState: vi.fn(),
}));

vi.mock('@/lib/ad-billing-shared', () => ({
  validateAdReturnUrl: vi.fn((url) => url || 'https://default.com'),
  sanitizeAdAlertPhone: vi.fn((phone) => phone || null),
  isManagedAdsCheckoutAllowed: vi.fn(() => true),
}));

vi.mock('@/lib/google-ads-api', () => ({
  resolveServingCustomerId: vi.fn(() => '123-456-7890'),
  isGoogleAdsConfigured: vi.fn(() => true),
}));

function createRequest(body: any) {
  return new NextRequest('http://localhost/api/stripe/ad-budget', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('Ad Budget Route', () => {
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { business_name: 'Test Business' } }),
          }),
        }),
      }),
    };

    vi.mocked(requireOfficeContext).mockResolvedValue({
      accountId: 'acc_123',
      supabase: mockSupabase,
    } as any);

    vi.mocked(checkRateLimitStrict).mockResolvedValue(true);
    vi.mocked(adBillingShared.isManagedAdsCheckoutAllowed).mockReturnValue(true);
    vi.mocked(googleAdsApi.isGoogleAdsConfigured).mockReturnValue(true);
  });

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkRateLimitStrict).mockResolvedValue(false);
    
    const req = createRequest({});
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(429);
    expect(data.error).toMatch(/Too many ad checkout requests/);
  });

  it('handles action: portal', async () => {
    vi.mocked(adBilling.createAdBudgetBillingPortalSession).mockResolvedValue('https://portal.test');
    
    const req = createRequest({ action: 'portal', returnUrl: 'https://return.test' });
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.url).toBe('https://portal.test');
    expect(adBilling.createAdBudgetBillingPortalSession).toHaveBeenCalledWith({
      accountId: 'acc_123',
      returnUrl: 'https://return.test',
    });
  });

  it('handles action: pause', async () => {
    vi.mocked(adBilling.pauseAdCampaign).mockResolvedValue({ success: true } as any);
    
    const req = createRequest({ action: 'pause' });
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(adBilling.pauseAdCampaign).toHaveBeenCalledWith(mockSupabase, 'acc_123');
  });

  it('handles action: resume', async () => {
    vi.mocked(adBilling.resumeAdCampaign).mockResolvedValue({ success: true } as any);
    
    const req = createRequest({ action: 'resume' });
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(adBilling.resumeAdCampaign).toHaveBeenCalledWith(mockSupabase, 'acc_123');
  });

  it('handles action: cancel', async () => {
    vi.mocked(adBilling.cancelAdCampaign).mockResolvedValue({ success: true } as any);
    
    const req = createRequest({ action: 'cancel', immediate: true });
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(adBilling.cancelAdCampaign).toHaveBeenCalledWith(mockSupabase, 'acc_123', true);
  });

  it('handles action: update_sms_alerts', async () => {
    vi.mocked(adBillingShared.sanitizeAdAlertPhone).mockReturnValue('+15551234567');
    
    const req = createRequest({ action: 'update_sms_alerts', smsAlertsEnabled: true, smsAlertPhone: '15551234567' });
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.smsAlertsEnabled).toBe(true);
    expect(data.smsAlertPhone).toBe('+15551234567');
    expect(adBilling.updateAccountAdBudgetState).toHaveBeenCalledWith(mockSupabase, 'acc_123', {
      smsAlertsEnabled: true,
      smsAlertPhone: '+15551234567',
    });
  });

  it('returns 403 if managed ads checkout is not allowed', async () => {
    vi.mocked(adBillingShared.isManagedAdsCheckoutAllowed).mockReturnValue(false);
    
    const req = createRequest({});
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(403);
    expect(data.error).toMatch(/Managed Ads checkout is currently in private preview/);
  });

  it('returns 503 in production if Google Ads is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(googleAdsApi.isGoogleAdsConfigured).mockReturnValue(false);
    
    const req = createRequest({});
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(503);
    expect(data.error).toMatch(/Managed Ads checkout is temporarily unavailable/);
    
    vi.unstubAllEnvs();
  });

  it('creates an ad budget checkout session successfully', async () => {
    vi.mocked(adBilling.createAdBudgetCheckoutSession).mockResolvedValue({
      url: 'https://checkout.test',
      sessionId: 'cs_123',
    });
    
    const req = createRequest({
      fundingModel: 'auto_refill_wallet',
      depositAmountDollars: '500',
      trade: 'Roofing',
      city: 'Seattle',
      radiusMiles: '20',
      smsAlertsEnabled: false,
    });
    
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.url).toBe('https://checkout.test');
    expect(data.sessionId).toBe('cs_123');
    
    expect(adBilling.createAdBudgetCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc_123',
        fundingModel: 'auto_refill_wallet',
        depositAmountDollars: 500,
        businessName: 'Test Business',
        trade: 'Roofing',
        city: 'Seattle',
        radiusMiles: 20,
        smsAlertsEnabled: false,
      })
    );
  });

  it('returns 400 when an unexpected error occurs', async () => {
    vi.mocked(adBilling.createAdBudgetCheckoutSession).mockRejectedValue(new Error('Validation error'));
    
    const req = createRequest({});
    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(400);
    expect(data.error).toBe('Validation error');
  });
});
