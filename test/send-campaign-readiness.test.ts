import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireActiveDedicatedMessagingSender: vi.fn(),
  sendCampaignSms: vi.fn(),
  sendCampaignEmail: vi.fn(),
  loadRecipients: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: (...args: unknown[]) =>
    mocks.requireActiveDedicatedMessagingSender(...args),
}));

vi.mock('@/lib/sms', () => ({
  sendCampaignSms: (...args: unknown[]) => mocks.sendCampaignSms(...args),
}));

vi.mock('@/lib/email', () => ({
  sendCampaignEmail: (...args: unknown[]) => mocks.sendCampaignEmail(...args),
}));

const { sendCampaign } = await import('@/lib/campaigns');

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireActiveDedicatedMessagingSender.mockResolvedValue({
    kind: 'ready',
    senderId: '22222222-2222-4222-8222-222222222222',
    provider: 'signalwire',
    number: '+12485550100',
  });
  mocks.sendCampaignSms.mockResolvedValue('sms-event-id-123');
  mocks.sendCampaignEmail.mockResolvedValue(undefined);
});

describe('sendCampaign defense-in-depth dedicated messaging readiness', () => {
  it('fails closed when wantSms is true and dedicated number is not ready', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(
      new Error('Customer texting requires an approved, active dedicated number.'),
    );

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'c1',
                name: 'John Doe',
                email: 'john@example.com',
                phone: '+12485550101',
                sms_consent_status: 'opted_in',
                jobs: [{ id: 'j1', created_at: new Date().toISOString() }],
              },
            ],
            error: null,
          }),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
        })),
      })),
    };

    await expect(
      sendCampaign(mockSupabase as never, ACCOUNT_ID, {
        channel: 'sms',
        audience: 'past',
        subject: '',
        body: 'Hello {name}!',
        businessName: 'Acme Heating',
        mailingAddress: null,
      }),
    ).rejects.toThrow('Customer texting requires an approved, active dedicated number.');

    expect(mocks.requireActiveDedicatedMessagingSender).toHaveBeenCalledWith(
      ACCOUNT_ID,
      expect.anything(),
    );
    expect(mocks.sendCampaignSms).not.toHaveBeenCalled();
  });
});
