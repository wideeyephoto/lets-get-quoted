import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateOwnerVerificationCode,
  ownerPhoneVerificationToken,
  isOwnerPhoneVerificationValid,
} from '@/lib/owner-phone-verification';
import {
  sendOwnerPhoneVerificationCodeAction,
  verifyOwnerPhoneVerificationCodeAction,
} from '@/app/dashboard/messages/actions';
import { recordOwnerSmsConsent } from '@/lib/sms';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn().mockResolvedValue({
    accountId: 'acc_test_ad_billing_2fa',
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    },
    role: 'owner',
  }),
  requireOwnerContext: vi.fn().mockResolvedValue({
    accountId: 'acc_test_ad_billing_2fa',
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    },
  }),
  createAdminClient: vi.fn().mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  }),
}));



vi.mock('@/lib/sms', () => ({
  sendOwnerPhoneVerificationSms: vi.fn().mockResolvedValue('msg_otp_123'),
  recordOwnerSmsConsent: vi.fn().mockResolvedValue('recorded'),
}));

describe('Ad Billing SMS Alert 2FA Phone Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a 6-digit OTP code and binds it into a valid HMAC token', () => {
    const code = generateOwnerVerificationCode();
    expect(code).toMatch(/^\d{6}$/);

    const accountId = 'acc_test_ad_billing_2fa';
    const phone = '+12485550100';
    const expiresAt = Date.now() + 600000;

    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);
    expect(token).toBeTruthy();

    const valid = isOwnerPhoneVerificationValid(accountId, phone, code, expiresAt, token);
    expect(valid).toBe(true);

    const wrongCode = isOwnerPhoneVerificationValid(accountId, phone, '000000', expiresAt, token);
    expect(wrongCode).toBe(false);

    const expired = isOwnerPhoneVerificationValid(accountId, phone, code, Date.now() - 1000, token);
    expect(expired).toBe(false);
  });

  it('sendOwnerPhoneVerificationCodeAction sends an SMS OTP and returns the token', async () => {
    const result = await sendOwnerPhoneVerificationCodeAction('(248) 555-0100');
    expect(result.status).toBe('sent');
    if (result.status === 'sent') {
      expect(result.phone).toBe('+12485550100');
      expect(result.token).toBeTruthy();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    }
  });

  it('verifyOwnerPhoneVerificationCodeAction validates code against token and returns verified status', async () => {
    const accountId = 'acc_test_ad_billing_2fa';
    const phone = '+12485550100';
    const code = '789123';
    const expiresAt = Date.now() + 600000;
    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);

    const result = await verifyOwnerPhoneVerificationCodeAction('(248) 555-0100', '789123', token, expiresAt);
    expect(result.status).toBe('verified');
    if (result.status === 'verified') {
      expect(result.phone).toBe('+12485550100');
    }
  });

  it('verifyOwnerPhoneVerificationCodeAction rejects invalid OTP codes', async () => {
    const accountId = 'acc_test_ad_billing_2fa';
    const phone = '+12485550100';
    const code = '789123';
    const expiresAt = Date.now() + 600000;
    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);

    const result = await verifyOwnerPhoneVerificationCodeAction('(248) 555-0100', '999999', token, expiresAt);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('incorrect or has expired');
    }
  });

  it('does not report verification when the durable consent write fails', async () => {
    (recordOwnerSmsConsent as any).mockResolvedValueOnce('failed');
    const accountId = 'acc_test_ad_billing_2fa';
    const phone = '+12485550100';
    const code = '789123';
    const expiresAt = Date.now() + 600000;
    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);

    const result = await verifyOwnerPhoneVerificationCodeAction(phone, code, token, expiresAt);

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('could not save');
  });

  it('preserves a prior STOP instead of reporting the phone as verified', async () => {
    (recordOwnerSmsConsent as any).mockResolvedValueOnce('suppressed');
    const accountId = 'acc_test_ad_billing_2fa';
    const phone = '+12485550100';
    const code = '789123';
    const expiresAt = Date.now() + 600000;
    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);

    const result = await verifyOwnerPhoneVerificationCodeAction(phone, code, token, expiresAt);

    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toContain('STOP');
  });

  it('sendOwnerPhoneVerificationCodeAction enforces rate limit when exceeded', async () => {

    const { createAdminClient } = await import('@/lib/auth');
    (createAdminClient as any).mockReturnValueOnce({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });

    const result = await sendOwnerPhoneVerificationCodeAction('(248) 555-0100');
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('Too many verification code requests');
    }
  });

  it('verifyOwnerPhoneVerificationCodeAction enforces rate limit when exceeded', async () => {
    const { createAdminClient } = await import('@/lib/auth');
    (createAdminClient as any).mockReturnValueOnce({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    });

    const result = await verifyOwnerPhoneVerificationCodeAction('(248) 555-0100', '123456', 'tok', Date.now() + 60000);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('Too many verification attempts');
    }
  });
});
