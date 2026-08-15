import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { accountDisplayName } from '@/lib/admin-accounts';
import { isDateRange, rangeWindow, type DateRange } from '@/lib/command-center-logic';
import { isPaymentLedgerStatus, listAdminPayments, PAYMENT_LEDGER_STATUSES } from '@/lib/admin-payments';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payment ledger' };

const RANGE_TABS: { key: DateRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

function usd(value: number | null | undefined): string {
  return `$${(Number(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams: { range?: string; status?: string; account?: string; q?: string; page?: string } }) {
  const { admin } = await requireAdmin();
  const range: DateRange = isDateRange(searchParams.range) ? searchParams.range : '30d';
  const status = isPaymentLedgerStatus(searchParams.status) ? searchParams.status : undefined;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const q = searchParams.q?.trim() ?? '';
  const accountId = /^[0-9a-f-]{36}$/i.test(searchParams.account ?? '') ? searchParams.account : undefined;
  const win = rangeWindow(range, new Date());
  const ledger = await listAdminPayments(admin, { startIso: win.currentStart, endIso: win.currentEnd, status, accountId, query: q, page });

  const accountIds = [...new Set(ledger.rows.map((row) => row.account_id))];
  const names = new Map<string, { business_name: string | null; account_number: number | null }>();
  let namesAvailable = true;
  if (accountIds.length) {
    const { data, error } = await admin.from('accounts').select('id, business_name, account_number').in('id', accountIds);
    if (error) namesAvailable = false;
    for (const row of data ?? []) names.set(String(row.id), row as { business_name: string | null; account_number: number | null });
  }

  const paramsFor = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ range });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (accountId) params.set('account', accountId);
    for (const [key, value] of Object.entries(next)) value ? params.set(key, value) : params.delete(key);
    return `/admin/payments?${params.toString()}`;
  };
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(ledger.total / pageSize));

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Reconciliation</p>
        <h1 className={styles.title}>Payment ledger</h1>
        <p className={styles.lead}>The individual processed payments behind the Command Center count, including later refunds and disputes. Synthetic payments are excluded.</p>
      </header>

      {accountId ? <div className={`${styles.banner} ${styles.ok}`}>Showing one account only. <Link className={styles.rowLink} href={`/admin/accounts/${accountId}`}>Back to account</Link> · <Link className={styles.rowLink} href={`/admin/payments?range=${range}`}>Show all accounts</Link></div> : null}

      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Processed period</span>
        <nav className={styles.filterTabs} aria-label="Processed period">
          {RANGE_TABS.map((item) => <Link key={item.key} href={paramsFor({ range: item.key, page: undefined })} aria-current={range === item.key ? 'page' : undefined} className={`${styles.filterTab} ${range === item.key ? styles.on : ''}`}>{item.label}</Link>)}
        </nav>
      </div>

      <form className={styles.searchRow} method="get">
        <input type="hidden" name="range" value={range} />
        {accountId ? <input type="hidden" name="account" value={accountId} /> : null}
        <label className={styles.srOnly} htmlFor="payment-search">Payment or provider reference</label>
        <input id="payment-search" className={styles.input} name="q" defaultValue={q} placeholder="Payment, intent, or dispute ID" />
        <label className={styles.srOnly} htmlFor="payment-status">Payment status</label>
        <select id="payment-status" className={styles.input} name="status" defaultValue={status ?? ''} style={{ flex: '0 1 180px' }}>
          <option value="">All statuses</option>
          {PAYMENT_LEDGER_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button className="btn primary" type="submit">Filter</button>
        {q || status ? <Link className="btn secondary" href={`/admin/payments?range=${range}`}>Clear</Link> : null}
      </form>

      {!ledger.available ? <div className={`${styles.banner} ${styles.err}`}>Payment data is unavailable. No zero or empty state is being inferred.</div> : null}
      {!namesAvailable ? <div className={`${styles.banner} ${styles.err}`}>Payment rows loaded, but account names are unavailable.</div> : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{ledger.total.toLocaleString('en-US')} processed {ledger.total === 1 ? 'payment' : 'payments'} · page {page} of {pageCount}</h2>
        {ledger.available && ledger.rows.length === 0 ? <p className={styles.emptyState}>No processed payments match these filters.</p> : null}
        {ledger.rows.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Processed</th><th>Account</th><th>Charge</th><th>Status</th><th className="num">Collected</th><th className="num">Refunded</th><th className="num">Net fee</th><th>Provider ref</th></tr></thead>
              <tbody>{ledger.rows.map((row) => {
                const account = names.get(row.account_id);
                const netFee = (Number(row.platform_fee) || 0) - (Number(row.platform_fee_refunded) || 0);
                return <tr key={row.id}>
                  <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{fmt(row.paid_at)}</td>
                  <td><Link href={`/admin/accounts/${row.account_id}`} className={styles.rowLink}>{account ? accountDisplayName(account) : 'Account'}</Link>{account?.account_number ? <div className={styles.muted}>#{account.account_number}</div> : null}</td>
                  <td><Link href={`/admin/payments/${row.id}`} className={styles.rowLink}>{row.label || `Payment ${row.id.slice(0, 8)}`}</Link></td>
                  <td><span className={`${styles.pill} ${row.status === 'disputed' || row.status === 'failed' ? styles.bad : row.status === 'refunded' ? styles.warn : styles.neutral}`}>{row.status}</span></td>
                  <td className="num">{usd(row.amount)}</td>
                  <td className="num">{row.refunded_amount ? usd(row.refunded_amount) : '—'}</td>
                  <td className="num">{usd(netFee)}</td>
                  <td className={styles.muted}><code>{row.stripe_dispute_id || row.stripe_payment_intent || '—'}</code></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : null}
        <div className={styles.pagination}>
          {page > 1 ? <Link className="btn secondary" href={paramsFor({ page: String(page - 1) })}>← Previous</Link> : <span />}
          {page < pageCount ? <Link className="btn secondary" href={paramsFor({ page: String(page + 1) })}>Next →</Link> : null}
        </div>
      </section>
    </>
  );
}
