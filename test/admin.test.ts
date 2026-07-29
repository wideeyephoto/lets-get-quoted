import { describe, it, expect, afterEach } from 'vitest';
import { isAdminEmail } from '../src/lib/auth';

// The allowlist is the whole security boundary for /admin, so pin its behavior:
// it must fail closed (empty/undefined env → nobody), be case-insensitive, and
// never match on partial/substring emails.
describe('isAdminEmail', () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  });

  it('denies everyone when ADMIN_EMAILS is unset', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });

  it('denies everyone when ADMIN_EMAILS is empty', () => {
    process.env.ADMIN_EMAILS = '   ';
    expect(isAdminEmail('anyone@example.com')).toBe(false);
  });

  it('allows an exact listed email, case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com, ops@letsgetquoted.com';
    expect(isAdminEmail('boss@letsgetquoted.com')).toBe(true);
    expect(isAdminEmail('BOSS@LetsGetQuoted.com')).toBe(true);
    expect(isAdminEmail('  ops@letsgetquoted.com  ')).toBe(true);
  });

  it('denies an unlisted email', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com';
    expect(isAdminEmail('intruder@letsgetquoted.com')).toBe(false);
  });

  it('does not match on substrings or empty input', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com';
    expect(isAdminEmail('boss@letsgetquoted.com.evil.com')).toBe(false);
    expect(isAdminEmail('')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
  });
});
