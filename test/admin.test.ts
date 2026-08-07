import { describe, it, expect, afterEach } from 'vitest';
import { isAdminEmail, staffRoleFor } from '../src/lib/auth';

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

// Roles are additive on top of the allowlist, never a stricter gate: every
// entry above (bare or "email:role") must keep granting the same /admin access
// it always did. See staffRoleFor's doc comment in auth.ts for why role is not
// an authorization boundary.
describe('staffRoleFor', () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  });

  it('defaults a bare email to the admin role', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com';
    expect(staffRoleFor('boss@letsgetquoted.com')).toBe('admin');
  });

  it('parses "email:role" pairs, case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com, support@letsgetquoted.com:support, cfo@letsgetquoted.com:finance';
    expect(staffRoleFor('support@letsgetquoted.com')).toBe('support');
    expect(staffRoleFor('CFO@LetsGetQuoted.com')).toBe('finance');
    expect(staffRoleFor('boss@letsgetquoted.com')).toBe('admin');
  });

  it('falls back to admin for an unrecognized role token', () => {
    process.env.ADMIN_EMAILS = 'weird@letsgetquoted.com:superuser';
    expect(staffRoleFor('weird@letsgetquoted.com')).toBe('admin');
  });

  it('still grants access regardless of role', () => {
    process.env.ADMIN_EMAILS = 'support@letsgetquoted.com:support';
    expect(isAdminEmail('support@letsgetquoted.com')).toBe(true);
  });

  it('defaults to admin for an unlisted email', () => {
    delete process.env.ADMIN_EMAILS;
    expect(staffRoleFor('nobody@letsgetquoted.com')).toBe('admin');
  });
});
