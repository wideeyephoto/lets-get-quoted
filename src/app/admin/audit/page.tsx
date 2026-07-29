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

export default async function AdminAuditPage() {
  const { admin } = await requireAdmin();
  const actions = await listAdminActions(admin, { limit: 250 });

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Accountability</p>
        <h1 className={styles.title}>Audit log</h1>
        <p className={styles.lead}>Every mutating staff action — refunds, credits, suspensions, lockouts, deletions — with who did it and when.</p>
      </header>

      <section className={styles.panel}>
        {actions.length === 0 ? (
          <p className={styles.emptyState}>No staff actions recorded yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Staff</th><th>Action</th><th>Account</th><th>Details</th></tr></thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{a.admin_email}</td>
                    <td><span className={`${styles.pill} ${styles.neutral}`}>{a.action.replace(/_/g, ' ')}</span></td>
                    <td>{a.account_id ? <Link href={`/admin/accounts/${a.account_id}`} className={styles.rowLink}>account</Link> : <span className={styles.muted}>—</span>}</td>
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
