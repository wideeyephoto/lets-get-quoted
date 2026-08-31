import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { buildRiskQueue } from '@/lib/admin-risk';
import { RISK_BAND_HELP, RISK_BAND_LABEL, type RiskBand, type RiskFactor } from '@/lib/risk-score';
import { isRiskDisposition, latestRiskReviews, RISK_DISPOSITIONS, type RiskDisposition } from '@/lib/risk-reviews';
import { staffCan } from '@/lib/staff';
import { setRiskDispositionAction } from './actions';
import styles from '../admin.module.css';

/**
 * Who to look at, and why.
 *
 * Every enforcement control a risk reviewer needs already existed on the
 * account page. What did not exist was any way to find the account: disputes,
 * refunds and no-shows were each listable, but never aggregated by account, so
 * a repeat offender was only visible to somebody who already suspected them.
 *
 * The page is built around the rule that a signal is not a violation. Signals
 * and confirmed outcomes are rendered as separate groups with different
 * language, the arithmetic behind every score is shown rather than hidden, and
 * there is not a single enforcement button here — the queue's job ends at
 * "open this account", where the controls and their permission checks live.
 */

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review queue' };

const BAND_CLASS: Record<RiskBand, string> = { high: 'bad', elevated: 'warn', normal: 'neutral' };

