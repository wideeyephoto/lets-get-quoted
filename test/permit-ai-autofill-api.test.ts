import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentMembership: vi.fn(),
  loadHeldCapabilities: vi.fn(),
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn(),
}));

vi.mock('@/lib/permit-intel/credentials-vault', () => ({
  listContractorCredentials: vi.fn().mockResolvedValue([
    {
      credentialType: 'state_license',
      holderName: 'Metro Electric & Solar Pro',
      licenseNumber: 'ME-991823',
    },
    {
      credentialType: 'liability_insurance',
      insuranceCarrier: 'Hartford Fire Insurance',
      policyNumber: 'HART-55291',
    },
    {
      credentialType: 'workers_comp',
      insuranceCarrier: 'State Fund',
      policyNumber: 'WC-11029',
    },
  ]),
}));

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership, loadHeldCapabilities } from '@/lib/auth';
import { getJob } from '@/lib/jobs';
import { POST } from '../src/app/api/permits/autofill/route';

describe('AI Permit Autofill API Route - POST /api/permits/autofill', () => {
  const validJobId = '11111111-1111-4111-a111-111111111111';
  const mockAccountId = '22222222-2222-4222-a222-222222222222';
  const mockUserId = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as any);

    const req = new Request('http://localhost/api/permits/autofill', {
      method: 'POST',
      body: JSON.stringify({ propertyAddress: '100 Main St, Royal Oak, MI' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects requests without propertyAddress when jobId is missing with 400', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    const req = new Request('http://localhost/api/permits/autofill', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('propertyAddress is required');
  });

  it('autofills permit application for direct address and trade payload', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    const req = new Request('http://localhost/api/permits/autofill', {
      method: 'POST',
      body: JSON.stringify({
        propertyAddress: '211 S Williams St, Royal Oak, MI 48067',
        trade: 'electrical',
        scopeText: 'Install 50A Level 2 Tesla EV charger in garage',
        estimatedValuation: 1600,
        owner: {
          name: 'James Wilson',
          phone: '(248) 555-1234',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.application).toBeDefined();
    expect(json.application.metadata.authorityName).toBe('City of Royal Oak');
    expect(json.application.projectInfo.synthesizedProjectDescription.value).toContain('EVSE');
    expect(json.application.contractorInfo.businessName.value).toBe('Metro Electric & Solar Pro');
    expect(json.application.contractorInfo.stateLicense.value).toBe('ME-991823');
  });

  it('enriches permit autofill using database job records when jobId is provided', async () => {
    vi.mocked(createSupabaseServerClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: mockUserId } } }),
      },
    } as any);

    vi.mocked(getCurrentMembership).mockResolvedValue({
      accountId: mockAccountId,
      role: 'owner',
    } as any);

    vi.mocked(loadHeldCapabilities).mockResolvedValue(new Set(['jobs.read']));

    vi.mocked(getJob).mockResolvedValue({
      id: validJobId,
      account_id: mockAccountId,
      ref: 'JOB-9941',
      client_name: 'Elena Rostova',
      client_phone: '(310) 555-4920',
      client_email: 'elena@example.com',
      address: '400 Sunset Blvd, Los Angeles, CA 90028',
      scope: 'Complete tear off and replacement of 28 squares architectural shingles',
      quoted_amount: 15400,
      status: 'in_progress',
      scheduled_for: null,
      scheduled_time: null,
      estimated_hours: 16,
      deposit_gate: null,
    } as any);

    const req = new Request('http://localhost/api/permits/autofill', {
      method: 'POST',
      body: JSON.stringify({
        jobId: validJobId,
        trade: 'roofing',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.application.metadata.stateOrProvince).toBe('CA');
    expect(json.application.ownerInfo.name.value).toBe('Elena Rostova');
    expect(json.application.projectInfo.valuation.total.value).toBe(15400);
  });
});

