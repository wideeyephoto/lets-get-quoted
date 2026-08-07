import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS,
  ROLE_HELP,
  STAFF_ROLES,
  deniedMessage,
  isStaffRole,
  parseStaffRole,
  permissionsFor,
  staffCan,
  type Permission,
  type StaffRole,
} from '@/lib/staff';

// Until now the answer to "what may this staff member do" was "everything", and
// auth.ts said so out loud. Every mistake in this module is silent and points
// the wrong way, so it gets exercised exhaustively rather than by example.

const active = (role: StaffRole) => ({ role, active: true });
const inactive = (role: StaffRole) => ({ role, active: false });

describe('the matrix', () => {
  it('gives super_admin everything, by construction', () => {
    for (const permission of PERMISSIONS) {
      expect(staffCan(active('super_admin'), permission), `super_admin lacks ${permission}`).toBe(true);
    }
  });

  it('gives read_only nothing at all', () => {
    for (const permission of PERMISSIONS) {
      expect(staffCan(active('read_only'), permission), `read_only has ${permission}`).toBe(false);
    }
  });

  // Anybody who can see a problem should be able to write down what they saw.
  it('lets every working role leave a note', () => {
    for (const role of STAFF_ROLES) {
      if (role === 'read_only') continue;
      expect(staffCan(active(role), 'account.support'), `${role} cannot support`).toBe(true);
    }
  });

  it('keeps money away from support, risk and ops', () => {
    const money: Permission[] = ['money.credit', 'money.refund', 'money.payouts', 'money.plan'];
    for (const role of ['support', 'risk', 'ops'] as StaffRole[]) {
      for (const permission of money) {
        expect(staffCan(active(role), permission), `${role} can ${permission}`).toBe(false);
      }
    }
  });

  it('keeps enforcement away from finance, support and ops', () => {
    for (const role of ['finance', 'support', 'ops'] as StaffRole[]) {
      expect(staffCan(active(role), 'account.enforce'), `${role} can enforce`).toBe(false);
    }
  });

  // The one thing in the console that cannot be undone.
  it('lets nobody but a super admin delete an account', () => {
    for (const role of STAFF_ROLES) {
      if (role === 'super_admin') continue;
      expect(staffCan(active(role), 'account.delete'), `${role} can delete`).toBe(false);
    }
  });

  it('lets nobody but a super admin change what other staff can do', () => {
    for (const role of STAFF_ROLES) {
      if (role === 'super_admin') continue;
      expect(staffCan(active(role), 'staff.manage'), `${role} can manage staff`).toBe(false);
    }
  });

  it('grants finance exactly the money permissions and nothing else', () => {
    expect([...permissionsFor('finance')].sort()).toEqual(
      ['account.support', 'money.credit', 'money.payouts', 'money.plan', 'money.refund'].sort(),
    );
  });
});

describe('inactive beats role', () => {
  // Ordered the other way round, "we removed their access" quietly becomes "we
  // changed their label".
  it('denies a deactivated super admin everything', () => {
    for (const permission of PERMISSIONS) {
      expect(staffCan(inactive('super_admin'), permission), `inactive super_admin has ${permission}`).toBe(false);
    }
  });

  it('denies a missing staff row everything', () => {
    expect(staffCan(null, 'account.support')).toBe(false);
    expect(staffCan(undefined, 'account.support')).toBe(false);
  });
});

describe('reading a role off config or a form', () => {
  it('accepts the roles it knows', () => {
    for (const role of STAFF_ROLES) expect(isStaffRole(role)).toBe(true);
    expect(isStaffRole('root')).toBe(false);
    expect(isStaffRole('')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });

  // 'admin' is what every bare ADMIN_EMAILS entry has always resolved to, and it
  // meant full access. If it stopped meaning that, this change would lock the
  // team out of their own console on the deploy that shipped it.
  it('keeps the legacy admin token meaning full access', () => {
    expect(parseStaffRole('admin', 'read_only')).toBe('super_admin');
    expect(parseStaffRole('ADMIN', 'read_only')).toBe('super_admin');
    expect(parseStaffRole(' admin ', 'read_only')).toBe('super_admin');
  });

  it('maps the other names people will actually type', () => {
    expect(parseStaffRole('engineering', 'read_only')).toBe('ops');
    expect(parseStaffRole('operations', 'read_only')).toBe('ops');
    expect(parseStaffRole('readonly', 'super_admin')).toBe('read_only');
  });

  // The two callers want opposite fallbacks, and the parameter is how they say
  // so: an unlabelled config entry has always meant full access, while a
  // malformed form submission must never grant more than it names.
  it('honours the caller fallback for anything unrecognised', () => {
    expect(parseStaffRole('wizard', 'super_admin')).toBe('super_admin');
    expect(parseStaffRole('wizard', 'read_only')).toBe('read_only');
    expect(parseStaffRole('', 'read_only')).toBe('read_only');
    expect(parseStaffRole(undefined, 'support')).toBe('support');
    expect(parseStaffRole(null, 'support')).toBe('support');
  });
});

describe('the words staff read', () => {
  it('explains every role', () => {
    for (const role of STAFF_ROLES) expect(ROLE_HELP[role], `no help for ${role}`).toBeTruthy();
  });

  it('names both the role and the missing permission when refusing', () => {
    const message = deniedMessage('support', 'money.refund');
    expect(message).toContain('support');
    expect(message).toContain('money.refund');
  });
});
