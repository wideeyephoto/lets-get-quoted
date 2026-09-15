import Link from 'next/link';
import { EMAIL_RECOVERY_REASONS, type EmailSendRecovery } from '@/lib/email-send-recovery';
import styles from '../admin.module.css';

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? `${date.toISOString().replace('T', ' ').slice(0, 16)} UTC` : 'Unknown';
}

export function EmailRecoveryPanel({ emailRecovery }: { emailRecovery: EmailSendRecovery }) {
  return (
    <section id="email-recovery" className={styles.panel}>
      <h2 className={styles.panelTitle}>Email recovery</h2>
      <p className={styles.muted}>Welcome, lifecycle, quote and invoice sends that need attention. Provider acceptance does not confirm delivery.</p>
      {!emailRecovery.available ? (
        <div className={`${styles.banner} ${styles.err}`}>Email recovery checks are unavailable. Verify database access and the latest migration before treating this as an all-clear.</div>
      ) : emailRecovery.rows.length === 0 ? (
        <p>No overdue or uncertain sends found in the tracked email paths.</p>
      ) : (
        <>
          <p>{emailRecovery.more ? 'At least 51' : emailRecovery.rows.length} {emailRecovery.rows.length === 1 ? 'send needs' : 'sends need'} attention. {emailRecovery.more ? 'Showing the 50 oldest.' : ''}</p>
          <p>Check the saved message and provider history before retrying. A closed retry window requires review; sending a replacement can duplicate an accepted message.</p>
          <ul className={styles.timeline}>
            {emailRecovery.rows.map(row => (
              <li key={`${row.source}:${row.send_id}`}>
                <time dateTime={row.first_attempt_at}>First attempt: {formatTime(row.first_attempt_at)}</time>
                <span>
                  <strong>{EMAIL_RECOVERY_REASONS[row.reason] ?? 'Delivery needs review'}</strong>
                  {' · '}{row.kind.replace(/_/g, ' ')}{' · '}{row.attempts} {row.attempts === 1 ? 'attempt' : 'attempts'}
                  {' · '}<Link href={`/admin/accounts/${row.account_id}`}>Open workspace</Link>
                  <br />Reference: <code style={{ overflowWrap: 'anywhere' }}>{row.send_id}</code>{row.phase === 'fallback' ? ' · Platform sender fallback' : ''}
                  <br />Retry cutoff: {formatTime(row.retry_before)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
