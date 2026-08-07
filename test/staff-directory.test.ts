import { describe, it, expect } from 'vitest';
import { changeStaffAccess, type StaffChangeResult } from '@/lib/staff-directory';

// changeStaffAccess is the one write in the console that can lock everybody out
// of the console. It refuses three things, and those refusals are what this
// covers — against a fake client, because the interesting logic is the ordering
// of the checks, not the SQL.

type Row = { id: string; email: string; role: string; active: boolean };

function fakeDb(rows: Row[], opts: { superAdmins?: number } = {}) {
  const updates: Record<string, unknown>[] = [];
  const roleChanges: Record<string, unknown>[] = [];
  const auditRows: Record<string, unknown>[] = [];

  const client = {
    from(table: string) {
      if (table === 'staff') {
        return {
          select(_cols: string, options?: { count?: string; head?: boolean }) {
            if (options?.head) {
              // activeSuperAdminCount's shape: filters then awaits.
              const q = {
                eq: () => q,
                then: (resolve: (v: unknown) => void) => resolve({ count: opts.superAdmins ?? 0, error: null }),
              };
              return q;
            }
            return {
              eq: (_c: string, id: string) => ({
                maybeSingle: async () => ({ data: rows.find((r) => r.id === id) ?? null }),
              }),
            };
          },
          update(patch: Record<string, unknown>) {
            updates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'staff_role_changes') {
        return { insert: async (row: Record<string, unknown>) => { roleChanges.push(row); return { error: null }; } };
      }
      if (table === 'admin_actions') {
        return { insert: async (row: Record<string, unknown>) => { auditRows.push(row); return { error: null }; } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, updates, roleChanges, auditRows };
}

const actor = (staffId: string) => ({
  adminEmail: 'boss@letsgetquoted.com',
  ip: '1.2.3.4',
  requestId: 'req-1',
  staff: { id: staffId },
  permission: 'staff.manage',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (db: ReturnType<typeof fakeDb>, a: ReturnType<typeof actor>, input: Parameters<typeof changeStaffAccess>[2]) =>
  changeStaffAccess(db.client as any, a, input) as Promise<StaffChangeResult>;

describe('you cannot change your own access', () => {
  // Not because it is dangerous — it is the audit story. "Who granted this?"
  // should never answer "they did".
  it('refuses, before it looks at anything else', async () => {
    const db = fakeDb([{ id: 's1', email: 'boss@letsgetquoted.com', role: 'support', active: true }], { superAdmins: 5 });
    const result = await run(db, actor('s1'), { staffId: 's1', role: 'super_admin', reason: 'promote me' });
    expect(result).toEqual({ ok: false, error: 'self' });
    expect(db.updates).toHaveLength(0);
    expect(db.roleChanges).toHaveLength(0);
  });
});

describe('the last active super admin is protected', () => {
  const lastOne: Row = { id: 's2', email: 'only@letsgetquoted.com', role: 'super_admin', active: true };

  // staff.manage belongs to super_admin alone, so removing the last one locks
  // the permission system behind the permission it needs — unrecoverable from
  // inside the product.
  it('cannot be demoted', async () => {
    const db = fakeDb([lastOne], { superAdmins: 1 });
    expect(await run(db, actor('s1'), { staffId: 's2', role: 'support', reason: 'left the team' })).toEqual({
      ok: false,
      error: 'last_super_admin',
    });
    expect(db.updates).toHaveLength(0);
  });

  it('cannot be deactivated', async () => {
    const db = fakeDb([lastOne], { superAdmins: 1 });
    expect(await run(db, actor('s1'), { staffId: 's2', active: false, reason: 'left the team' })).toEqual({
      ok: false,
      error: 'last_super_admin',
    });
  });

  it('lets go once there is a second one', async () => {
    const db = fakeDb([lastOne], { superAdmins: 2 });
    expect(await run(db, actor('s1'), { staffId: 's2', role: 'support', reason: 'moved to support' })).toEqual({ ok: true });
    expect(db.updates[0]).toMatchObject({ role: 'support' });
  });

  // Nothing is being removed, so the count never needs consulting.
  it('does not block a super admin staying a super admin', async () => {
    const db = fakeDb([lastOne], { superAdmins: 1 });
    expect(await run(db, actor('s1'), { staffId: 's2', role: 'super_admin', reason: 'no change' })).toEqual({ ok: true });
  });

  // An already-inactive row is not holding the console open, so demoting it
  // must not be mistaken for removing the last live super admin.
  it('ignores an inactive super admin when protecting the last one', async () => {
    const db = fakeDb([{ id: 's3', email: 'gone@letsgetquoted.com', role: 'super_admin', active: false }], { superAdmins: 1 });
    expect(await run(db, actor('s1'), { staffId: 's3', role: 'read_only', reason: 'tidy up' })).toEqual({ ok: true });
  });
});

describe('an ordinary change', () => {
  const person: Row = { id: 's4', email: 'sam@letsgetquoted.com', role: 'support', active: true };

  it('records what it was and what it became, and why', async () => {
    const db = fakeDb([person], { superAdmins: 3 });
    expect(await run(db, actor('s1'), { staffId: 's4', role: 'finance', reason: 'moved to billing' })).toEqual({ ok: true });

    expect(db.roleChanges[0]).toMatchObject({
      staff_email: 'sam@letsgetquoted.com',
      from_role: 'support',
      to_role: 'finance',
      from_active: true,
      to_active: true,
      reason: 'moved to billing',
      changed_by: 'boss@letsgetquoted.com',
    });
    // And the same change reaches the main audit trail, with the request
    // context that makes the row answerable later.
    expect(db.auditRows[0]).toMatchObject({
      action: 'staff_access_change',
      reason: 'moved to billing',
      ip: '1.2.3.4',
      request_id: 'req-1',
      permission: 'staff.manage',
      before_value: { role: 'support', active: true },
      after_value: { role: 'finance', active: true },
    });
  });

  it('stamps who switched somebody off, and when', async () => {
    const db = fakeDb([person], { superAdmins: 3 });
    await run(db, actor('s1'), { staffId: 's4', active: false, reason: 'left' });
    expect(db.updates[0]).toMatchObject({ active: false, deactivated_by: 'boss@letsgetquoted.com' });
    expect(db.updates[0].deactivated_at).toBeTruthy();
  });

  // Otherwise a rehire reads as one long unbroken absence.
  it('clears the deactivation stamp on the way back in', async () => {
    const db = fakeDb([{ ...person, active: false }], { superAdmins: 3 });
    await run(db, actor('s1'), { staffId: 's4', active: true, reason: 'back from leave' });
    expect(db.updates[0]).toMatchObject({ active: true, deactivated_at: null, deactivated_by: null });
  });

  it('keeps the role when only the active flag moves, and vice versa', async () => {
    const db = fakeDb([person], { superAdmins: 3 });
    await run(db, actor('s1'), { staffId: 's4', active: false, reason: 'left' });
    expect(db.updates[0]).toMatchObject({ role: 'support' });
  });

  it('refuses a row that has since gone', async () => {
    const db = fakeDb([], { superAdmins: 3 });
    expect(await run(db, actor('s1'), { staffId: 'nope', role: 'support', reason: 'x' })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});