function FactorList({ factors, kind }: { factors: RiskFactor[]; kind: RiskFactor['kind'] }) {
  const shown = factors.filter((f) => f.kind === kind);
  if (!shown.length) return <span className={styles.muted}>—</span>;
  return (
    <ul style={{ margin: 0, paddingLeft: '1rem', listStyle: 'disc' }}>
      {shown.map((f) => (
        <li key={f.key} style={{ marginBottom: '.25rem' }}>
          <strong style={{ fontSize: '.82rem' }}>{f.label}</strong>
          {f.points > 0 ? <span className={styles.muted} style={{ fontSize: '.72rem' }}> +{f.points}</span> : null}
          {/* The raw numbers, always. A score somebody cannot check is a score
              they either over-trust or ignore, and both are worse than the
              arithmetic being visible. */}
          <div className={styles.muted} style={{ fontSize: '.74rem', maxWidth: '46ch' }}>{f.detail}</div>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminRiskPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ status?: string; done?: string; error?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const ctx = await requireAdmin();
  const queue = await buildRiskQueue(ctx.admin);
  const latest = await latestRiskReviews(ctx.admin, queue.rows.map((row) => row.accountId));
  const status: RiskDisposition | 'all' = searchParams.status === 'all' ? 'all' : isRiskDisposition(searchParams.status) ? searchParams.status : 'open';
  const dispositionFor = (accountId: string): RiskDisposition => latest.reviews.get(accountId)?.disposition ?? 'open';
  const rows = status === 'all' ? queue.rows : queue.rows.filter((row) => dispositionFor(row.accountId) === status);
  const canReview = staffCan(ctx.staff, 'account.enforce');

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Trust &amp; safety</p>
        <h1 className={styles.title}>Review queue</h1>
        <p className={styles.lead}>
          Accounts with something worth a look in the last {queue.windowDays} days, most first. This ranks and explains;
          it does not decide. Every enforcement control is on the account page, behind its own permission.
        </p>
      </header>

      {!queue.available || !latest.available ? (
        <div className={`${styles.banner} ${styles.err}`}>Review data is incomplete. {queue.unavailableSources.length ? `Could not read ${queue.unavailableSources.join(', ')}.` : 'Could not read review dispositions.'} No empty state should be treated as clear.</div>
      ) : null}
      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>Review disposition recorded.</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>Choose a disposition and enter a reason of at least four characters.</div> : null}

      {/* The stated principle, made structural rather than decorative: a
          dispute is a customer's assertion, not a finding against the
          contractor, and a high refund rate is often a business that makes
          things right. Saying so here is what stops a queue position becoming
          an accusation. */}
      <div className={`${styles.banner} ${styles.ok}`}>
        <strong>A signal is not a violation.</strong> Disputes are customer assertions, not findings — many resolve in
        the contractor&rsquo;s favour. Confirmed outcomes are listed separately from signals for that reason. Read both
        columns before doing anything.
      </div>

      <nav className={styles.filterTabs} aria-label="Review disposition">
        <Link href="/admin/risk?status=all" aria-current={status === 'all' ? 'page' : undefined} className={`${styles.filterTab} ${status === 'all' ? styles.on : ''}`}>All signals</Link>
        {RISK_DISPOSITIONS.map((value) => <Link key={value} href={`/admin/risk?status=${value}`} aria-current={status === value ? 'page' : undefined} className={`${styles.filterTab} ${status === value ? styles.on : ''}`}>{value}</Link>)}
      </nav>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>
          {rows.length} {rows.length === 1 ? 'account' : 'accounts'} with review signals
          <span className={styles.muted} style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            {' '}· {queue.accountsScanned.toLocaleString('en-US')} scanned over {queue.windowDays} days
          </span>
        </h2>
        {queue.truncated ? (
          <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.8rem' }}>
            A row cap was reached, so this covers the most recent activity rather than the whole window. Everything
            below is real; something older may be missing.
          </p>
        ) : null}

        {rows.length === 0 ? (
          queue.available && latest.available ? <p className={styles.emptyState}>
            No accounts match the {status} review filter in the last {queue.windowDays} days across {queue.accountsScanned.toLocaleString('en-US')} accounts.
          </p> : null
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Assessment</th>
                  <th>Review status</th>
                  <th>Confirmed outcomes</th>
                  <th>Signals</th>
                  <th className="num">Collected</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.accountId}>
                    <td>
                      <Link href={`/admin/accounts/${row.accountId}`} className={styles.rowLink}>{row.name}</Link>
                      {row.accountNumber ? <div className={styles.muted} style={{ fontSize: '.72rem' }}>#{row.accountNumber}</div> : null}
                      {row.signals.suspended ? (
                        <div><span className={`${styles.pill} ${styles.bad}`}>Suspended</span></div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className={`${styles.pill} ${styles[BAND_CLASS[row.assessment.band]]}`}>
                        {RISK_BAND_LABEL[row.assessment.band]}
                      </span>
                      <div className={styles.muted} style={{ fontSize: '.72rem', maxWidth: '22ch' }}>
                        {RISK_BAND_HELP[row.assessment.band]}
                      </div>
                    </td>
                    <td style={{ minWidth: '15rem' }}>
                      <span className={`${styles.pill} ${dispositionFor(row.accountId) === 'escalated' ? styles.bad : dispositionFor(row.accountId) === 'monitor' ? styles.warn : dispositionFor(row.accountId) === 'cleared' ? styles.good : styles.neutral}`}>{dispositionFor(row.accountId)}</span>
                      {latest.reviews.get(row.accountId) ? (
                        <div className={styles.muted} style={{ fontSize: '.72rem', marginTop: '.25rem' }}>
                          {latest.reviews.get(row.accountId)?.note}<br />
                          {latest.reviews.get(row.accountId)?.created_by}{latest.reviews.get(row.accountId)?.review_on ? ` · review ${latest.reviews.get(row.accountId)?.review_on}` : ''}
                        </div>
                      ) : <div className={styles.muted} style={{ fontSize: '.72rem' }}>Not reviewed yet</div>}
                    </td>
                    <td><FactorList factors={row.assessment.factors} kind="confirmed" /></td>
                    <td><FactorList factors={row.assessment.factors} kind="signal" /></td>
                    <td className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      ${Math.round(row.signals.paidVolume).toLocaleString('en-US')}
                      <div className={styles.muted} style={{ fontSize: '.72rem' }}>{row.signals.paidCount} payments</div>
                    </td>
                    <td>
                      {/* The only action, on purpose. Enforcement belongs where
                          the context is, not next to a score. */}
                      <Link href={`/admin/accounts/${row.accountId}`} className={styles.rowLink}>Open account →</Link>
                      {canReview ? (
                        <details className={styles.inlineDisclosure}>
                          <summary>Set disposition</summary>
                          <form action={setRiskDispositionAction.bind(null, row.accountId)} className={styles.formStack}>
                            <label className={styles.srOnly} htmlFor={`risk-disposition-${row.accountId}`}>Disposition</label>
                            <select id={`risk-disposition-${row.accountId}`} className={styles.compactInput} name="disposition" defaultValue={dispositionFor(row.accountId)}>{RISK_DISPOSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select>
                            <label className={styles.srOnly} htmlFor={`risk-note-${row.accountId}`}>Review note</label>
                            <input id={`risk-note-${row.accountId}`} className={styles.compactInput} name="note" required minLength={4} placeholder="What you reviewed and why" />
                            <label className={styles.srOnly} htmlFor={`risk-date-${row.accountId}`}>Review again on</label>
                            <input id={`risk-date-${row.accountId}`} className={styles.compactInput} name="review_on" type="date" />
                            <button className="btn secondary" type="submit">Save review</button>
                          </form>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>How this is worked out</h2>
        {/* Two staff members should read a queue position the same way, which
            needs the thresholds written down somewhere they will actually be
            found — next to the numbers, not in a runbook. */}
        <dl className={styles.kv}>
          <dt>Window</dt>
          <dd>The last {queue.windowDays} days. Disputes count if they were OPENED in the window, even against an older charge.</dd>
          <dt>Rates</dt>
          <dd>Ignored below 5 payments or $500 collected — one dispute against two payments is 50% and means nothing.</dd>
          <dt>Weighting</dt>
          <dd>
            A lost chargeback counts heaviest: it is the only money signal that is an adjudicated outcome rather than an
            allegation. Disputes, dispute rate and refund rate are signals and weigh less.
          </dd>
          <dt>No-shows</dt>
          <dd>
            Listed as confirmed, with a caveat: a Quick Stop can reach that state from the customer&rsquo;s own public
            report link, not only from a staff adjudication.
          </dd>
          <dt>Suspended</dt>
          <dd>
            Shown but scored zero. A suspended account has already been reviewed and acted on; scoring it would pin a
            settled case to the top of a queue of accounts still awaiting a decision.
          </dd>
          <dt>Not included</dt>
          <dd>
            Nothing about identity, device, IP or velocity of signups — none of that is collected. This is a payments
            and fulfilment picture only.
          </dd>
        </dl>
      </section>
    </>
  );
}
