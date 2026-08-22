import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verificationConfigured: true,
  provider: { id: 'signalwire' as const },
  suppression: null as string | null,
  sender: vi.fn(),
}));

vi.mock('@/lib/lead-verification', () => ({
  isLeadVerificationConfigured: () => mocks.verificationConfigured,
}));
vi.mock('@/lib/messaging-number-provisioning', () => ({
  loadDedicatedMessagingReadiness: (...args: unknown[]) => mocks.sender(...args),
}));
vi.mock('@/lib/sms-provider', () => ({
  smsProviderConfig: () => mocks.provider,
  outboundSmsSuppression: () => mocks.suppression,
}));

import { loadLeadPhoneVerificationReadiness } from '@/lib/lead-phone-verification-readiness';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const SENDER = '22222222-2222-4222-8222-222222222222';
const admin = {} as never;

beforeEach(() => {
  mocks.verificationConfigured = true;
  mocks.provider = { id: 'signalwire' };
  mocks.suppression = null;
  mocks.sender.mockReset();
  mocks.sender.mockResolvedValue({ kind: 'ready', provider: 'signalwire', senderId: SENDER });
  vi.stubEnv('LGQ_SMS_DELIVERY_WORKER_ENABLED', '1');
  vi.stubEnv('LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED', '1');
  vi.stubEnv('LGQ_SMS_CANARY_ACCOUNT_IDS', '');
});

afterEach(() => vi.unstubAllEnvs());

describe('lead phone verification readiness', () => {
  it('admits only the exact active provider and dedicated sender', async () => {
    await expect(loadLeadPhoneVerificationReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'ready', provider: 'signalwire', senderId: SENDER,
    });
  });

  it.each([
    ['worker', 'LGQ_SMS_DELIVERY_WORKER_ENABLED', '0', 'delivery_worker_disabled'],
    ['lane', 'LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED', '0', 'contractor_lane_disabled'],
  ])('fails closed when the %s gate is dark', async (_label, key, value, reason) => {
    vi.stubEnv(key, value);
    await expect(loadLeadPhoneVerificationReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'unavailable', reason,
    });
    expect(mocks.sender).not.toHaveBeenCalled();
  });

  it('does not issue a short-lived code while outbound is suppressed', async () => {
    mocks.suppression = 'switched-off';
    await expect(loadLeadPhoneVerificationReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'unavailable', reason: 'outbound_suppressed',
    });
  });

  it('does not enqueue outside the active canary set', async () => {
    vi.stubEnv('LGQ_SMS_CANARY_ACCOUNT_IDS', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await expect(loadLeadPhoneVerificationReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'unavailable', reason: 'outside_canary',
    });
  });

  it('rejects a dedicated sender on a different provider', async () => {
    mocks.sender.mockResolvedValueOnce({ kind: 'ready', provider: 'twilio', senderId: SENDER });
    await expect(loadLeadPhoneVerificationReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'unavailable', reason: 'dedicated_sender_unavailable',
    });
  });

  it('checks the token secret before querying sender inventory', async () => {
    mocks.verificationConfigured = false;
    await expect(loadLeadPhoneVerificationReadiness(ACCOUNT, admin)).resolves.toEqual({
      kind: 'unavailable', reason: 'verification_secret_missing',
    });
    expect(mocks.sender).not.toHaveBeenCalled();
  });
});
