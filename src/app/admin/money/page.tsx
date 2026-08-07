import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { accountDisplayName } from '@/lib/admin-accounts';
import { getOpenDisputes, getPausedPayouts, getNotOnboardedCount } from '@/lib/admin-alerts';
import { fetchFeeWindow } from '@/lib/platform-fees';
import { isDateRange, rangeWindow, type DateRange } from '@/lib/command-center-logic';
import { StatCard } from '../StatCard';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

function usd(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—';
}

const RANGE_TABS: { key: DateRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
];

export default async function AdminMoneyPage({ searchParams }: { searchParams: { range?: string; account?: string } }) {
  const { admin } = await requireAdmin();
  // Set when an account page's dispute count sends you here. Only the disputes
  // table narrows — the fee and refund totals stay platform-wide, because a
  // per-account fee figure is a different report and quietly reusing these
  // cards for it would mislabel four numbers to make one link work.
  const accountId = searchParams.account?.trim() || undefined;
  // Was hardcoded to 30 days. The Command Center's fee and refund metrics link
  // here, and they can be showing 7 or 90 — a drill-down that silently changed
  // the window would produce a total that disagrees with the number clicked,
  // which is the same failure as not linking at all.
  const range: DateRange = isDateRange(searchParams.range) ? searchParams.range : '30d';
  const now = new Date();
  const win = rangeWindow(range, now);
  const rangeLabel = RANGE_TABS.find((r) => r.key === range)?.label ?? '30 days';

  // The fee arithmetic — and the refund rows the table renders — come from the
  // one definition in lib/platform-fees.ts, which the Command Center shares.
  // They used to be two copies of the same query carrying the same defect.
  const [fees, disputes, pausedRows, notOnboardedCount] = await Promise.all([
    fetchFeeWindow(admin, win.currentStart, win.currentEnd),
    getOpenDisputes(admin, { accountId }),
    getPausedPayouts(admin),
    getNotOnboardedCount(admin),
  ]);

  // Deliberately not named *30 any more — the window is whatever `range` says,
  // and a variable called fees30 holding 90 days of fees is how a hardcoded
  // label survives the change that was supposed to remove it.
  const { grossFees, feesReversed, netFees, refunds, refundRows } = fees;
  const refundCount = refundRows.length;

  // Stitch display names (site company_name preferred) onto the dispute, paused
  // and refund rows in one pass.
  const acctIds = [...new Set([
    ...disputes.map((d) => d.account_id),
    ...pausedRows.map((p) => p.id),
    ...refundRows.map((r) => r.account_id),
  ].filter(Boolean))];
  const nameMap = new Map<string, { business_name: string | null; company_name: string | null; account_number: number | null }>();
  if (acctIds.length) {
    const [acctsRes, sitesRes] = await Promise.all([
      admin.from('accounts').select('id, business_name, account_number').in('id', acctIds),
      admin.from('sites').select('account_id, company_name').in('account_id', acctIds),
    ]);
    const siteNames = new Map<string, string | null>();
    for (const s of sitesRes.data ?? []) {
      const site = s as { account_id: string; company_name: string | null };
      siteNames.set(site.account_id, site.company_name);
    }
    for (const a of acctsRes.data ?? []) {
      const row = a as { id: string; business_name: string | null; account_number: number | null };
      nameMap.set(row.id, { business_name: row.business_name, company_name: siteNames.get(row.id) ?? null, account_number: row.account_number });
    }
  }

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Oversight</p>
        <h1 className={styles.title}>Money</h1>
        <p className={styles.lead}>Platform fees, refunds, disputes, and payout health. You&rsquo;re the merchant of record on Connect — this is the liability side of the ledger.</p>
      </header>

      <div className={styles.filterTabs}>
        {RANGE_TABS.map((r) => (
          <Link key={r.key} href={`/admin/money?range=${r.key}`} className={`${styles.filterTab} ${range === r.key ? styles.on : ''}`}>{r.label}</Link>
        ))}
      </div>

      {/* Every figure that IS a set of rows now opens them. The two that are
          sums of money link to the tables further down this page, which is
          where their working is; the three that count accounts or payments
          link to the list that holds those records. */}
      <section className={styles.cardGrid} style={{ marginBottom: '1.4rem' }}>
        <StatCard
          value={usd(netFees)}
          label={`Platform fees (${rangeLabel})`}
          /* The arithmetic is shown rather than hidden. A net figure with no
             working is indistinguishable from the gross one that used to sit
             here, and the whole point of the fix is that they differ. */
          note={feesReversed > 0 ? <>{usd(grossFees)} charged − {usd(feesReversed)} returned with refunds</> : null}
        />
        <StatCard
          value={usd(refunds)}
          label={`Refunds issued (${rangeLabel})`}
          tone={refunds > 0 ? 'warn' : undefined}
          href={refundCount > 0 ? '#refunds' : undefined}
          drill={refundCount > 0 ? `${refundCount} ${refundCount === 1 ? 'refund' : 'refunds'}` : undefined}
        />
        <StatCard
          value={disputes.length}
          label="Open disputes"
          tone={disputes.length > 0 ? 'bad' : undefined}
          href={disputes.length > 0 ? '#disputes' : undefined}
          drill="See them"
        />
        <StatCard
          value={pausedRows.length}
          label="Payouts paused"
          tone={pausedRows.length > 0 ? 'warn' : undefined}
          href={pausedRows.length > 0 ? '#paused' : undefined}
          drill="See them"
        />
        <StatCard
          value={notOnboardedCount}
          label="Not onboarded"
          href={notOnboardedCount > 0 ? '/admin/accounts?filter=not_onboarded' : undefined}
          drill="Open the list"
        />
      </section>

      <section className={styles.panel} id="refunds">
        <p className={styles.panelTitle}>Refunds issued ({rangeLabel})</p>
        {refundRows.length === 0 ? (
          <p className={styles.emptyState}>No refunds in the last {rangeLabel}.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Refunded</th><th>Account</th><th>Charge</th><th className="num">Original</th><th className="num">Refunded</th><th className="num">Our fee returned</th><th /></tr></thead>
              <tbody>
                {refundRows.map((row) => {
                  const acct = nameMap.get(row.account_id);
                  const original = Number(row.amount) || 0;
                  const refunded = Number(row.refunded_amount) || 0;
                  // A refund smaller than the charge is a partial one, and the
                  // difference between "we gave it all back" and "we gave half
                  // back" is the first thing anybody asks about a refund.
                  const partial = refunded > 0 && original > 0 && refunded < original - 0.005;
                  return (
                    <tr key={row.id}>
                      <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.refunded_at)}</td>
                      <td>
                        <Link href={`/admin/accounts/${row.account_id}`} className={styles.rowLink}>{acct ? accountDisplayName(acct) : 'Account'}</Link>
                        {acct?.account_number ? <span className={styles.muted}> · #{acct.account_number}</span> : null}
                      </td>
                      <td>{row.label || '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{usd(original)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{usd(refunded)}</td>
                      <td className="num" style={{ textAlign: 'right' }} title="Returned to Stripe with the refund, in proportion">
                        {row.platform_fee_refunded === null ? (
                          <span className={styles.muted} title="Refunded before we recorded fee reversals">—</span>
                        ) : (
                          usd(Number(row.platform_fee_refunded) || 0)
                        )}
                      </td>
                      <td>{partial ? <span className={`${styles.pill} ${styles.neutral}`}>Partial</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel} id="disputes">
        <p className={styles.panelTitle}>
          Open disputes / chargebacks
          {accountId ? <span className={styles.muted} style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — one account only</span> : null}
        </p>
        {accountId ? (
          <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.8rem' }}>
            <Link href={`/admin/accounts/${accountId}`} className={styles.rowLink}>Back to the account →</Link>
            {' · '}
            <Link href={`/admin/money?range=${range}`} className={styles.rowLink}>Show every account</Link>
          </p>
        ) : null}
        {disputes.length === 0 ? (
          <p className={styles.emptyState}>{accountId ? 'No open disputes on this account.' : 'No open disputes. 🎉'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Opened</th><th>Account</th><th>Charge</th><th className="num">Amount</th><th>Reason</th><th>Respond by</th><th /></tr></thead>
              <tbody>
                {disputes.map((row) => {
                  const acct = nameMap.get(row.account_id);
                  const dueMs = row.dispute_due_by ? new Date(row.dispute_due_by).getTime() : NaN;
                  const overdue = Number.isFinite(dueMs) && dueMs < Date.now();
                  return (
                    <tr key={row.id}>
                      <td className={styles.muted}>{fmtDate(row.disputed_at)}</td>
                      <td><Link href={`/admin/accounts/${row.account_id}`} className={styles.rowLink}>{acct ? accountDisplayName(acct) : 'Account'}</Link>{acct?.account_number ? <span className={styles.muted}> · #{acct.account_number}</span> : null}</td>
                      <td>{row.label || '—'}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{usd(Number(row.amount) || 0)}</td>
                      <td className={styles.muted}>{row.dispute_reason || row.dispute_status || '—'}</td>
                      <td>{row.dispute_due_by ? <span className={`${styles.pill} ${overdue ? styles.bad : styles.warn}`}>{fmtDate(row.dispute_due_by)}</span> : <span className={styles.muted}>—</span>}</td>
                      <td>
                        {row.stripe_dispute_id ? (
                          <a href={`https://dashboard.stripe.com/disputes/${row.stripe_dispute_id}`} target="_blank" rel="noreferrer" className={styles.rowLink}>Respond on Stripe →</a>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel} id="paused">
        <p className={styles.panelTitle}>Payouts paused</p>
        {pausedRows.length === 0 ? (
          <p className={styles.emptyState}>No accounts with paused payouts.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Account</th><th>#</th><th>Paused since</th></tr></thead>
              <tbody>
                {pausedRows.map((row) => {
                  return (
                    <tr key={row.id}>
                      <td><Link href={`/admin/accounts/${row.id}`} className={styles.rowLink}>{accountDisplayName(nameMap.get(row.id) ?? row)}</Link></td>
                      <td className={styles.muted}>{row.account_number ?? '—'}</td>
                      <td className={styles.muted}>{fmtDate(row.connect_disabled_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
