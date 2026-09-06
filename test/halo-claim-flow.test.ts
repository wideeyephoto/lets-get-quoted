import { describe, expect, it, vi, beforeEach } from 'vitest';
import { submitNeighborHaloClaimAction } from '@/app/claim/halo/[id]/claim-actions';
import { createHaloClaimToken } from '@/lib/neighborhood-halo-claim-token';

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-forwarded-for': '198.51.100.24' })),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/leads', () => ({
  createLead: vi.fn().mockResolvedValue({ id: 'lead_123', name: 'Jane Doe' }),
}));

vi.mock('@/lib/neighborhood-halo-service', () => ({
  getHaloCampaignById: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  sendSpeedToLeadSms: vi.fn().mockResolvedValue('msg_123'),
  sendContractorAdLeadSms: vi.fn().mockResolvedValue('msg_456'),
}));

describe('Neighbor Halo Claim Flow', () => {
  const campaignId = 'halo_test_789';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'halo-claim-test-service-role-key';
  });

  it('rejects claim when name is missing', async () => {
    const formData = new FormData();
    formData.append('campaignId', campaignId);
    formData.append('phone', '555-111-2222');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Please enter your name.');
  });

  it('rejects claim when phone is missing', async () => {
    const formData = new FormData();
    formData.append('campaignId', campaignId);
    formData.append('name', 'Jane Doe');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Please provide a valid phone number for SMS confirmation.');
  });

  it.each([undefined, 'forged.token'])('rejects a missing or forged claim capability before creating a service-role client', async (claimToken) => {
    const { createAdminClient } = await import('@/lib/auth');
    const { getHaloCampaignById } = await import('@/lib/neighborhood-halo-service');
    const formData = new FormData();
    formData.append('campaignId', campaignId);
    if (claimToken) formData.append('claimToken', claimToken);
    formData.append('name', 'Mallory');
    formData.append('phone', '555-111-2222');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);

    expect(res).toEqual({
      success: false,
      error: 'This campaign link is invalid or has expired. Please reload the page.',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(getHaloCampaignById).not.toHaveBeenCalled();
  });

  it('rejects a validly signed campaign capability if its tenant binding no longer matches', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    const { getHaloCampaignById } = await import('@/lib/neighborhood-halo-service');
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never);
    vi.mocked(getHaloCampaignById).mockResolvedValue({
      id: campaignId,
      accountId: 'account-after-reassignment',
      status: 'active',
    } as never);

    const formData = new FormData();
    formData.append('campaignId', campaignId);
    formData.append('claimToken', createHaloClaimToken(campaignId, 'original-account'));
    formData.append('name', 'Jane Doe');
    formData.append('phone', '555-111-2222');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);

    expect(res).toEqual({ success: false, error: 'Neighborhood offer not found or has expired.' });
  });

  it('fails closed at the limiter before reading or mutating a campaign', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    const { createLead } = await import('@/lib/leads');
    const { getHaloCampaignById } = await import('@/lib/neighborhood-halo-service');
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    } as never);

    const formData = new FormData();
    formData.append('campaignId', campaignId);
    formData.append('claimToken', createHaloClaimToken(campaignId, 'acc_1'));
    formData.append('name', 'Jane Doe');
    formData.append('phone', '555-111-2222');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);

    expect(res).toEqual({
      success: false,
      error: 'Too many claim attempts. Please wait a while and try again.',
    });
    expect(getHaloCampaignById).not.toHaveBeenCalled();
    expect(createLead).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'inactive', status: 'paused', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    { label: 'expired', status: 'active', expiresAt: new Date(Date.now() - 60_000).toISOString() },
    { label: 'malformed expiry', status: 'active', expiresAt: 'not-a-date' },
  ])('rejects an otherwise authorized $label campaign', async ({ status, expiresAt }) => {
    const { createAdminClient } = await import('@/lib/auth');
    const { createLead } = await import('@/lib/leads');
    const { getHaloCampaignById } = await import('@/lib/neighborhood-halo-service');
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    } as never);
    vi.mocked(getHaloCampaignById).mockResolvedValue({
      id: campaignId,
      accountId: 'acc_1',
      status,
      expiresAt,
    } as never);

    const formData = new FormData();
    formData.append('campaignId', campaignId);
    formData.append('claimToken', createHaloClaimToken(campaignId, 'acc_1'));
    formData.append('name', 'Jane Doe');
    formData.append('phone', '555-111-2222');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);

    expect(res).toEqual({ success: false, error: 'Neighborhood offer not found or has expired.' });
    expect(createLead).not.toHaveBeenCalled();
  });

  it('processes claim, generates lead, and sends speed-to-lead SMS', async () => {
    const { getHaloCampaignById } = await import('@/lib/neighborhood-halo-service');
    const { createLead } = await import('@/lib/leads');
    const { sendSpeedToLeadSms, sendContractorAdLeadSms } = await import('@/lib/sms');
    const { createAdminClient } = await import('@/lib/auth');

    vi.mocked(getHaloCampaignById).mockResolvedValue({
      id: campaignId,
      accountId: 'acc_1',
      status: 'active',
      streetName: 'Maple Ave',
      city: 'Rochester',
      leadsGenerated: 2,
    } as never);

    const mockAdmin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'accounts' || table === 'sites') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { business_name: 'Apex Home Services', phone: '555-999-8888' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'neighborhood_halo_campaigns') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never);

    const formData = new FormData();
    formData.append('campaignId', campaignId);
    formData.append('claimToken', createHaloClaimToken(campaignId, 'acc_1'));
    formData.append('name', 'John Smith');
    formData.append('phone', '555-444-3333');
    formData.append('address', '1432 Maple Ave');
    formData.append('notes', 'Need gutter inspection');

    const res = await submitNeighborHaloClaimAction({ success: false }, formData);

    expect(res.success).toBe(true);
    expect(res.voucherCode).toContain('NEIGHBOR-MAPLEA-250');
    expect(createLead).toHaveBeenCalledWith(
      expect.anything(),
      'acc_1',
      expect.objectContaining({
        name: 'John Smith',
        phone: '555-444-3333',
        source: 'neighborhood_halo',
      })
    );
    expect(sendSpeedToLeadSms).toHaveBeenCalledTimes(1);
    expect(sendContractorAdLeadSms).toHaveBeenCalledTimes(1);
  });
});
