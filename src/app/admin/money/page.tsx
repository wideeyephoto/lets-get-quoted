import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { accountDisplayName } from '@/lib/admin-accounts';
import { getOpenDisputes, getPausedPayouts, getNotOnboardedCount } from '@/lib/admin-alerts';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

function usd(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—';
}

export default async function AdminMoneyPage() {
  const { admin } = await requireAdmin();
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [feeRows, refundRows, disputes, pausedRows, notOnboardedCount] = await Promise.all([
    admin.from('payments').select('platform_fee').eq('status', 'paid').gte('paid_at', since30),
    // Dated by refunded_at, NOT paid_at. Filtering refunds by the payment date
    // meant "refunds on payments paid in the last 30 days" — a refund issued
    // today against a ninety-day-old charge landed in no window at all.
    admin
      .from('payments')
      .select('refunded_amount, platform_fee_refunded, refunded_at')
      .gt('refunded_amount', 0)
      .gte('refunded_at', since30),
    getOpenDisputes(admin),
    getPausedPayouts(admin),
    getNotOnboardedCount(admin),
  ]);

  const grossFees30 = (feeRows.data ?? []).reduce((s, r) => s + (Number((r as { platform_fee: number }).platform_fee) || 0), 0);
  const refundRowsData = (refundRows.data ?? []) as { refunded_amount: number; platform_fee_refunded: number | null }[];
  const refunds30 = refundRowsData.reduce((s, r) => s + (Number(r.refunded_amount) || 0), 0);
  // Refunds are issued with refund_application_fee: true, so Stripe hands our
  // fee back in proportion. Reporting the gross figure claimed money we had
  // already returned.
  const feesReversed30 = refundRowsData.reduce((s, r) => s + (Number(r.platform_fee_refunded) || 0), 0);
  const fees30 = grossFees30 - feesReversed30;

  // Stitch display names (site company_name preferred) onto the dispute + paused
  // rows in one pass.
  const acctIds = [...new Set([...disputes.map((d) => d.account_id), ...pausedRows.map((p) => p.id)].filter(Boolean))];
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

      <section className={styles.cardGrid} style={{ marginBottom: '1.4rem' }}>
        <div className={`${styles.panel} ${styles.statCard}`}>
          <span className={styles.statValue}>{usd(fees30)}</span>
          <span className={styles.statLabel}>Platform fees (30 days)</span>
          {/* The arithmetic is shown rather than hidden. A net figure with no
              working is indistinguishable from the gross one that used to sit
              here, and the whole point of the fix is that they differ. */}
          {feesReversed30 > 0 ? (
            <span className={styles.muted} style={{ fontSize: '0.72rem' }}>
              {usd(grossFees30)} charged − {usd(feesReversed30)} returned with refunds
            </span>
          ) : null}
        </div>
        <div className={`${styles.panel} ${styles.statCard}`}>
          <span className={styles.statValue} style={refunds30 > 0 ? { color: '#ffd166' } : undefined}>{usd(refunds30)}</span>
          <span className={styles.statLabel}>Refunds issued (30 days)</span>
        </div>
        <div className={`${styles.panel} ${styles.statCard}`}>
          <span className={styles.statValue} style={disputes.length > 0 ? { color: '#fca5a5' } : undefined}>{disputes.length}</span>
          <span className={styles.statLabel}>Open disputes</span>
        </div>
        <div className={`${styles.panel} ${styles.statCard}`}>
          <span className={styles.statValue} style={pausedRows.length > 0 ? { color: '#ffd166' } : undefined}>{pausedRows.length}</span>
          <span className={styles.statLabel}>Payouts paused</span>
        </div>
        <div className={`${styles.panel} ${styles.statCard}`}>
          <span className={styles.statValue}>{notOnboardedCount}</span>
          <span className={styles.statLabel}>Not onboarded</span>
        </div>
      </section>

      <section className={styles.panel}>
        <p className={styles.panelTitle}>Open disputes / chargebacks</p>
        {disputes.length === 0 ? (
          <p className={styles.emptyState}>No open disputes. 🎉</p>
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

      <section className={styles.panel}>
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
