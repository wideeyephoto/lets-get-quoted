import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadDedicatedMessagingReadiness: vi.fn(),
  sendRebookInviteSms: vi.fn(),
  sendRebookInviteEmail: vi.fn(),
  isEmailSuppressed: vi.fn(),
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  loadDedicatedMessagingReadiness: (...args: unknown[]) =>
    mocks.loadDedicatedMessagingReadiness(...args),
}));

vi.mock('@/lib/sms', () => ({
  sendRebookInviteSms: (...args: unknown[]) => mocks.sendRebookInviteSms(...args),
}));

vi.mock('@/lib/email', () => ({
  sendRebookInviteEmail: (...args: unknown[]) => mocks.sendRebookInviteEmail(...args),
}));

vi.mock('@/lib/email-suppression', () => ({
  isEmailSuppressed: (...args: unknown[]) => mocks.isEmailSuppressed(...args),
  loadSuppressedEmails: vi.fn().mockResolvedValue(new Set()),
  resolveMarketingMailingAddress: (addr: string | null) => addr,
}));

const { sendRebookInvite } = await import('@/lib/rebook');

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isEmailSuppressed.mockResolvedValue(false);
  mocks.sendRebookInviteSms.mockResolvedValue('sms-123');
  mocks.sendRebookInviteEmail.mockResolvedValue(undefined);
});

describe('Rebook Invite Channel Delivery Hardening', () => {
  it('sends SMS when dedicated messaging is ready and client is opted in', async () => {
    mocks.loadDedicatedMessagingReadiness.mockResolvedValue({
      kind: 'ready',
      senderId: '33333333-3333-4333-8333-333333333333',
      provider: 'signalwire',
      number: '+12485550100',
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: CLIENT_ID,
                      account_id: ACCOUNT_ID,
                      name: 'Jane Doe',
                      phone: '+12485550199',
                      email: 'jane@example.com',
                    },
                  }),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            })),
          };
        }
        if (table === 'sites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    subdomain: 'acme',
                    published: true,
                    company_name: 'Acme Heating',
                  },
                }),
              })),
            })),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    business_name: 'Acme Heating',
                    mailing_address: '123 Main St, Royal Oak MI',
                  },
                }),
              })),
            })),
          };
        }
        if (table === 'sms_consent') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { status: 'opted_in' },
                  }),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };

    const channel = await sendRebookInvite(mockSupabase as never, ACCOUNT_ID, CLIENT_ID);
    expect(channel).toBe('sms');
    expect(mocks.sendRebookInviteSms).toHaveBeenCalled();
    expect(mocks.sendRebookInviteEmail).not.toHaveBeenCalled();
  });

  it('falls back to Email when dedicated messaging is not ready but client has email', async () => {
    mocks.loadDedicatedMessagingReadiness.mockResolvedValue({
      kind: 'not_ready',
    });

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'clients') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: CLIENT_ID,
                      account_id: ACCOUNT_ID,
                      name: 'Jane Doe',
                      phone: '+12485550199',
                      email: 'jane@example.com',
                    },
                  }),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null }),
              })),
            })),
          };
        }
        if (table === 'sites') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    subdomain: 'acme',
                    published: true,
                    company_name: 'Acme Heating',
                  },
                }),
              })),
            })),
          };
        }
        if (table === 'accounts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    business_name: 'Acme Heating',
                    mailing_address: '123 Main St, Royal Oak MI',
                  },
                }),
              })),
            })),
          };
        }
        if (table === 'sms_consent') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { status: 'opted_in' },
                  }),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };

    const channel = await sendRebookInvite(mockSupabase as never, ACCOUNT_ID, CLIENT_ID);
    expect(channel).toBe('email');
    expect(mocks.sendRebookInviteSms).not.toHaveBeenCalled();
    expect(mocks.sendRebookInviteEmail).toHaveBeenCalled();
  });
});
