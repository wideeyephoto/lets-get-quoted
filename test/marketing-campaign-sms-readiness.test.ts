import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOfficeContext: vi.fn(),
  requireActiveDedicatedMessagingSender: vi.fn(),
  sendCampaign: vi.fn(),
  loadEmailBrand: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOfficeContext: (...args: unknown[]) => mocks.requireOfficeContext(...args),
  createAdminClient: () => ({}),
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: (...args: unknown[]) =>
    mocks.requireActiveDedicatedMessagingSender(...args),
  CustomerMessagingRegistrationRequiredError: class CustomerMessagingRegistrationRequiredError extends Error {
    constructor() {
      super('Customer texting requires an approved, active dedicated number.');
      this.name = 'CustomerMessagingRegistrationRequiredError';
    }
  },
}));

vi.mock('@/lib/email-brand', () => ({
  loadEmailBrand: (...args: unknown[]) => mocks.loadEmailBrand(...args),
}));

vi.mock('@/lib/campaigns', () => ({
  sendCampaign: (...args: unknown[]) => mocks.sendCampaign(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mocks.redirect(...args),
}));

const { sendCampaignAction } = await import('@/app/dashboard/marketing/actions');

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function makeFormData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  const mockSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              business_name: 'Acme Heating',
              company_name: 'Acme Heating LLC',
              mailing_address: '123 Main St, Detroit, MI 48201',
            },
          }),
        })),
      })),
    })),
  };

  mocks.requireOfficeContext.mockResolvedValue({
    supabase: mockSupabase,
    accountId: ACCOUNT_ID,
  });

  mocks.loadEmailBrand.mockResolvedValue({
    replyTo: 'contractor@example.com',
  });

  mocks.sendCampaign.mockResolvedValue({
    recipientCount: 10,
    emailSent: 0,
    smsQueued: 10,
    failed: 0,
    skipped: 0,
  });

  mocks.requireActiveDedicatedMessagingSender.mockResolvedValue({
    kind: 'ready',
    senderId: '22222222-2222-4222-8222-222222222222',
    provider: 'signalwire',
    number: '+12485550100',
  });
});

describe('Marketing Campaign SMS Dedicated Number Readiness Gate', () => {
  it('blocks SMS campaign broadcasts when dedicated number readiness check fails', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(
      new Error('Customer texting requires an approved, active dedicated number.'),
    );

    const formData = makeFormData({
      channel: 'sms',
      audience: 'past',
      body: 'Hi {name}, we are booking spring projects now!',
    });

    await expect(sendCampaignAction(formData)).rejects.toThrow(
      'Customer texting requires an approved, active dedicated number.',
    );

    expect(mocks.requireActiveDedicatedMessagingSender).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mocks.sendCampaign).not.toHaveBeenCalled();
  });

  it('blocks Email + Text campaign broadcasts when dedicated number readiness check fails', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(
      new Error('Customer texting requires an approved, active dedicated number.'),
    );

    const formData = makeFormData({
      channel: 'both',
      audience: 'past',
      subject: 'Spring Special',
      body: 'Hi {name}, booking spring appointments now.',
    });

    await expect(sendCampaignAction(formData)).rejects.toThrow(
      'Customer texting requires an approved, active dedicated number.',
    );

    expect(mocks.requireActiveDedicatedMessagingSender).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mocks.sendCampaign).not.toHaveBeenCalled();
  });

  it('permits Email campaign broadcasts without checking dedicated number readiness', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(
      new Error('Should not be called for email'),
    );

    mocks.sendCampaign.mockResolvedValue({
      recipientCount: 10,
      emailSent: 10,
      smsQueued: 0,
      failed: 0,
      skipped: 0,
    });

    const formData = makeFormData({
      channel: 'email',
      audience: 'past',
      subject: 'Spring Tune-up',
      body: 'Hi {name}, schedule your tune-up now.',
    });

    await sendCampaignAction(formData);

    expect(mocks.requireActiveDedicatedMessagingSender).not.toHaveBeenCalled();
    expect(mocks.sendCampaign).toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('/dashboard/marketing/campaigns?'));
  });

  it('permits SMS campaign broadcasts when dedicated number and active campaign are ready', async () => {
    const formData = makeFormData({
      channel: 'sms',
      audience: 'past',
      body: 'Hi {name}, spring discounts available!',
    });

    await sendCampaignAction(formData);

    expect(mocks.requireActiveDedicatedMessagingSender).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(mocks.sendCampaign).toHaveBeenCalledWith(
      expect.anything(),
      ACCOUNT_ID,
      expect.objectContaining({
        channel: 'sms',
        audience: 'past',
        body: 'Hi {name}, spring discounts available!',
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(expect.stringContaining('/dashboard/marketing/campaigns?'));
  });
});
