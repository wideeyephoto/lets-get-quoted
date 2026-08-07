import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listAdminActions } from '@/lib/admin';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

function summarize(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta ?? {});
  if (!keys.length) return '';
  return keys
    .slice(0, 4)
    .map((k) => `${k}: ${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}`)
    .join(' · ');
}

/**
 * Only the fields that actually MOVED, as "was → now".
 *
 * Dumping both blobs side by side is how a before/after column becomes
 * unreadable and then ignored: on a suspend, four of the five keys are
 * identical and the eye has to find the one that is not.
 */
function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!before && !after) return '';
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const moved = keys.filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
  if (moved.length === 0) return '';
  return moved.slice(0, 3).map((k) => `${k}: ${show(before?.[k])} → ${show(after?.[k])}`).join(' · ');
}

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default async function AdminAuditPage() {
  const { admin } = await requireAdmin();
  const actions = await listAdminActions(admin, { limit: 250 });

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Accountability</p>
        <h1 className={styles.title}>Audit log</h1>
        <p className={styles.lead}>
          Every mutating staff action — refunds, credits, suspensions, lockouts, deletions — with who did it, why, from
          where, and what the thing looked like before. Append-only, enforced by the database: no row here can be
          edited or removed, including by a super admin.
        </p>
      </header>

      <section className={styles.panel}>
        {actions.length === 0 ? (
          <p className={styles.emptyState}>No staff actions recorded yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Staff</th><th>Action</th><th>Account</th><th>Why</th><th>Change</th><th>Details</th></tr></thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      {a.admin_email}
                      {/* The authority and the origin sit under the name rather
                          than in their own columns: they are what you check
                          once something already looks wrong. */}
                      <div className={styles.muted} style={{ fontSize: '.72rem' }}>
                        {a.permission ? <code>{a.permission}</code> : null}
                        {a.ip ? <> · {a.ip}</> : null}
                      </div>
                    </td>
                    <td><span className={`${styles.pill} ${styles.neutral}`}>{a.action.replace(/_/g, ' ')}</span></td>
                    <td>{a.account_id ? <Link href={`/admin/accounts/${a.account_id}`} className={styles.rowLink}>account</Link> : <span className={styles.muted}>—</span>}</td>
                    {/* Promoted to its own column. It was buried in meta, which
                        is where a field goes to stop being filled in. */}
                    <td style={{ fontSize: '.82rem' }}>{a.reason || <span className={styles.muted}>—</span>}</td>
                    <td className={styles.muted} style={{ fontSize: '.75rem' }}>{diff(a.before_value, a.after_value)}</td>
                    <td className={styles.muted} style={{ fontSize: '.78rem' }}>{summarize(a.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
