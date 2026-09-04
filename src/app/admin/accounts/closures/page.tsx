import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { loadPendingIrreversibleWork } from '@/lib/admin-closures';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pending Irreversible Work & Closures' };

function fmtDate(v: unknown): string {
  if (!v) return '—';
  try {
    const d = new Date(v as string | number | Date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

function fmtDateTime(v: unknown): string {
  if (!v) return '—';
  try {
    const d = new Date(v as string | number | Date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function stateBadge(state: string) {
  const s = state.toLowerCase();
  const cls =
    s === 'completed' || s === 'done' || s === 'succeeded' || s === 'cleared'
      ? styles.good
      : s === 'failed' || s === 'error' || s === 'dead_letter'
        ? styles.bad
        : s === 'in_progress' || s === 'processing' || s === 'running'
          ? styles.warn
          : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{state}</span>;
}

export default async function AdminClosuresPage() {
  const ctx = await requireAdmin();
  const data = await loadPendingIrreversibleWork(ctx.admin);
  const { activeClosures, completedClosures, recoverableDeletions, metrics } = data;

  return (
    <>
      <Link href="/admin/accounts" className={styles.backLink}>
        ← Back to Accounts
      </Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Governance & Data Lifecycle</p>
        <h1 className={styles.title}>Pending Irreversible Work & Closures</h1>
        <p className={styles.lead}>
          Track scheduled account disposal lifecycles across external service providers and monitor
          soft-deleted items awaiting permanent purge in the recoverable trash bin.
        </p>
      </header>

      {/* Metrics Row */}
      <div className={styles.metricsRow}>
        <div className={`${styles.panel} ${styles.statCard} ${metrics.pendingClosuresCount > 0 ? styles.accentAmber : styles.accentNeutral}`}>
          <div className={styles.statLabel}>Pending Closures</div>
          <div className={styles.statValue}>{metrics.pendingClosuresCount}</div>
          <div className={styles.statDrill}>
            {metrics.pendingClosuresCount > 0 ? 'Disposal pipeline active' : 'All closures cleared'}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${metrics.failedClosuresCount > 0 ? styles.accentRose : styles.accentNeutral}`}>
          <div className={styles.statLabel}>Failed Disposals</div>
          <div className={styles.statValue} style={{ color: metrics.failedClosuresCount > 0 ? '#f87171' : 'inherit' }}>
            {metrics.failedClosuresCount}
          </div>
          <div className={styles.statDrill}>
            {metrics.failedClosuresCount > 0 ? 'Requires engineering retry' : '0 errors'}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentIndigo}`}>
          <div className={styles.statLabel}>Trash Bin Items</div>
          <div className={styles.statValue}>{metrics.activeTrashCount}</div>
          <div className={styles.statDrill}>30-day soft-deletion window</div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${metrics.expiringSoonTrashCount > 0 ? styles.accentRose : styles.accentNeutral}`}>
          <div className={styles.statLabel}>Purging Soon</div>
          <div className={styles.statValue} style={{ color: metrics.expiringSoonTrashCount > 0 ? '#fbbf24' : 'inherit' }}>
            {metrics.expiringSoonTrashCount}
          </div>
          <div className={styles.statDrill}>Within 7 days of irreversible purge</div>
        </div>
      </div>

      {/* Active Account Closure Jobs */}
      <section className={styles.panel} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Active Account Closure Pipeline</h2>
          <span className={`${styles.pill} ${activeClosures.length > 0 ? styles.warn : styles.good}`}>
            {activeClosures.length} ACTIVE
          </span>
        </div>
        <p className={styles.muted} style={{ margin: '0 0 0.85rem', fontSize: '0.78rem' }}>
          When an account is deleted or closed, access is cut off immediately and multi-stage disposal jobs
          tear down database records, cancel Stripe billing, archive QuickBooks data, scrub Cloud Storage buckets, and wipe Auth credentials.
        </p>

        {activeClosures.length === 0 ? (
          <p className={styles.emptyState}>No account closures currently in progress.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account / Subject</th>
                  <th>Requested By</th>
                  <th>Revoked At</th>
                  <th>Local DB</th>
                  <th>Stripe</th>
                  <th>QuickBooks</th>
                  <th>Storage</th>
                  <th>Auth Cleanup</th>
                  <th>Attempts</th>
                  <th>Status / Error</th>
                </tr>
              </thead>
              <tbody>
                {activeClosures.map((job) => (
                  <tr key={job.id}>
                    <td>
                      {job.accountId ? (
                        <Link href={`/admin/accounts/${job.accountId}`} className={styles.rowLink}>
                          <strong>{job.businessName || job.accountNumber || job.accountId}</strong>
                        </Link>
                      ) : (
                        <strong>{job.businessName || job.closureSubjectId}</strong>
                      )}
                      <div className={styles.muted} style={{ fontSize: '0.72rem' }}>
                        Subject: <code>{job.closureSubjectId}</code>
                      </div>
                    </td>
                    <td>
                      <div>{job.requestedByRole}</div>
                      {job.requestedByUserId && (
                        <div className={styles.muted} style={{ fontSize: '0.72rem' }}>
                          User: {job.requestedByUserId.slice(0, 8)}...
                        </div>
                      )}
                    </td>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(job.accessRevokedAt)}
                    </td>
                    <td>{stateBadge(job.localDisposalState)}</td>
                    <td>{stateBadge(job.stripeState)}</td>
                    <td>{stateBadge(job.quickbooksState)}</td>
                    <td>{stateBadge(job.storageState)}</td>
                    <td>{stateBadge(job.authCleanupState)}</td>
                    <td className={styles.muted}>
                      {job.attempts} / {job.maxAttempts}
                      {job.nextRetryAt && (
                        <div style={{ fontSize: '0.7rem' }}>Retry: {fmtDateTime(job.nextRetryAt)}</div>
                      )}
                    </td>
                    <td>
                      {job.lastError ? (
                        <span className={`${styles.pill} ${styles.bad}`} title={job.lastError}>
                          Error
                        </span>
                      ) : (
                        <span className={`${styles.pill} ${styles.warn}`}>Pending</span>
                      )}
                      {job.lastError && (
                        <div className={styles.muted} style={{ fontSize: '0.7rem', color: '#f87171', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {job.lastError}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recoverable Deletions Trash Bin */}
      <section id="trash" className={styles.panel} style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>Recoverable Deletions (Trash Bin)</h2>
          <span className={`${styles.pill} ${recoverableDeletions.length > 0 ? styles.accent : styles.neutral}`}>
            {recoverableDeletions.length} ITEMS
          </span>
        </div>
        <p className={styles.muted} style={{ margin: '0 0 0.85rem', fontSize: '0.78rem' }}>
          Soft-deleted items across tenant workspaces. Items remain restorable for 30 days before permanent irreversible purge.
        </p>

        {recoverableDeletions.length === 0 ? (
          <p className={styles.emptyState}>The trash bin is completely empty across all accounts.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Entity</th>
                  <th>Title / Details</th>
                  <th>Deleted Date</th>
                  <th>Reason / User</th>
                  <th>Purge Countdown</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recoverableDeletions.map((del) => (
                  <tr key={del.id}>
                    <td>
                      <Link href={`/admin/accounts/${del.accountId}`} className={styles.rowLink}>
                        <strong>{del.businessName || del.accountNumber || del.accountId.slice(0, 8)}</strong>
                      </Link>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${styles.neutral}`}>{del.entityType}</span>
                      <div className={styles.muted} style={{ fontSize: '0.7rem' }}>
                        <code>{del.entityId.slice(0, 10)}...</code>
                      </div>
                    </td>
                    <td>
                      <strong>{del.title}</strong>
                      {del.subtitle && (
                        <div className={styles.muted} style={{ fontSize: '0.72rem' }}>
                          {del.subtitle}
                        </div>
                      )}
                    </td>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>
                      {fmtDateTime(del.deletedAt)}
                    </td>
                    <td>
                      <div>{del.deletionReason || 'User action'}</div>
                      {del.deletedByUserId && (
                        <div className={styles.muted} style={{ fontSize: '0.7rem' }}>
                          by {del.deletedByUserId.slice(0, 8)}...
                        </div>
                      )}
                    </td>
                    <td>
                      {del.isExpired ? (
                        <span className={`${styles.pill} ${styles.bad}`}>Expired (Pending Purge)</span>
                      ) : del.daysRemaining <= 7 ? (
                        <span className={`${styles.pill} ${styles.warn}`}>
                          {del.daysRemaining}d {del.hoursRemaining}h left
                        </span>
                      ) : (
                        <span className={`${styles.pill} ${styles.neutral}`}>
                          {del.daysRemaining}d {del.hoursRemaining}h left
                        </span>
                      )}
                      <div className={styles.muted} style={{ fontSize: '0.7rem' }}>
                        Purge at {fmtDate(del.purgeEligibleAt)}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${styles.neutral}`}>{del.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recently Completed Closures */}
      {completedClosures.length > 0 && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Recently Completed Closures</h2>
          <p className={styles.muted} style={{ margin: '0 0 0.85rem', fontSize: '0.78rem' }}>
            Completed disposal jobs where all external systems and database records were verified cleared.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Requested By</th>
                  <th>Completed Date</th>
                  <th>Final State</th>
                </tr>
              </thead>
              <tbody>
                {completedClosures.slice(0, 10).map((job) => (
                  <tr key={job.id}>
                    <td>
                      <code>{job.closureSubjectId}</code>
                      {job.businessName && <div>{job.businessName}</div>}
                    </td>
                    <td className={styles.muted}>{job.requestedByRole}</td>
                    <td className={styles.muted}>{fmtDateTime(job.completedAt)}</td>
                    <td>
                      <span className={`${styles.pill} ${styles.good}`}>COMPLETED</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
