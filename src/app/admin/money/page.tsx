import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { accountDisplayName } from '@/lib/admin-accounts';
import { createAdminSignalDiagnostics, getOpenDisputes, getPausedPayouts, getNotOnboardedCount } from '@/lib/admin-alerts';
import { fetchFeeWindow } from '@/lib/platform-fees';
import { stripeAdminLinks } from '@/lib/admin-payments';
import { isDateRange, rangeWindow, type DateRange } from '@/lib/command-center-logic';
import { loadPlatformOverageOverview } from '@/lib/admin-overage';
import { loadAdminGoogleLsaOverview } from '@/lib/admin-google-lsa';
import { StatCard } from '../StatCard';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Money' };

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

export default async function AdminMoneyPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ range?: string; account?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
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
  const diagnostics = createAdminSignalDiagnostics();

  // The fee arithmetic — and the refund rows the table renders — come from the
  // one definition in lib/platform-fees.ts, which the Command Center shares.
  // They used to be two copies of the same query carrying the same defect.
  const [fees, disputes, pausedRows, notOnboardedCount, overageOverview, lsaOverview] = await Promise.all([
    fetchFeeWindow(admin, win.currentStart, win.currentEnd),
    getOpenDisputes(admin, { accountId, diagnostics }),
    getPausedPayouts(admin, { diagnostics }),
    getNotOnboardedCount(admin, { diagnostics }),
    loadPlatformOverageOverview(admin),
    loadAdminGoogleLsaOverview(admin),
  ]);

  // Deliberately not named *30 any more — the window is whatever `range` says,
  // and a variable called fees30 holding 90 days of fees is how a hardcoded
  // label survives the change that was supposed to remove it.
  const { grossFees, feesReversed, netFees, refunds, refundRows } = fees;
  const refundCount = refundRows.length;
  const disputesAvailable = !diagnostics.failed.includes('disputes');
  const payoutsAvailable = !diagnostics.failed.includes('pausedPayouts');
  const onboardingAvailable = !diagnostics.failed.includes('notOnboarded');
  const unavailableCount = diagnostics.failed.length
    + Number(!fees.availability.payments)
    + Number(!fees.availability.fees)
    + Number(!fees.availability.refunds);

  // Stitch display names (site company_name preferred) onto the dispute, paused,
  // refund, overage, and LSA rows in one pass.
  const acctIds = [...new Set([
    ...disputes.map((d) => d.account_id),
    ...pausedRows.map((p) => p.id),
    ...refundRows.map((r) => r.account_id),
    ...overageOverview.exhaustedAccountIds,
    ...overageOverview.recentSettlements.map((s) => s.accountId),
    ...lsaOverview.wallets.map((w) => w.accountId),
    ...lsaOverview.connections.map((c) => c.accountId),
  ].filter(Boolean))];
  const nameMap = new Map<string, { business_name: string | null; company_name: string | null; account_number: number | null }>();
  let namesAvailable = true;
  if (acctIds.length) {
    const [acctsRes, sitesRes] = await Promise.all([
      admin.from('accounts').select('id, business_name, account_number').in('id', acctIds),
      admin.from('sites').select('account_id, company_name').in('account_id', acctIds),
    ]);
    if (acctsRes.error || sitesRes.error) namesAvailable = false;
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
        <p className={styles.lead}>Reconciled LGQ fees, refunds, disputes, and payout health across the legacy and direct-charge rails.</p>
      </header>

      {unavailableCount > 0 ? (
        <div className={`${styles.banner} ${styles.err}`} role="status">
          <strong>Some money data is unavailable.</strong> Missing sources show an em dash and are not treated as zero or all-clear. Refresh to retry.
        </div>
      ) : null}
      {!namesAvailable ? <div className={`${styles.banner} ${styles.err}`}>Money rows loaded, but some account names are unavailable.</div> : null}

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
          value={fees.availability.fees && fees.availability.refunds ? usd(netFees) : '—'}
          label={`Reconciled LGQ fees (${rangeLabel})`}
          /* The arithmetic is shown rather than hidden. A net figure with no
             working is indistinguishable from the gross one that used to sit
             here, and the whole point of the fix is that they differ. */
          note={fees.availability.fees && fees.availability.refunds && feesReversed > 0 ? <>{usd(grossFees)} recognized − {usd(feesReversed)} returned with refunds</> : null}
          tone={!fees.availability.fees || !fees.availability.refunds ? 'warn' : undefined}
        />
        <StatCard
          value={fees.availability.refunds ? usd(refunds) : '—'}
          label={`Refunds issued (${rangeLabel})`}
          tone={!fees.availability.refunds || refunds > 0 ? 'warn' : undefined}
          href={refundCount > 0 ? '#refunds' : undefined}
          drill={refundCount > 0 ? `${refundCount} ${refundCount === 1 ? 'refund' : 'refunds'}` : undefined}
        />
        <StatCard
          value={disputesAvailable ? disputes.length : '—'}
          label="Open disputes"
          tone={!disputesAvailable || disputes.length > 0 ? 'bad' : undefined}
          href={disputes.length > 0 ? '#disputes' : undefined}
          drill="See them"
        />
        <StatCard
          value={payoutsAvailable ? pausedRows.length : '—'}
          label="Payouts paused"
          tone={!payoutsAvailable || pausedRows.length > 0 ? 'warn' : undefined}
          href={pausedRows.length > 0 ? '#paused' : undefined}
          drill="See them"
        />
        <StatCard
          value={onboardingAvailable ? notOnboardedCount : '—'}
          label="Not onboarded"
          href={notOnboardedCount > 0 ? '/admin/accounts?filter=not_onboarded' : undefined}
          drill="Open the list"
        />
      </section>

      <section className={styles.panel} id="refunds">
        <h2 className={styles.panelTitle}>Refunds issued ({rangeLabel})</h2>
        {!fees.availability.refunds ? (
          <p className={styles.emptyState}>Refund data is unavailable. Refresh to retry.</p>
        ) : refundRows.length === 0 ? (
          <p className={styles.emptyState}>No refunds in the last {rangeLabel}.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Refunded</th><th>Account</th><th>Charge</th><th className="num">Original</th><th className="num">Refunded</th><th className="num">LGQ fee returned</th><th /></tr></thead>
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
                      <td><Link href={`/admin/payments/${row.id}`} className={styles.rowLink}>{row.label || 'Charge'}</Link></td>
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
        <h2 className={styles.panelTitle}>
          Open disputes / chargebacks
          {accountId ? <span className={styles.muted} style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> — one account only</span> : null}
        </h2>
        {accountId ? (
          <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.8rem' }}>
            <Link href={`/admin/accounts/${accountId}`} className={styles.rowLink}>Back to the account →</Link>
            {' · '}
            <Link href={`/admin/money?range=${range}`} className={styles.rowLink}>Show every account</Link>
          </p>
        ) : null}
        {!disputesAvailable ? (
          <p className={styles.emptyState}>Dispute data is unavailable. Refresh to retry.</p>
        ) : disputes.length === 0 ? (
          <p className={styles.emptyState}>{accountId ? 'No open disputes on this account.' : 'No open disputes. 🎉'}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Opened</th><th>Account</th><th>Charge</th><th className="num">Amount</th><th>Reason</th><th>Respond by</th><th /></tr></thead>
              <tbody>
                {disputes.map((row) => {
                  const acct = nameMap.get(row.account_id);
                  const dueMs = row.dispute_due_by ? new Date(row.dispute_due_by).getTime() : NaN;
                  const overdue = Number.isFinite(dueMs) && dueMs < now.getTime();
                  const disputeUrl = stripeAdminLinks(row).find((link) => link.kind === 'dispute')?.url;
                  return (
                    <tr key={row.id}>
                      <td className={styles.muted}>{fmtDate(row.disputed_at)}</td>
                      <td><Link href={`/admin/accounts/${row.account_id}`} className={styles.rowLink}>{acct ? accountDisplayName(acct) : 'Account'}</Link>{acct?.account_number ? <span className={styles.muted}> · #{acct.account_number}</span> : null}</td>
                      <td><Link href={`/admin/payments/${row.id}`} className={styles.rowLink}>{row.label || 'Charge'}</Link></td>
                      <td className="num" style={{ textAlign: 'right' }}>{usd(Number(row.amount) || 0)}</td>
                      <td className={styles.muted}>{row.dispute_reason || row.dispute_status || '—'}</td>
                      <td>{row.dispute_due_by ? <span className={`${styles.pill} ${overdue ? styles.bad : styles.warn}`}>{fmtDate(row.dispute_due_by)}</span> : <span className={styles.muted}>—</span>}</td>
                      <td>
                        {disputeUrl ? (
                          <a href={disputeUrl} target="_blank" rel="noreferrer" className={styles.rowLink}>Respond on Stripe →</a>
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
        <h2 className={styles.panelTitle}>Payouts paused</h2>
        {!payoutsAvailable ? (
          <p className={styles.emptyState}>Payout status is unavailable. Refresh to retry.</p>
        ) : pausedRows.length === 0 ? (
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

      {/* Platform Overage & Cap Exhaustion Oversight */}
      <section className={styles.panel} id="overage-overview">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <div>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>Platform overage &amp; caps oversight</h2>
            <p className={styles.muted} style={{ margin: '0.2rem 0 0 0', fontSize: '.8rem' }}>
              Pending unbilled accruals, exhausted spending caps, and recent settlements across all customer workspaces.
            </p>
          </div>
          <span className={`${styles.pill} ${overageOverview.exhaustedCapsCount > 0 ? styles.bad : styles.good}`}>
            {overageOverview.exhaustedCapsCount} exhausted cap{overageOverview.exhaustedCapsCount === 1 ? '' : 's'}
          </span>
        </div>

        <div className={styles.cardGrid} style={{ marginBottom: '1.25rem' }}>
          <StatCard
            label="Pending unbilled accruals"
            value={usd(overageOverview.totalPendingAccrualDollars)}
            tone={overageOverview.totalPendingAccrualDollars > 0 ? 'warn' : undefined}
            accent="amber"
            note={`${overageOverview.pendingAccrualAccountsCount} accounts currently accruing unbilled usage`}
          />
          <StatCard
            label="Exhausted spending caps"
            value={overageOverview.exhaustedCapsCount.toLocaleString('en-US')}
            tone={overageOverview.exhaustedCapsCount > 0 ? 'bad' : undefined}
            accent={overageOverview.exhaustedCapsCount > 0 ? 'rose' : 'emerald'}
            note={overageOverview.exhaustedCapsCount > 0 ? 'Workspaces blocked by hard cap' : 'All workspaces within spending caps'}
          />
          <StatCard
            label="Unsettled / failed settlements"
            value={overageOverview.failedSettlementsCount.toLocaleString('en-US')}
            tone={overageOverview.failedSettlementsCount > 0 ? 'warn' : undefined}
            accent={overageOverview.failedSettlementsCount > 0 ? 'amber' : 'neutral'}
            note="Failed or indeterminate invoice item operations"
          />
        </div>

        {overageOverview.exhaustedAccountIds.length > 0 ? (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '.9rem', fontWeight: 600, color: '#fca5a5', marginBottom: '.5rem' }}>
              Exhausted spending caps ({overageOverview.exhaustedAccountIds.length})
            </h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Workspace</th><th>Account #</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {overageOverview.exhaustedAccountIds.map((accId) => {
                    const info = nameMap.get(accId);
                    return (
                      <tr key={accId}>
                        <td><Link href={`/admin/accounts/${accId}?tab=overage`} className={styles.rowLink}>{info ? accountDisplayName(info) : accId.slice(0, 8)}</Link></td>
                        <td className={styles.muted}>{info?.account_number ?? '—'}</td>
                        <td><span className={`${styles.pill} ${styles.bad}`}>Cap exhausted</span></td>
                        <td><Link href={`/admin/accounts/${accId}?tab=overage`} className={styles.rowLink}>View usage &amp; adjust cap →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {overageOverview.recentSettlements.length > 0 ? (
          <div>
            <h3 style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: '.5rem' }}>
              Recent overage settlements ({overageOverview.recentSettlements.length})
            </h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Workspace</th><th>Period end</th><th>Closed at</th><th>Chargeable amount</th><th>State</th><th>Action</th></tr></thead>
                <tbody>
                  {overageOverview.recentSettlements.map((s) => {
                    const info = nameMap.get(s.accountId);
                    return (
                      <tr key={s.id}>
                        <td><Link href={`/admin/accounts/${s.accountId}?tab=overage`} className={styles.rowLink}>{info ? accountDisplayName(info) : s.accountId.slice(0, 8)}</Link></td>
                        <td className={styles.muted}>{fmtDate(s.periodEnd)}</td>
                        <td className={styles.muted}>{fmtDate(s.closedAt)}</td>
                        <td><strong>{usd(s.chargeableCents / 100)}</strong></td>
                        <td><span className={`${styles.pill} ${s.state === 'settled' ? styles.good : s.state === 'failed' ? styles.bad : styles.warn}`}>{s.state}</span></td>
                        <td><Link href={`/admin/accounts/${s.accountId}?tab=overage`} className={styles.rowLink}>Inspect →</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      {/* Google Local Services Ads (LSA) Overview */}
      <section className={styles.panel} id="google-lsa-overview">
        {(() => {
          const depletedWallets = lsaOverview.wallets.filter((w) => w.balanceDollars <= w.thresholdDollars);
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <h2 className={styles.panelTitle} style={{ margin: 0 }}>Google Local Services Ads (LSA) platform overview</h2>
                  <p className={styles.muted} style={{ margin: '0.2rem 0 0 0', fontSize: '.8rem' }}>
                    Cross-contractor aggregated LSA click spend, lead delivery metrics, and pre-funded ad wallet balances.
                  </p>
                </div>
                <span className={`${styles.pill} ${depletedWallets.length > 0 ? styles.bad : styles.good}`}>
                  {lsaOverview.activeConnectionsCount} connected account{lsaOverview.activeConnectionsCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className={styles.cardGrid} style={{ marginBottom: '1.25rem' }}>
                <StatCard
                  label="Total 30-day LSA spend"
                  value={usd(lsaOverview.totalSpendDollars)}
                  accent="emerald"
                  note="Direct Google Ads campaign spend"
                />
                <StatCard
                  label="Total leads generated"
                  value={lsaOverview.totalLeadsCount.toLocaleString('en-US')}
                  accent="indigo"
                  note="Verified contractor customer inquiries"
                />
                <StatCard
                  label="Depleted ad wallets"
                  value={depletedWallets.length.toLocaleString('en-US')}
                  tone={depletedWallets.length > 0 ? 'bad' : undefined}
                  accent={depletedWallets.length > 0 ? 'rose' : 'emerald'}
                  note={depletedWallets.length > 0 ? 'Below auto-refill threshold' : `All ${lsaOverview.activeWalletsCount} contractor balances funded`}
                />
              </div>

              {depletedWallets.length > 0 ? (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '.9rem', fontWeight: 600, color: '#fca5a5', marginBottom: '.5rem' }}>
                    Wallets requiring attention / refill ({depletedWallets.length})
                  </h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Contractor</th><th>Current balance</th><th>Auto-refill threshold</th><th>Refill amount</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {depletedWallets.map((w) => (
                          <tr key={w.accountId}>
                            <td><Link href={`/admin/accounts/${w.accountId}?tab=ads`} className={styles.rowLink}>{w.businessName || w.accountId.slice(0, 8)}</Link></td>
                            <td><strong style={{ color: '#fca5a5' }}>{usd(w.balanceDollars)}</strong></td>
                            <td className={styles.muted}>{usd(w.thresholdDollars)}</td>
                            <td>{usd(w.refillDollars)}</td>
                            <td><span className={`${styles.pill} ${styles.bad}`}>{w.status}</span></td>
                            <td><Link href={`/admin/accounts/${w.accountId}?tab=ads`} className={styles.rowLink}>Manage wallet →</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {lsaOverview.connections.length > 0 ? (
                <div>
                  <h3 style={{ fontSize: '.9rem', fontWeight: 600, marginBottom: '.5rem' }}>
                    Active Google LSA accounts ({lsaOverview.connections.length})
                  </h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Contractor</th><th>Customer ID</th><th>Account name</th><th>Mode</th><th>Last synced</th><th>Action</th></tr></thead>
                      <tbody>
                        {lsaOverview.connections.map((c) => (
                          <tr key={c.accountId}>
                            <td><Link href={`/admin/accounts/${c.accountId}?tab=ads`} className={styles.rowLink}>{c.businessName || c.accountId.slice(0, 8)}</Link></td>
                            <td><code>{c.customerId || '—'}</code></td>
                            <td className={styles.muted}>{c.customerName || '—'}</td>
                            <td><span className={`${styles.pill} ${styles.neutral}`}>{c.campaignMode || 'managed'}</span></td>
                            <td className={styles.muted}>{c.lastSyncAt ? fmtDate(c.lastSyncAt) : 'Never'}</td>
                            <td><Link href={`/admin/accounts/${c.accountId}?tab=ads`} className={styles.rowLink}>View ads →</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          );
        })()}
      </section>

    </>
  );
}
