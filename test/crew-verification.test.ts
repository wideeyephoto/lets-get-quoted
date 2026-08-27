import { describe, it, expect } from 'vitest';
import {
  isCrewPhoneVerified,
  resolveCrewPhoneVerification,
  createCrewPhoneOtp,
} from '@/lib/crew-verification';
import { isLeadVerificationValid } from '@/lib/lead-verification';

describe('Crew Phone Verification Security', () => {
  it('identifies unverified crew members correctly', () => {
    const unverifiedCrew = {
      phone: '248-555-0199',
      active: true,
      user_id: null,
      last_signed_in_at: null,
      phone_verified_at: null,
      phone_verified: false,
    };

    expect(isCrewPhoneVerified(unverifiedCrew)).toBe(false);
    expect(resolveCrewPhoneVerification(unverifiedCrew).reason).toBe('unverified');
  });

  it('rejects inactive crew members even if previously verified', () => {
    const inactiveCrew = {
      phone: '248-555-0199',
      active: false,
      user_id: 'usr-123',
      last_signed_in_at: '2026-08-01T10:00:00Z',
      phone_verified_at: '2026-08-01T10:00:00Z',
      phone_verified: true,
    };

    expect(isCrewPhoneVerified(inactiveCrew)).toBe(false);
  });

  it('verifies crew members who have logged into the field app', () => {
    const activeFieldUser = {
      phone: '248-555-0199',
      active: true,
      user_id: 'usr-123',
      last_signed_in_at: '2026-08-25T08:30:00Z',
    };

    expect(isCrewPhoneVerified(activeFieldUser)).toBe(true);
    expect(resolveCrewPhoneVerification(activeFieldUser).reason).toBe('signed_in');
  });

  it('verifies crew members who have verified via SMS OTP timestamp', () => {
    const smsVerified = {
      phone: '248-555-0199',
      active: true,
      phone_verified_at: '2026-08-27T12:00:00Z',
    };

    expect(isCrewPhoneVerified(smsVerified)).toBe(true);
    expect(resolveCrewPhoneVerification(smsVerified).reason).toBe('verified_sms');
  });

  it('verifies crew members explicitly approved by business owner', () => {
    const ownerVerified = {
      phone: '248-555-0199',
      active: true,
      phone_verified: true,
    };

    expect(isCrewPhoneVerified(ownerVerified)).toBe(true);
    expect(resolveCrewPhoneVerification(ownerVerified).reason).toBe('owner_verified');
  });

  it('generates valid cryptographic OTP tokens that pass validation', () => {
    process.env.LGQ_LEAD_VERIFICATION_SECRET = 'test-secret-key-1234567890';

    const phone = '+12485550199';
    const { code, token, expiresAt } = createCrewPhoneOtp(phone);

    expect(code).toMatch(/^\d{6}$/);
    expect(token).toBeTruthy();
    expect(expiresAt).toBeGreaterThan(Date.now());

    const isValid = isLeadVerificationValid(phone, code, expiresAt, token);
    expect(isValid).toBe(true);

    const isInvalidCode = isLeadVerificationValid(phone, '000000', expiresAt, token);
    expect(isInvalidCode).toBe(false);

    const isExpired = isLeadVerificationValid(phone, code, Date.now() - 1000, token);
    expect(isExpired).toBe(false);
  });
});
