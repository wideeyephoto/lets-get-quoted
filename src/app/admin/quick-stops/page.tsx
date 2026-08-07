import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listQuickStopRequestsForAdmin } from '@/lib/admin-quick-stops';
import { accountDisplayName } from '@/lib/admin-accounts';
import { QUICK_STOP_STATUS_LABEL, centsToDollars, type QuickStopStatus } from '@/lib/quick-stop';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; label: string; statuses?: string[]; blurb?: string }[] = [
  { key: 'active', label: 'Active', statuses: ['awaiting_contractor', 'more_information_requested', 'contractor_offer_sent', 'awaiting_customer_payment', 'confirmed', 'en_route', 'arrived'] },
  // Exists so the Command Center's "Quick Stops nobody answered" card has a
  // destination holding its own rows. That card used to link to the bare page,
  // which defaults to Active — and Active is the one tab that excludes
  // offer_expired, which is nearly all of what the card shows once the sweep
  // has run. Same status list as getOverdueQuickStops, deliberately.
  {
    key: 'unanswered',
    label: 'Nobody answered',
    statuses: ['awaiting_contractor', 'more_information_requested', 'awaiting_customer_payment', 'offer_expired'],
    blurb: 'Waiting on somebody, or already timed out unanswered. The sweep expires the live ones within about fifteen minutes of their deadline, so most of what settles here is offer_expired.',
  },
  { key: 'disputes', label: 'Disputes', statuses: ['disputed', 'no_show_reported'] },
  { key: 'no_shows', label: 'No-shows', statuses: ['no_show_confirmed'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
  { key: 'canceled', label: 'Canceled / refunded', statuses: ['customer_canceled', 'contractor_canceled', 'refunded', 'offer_expired', 'customer_declined', 'contractor_declined'] },
  { key: 'all', label: 'All' },
];

const ROW_LIMIT = 150;

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

export default async function AdminQuickStopsPage({ searchParams }: { searchParams: { f?: string; account?: string } }) {
  const { admin } = await requireAdmin();
  const active = FILTERS.find((f) => f.key === searchParams.f) ?? FILTERS[0];
  // Scoping to one account is what makes the per-account "No-shows" count on
  // the account page openable. Without it that number pointed at a
  // cross-account list capped at 150 rows, where the requests it counted might
  // not even appear.
  const accountId = searchParams.account?.trim() || undefined;
  const rows = await listQuickStopRequestsForAdmin(admin, { statuses: active.statuses, limit: ROW_LIMIT, accountId });
  const scopedName = accountId && rows.length ? accountDisplayName(rows[0]) : null;

  function href(key: string): string {
    return accountId ? `/admin/quick-stops?f=${key}&account=${accountId}` : `/admin/quick-stops?f=${key}`;
  }

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Governance</p>
        <h1 className={styles.title}>Quick Stops</h1>
        <p className={styles.lead}>Every Quick Stop across all accounts. Open a request to see its full timeline and issue refunds or resolve disputes.</p>
      </header>

      {accountId ? (
        <div className={`${styles.banner} ${styles.ok}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <span>Showing {scopedName ? <strong>{scopedName}</strong> : 'one account'} only.</span>
          <span>
            <Link href={`/admin/accounts/${accountId}`} className={styles.rowLink}>Back to the account →</Link>
            {' · '}
            <Link href={`/admin/quick-stops?f=${active.key}`} className={styles.rowLink}>Show every account</Link>
          </span>
        </div>
      ) : null}

      <div className={styles.filterTabs}>
        {FILTERS.map((f) => (
          <Link key={f.key} href={href(f.key)} className={`${styles.filterTab} ${f.key === active.key ? styles.on : ''}`}>
            {f.label}
          </Link>
        ))}
      </div>

      {active.blurb ? (
        <p className={styles.muted} style={{ margin: '-0.4rem 0 1rem', fontSize: '.82rem', maxWidth: '70ch' }}>{active.blurb}</p>
      ) : null}

      <section className={styles.panel}>
        {/* A list that silently stops at 150 reads as "there are 150". */}
        {rows.length >= ROW_LIMIT ? (
          <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.8rem' }}>
            Showing the {ROW_LIMIT} most recent. There are more — narrow with a tab above.
          </p>
        ) : null}
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
