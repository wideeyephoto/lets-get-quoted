import { formatTimestamp, formatNumber, formatUsd, capFirst } from '@/app/admin/utils/formatters';
import Link from 'next/link';
import { loadPendingVoiceReceipts, safeVoiceReference, voiceReceiptFailureStage, voiceReceiptRetryState } from '@/lib/admin-voice-receipts';
import { retryVoiceReceiptAction } from './actions';
import styles from '../admin.module.css';
import voiceStyles from './voice-receipts.module.css';

function time(value: string): string {
  return formatTimestamp(value, 'short');
}

export default function VoiceReceiptFailures({ result, canRetry }: { result: Awaited<ReturnType<typeof loadPendingVoiceReceipts>>; canRetry: boolean }) {
  const now = Date.now();
  return <section className={styles.panel} id="voice-receipts">
    <h2 className={styles.panelTitle}>Voice receipt processing{result.available ? ` · ${result.total} pending` : ''}</h2>
    <p className={styles.muted}>Recovery checks run every five minutes. A retry resumes the original receipt and preserves its usage debit, retry limit, and notification history.</p>
    {!result.available ? <p role="alert" className={styles.emptyState}>Voice receipt status is unavailable. Refresh to check again.</p> : null}
    {result.available && result.rows.length === 0 ? <p className={styles.emptyState}>No pending or failed voice receipts.</p> : null}
    {result.available && result.total > result.rows.length ? <p className={styles.muted}>Showing the oldest {result.rows.length} of {result.total} pending receipts.</p> : null}
    {result.rows.length ? <div className={styles.tableWrap} role="region" aria-label="Pending voice receipts" tabIndex={0}><table className={`${styles.table} ${voiceStyles.table}`}>
      <thead><tr><th>Receipt / call</th><th>Account</th><th>Failure stage</th><th>Attempts</th><th>Received</th><th>Retry state</th><th>Recovery</th></tr></thead>
      <tbody>{result.rows.map(row => {
        const state = voiceReceiptRetryState(row, now);
        const accountId = safeVoiceReference(row.account_id);
        return <tr key={row.id} id={`voice-receipt-${row.id}`}>
          <td className={voiceStyles.reference}><code>{row.id}</code><br /><span className={styles.muted}>Call: {safeVoiceReference(row.provider_call_id) || 'Unavailable'}</span></td>
          <td>{accountId ? <Link className={styles.rowLink} href={`/admin/accounts/${accountId}`}>Open account</Link> : 'Unattributed'}</td>
          <td>{voiceReceiptFailureStage(row.last_error)}</td><td className="num">{row.attempt_count} / 5</td><td>{time(row.received_at)}</td>
          <td>{state.label}{state.at ? <><br /><span className={styles.muted}>{time(state.at)}</span></> : null}</td>
          <td>{state.retry && canRetry ? <form action={retryVoiceReceiptAction.bind(null, row.id)} className={voiceStyles.retryForm}>
            <label className={styles.srOnly} htmlFor={`retry-voice-${row.id}`}>Reason for retry</label>
            <input id={`retry-voice-${row.id}`} name="reason" required minLength={10} maxLength={500} placeholder="Reason for retry" className={styles.input} />
            <button className="btn secondary" type="submit">Retry receipt</button>
          </form> : state.label === 'Needs review' ? 'Review the original call and admission before reconciliation.' : state.retry ? 'An operations administrator can retry.' : 'Refresh after processing.'}</td>
        </tr>;
      })}</tbody>
    </table></div> : null}
  </section>;
}
