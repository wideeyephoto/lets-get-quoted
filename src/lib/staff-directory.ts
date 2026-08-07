import type { SupabaseClient } from '@supabase/supabase-js';
import { logAdminAction, type AuditActor } from '@/lib/admin';
import { parseStaffRole, type StaffRole } from '@/lib/staff';

/**
 * Reading and changing the staff directory.
 *
 * Separate from lib/staff.ts, which is the pure matrix: this half talks to the
 * database, and the two are kept apart so the question "what may this role do"
 * stays answerable without one.
 */

export type StaffRow = {
  id: string;
  email: string;
  role: StaffRole;
  display_name: string | null;
  active: boolean;
  deactivated_at: string | null;
  deactivated_by: string | null;
  last_seen_at: string | null;
  created_at: string;
};

const COLUMNS = 'id, email, role, display_name, active, deactivated_at, deactivated_by, last_seen_at, created_at';

export async function listStaff(admin: SupabaseClient): Promise<StaffRow[]> {
  const { data, error } = await admin
    .from('staff')
    .select(COLUMNS)
    // Active first, then alphabetically. A directory sorted by creation date
    // buries the people who still work here under the people who do not.
    .order('active', { ascending: false })
    .order('email', { ascending: true });
  if (error) {
    console.error('listStaff failed:', error);
    return [];
  }
  return ((data ?? []) as StaffRow[]).map((row) => ({ ...row, role: parseStaffRole(row.role, 'read_only') }));
}

export type StaffRoleChange = {
  id: string;
  staff_email: string;
  from_role: string | null;
  to_role: string | null;
  from_active: boolean | null;
  to_active: boolean | null;
  reason: string | null;
  changed_by: string;
  created_at: string;
};

export async function listStaffRoleChanges(admin: SupabaseClient, limit = 100): Promise<StaffRoleChange[]> {
  const { data, error } = await admin
    .from('staff_role_changes')
    .select('id, staff_email, from_role, to_role, from_active, to_active, reason, changed_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('listStaffRoleChanges failed:', error);
    return [];
  }
  return (data ?? []) as StaffRoleChange[];
}

/**
 * How many active super admins there are.
 *
 * The whole console has exactly one way to hand out permissions, and it needs
 * staff.manage — which only super_admin carries. Removing the last one is a
 * lockout that cannot be undone from inside the product: it needs somebody with
 * database access to repair, at exactly the moment nobody can grant that.
 */
export async function activeSuperAdminCount(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
    .eq('active', true);
  if (error) {
    console.error('activeSuperAdminCount failed:', error);
    // Fail as though this were the last one. Refusing a legitimate change is
    // recoverable; permitting the one that locks everybody out is not.
    return 1;
  }
  return count ?? 0;
}

export type StaffChangeResult = { ok: true } | { ok: false; error: 'not_found' | 'last_super_admin' | 'self' | 'failed' };

/**
 * Change a staff member's role, or their active flag, or both.
 *
 * Refuses three things, and the refusals are the interesting part:
 *
 *   self          You cannot change your own role or deactivate yourself. Not
 *                 because it is dangerous — it is the audit story. "Who granted
 *                 this?" should never answer "they did", and self-demotion by
 *                 accident is a support ticket nobody can resolve.
 *   last_super    The last active super admin cannot be demoted or switched
 *                 off. staff.manage belongs to super_admin alone, so removing
 *                 the last one locks the console's permissions behind the
 *                 permission you just removed.
 *   not_found     Somebody edited a row that has since gone.
 */
export async function changeStaffAccess(
  admin: SupabaseClient,
  actor: AuditActor & { staff?: { id: string } | null },
  input: { staffId: string; role?: StaffRole; active?: boolean; reason: string | null },
): Promise<StaffChangeResult> {
  const { data: current } = await admin.from('staff').select(COLUMNS).eq('id', input.staffId).maybeSingle();
  if (!current) return { ok: false, error: 'not_found' };
  const row = current as StaffRow;

  if (actor.staff?.id && actor.staff.id === row.id) return { ok: false, error: 'self' };

  const nextRole = input.role ?? parseStaffRole(row.role, 'read_only');
  const nextActive = input.active ?? row.active;

  const wasLiveSuperAdmin = row.active && parseStaffRole(row.role, 'read_only') === 'super_admin';
  const staysLiveSuperAdmin = nextActive && nextRole === 'super_admin';
  if (wasLiveSuperAdmin && !staysLiveSuperAdmin) {
    if ((await activeSuperAdminCount(admin)) <= 1) return { ok: false, error: 'last_super_admin' };
  }

  const patch: Record<string, unknown> = {
    role: nextRole,
    active: nextActive,
    updated_at: new Date().toISOString(),
  };
  // Only stamped on the transition, so reactivating and deactivating again
  // does not read as one long absence.
  if (row.active && !nextActive) {
    patch.deactivated_at = new Date().toISOString();
    patch.deactivated_by = actor.adminEmail;
  }
  if (!row.active && nextActive) {
    patch.deactivated_at = null;
    patch.deactivated_by = null;
  }

  const { error } = await admin.from('staff').update(patch).eq('id', row.id);
  if (error) {
    console.error('changeStaffAccess failed:', error);
    return { ok: false, error: 'failed' };
  }

  // The permanent record. Written even when only the active flag moved, because
  // "when did they lose access" is the same question as "when did their role
  // change" to anybody asking later.
  const { error: logError } = await admin.from('staff_role_changes').insert({
    staff_id: row.id,
    staff_email: row.email,
    from_role: row.role,
    to_role: nextRole,
    from_active: row.active,
    to_active: nextActive,
    reason: input.reason,
    changed_by: actor.adminEmail,
  });
  if (logError) console.error('staff_role_changes insert failed:', logError);

  await logAdminAction(admin, actor, {
    action: 'staff_access_change',
    targetType: 'staff',
    targetId: row.id,
    reason: input.reason,
    before: { role: row.role, active: row.active },
    after: { role: nextRole, active: nextActive },
    meta: { email: row.email },
  });

  return { ok: true };
}
