import { requirePermission } from '@/lib/auth';
import { activeSuperAdminCount, listStaff, listStaffRoleChanges } from '@/lib/staff-directory';
import { PERMISSIONS, ROLE_HELP, STAFF_ROLES, permissionsFor } from '@/lib/staff';
import styles from '../admin.module.css';
import StaffRowActions from './StaffRowActions';
import { inviteStaffAction } from './actions';

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
export const metadata = { title: 'Staff' };

const DONE: Record<string, string> = { changed: 'Access updated, and recorded below.', invited: 'Staff access provisioned and invitation sent.' };
const ERRORS: Record<string, string> = {
  reason: 'Say why. This is the one change in the console that always needs a reason.',
  role: 'That is not a role this console knows.',
  self: 'You cannot change your own access — ask another super admin.',
  last_super_admin: 'That is the last active super admin. Grant somebody else the role first.',
  not_found: 'That staff member no longer exists.',
  failed: 'Could not save that. Try again in a moment.',
  email: 'Enter a valid email address.',
  exists: 'That email already has a staff row. Update it in the directory instead.',
  invite_failed: 'Access was provisioned, but the invitation email failed. Verify delivery before sharing access.',
};

function fmt(v: string | null): string {
  return v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export default async function AdminStaffPage({ searchParams }: { searchParams: { done?: string; error?: string } }) {
  const ctx = await requirePermission('staff.manage');
  let directoryAvailable = true;
  let historyAvailable = true;
  let countAvailable = true;
  const [staff, changes, superAdmins] = await Promise.all([
    listStaff(ctx.admin, () => { directoryAvailable = false; }),
    listStaffRoleChanges(ctx.admin, 100, () => { historyAvailable = false; }),
    activeSuperAdminCount(ctx.admin, () => { countAvailable = false; }),
  ]);

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Access</p>
        <h1 className={styles.title}>Staff</h1>
        <p className={styles.lead}>
          Invite and govern staff here. <code>ADMIN_EMAILS</code> remains the break-glass bootstrap list; active directory
          rows can sign in without a deploy.
        </p>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERRORS[searchParams.error] ?? 'Something went wrong.'}</div> : null}
      {!directoryAvailable || !historyAvailable || !countAvailable ? <div className={`${styles.banner} ${styles.err}`}>Staff access data is incomplete. Blank sections are not being treated as empty.</div> : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Invite staff</h2>
        <form action={inviteStaffAction} className={styles.formStack}>
          <div className={styles.searchRow} style={{ margin: 0 }}>
            <label className={styles.srOnly} htmlFor="staff-name">Display name</label>
            <input id="staff-name" className={styles.input} name="display_name" placeholder="Display name" />
            <label className={styles.srOnly} htmlFor="staff-email">Email</label>
            <input id="staff-email" className={styles.input} name="email" type="email" required placeholder="name@company.com" />
            <label className={styles.srOnly} htmlFor="staff-role">Role</label>
            <select id="staff-role" className={styles.input} name="role" defaultValue="read_only">{STAFF_ROLES.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}</select>
          </div>
          <label htmlFor="staff-invite-reason">Why this person needs access</label>
          <input id="staff-invite-reason" className={styles.input} name="reason" required minLength={4} placeholder="Team and responsibility" />
          <button className="btn primary" type="submit">Provision and send invite</button>
        </form>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>People</h2>
        {directoryAvailable && staff.length === 0 ? (
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
                      {person.invited_at && !person.last_seen_at ? <div className={styles.muted} style={{ fontSize: '.72rem' }}>Invited {fmt(person.invited_at)} by {person.invited_by ?? 'staff'} · not signed in yet</div> : null}
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
        <h2 className={styles.panelTitle}>What each role can do</h2>
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
        <h2 className={styles.panelTitle}>Access history</h2>
        <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.8rem' }}>
          Append-only, enforced by the database. Nothing here can be edited or removed, including by a super admin.
        </p>
        {historyAvailable && changes.length === 0 ? (
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
