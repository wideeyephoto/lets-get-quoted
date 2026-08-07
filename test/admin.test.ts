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

// ADMIN_EMAILS is now the OUTER gate only: it decides who can reach /admin at
// all, and the staff row decides what they can do once inside. The role token
// here is a SEED for that row on first sign-in, never the authority itself —
// once a staff row exists the database wins, and editing this variable changes
// who gets in rather than what they can do.
//
// 'admin' still resolves to full access (now spelled super_admin), and it must:
// it is what every bare entry has always meant, and a security change that
// silently demotes the person deploying it gets reverted rather than fixed.
describe('staffRoleFor', () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  });

  it('defaults a bare email to full access, as it always has', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com';
    expect(staffRoleFor('boss@letsgetquoted.com')).toBe('super_admin');
  });

  it('parses "email:role" pairs, case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com, support@letsgetquoted.com:support, cfo@letsgetquoted.com:finance';
    expect(staffRoleFor('support@letsgetquoted.com')).toBe('support');
    expect(staffRoleFor('CFO@LetsGetQuoted.com')).toBe('finance');
    expect(staffRoleFor('boss@letsgetquoted.com')).toBe('super_admin');
  });

  // Deliberately fails OPEN, unlike every other parse in this codebase. A typo
  // in ADMIN_EMAILS that silently downgraded somebody to read_only would look
  // exactly like a bug in the new permission system, on the day it shipped.
  it('falls back to full access for an unrecognized role token', () => {
    process.env.ADMIN_EMAILS = 'weird@letsgetquoted.com:superuser';
    expect(staffRoleFor('weird@letsgetquoted.com')).toBe('super_admin');
  });

  it('still understands the legacy admin token', () => {
    process.env.ADMIN_EMAILS = 'boss@letsgetquoted.com:admin';
    expect(staffRoleFor('boss@letsgetquoted.com')).toBe('super_admin');
  });

  it('still grants access regardless of role', () => {
    process.env.ADMIN_EMAILS = 'support@letsgetquoted.com:support';
    expect(isAdminEmail('support@letsgetquoted.com')).toBe(true);
  });

  // Never reached in practice — requireAdmin calls isAdminEmail first, and an
  // unlisted email 404s before a role is ever asked for.
  it('defaults to full access for an unlisted email', () => {
    delete process.env.ADMIN_EMAILS;
    expect(staffRoleFor('nobody@letsgetquoted.com')).toBe('super_admin');
  });
});
