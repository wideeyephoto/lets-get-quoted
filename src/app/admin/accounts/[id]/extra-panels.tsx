import Link from 'next/link';
import { formatTimestamp, formatNumber, formatUsd, capFirst } from '@/app/admin/utils/formatters';
import styles from '../../admin.module.css';
import { PaymentStatusPill, bool, words, fmtDateTime, fmtDate, usdCents, initials } from './utils';

// Imports needed by UsageAndOverage
import { remainingCapMillicents, describeOverageResource, formatOverageRate, formatOverageTotal, formatStorageBytes } from '@/lib/admin-overage';
import { formatPlatformFeeBps } from '@/lib/admin-plan-authority';

export interface ExtraPanelsProps {
  accountId: string;
  actions: any[];
  page: number;
  usageOverage: any;
  entitlement: any;
}

export function UsageAndOveragePanel(props: ExtraPanelsProps) {
  const { accountId, actions, page, usageOverage, entitlement } = props;

    const summary = usageOverage.summary;
    const creditLots = usageOverage.creditLots;
    const storage = usageOverage.storageState;
    const seats = usageOverage.purchasedSeats;
    const settlements = usageOverage.settlements;

    const statusLabel = !summary.readable
      ? 'UNAVAILABLE'
      : summary.atCap
        ? 'AT CAP'
        : summary.enabled
          ? 'ACTIVE'
          : 'DISABLED';
    const statusClass = !summary.readable
      ? styles.warn
      : summary.atCap
        ? styles.bad
        : summary.enabled
          ? styles.good
          : styles.neutral;

    const capUsagePercent =
      summary.capCents !== null && summary.capCents > 0
        ? Math.min(100, Math.round((summary.totalMillicents / (summary.capCents * 1000)) * 100))
        : null;
    const remaining = remainingCapMillicents(summary);

    return (
      <section className={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Usage, credits & overage</h2>
          <span className={`${styles.pill} ${statusClass}`}>{statusLabel}</span>
        </div>
        <p className={styles.muted} style={{ margin: '0 0 0.75rem', fontSize: '0.76rem' }}>
          Real-time mirror of customer-facing Plan & Usage meters, credit lots, and billing rail accruals.
        </p>

        <dl className={styles.kv}>
          <dt>Overage rail</dt>
          <dd>
            {summary.enabled ? (
              <span className={`${styles.pill} ${styles.good}`}>Active & authorized</span>
            ) : (
              <span className={`${styles.pill} ${styles.neutral}`}>Disabled</span>
            )}
          </dd>
          <dt>Current period</dt>
          <dd>
            {summary.periodStart && summary.periodEnd
              ? `${fmtDate(summary.periodStart)} – ${fmtDate(summary.periodEnd)}`
              : '—'}
          </dd>
          <dt>Monthly cap</dt>
          <dd>
            <strong>{summary.capCents !== null ? usdCents(summary.capCents) : 'No cap'}</strong>
            {summary.capCents !== null && (
              <span className={styles.muted}>
                {' '}({usdCents(summary.totalMillicents / 1000)} accrued{capUsagePercent !== null ? `, ${capUsagePercent}% used` : ''})
              </span>
            )}
          </dd>
          <dt>Remaining cap</dt>
          <dd>
            {summary.capCents !== null && remaining !== null ? (
              <strong style={{ color: summary.atCap ? '#f87171' : 'inherit' }}>
                {usdCents(remaining / 1000)}
              </strong>
            ) : (
              'Unlimited'
            )}
          </dd>
        </dl>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1.2rem 0 1rem' }} />

        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.86rem', fontWeight: 700, color: 'rgba(247,245,239,0.85)' }}>
          Current period overage line items
        </h3>
        {summary.lines.length === 0 ? (
          <p className={styles.emptyState}>No overage accrued in current period.</p>
        ) : (
          <div className={styles.tableWrap} style={{ marginBottom: '1rem' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th className="num">Quantity</th>
                  <th className="num">Rate</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((line: any) => (
                  <tr key={line.resourceCode}>
                    <td>
                      <strong>{describeOverageResource(line.resourceCode)}</strong>
                      <div className={styles.muted} style={{ fontSize: '0.72rem' }}>{line.resourceCode}</div>
                    </td>
                    <td className={`num ${styles.muted}`}>{line.units.toLocaleString()}</td>
                    <td className={`num ${styles.muted}`}>
                      {line.rateMillicents !== null ? formatOverageRate(line.rateMillicents) : '—'}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatOverageTotal(line.millicents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1.2rem 0 1rem' }} />

        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.86rem', fontWeight: 700, color: 'rgba(247,245,239,0.85)' }}>
          Credit allowances & rollover balances
        </h3>
        {creditLots.kind === 'ready' && creditLots.resources.length > 0 ? (
          <div className={styles.tableWrap} style={{ marginBottom: '1rem' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th className="num">Period Allowance</th>
                  <th className="num">Used This Period</th>
                  <th className="num">Remaining</th>
                  <th className="num">Non-Expiring</th>
                  <th className="num">Total Available</th>
                  <th>Next Expiration</th>
                </tr>
              </thead>
              <tbody>
                {creditLots.resources.map((res: any) => (
                  <tr key={res.resourceCode}>
                    <td>
                      <strong>{res.label}</strong>
                      <div className={styles.muted} style={{ fontSize: '0.72rem' }}>{res.resourceCode}</div>
                    </td>
                    <td className={`num ${styles.muted}`}>
                      {res.periodGranted !== null ? res.periodGranted.toLocaleString() : '—'}
                    </td>
                    <td className={`num ${styles.muted}`}>
                      {res.periodUsed !== null ? res.periodUsed.toLocaleString() : '—'}
                      {res.percentUsed !== null ? ` (${res.percentUsed}%)` : ''}
                    </td>
                    <td className={`num ${styles.muted}`}>
                      {res.periodRemaining !== null ? res.periodRemaining.toLocaleString() : '—'}
                    </td>
                    <td className={`num ${styles.muted}`}>{res.nonExpiring.toLocaleString()}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{res.totalAvailable.toLocaleString()}</td>
                    <td className={styles.muted}>{fmtDate(res.nextExpirationAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.emptyState}>No credit allowances or lots recorded for this account.</p>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1.2rem 0 1rem' }} />

        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.86rem', fontWeight: 700, color: 'rgba(247,245,239,0.85)' }}>
          Workspace storage & capacity
        </h3>
        <dl className={styles.kv}>
          <dt>Storage used</dt>
          <dd>
            {storage.bytesUsed !== null ? formatStorageBytes(storage.bytesUsed) : 'Unmeasured'}
            {storage.limitBytes !== null ? ` / ${formatStorageBytes(storage.limitBytes)}` : ' (no limit)'}
            {storage.bytesUsed !== null && storage.limitBytes !== null && storage.limitBytes > 0 && (
              <span className={styles.muted}>
                {' '}({Math.round((storage.bytesUsed / storage.limitBytes) * 100)}%)
              </span>
            )}
            {storage.objectCount !== null && (
              <span className={styles.muted}> · {storage.objectCount.toLocaleString()} objects</span>
            )}
          </dd>
          <dt>Purchased seats</dt>
          <dd>
            {seats.crewUsers} crew seat{seats.crewUsers === 1 ? '' : 's'}, {seats.officeUsers} office seat{seats.officeUsers === 1 ? '' : 's'}
          </dd>
        </dl>

        {settlements.length > 0 && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1.2rem 0 1rem' }} />
            <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.86rem', fontWeight: 700, color: 'rgba(247,245,239,0.85)' }}>
              Recent overage settlements
            </h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Closed Date</th>
                    <th>Period</th>
                    <th className="num">Accrued</th>
                    <th className="num">Charged</th>
                    <th>State</th>
                    <th>Invoice Item</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.slice(0, 5).map((s: any) => (
                    <tr key={s.id}>
                      <td className={styles.muted}>{fmtDate(s.closedAt)}</td>
                      <td className={styles.muted}>{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</td>
                      <td className={`num ${styles.muted}`}>{usdCents(s.totalMillicents / 1000)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{usdCents(s.chargeableCents)}</td>
                      <td>
                        <span className={`${styles.pill} ${s.state === 'invoiced' || s.state === 'settled' ? styles.good : s.state === 'failed' ? styles.bad : styles.neutral}`}>
                          {s.state}
                        </span>
                        {s.lastError && (
                          <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: '0.2rem' }}>
                            {s.lastError}
                          </div>
                        )}
                      </td>
                      <td className={styles.muted} style={{ fontSize: '0.72rem' }}>
                        {s.stripeInvoiceItemId ? <code>{s.stripeInvoiceItemId}</code> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    );
  
}

export function AuditPanel(props: ExtraPanelsProps) {
  const { accountId, actions, page, usageOverage, entitlement } = props;
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Staff actions on this account</h2>
      {actions.length === 0 ? (
        <p className={styles.emptyState}>None yet.</p>
      ) : (
        <ul className={styles.timeline}>
          {actions.map((ac) => (
            <li key={ac.id}>
              <time>{fmtDateTime(ac.created_at)}</time>
              <span>
                <span className={styles.timelineActor}>{ac.admin_email}</span> — {ac.action.replace(/_/g, ' ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

