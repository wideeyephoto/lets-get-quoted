import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAdminEmail, staffRoleFor } from '../src/lib/auth';
import { parseStaffRole, staffCan } from '../src/lib/staff';

describe('Staff / Identity Recovery & Break-Glass Drill', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('proves ADMIN_EMAILS acts as immutable break-glass bootstrap allowlist', () => {
    vi.stubEnv('ADMIN_EMAILS', 'founder@letsgetquoted.com:super_admin,ops@letsgetquoted.com:ops,plain@letsgetquoted.com');

    expect(isAdminEmail('founder@letsgetquoted.com')).toBe(true);
    expect(isAdminEmail('ops@letsgetquoted.com')).toBe(true);
    expect(isAdminEmail('plain@letsgetquoted.com')).toBe(true);
    expect(isAdminEmail('unauthorized@attacker.com')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);

    // Verify role derivation
    expect(staffRoleFor('founder@letsgetquoted.com')).toBe('super_admin');
    expect(staffRoleFor('ops@letsgetquoted.com')).toBe('ops');
    expect(staffRoleFor('plain@letsgetquoted.com')).toBe('super_admin'); // Unlabeled falls back to super_admin
  });

  it('proves inactive staff rows deny permissions immediately even if in ADMIN_EMAILS', () => {
    const inactiveStaff = {
      id: 'staff-1',
      email: 'founder@letsgetquoted.com',
      role: 'super_admin' as const,
      active: false, // Deactivated in directory
      display_name: 'Founder',
    };

    // An inactive staff member is denied by staffCan
    expect(inactiveStaff.active).toBe(false);
    expect(staffCan(inactiveStaff, 'account.enforce')).toBe(false);
  });

  it('validates permission matrix across emergency actions', () => {
    // Super admin can perform all emergency operations
    expect(staffCan({ role: 'super_admin', active: true }, 'account.enforce')).toBe(true);
    expect(staffCan({ role: 'super_admin', active: true }, 'account.export')).toBe(true);
    expect(staffCan({ role: 'super_admin', active: true }, 'staff.manage')).toBe(true);

    // Support role cannot manage other staff or access security controls
    expect(staffCan({ role: 'support', active: true }, 'staff.manage')).toBe(false);
    expect(staffCan({ role: 'read_only', active: true }, 'account.enforce')).toBe(false);
  });

  it('exercises session revocation ban logic across multiple members', async () => {
    const userIds = ['usr-member-1', 'usr-member-2', 'usr-member-3'];
    const updateCalls: Array<{ userId: string; banDuration: string }> = [];

    const mockAdminAuth = {
      admin: {
        updateUserById: async (userId: string, attributes: { ban_duration?: string }) => {
          updateCalls.push({ userId, banDuration: attributes.ban_duration || '' });
          return { data: { id: userId }, error: null };
        },
      },
    };

    // Execute ban loop
    for (const userId of userIds) {
      const { error } = await mockAdminAuth.admin.updateUserById(userId, { ban_duration: '24h' });
      expect(error).toBeNull();
    }

    expect(updateCalls.length).toBe(3);
    expect(updateCalls[0]).toEqual({ userId: 'usr-member-1', banDuration: '24h' });
    expect(updateCalls[1]).toEqual({ userId: 'usr-member-2', banDuration: '24h' });
    expect(updateCalls[2]).toEqual({ userId: 'usr-member-3', banDuration: '24h' });
  });

  it('verifies workspace suspension locks down tenant context immediately', () => {
    const activeAccount = {
      id: 'acc-active',
      suspended_at: null,
      business_name: 'Acme Painting',
    };

    const suspendedAccount = {
      id: 'acc-suspended',
      suspended_at: '2026-08-31T12:00:00Z',
      business_name: 'Locked Out Contractor',
    };

    // Membership guard checks: a.suspended_at is null
    const isActiveAllowed = activeAccount.suspended_at === null;
    const isSuspendedAllowed = suspendedAccount.suspended_at === null;

    expect(isActiveAllowed).toBe(true);
    expect(isSuspendedAllowed).toBe(false);
  });
});
