import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listQuickStopRequestsForAdmin } from '@/lib/admin-quick-stops';
import { accountDisplayName } from '@/lib/admin-accounts';
import { QUICK_STOP_STATUS_LABEL, centsToDollars, type QuickStopStatus } from '@/lib/quick-stop';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; label: string; statuses?: string[] }[] = [
  { key: 'active', label: 'Active', statuses: ['awaiting_contractor', 'more_information_requested', 'contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'] },
  { key: 'disputes', label: 'Disputes', statuses: ['disputed', 'no_show_reported'] },
  { key: 'no_shows', label: 'No-shows', statuses: ['no_show_confirmed'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'canceled', label: 'Canceled / refunded', statuses: ['customer_canceled', 'contractor_canceled', 'refunded', 'offer_expired', 'customer_declined', 'contractor_declined'] },
  { key: 'all', label: 'All' },
];

function statusPill(status: string) {
  const bad = ['disputed', 'no_show_reported', 'no_show_confirmed'];
  const warn = ['awaiting_customer_payment', 'offer_expired', 'more_information_requested'];
  const good = ['confirmed', 'en_route', 'arrived', 'completed'];
  const cls = bad.includes(status) ? styles.bad : warn.includes(status) ? styles.warn : good.includes(status) ? styles.good : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{QUICK_STOP_STATUS_LABEL[status as QuickStopStatus] ?? status}</span>;
}

function money(cents: number | null | undefined): string {
  if (!cents) return '$0';
  return `$${centsToDollars(cents).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default async function AdminQuickStopsPage({ searchParams }: { searchParams: { f?: string } }) {
  const { admin } = await requireAdmin();
  const active = FILTERS.find((f) => f.key === searchParams.f) ?? FILTERS[0];
  const rows = await listQuickStopRequestsForAdmin(admin, { statuses: active.statuses, limit: 150 });

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Governance</p>
        <h1 className={styles.title}>Quick Stops</h1>
        <p className={styles.lead}>Every Quick Stop across all accounts. Open a request to see its full timeline and issue refunds or resolve disputes.</p>
      </header>

      <div className={styles.filterTabs}>
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/quick-stops?f=${f.key}`} className={`${styles.filterTab} ${f.key === active.key ? styles.on : ''}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.emptyState}>No Quick Stops in this view.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Account</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="num">Fee</th>
                  <th className="num">Refunded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.muted}>{new Date(r.created_at).toLocaleDateString('en-US', { dateStyle: 'short' })}</td>
                    <td>
                      <Link href={`/admin/quick-stops/${r.id}`} className={styles.rowLink}>{accountDisplayName(r)}</Link>
                      {r.account_number ? <span className={styles.muted}> · #{r.account_number}</span> : null}
                    </td>
                    <td>{r.client_name || <span className={styles.muted}>—</span>}</td>
                    <td>{statusPill(r.status)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{money(r.fee_cents)}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{r.refund_cents ? <span style={{ color: '#ffd166' }}>{money(r.refund_cents)}</span> : <span className={styles.muted}>—</span>}</td>
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
