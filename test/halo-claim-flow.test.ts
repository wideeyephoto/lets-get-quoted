import { describe, expect, it, vi, beforeEach } from 'vitest';
import { submitNeighborHaloClaimAction } from '@/app/claim/halo/[id]/claim-actions';

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

  it('processes claim, generates lead, and sends speed-to-lead SMS', async () => {
    const { getHaloCampaignById } = await import('@/lib/neighborhood-halo-service');
    const { createLead } = await import('@/lib/leads');
    const { sendSpeedToLeadSms, sendContractorAdLeadSms } = await import('@/lib/sms');
    const { createAdminClient } = await import('@/lib/auth');

    vi.mocked(getHaloCampaignById).mockResolvedValue({
      id: campaignId,
      accountId: 'acc_1',
      streetName: 'Maple Ave',
      city: 'Rochester',
      leadsGenerated: 2,
    } as never);

    const mockAdmin = {
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
