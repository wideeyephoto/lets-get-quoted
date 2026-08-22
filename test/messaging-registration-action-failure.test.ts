import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireMfaPermission: vi.fn(),
  loadApplication: vi.fn(),
  reviewApplication: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  requireMfaPermission: mocks.requireMfaPermission,
}));
vi.mock('@/lib/admin', () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock('@/lib/messaging-number-provisioning', () => ({
  loadAdminMessagingRegistrationApplication: mocks.loadApplication,
  reviewMessagingRegistrationApplication: mocks.reviewApplication,
}));
vi.mock('@/lib/signalwire-number-provisioning', () => ({
  SignalWireNumberProvisioningClient: class {},
}));

import { reviewMessagingApplicationAction } from '@/app/admin/messaging/registrations/actions';

const APPLICATION = '22222222-2222-4222-8222-222222222222';

function redirectError(url: string): Error {
  return Object.assign(new Error('NEXT_REDIRECT'), { url });
}

describe('messaging registration action failure redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireMfaPermission.mockResolvedValue({
      admin: {},
      adminEmail: 'operator@example.com',
    });
    mocks.redirect.mockImplementation((url: string) => {
      throw redirectError(url);
    });
  });

  it('correlates malformed preflight input without putting it or diagnostics in the URL', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const formData = new FormData();
    formData.set('applicationId', 'bad?id=raw-error-prose');

    await expect(reviewMessagingApplicationAction(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.loadApplication).not.toHaveBeenCalled();
    const redirectUrl = mocks.redirect.mock.calls[0][0] as string;
    const url = new URL(redirectUrl, 'https://app.letsgetquoted.com');
    const entry = log.mock.calls[0][0] as Record<string, unknown>;
    expect([...url.searchParams.keys()].sort()).toEqual(['correlation', 'error']);
    expect(url.searchParams.get('error')).toBe('1');
    expect(url.searchParams.get('correlation')).toBe(entry.correlationId);
    expect(redirectUrl).not.toContain('raw-error-prose');
    expect(entry).toMatchObject({
      event: 'messaging_registration_action_failed',
      applicationId: null,
      action: 'review_application',
      errorCode: 'invalid_application_id',
    });
    log.mockRestore();
  });

  it('keeps raw provider/database failure prose out of the redirect and fixed UI contract', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.loadApplication.mockResolvedValue({
      id: APPLICATION,
      accountId: '33333333-3333-4333-8333-333333333333',
      status: 'submitted',
      providerBrandId: null,
      providerCampaignId: null,
      providerNumberId: null,
    });
    mocks.reviewApplication.mockRejectedValue(new Error('provider said token=secret-value for owner@example.com'));
    const formData = new FormData();
    formData.set('applicationId', APPLICATION);
    formData.set('decision', 'under_review');

    await expect(reviewMessagingApplicationAction(formData)).rejects.toThrow('NEXT_REDIRECT');

    const redirectUrl = mocks.redirect.mock.calls[0][0] as string;
    const url = new URL(redirectUrl, 'https://app.letsgetquoted.com');
    const entry = log.mock.calls[0][0] as Record<string, unknown>;
    expect([...url.searchParams.keys()].sort()).toEqual(['application', 'correlation', 'error']);
    expect(url.searchParams.get('application')).toBe(APPLICATION);
    expect(url.searchParams.get('correlation')).toBe(entry.correlationId);
    expect(redirectUrl).not.toContain('secret-value');
    expect(redirectUrl).not.toContain('owner%40example.com');
    expect(entry).toMatchObject({
      event: 'messaging_registration_action_failed',
      applicationId: APPLICATION,
      action: 'review_application',
      errorCode: 'review_failed',
    });
    expect(String(entry.safeMessage)).not.toContain('secret-value');
    expect(String(entry.safeMessage)).not.toContain('owner@example.com');
    log.mockRestore();
  });
});
