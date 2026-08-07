'use client';

import { STAFF_ROLES, type StaffRole } from '@/lib/staff';
import styles from '../admin.module.css';
import { changeStaffAccessAction } from './actions';

/**
 * One row's controls.
 *
 * Role and active move in the SAME submit, because they are one decision.
 * Split across two forms, demoting somebody and switching them off is two
 * audit rows and two chances for the second one to be forgotten — which leaves
 * a demoted-but-live account nobody meant to keep.
 */
export default function StaffRowActions({
  staffId,
  email,
  role,
  active,
  isSelf,
  isLastSuperAdmin,
}: {
  staffId: string;
  email: string;
  role: StaffRole;
  active: boolean;
  isSelf: boolean;
  isLastSuperAdmin: boolean;
}) {
  // Both are enforced in changeStaffAccess as well — a server action is a
  // public endpoint and a disabled input proves nothing. Saying WHY here is the
  // difference between a control that looks broken and one that explains itself.
  if (isSelf) {
    return (
      <span className={styles.muted} style={{ fontSize: '.8rem' }}>
        This is you. Somebody else has to change your access — &ldquo;who granted this?&rdquo; should never answer
        &ldquo;they did&rdquo;.
      </span>
    );
  }
  if (isLastSuperAdmin) {
    return (
      <span className={styles.muted} style={{ fontSize: '.8rem' }}>
        The last active super admin. Grant somebody else the role first — removing this one locks the permission
        system behind the permission it needs.
      </span>
    );
  }

  return (
    <form action={changeStaffAccessAction.bind(null, staffId)} className={styles.formStack}>
      <div className={styles.searchRow} style={{ margin: 0, flexWrap: 'wrap' }}>
        <select className={styles.input} name="role" defaultValue={role} aria-label={`Role for ${email}`} style={{ flex: '0 0 140px' }}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{r.replace('_', ' ')}</option>
          ))}
        </select>
        <select className={styles.input} name="active" defaultValue={String(active)} aria-label={`Access for ${email}`} style={{ flex: '0 0 130px' }}>
          <option value="true">Active</option>
          <option value="false">Deactivated</option>
        </select>
        <input className={styles.input} name="reason" placeholder="Why (required)" aria-label={`Reason for changing ${email}`} required />
        <button type="submit" className="btn secondary">Save</button>
      </div>
    </form>
  );
}
