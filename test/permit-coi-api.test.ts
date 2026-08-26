import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/permit-intel/credentials-vault', () => ({
  listContractorCredentials: vi.fn().mockResolvedValue([
    {
      credentialType: 'state_license',
      licenseNumber: 'MI-210199482',
    },
    {
      credentialType: 'liability_insurance',
      insuranceCarrier: 'Travelers Property Casualty',
      policyNumber: 'TRV-8849201',
    },
    {
      credentialType: 'workers_comp',
      insuranceCarrier: 'Accident Fund',
      policyNumber: 'WC-9940122',
    },
  ]),
}));

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { POST } from '../src/app/api/permits/coi/route';

describe('Municipal Certificate of Insurance API Route - POST /api/permits/coi', () => {
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates ACORD 25 COI JSON with municipal certificate holder', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { business_name: 'Apex Roofing LLC' },
        }),
      }),
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    const req = new Request('http://localhost/api/permits/coi', {
      method: 'POST',
      body: JSON.stringify({
        municipality: {
          authorityName: 'City of Royal Oak',
          agencyName: 'City of Royal Oak Building Inspection Division',
          address: '211 S Williams St',
          city: 'Royal Oak',
          state: 'MI',
          zip: '48067',
        },
        projectAddress: '1500 N Main St, Royal Oak, MI',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.certificate).toBeDefined();
    expect(json.certificate.insured.companyName).toBe('Apex Roofing LLC');
    expect(json.certificate.insured.stateLicenseNumber).toBe('MI-210199482');
    expect(json.certificate.certificateHolder.name).toContain('Royal Oak');
  });

  it('returns printable HTML when format is html', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { business_name: 'Apex Roofing LLC' },
        }),
      }),
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    const req = new Request('http://localhost/api/permits/coi', {
      method: 'POST',
      body: JSON.stringify({
        municipality: {
          authorityName: 'City of Detroit',
          city: 'Detroit',
          state: 'MI',
        },
        format: 'html',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('ACORD 25');
  });
});
