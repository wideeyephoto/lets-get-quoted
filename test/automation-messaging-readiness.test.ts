import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireOwnerContext: vi.fn(),
  requireOfficeContext: vi.fn(),
  requireActiveDedicatedMessagingSender: vi.fn(),
  recordAccountEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: (...args: unknown[]) => mocks.requireOwnerContext(...args),
  requireOfficeContext: (...args: unknown[]) => mocks.requireOfficeContext(...args),
  createAdminClient: () => ({}),
}));
vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: (...args: unknown[]) =>
    mocks.requireActiveDedicatedMessagingSender(...args),
}));
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: (...args: unknown[]) => mocks.recordAccountEvent(...args),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

const { enableRecommendedAutomationsAction, toggleAutomationAction } =
  await import('@/app/dashboard/settings/actions');

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const eq = vi.fn();
const update = vi.fn(() => ({ eq }));
const getUser = vi.fn();
const supabase = {
  from: vi.fn(() => ({ update })),
  auth: { getUser },
};

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({ data: { user: { email: 'owner@example.com' } } });
  mocks.requireOwnerContext.mockResolvedValue({ supabase, accountId: ACCOUNT_ID });
  mocks.requireOfficeContext.mockResolvedValue({ supabase, accountId: ACCOUNT_ID });
  mocks.requireActiveDedicatedMessagingSender.mockResolvedValue({
    kind: 'ready',
    senderId: '22222222-2222-4222-8222-222222222222',
    provider: 'signalwire',
    number: '+12485550100',
  });
});

describe('automation customer-text readiness boundary', () => {
  it('checks exact dedicated-sender readiness before enabling an SMS automation', async () => {
    await toggleAutomationAction('followups', true);

    expect(mocks.requireActiveDedicatedMessagingSender).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(update).toHaveBeenCalledWith({ quote_followups_enabled: true });
  });

  it('fails closed before changing the flag when sender readiness cannot be proven', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(new Error('registration required'));

    await expect(toggleAutomationAction('reviews', true)).rejects.toThrow('registration required');
    expect(update).not.toHaveBeenCalled();
    expect(mocks.recordAccountEvent).not.toHaveBeenCalled();
  });

  it('always permits shutdown even while customer texting is unavailable', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(new Error('unavailable'));

    await expect(toggleAutomationAction('arrival', false)).resolves.toBeUndefined();
    expect(mocks.requireActiveDedicatedMessagingSender).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ arrival_updates_enabled: false });
  });

  it('does not couple non-SMS switches to dedicated-number readiness', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(new Error('unavailable'));

    await expect(toggleAutomationAction('daily-digest', true)).resolves.toBeUndefined();
    expect(mocks.requireActiveDedicatedMessagingSender).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ daily_digest_enabled: true });
  });

  it('does not partially apply the recommended preset before readiness succeeds', async () => {
    mocks.requireActiveDedicatedMessagingSender.mockRejectedValue(new Error('registration required'));

    await expect(enableRecommendedAutomationsAction()).rejects.toThrow('registration required');
    expect(update).not.toHaveBeenCalled();
  });
});
