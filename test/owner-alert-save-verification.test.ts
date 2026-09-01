import { beforeEach, describe, expect, it, vi } from 'vitest';

const ACCOUNT_ID = 'acc_owner_phone_save';
const PHONE = '+12485550100';

const mocks = vi.hoisted(() => ({
  accountUpdate: vi.fn(),
  updateEq: vi.fn(),
  limiterRpc: vi.fn(),
  loadOwnerAlerts: vi.fn(),
  validateOwnerAlerts: vi.fn(),
  recordOwnerSmsConsent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  requireOwnerContext: vi.fn(async () => ({
    accountId: ACCOUNT_ID,
    supabase: {
      from: vi.fn(() => ({ update: mocks.accountUpdate })),
    },
  })),
  requireOfficeContext: vi.fn(),
  createAdminClient: vi.fn(() => ({ rpc: mocks.limiterRpc })),
}));

vi.mock('@/lib/owner-sms', () => ({
  loadOwnerAlerts: mocks.loadOwnerAlerts,
  validateOwnerAlerts: mocks.validateOwnerAlerts,
}));

vi.mock('@/lib/sms', () => ({
  hasCurrentSmsConsent: vi.fn(),
  recordOwnerSmsConsent: mocks.recordOwnerSmsConsent,
  sendInboxReplySms: vi.fn(),
  sendOwnerPhoneVerificationSms: vi.fn(),
}));

vi.mock('@/lib/messaging-number-provisioning', () => ({
  requireActiveDedicatedMessagingSender: vi.fn(),
}));

const { saveOwnerAlertsAction } = await import('@/app/dashboard/messages/actions');
const { ownerPhoneVerificationToken } = await import('@/lib/owner-phone-verification');

function ownerAlerts(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'ok' as const,
    phone: null,
    enabled: false,
    consent: 'none' as const,
    consentedAt: null,
    consentVersion: null,
    ...overrides,
  };
}

function formData({
  phone = PHONE,
  enabled = true,
  consented = true,
  code = '',
  token = '',
  expiresAt = 0,
}: {
  phone?: string;
  enabled?: boolean;
  consented?: boolean;
  code?: string;
  token?: string;
  expiresAt?: number;
} = {}) {
  const form = new FormData();
  form.set('alertPhone', phone);
  if (enabled) form.set('alertsEnabled', 'on');
  if (consented) form.set('alertsConsent', 'on');
  form.set('verificationCode', code);
  form.set('verificationToken', token);
  form.set('verificationExpiresAt', String(expiresAt));
  return form;
}

function validOtp(code = '384921') {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  return {
    code,
    expiresAt,
    token: ownerPhoneVerificationToken(ACCOUNT_ID, PHONE, code, expiresAt),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accountUpdate.mockReturnValue({ eq: mocks.updateEq });
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.limiterRpc.mockResolvedValue({ data: true, error: null });
  mocks.loadOwnerAlerts.mockResolvedValue(ownerAlerts());
  mocks.validateOwnerAlerts.mockReturnValue([]);
  mocks.recordOwnerSmsConsent.mockResolvedValue('recorded');
});

describe('saving the owner field phone', () => {
  it('refuses a new number without a phone-bound OTP', async () => {
    const result = await saveOwnerAlertsAction({ status: 'idle' }, formData());

    expect(result).toEqual({
      status: 'error',
      errors: [{ field: 'phone', message: 'Verify this number with the 6-digit text code before saving it.' }],
    });
    expect(mocks.recordOwnerSmsConsent).not.toHaveBeenCalled();
    expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });

  it('also requires OTP for a legacy saved phone that has no consent evidence', async () => {
    mocks.loadOwnerAlerts.mockResolvedValue(ownerAlerts({ phone: PHONE }));

    const result = await saveOwnerAlertsAction({ status: 'idle' }, formData());

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errors[0]?.message).toContain('Verify this number');
    expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });

  it('rejects an incorrect or expired OTP before any durable write', async () => {
    const otp = validOtp('384921');

    const result = await saveOwnerAlertsAction(
      { status: 'idle' },
      formData({ ...otp, code: '000000' }),
    );

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errors[0]?.message).toContain('invalid or has expired');
    expect(mocks.recordOwnerSmsConsent).not.toHaveBeenCalled();
    expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });

  it('rate-limits the save path that actually verifies the form OTP', async () => {
    mocks.limiterRpc.mockResolvedValueOnce({ data: false, error: null });

    const result = await saveOwnerAlertsAction({ status: 'idle' }, formData(validOtp()));

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errors[0]?.message).toContain('Too many verification attempts');
    expect(mocks.recordOwnerSmsConsent).not.toHaveBeenCalled();
    expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });

  it('persists a valid verified phone and reports Text-to-Job ready only when routing is enabled', async () => {
    const otp = validOtp();

    const ready = await saveOwnerAlertsAction({ status: 'idle' }, formData(otp));
    const disabled = await saveOwnerAlertsAction(
      { status: 'idle' },
      formData({ ...otp, enabled: false }),
    );

    expect(ready).toMatchObject({ status: 'saved', ready: true, phone: PHONE, enabled: true });
    expect(disabled).toMatchObject({ status: 'saved', ready: false, phone: PHONE, enabled: false });
    expect(mocks.recordOwnerSmsConsent).toHaveBeenCalledWith(
      ACCOUNT_ID,
      PHONE,
      expect.any(String),
    );
    expect(mocks.accountUpdate).toHaveBeenCalledWith({
      alert_phone: PHONE,
      high_value_sms_enabled: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/dashboard/text-to-job');
  });

  it('does not claim the account settings were untouched if their update fails after verification', async () => {
    mocks.updateEq.mockResolvedValueOnce({ error: { message: 'database unavailable' } });

    const result = await saveOwnerAlertsAction({ status: 'idle' }, formData(validOtp()));

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errors[0]?.message).toContain('verification record may have saved');
  });
});
