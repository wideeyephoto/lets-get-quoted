import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/public/leads/route';
import { HONEYPOT_FIELD } from '@/components/honeypot-field';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      limit: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      then: vi.fn(),
    })),
  })),
}));

vi.mock('@/lib/app-origin', () => ({ APP_ORIGIN: 'http://localhost' }));
vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: vi.fn(),
  sendLeadNotificationEmail: vi.fn(),
}));
vi.mock('@/lib/email-quality', () => ({
  classifyEmail: vi.fn((email) => ({ valid: !email.includes('invalid'), junk: email.includes('junk') })),
}));
vi.mock('@/lib/leads', () => ({
  createLead: vi.fn().mockResolvedValue({ id: 'lead_123', triage: { score: 'hot', flags: [] } }),
  getLeadTriage: vi.fn((lead) => lead.triage || { score: 'warm', flags: [] }),
  LEAD_PRUNE_FLAGS: new Set(['out_of_area', 'excluded_work', 'below_minimum', 'just_researching', 'while_booked', 'phone_verification_unavailable']),
}));
vi.mock('@/lib/attribution', () => ({
  parseAttribution: vi.fn(() => null),
  sanitizeAttribution: vi.fn((attr) => attr),
}));
vi.mock('@/lib/ad-speed-to-lead', () => ({ dispatchSpeedToLeadSms: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/lead-photo-storage', () => ({
  deleteLeadPhotos: vi.fn(),
  uploadLeadPhoto: vi.fn(),
  createLeadPhotoUrls: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/lead-photo-ai', () => ({ analyzeLeadPhotos: vi.fn() }));
vi.mock('@/lib/lead-verification', () => ({ isLeadVerificationValid: vi.fn() }));
vi.mock('@/lib/lead-phone-verification-readiness', () => ({ loadLeadPhoneVerificationReadiness: vi.fn().mockResolvedValue({ kind: 'ready' }) }));
vi.mock('@/lib/phone', () => ({ normalizeUsPhone: vi.fn((p) => p.replace(/\D/g, '') === '1234567890' ? null : '+1' + p.replace(/\D/g, '')) }));
vi.mock('@/lib/site-content', () => ({
  getSiteContent: vi.fn(() => ({
    quoteForm: { emailRequired: false },
    estimateRanges: { emailField: 'optional' },
    leadFilters: { exclusions: [], minJobAmount: 0, serviceAreaGate: false, phoneVerification: false },
    serviceAreas: { cities: [] },
  })),
  isFullyBookedActive: vi.fn(() => false),
}));
vi.mock('@/lib/sms', () => ({
  sendIntakeConfirmationSms: vi.fn().mockResolvedValue(undefined),
  sendOwnerHighValueLeadSms: vi.fn().mockResolvedValue(undefined),
  ensureSmsConsentBaseline: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStrict: vi.fn().mockResolvedValue(true),
  clientIpFrom: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/service-area-match', () => ({ serviceAreaVerdict: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/location-context/jurisdiction-resolver', () => ({
  resolveJurisdiction: vi.fn(() => ({ authorityId: 'auth_1', authorityName: 'City' })),
}));
vi.mock('@/lib/permit-intel/requirement-engine', () => ({
  evaluatePermitRequirement: vi.fn(() => ({ decision: 'required', estimatedGovernmentFee: { estimatedTotal: 100 } })),
}));

describe('Public Leads API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createFormData(data: Record<string, string>) {
    const fd = new FormData();
    for (const [key, value] of Object.entries(data)) {
      fd.append(key, value);
    }
    // Add startedAt to bypass timing validation
    if (!fd.has('startedAt')) {
      fd.append('startedAt', (Date.now() - 2000).toString());
    }
    return fd;
  }

  function createRequest(formData: FormData, headers = new Headers()) {
    return new NextRequest('http://localhost/api/public/leads', {
      method: 'POST',
      body: formData,
      headers,
    });
  }

  it('rejects submissions caught by honeypot', async () => {
    const fd = createFormData({ [HONEYPOT_FIELD]: 'bot-filled' });
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it('rejects submissions faster than 1800ms', async () => {
    const fd = new FormData();
    fd.append('startedAt', (Date.now() - 500).toString());
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Please take a moment to complete the form.' });
  });

  it('rejects submissions without name or siteId', async () => {
    const fd = createFormData({ siteId: '', name: 'Test' });
    let res = await POST(createRequest(fd));
    expect(res.status).toBe(400);

    const fd2 = createFormData({ siteId: 'site_1', name: '' });
    res = await POST(createRequest(fd2));
    expect(res.status).toBe(400);
  });

  it('rejects submissions without a message', async () => {
    const fd = createFormData({ siteId: 'site_1', name: 'Test' });
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Tell us what you need done so we can help.' });
  });

  it('rejects invalid phone numbers', async () => {
    const fd = createFormData({ siteId: 'site_1', name: 'Test', message: 'help', phone: '1234567890' });
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Enter a valid phone number.' });
  });

  it('rejects invalid email addresses', async () => {
    const fd = createFormData({ siteId: 'site_1', name: 'Test', message: 'help', email: 'invalid@example.com' });
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Enter a valid email address.' });
  });

  it('rejects rate limited requests', async () => {
    const { checkRateLimitStrict } = await import('@/lib/rate-limit');
    vi.mocked(checkRateLimitStrict).mockResolvedValueOnce(false);
    const fd = createFormData({ siteId: 'site_1', name: 'Test', message: 'help', email: 'test@example.com' });
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(429);
  });

  it('handles basic valid submission when site is found', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'sites') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'site_1', account_id: 'acct_1', company_name: 'Test Co', content: {} } }) }) }) }) };
        }
        if (table === 'accounts') {
          return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { high_value_lead_amount: 1000 } }) }) }) };
        }
        if (table === 'lead_blocklist') {
          return { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ then: (cb: any) => cb({ data: [] }) }) }) }) }) };
        }
        if (table === 'leads') {
          return { select: () => ({ eq: () => ({ in: () => ({ gte: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }) }) }) };
        }
        return { select: vi.fn() };
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as any);

    const fd = createFormData({ siteId: 'site_1', name: 'Test Person', message: 'Need roof', email: 'test@example.com' });
    const res = await POST(createRequest(fd));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, leadId: 'lead_123' });
    
    const { createLead } = await import('@/lib/leads');
    expect(createLead).toHaveBeenCalled();
  });
});
