import { describe, it, expect } from 'vitest';
import {
  generateOwnerVerificationCode,
  ownerPhoneVerificationToken,
  isOwnerPhoneVerificationValid,
} from '@/lib/owner-phone-verification';
import { ownerVerificationCodeText } from '@/lib/sms-templates';

describe('owner phone 2FA verification', () => {
  it('generates a 6-digit numeric OTP code', () => {
    const code = generateOwnerVerificationCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('mints and validates valid tokens', () => {
    const accountId = 'acc-test-123';
    const phone = '+12485550100';
    const code = '481920';
    const expiresAt = Date.now() + 600000;

    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);
    expect(typeof token).toBe('string');
    expect(token.length).toBe(64); // SHA-256 hex length

    const isValid = isOwnerPhoneVerificationValid(accountId, phone, code, expiresAt, token);
    expect(isValid).toBe(true);
  });

  it('refuses invalid or tampered codes', () => {
    const accountId = 'acc-test-123';
    const phone = '+12485550100';
    const code = '481920';
    const expiresAt = Date.now() + 600000;

    const token = ownerPhoneVerificationToken(accountId, phone, code, expiresAt);

    expect(isOwnerPhoneVerificationValid(accountId, phone, '999999', expiresAt, token)).toBe(false);
    expect(isOwnerPhoneVerificationValid(accountId, '+18105550199', code, expiresAt, token)).toBe(false);
    expect(isOwnerPhoneVerificationValid('acc-other', phone, code, expiresAt, token)).toBe(false);
  });

  it('refuses expired tokens', () => {
    const accountId = 'acc-test-123';
    const phone = '+12485550100';
    const code = '481920';
    const pastExpiresAt = Date.now() - 1000;

    const token = ownerPhoneVerificationToken(accountId, phone, code, pastExpiresAt);
    expect(isOwnerPhoneVerificationValid(accountId, phone, code, pastExpiresAt, token)).toBe(false);
  });

  it('formats the transactional OTP SMS text with STOP opt-out', () => {
    const body = ownerVerificationCodeText({ code: '754912' });
    expect(body).toContain('754912');
    expect(body).toContain('Let’s Get Quoted verification code');
    expect(body).toContain('Reply STOP to opt out');
  });
});
