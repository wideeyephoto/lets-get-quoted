import { requirePermission } from '@/lib/auth';
import { activeSuperAdminCount, listStaff, listStaffRoleChanges } from '@/lib/staff-directory';
import { PERMISSIONS, ROLE_HELP, STAFF_ROLES, permissionsFor } from '@/lib/staff';
import styles from '../admin.module.css';
import StaffRowActions from './StaffRowActions';

/**
 * Who works here, and what each of them may do.
 *
 * Until this page existed, staff were strings in an environment variable and
 * their role was decorative. Roles are now enforced, which means there has to
 * be somewhere to change one that is not a redeploy — and somewhere that leaves
 * a record, because "when did this person get the ability to issue refunds" is
 * asked long after the change.
 *
 * Reaching this page needs staff.manage, which only super_admin carries. That
 * is deliberate and it is also the reason the last active super admin cannot be
 * demoted from it.
 */

export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = { changed: 'Access updated, and recorded below.' };
const ERRORS: Record<string, string> = {
  reason: 'Say why. This is the one change in the console that always needs a reason.',
  role: 'That is not a role this console knows.',
  self: 'You cannot change your own access — ask another super admin.',
  last_super_admin: 'That is the last active super admin. Grant somebody else the role first.',
  not_found: 'That staff member no longer exists.',
  failed: 'Could not save that. Try again in a moment.',
};

function fmt(v: string | null): string {
  return v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default async function AdminStaffPage({ searchParams }: { searchParams: { done?: string; error?: string } }) {
  const ctx = await requirePermission('staff.manage');
  const [staff, changes, superAdmins] = await Promise.all([
    listStaff(ctx.admin),
    listStaffRoleChanges(ctx.admin, 100),
    activeSuperAdminCount(ctx.admin),
  ]);

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Access</p>
        <h1 className={styles.title}>Staff</h1>
        <p className={styles.lead}>
          A staff row appears the first time somebody on <code>ADMIN_EMAILS</code> signs in, seeded with the role that
          variable declares. After that this page is what governs — editing the variable changes who can get through
          the door, never what they can do once inside.
        </p>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERRORS[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      <section className={styles.panel}>
        <p className={styles.panelTitle}>People</p>
        {staff.length === 0 ? (
          <p className={styles.emptyState}>Nobody has signed in to the console yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Email</th><th>Role</th><th>Access</th><th>Last seen</th><th>Change</th></tr>
              </thead>
              <tbody>
                {staff.map((person) => (
                  <tr key={person.id}>
                    <td>
                      {person.email}
                      {person.id === ctx.staff.id ? <span className={styles.muted}> (you)</span> : null}
                    </td>
                    <td><span className={`${styles.pill} ${person.role === 'super_admin' ? styles.warn : styles.neutral}`}>{person.role.replace('_', ' ')}</span></td>
                    <td>
                      {person.active ? (
                        <span className={`${styles.pill} ${styles.good}`}>Active</span>
                      ) : (
                        <>
                          <span className={`${styles.pill} ${styles.bad}`}>Off</span>
                          <div className={styles.muted} style={{ fontSize: '.75rem' }}>
                            {fmt(person.deactivated_at)}{person.deactivated_by ? ` by ${person.deactivated_by}` : ''}
                          </div>
                        </>
                      )}
                    </td>
                    {/* Not decoration: an access review is "who has power here
                        and has not used it in a year", and that needs a date. */}
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{fmt(person.last_seen_at)}</td>
                    <td>
                      <StaffRowActions
                        staffId={person.id}
                        email={person.email}
                        role={person.role}
                        active={person.active}
                        isSelf={person.id === ctx.staff.id}
                        isLastSuperAdmin={person.active && person.role === 'super_admin' && superAdmins <= 1}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <p className={styles.panelTitle}>What each role can do</p>
        {/* Rendered from the same matrix the server enforces, so this cannot
            drift into describing permissions nobody actually has. A role list
            nobody can interpret gets everyone made a super admin within a
            month. */}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Permission</th>{STAFF_ROLES.map((r) => <th key={r}>{r.replace('_', ' ')}</th>)}</tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission}>
                  <td><code>{permission}</code></td>
                  {STAFF_ROLES.map((role) => (
                    <td key={role} style={{ textAlign: 'center' }}>
                      {permissionsFor(role).includes(permission)
                        ? <span aria-label="yes">&#10003;</span>
                        : <span className={styles.muted} aria-label="no">&mdash;</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className={styles.kv} style={{ marginTop: '1rem' }}>
          {STAFF_ROLES.map((role) => (
            <div key={role} style={{ display: 'contents' }}>
              <dt>{role.replace('_', ' ')}</dt>
              <dd>{ROLE_HELP[role]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.panel}>
        <p className={styles.panelTitle}>Access history</p>
        <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.8rem' }}>
          Append-only, enforced by the database. Nothing here can be edited or removed, including by a super admin.
        </p>
        {changes.length === 0 ? (
          <p className={styles.emptyState}>No access changes recorded yet.</p>
        ) : (
          <ul className={styles.timeline}>
            {changes.map((change) => (
              <li key={change.id}>
                <time>{fmt(change.created_at)}</time>
                <span>
                  <span className={styles.timelineActor}>{change.changed_by}</span>
                  {' set '}
                  <strong>{change.staff_email}</strong>
                  {change.from_role !== change.to_role ? ` from ${change.from_role} to ${change.to_role}` : ''}
                  {change.from_active !== change.to_active ? ` · ${change.to_active ? 'reactivated' : 'deactivated'}` : ''}
                  {change.reason ? <span className={styles.muted}> — {change.reason}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
