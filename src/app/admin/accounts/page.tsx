import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listAccountsForAdmin, accountDisplayName } from '@/lib/admin-accounts';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

function connectPill(row: { connect_onboarded: boolean | null; connect_disabled_at: string | null }) {
  if (row.connect_disabled_at) return <span className={`${styles.pill} ${styles.bad}`}>Payouts paused</span>;
  if (row.connect_onboarded) return <span className={`${styles.pill} ${styles.good}`}>Connected</span>;
  return <span className={`${styles.pill} ${styles.neutral}`}>Not connected</span>;
}

export default async function AdminAccountsPage({ searchParams }: { searchParams: { q?: string } }) {
  const { admin } = await requireAdmin();
  const query = searchParams.q?.trim() ?? '';
  const rows = await listAccountsForAdmin(admin, { query, limit: 50 });

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>Accounts</h1>
        <p className={styles.lead}>Look up any contractor to see their plan, payout status, and recent activity. Search by business name or account number.</p>
      </header>

      <form className={styles.searchRow} method="get">
        <input className={styles.input} type="search" name="q" defaultValue={query} placeholder="Business name or account #…" autoFocus />
        <button type="submit" className="btn primary">Search</button>
        {query ? <Link href="/admin/accounts" className="btn secondary">Clear</Link> : null}
      </form>

      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.emptyState}>{query ? `No accounts match “${query}”.` : 'No accounts yet.'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>#</th>
                  <th>Plan</th>
                  <th>Payouts</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/accounts/${r.id}`} className={styles.rowLink}>
                        {accountDisplayName(r)}
                      </Link>
                    </td>
                    <td className={styles.muted}>{r.account_number ?? '—'}</td>
                    <td><span className={`${styles.pill} ${styles.neutral}`}>{r.plan ?? 'free'}</span></td>
                    <td>{connectPill(r)}</td>
                    <td>
                      {r.suspended_at ? (
                        <span className={`${styles.pill} ${styles.bad}`}>Suspended</span>
                      ) : (
                        <span className={`${styles.pill} ${styles.good}`}>Active</span>
                      )}
                    </td>
                    <td className={styles.muted}>{new Date(r.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' } as Intl.DateTimeFormatOptions)}</td>
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
