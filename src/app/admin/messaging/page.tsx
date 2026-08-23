import { requireAdmin } from '@/lib/auth';
import { loadMessagingOperationsHealth } from '@/lib/admin-messaging';
import {
  reconcileMessagingUnmatchedStatusAction,
  resolveMessagingReviewAction,
} from './actions';
import Link from 'next/link';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Messaging operations' };

function when(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US') : 'Unknown';
}

function maskPhone(value: string | null): string {
  if (!value) return '—';
  return value.length > 4 ? `${value.slice(0, 2)}•••${value.slice(-4)}` : '••••';
}

export default async function AdminMessagingPage() {
  const { admin } = await requireAdmin();
  const health = await loadMessagingOperationsHealth(admin);
  const counts = health.taskCounts;
  const paymentProducer = health.paymentProducerTaskCounts;
  const inboundActions = health.inboundActionTaskCounts;
  const deliveries = health.deliveryStatusCounts;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Operations</p>
        <h1 className={styles.title}>Messaging</h1>
        <p className={styles.lead}>
          Carrier configuration, durable delivery work, number readiness, and replies that need a human decision. This page never changes provider credentials or purchases a number.
        </p>
        <p><Link href="/admin/messaging/registrations">Review dedicated-number registrations →</Link></p>
      </header>

      {health.unavailable.length ? (
        <div className={`${styles.banner} ${styles.err}`}>
          Messaging health is incomplete: {health.unavailable.join(', ')} could not be read. Missing data is not an all-clear.
        </div>
      ) : null}

      <section className={styles.cardGrid} aria-label="Messaging delivery counts">
        {[
          ['Queue due', counts.queued ?? 0],
          ['Worker leases', counts.leased ?? 0],
          ['Delivery failed', deliveries.failed ?? 0],
          ['Indeterminate', deliveries.indeterminate ?? 0],
          ['Usage reconcile', health.usageReconciliationFailureCount ?? '—'],
          ['Needs review', health.openReviewCount ?? '—'],
          ['Webhook failures', health.unresolvedSmsWebhookFailureCount ?? '—'],
          ['Payment SMS backlog', (paymentProducer.ready ?? 0) + (paymentProducer.retry_wait ?? 0)],
          ['Payment SMS dead letters', paymentProducer.dead_letter ?? 0],
          ['Inbound action deferred', inboundActions.failed ?? 0],
          ['Inbound action dead letters', health.inboundActionHighAttemptCount ?? '—'],
        ].map(([label, value]) => (
          <div className={`${styles.panel} ${styles.statCard}`} key={String(label)}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
          </div>
        ))}
      </section>

      <p className={styles.muted}>
        Queue counts describe worker state; delivery counts describe the customer-facing lifecycle after carrier callbacks.
        {' '}Usage reconciliation failures require an accounting review, not a resend.
        {' '}Payment-producer and inbound-action dead letters require operator investigation; neither authorizes a resend.
        {' '}<Link href="/admin/failures#webhooks">Review unresolved webhook and signature failures →</Link>
      </p>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Runtime gates</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}><tbody>
            <tr><td>Active provider</td><td><strong>{health.provider.active ?? 'None'}</strong></td></tr>
            <tr><td>Worker</td><td>{health.workerEnabled ? 'Enabled' : 'Dark / disabled'}</td></tr>
            <tr><td>Outbound gate</td><td>{health.suppression ? `Suppressed: ${health.suppression}` : 'Open'}</td></tr>
            <tr><td>Traffic lanes</td><td>{Object.entries(health.purposeGates).map(([purpose, enabled]) => `${purpose}: ${enabled ? 'enabled' : 'dark'}`).join(' · ')}</td></tr>
            <tr><td>Canary accounts</td><td>{health.canaryAccounts.length ? health.canaryAccounts.join(', ') : 'None — all accounts would be eligible after activation'}</td></tr>
            <tr><td>Oldest queued</td><td>{when(health.oldestQueuedAt)}</td></tr>
            <tr><td>Oldest payment SMS producer backlog</td><td>{when(health.oldestPaymentProducerBacklogAt)}</td></tr>
            <tr><td>Oldest inbound action backlog</td><td>{when(health.oldestInboundActionBacklogAt)}</td></tr>
            <tr><td>Latest provider acceptance / delivery</td><td>{when(health.latestSuccessfulOutboundAt)}</td></tr>
            <tr><td>Latest inbound</td><td>{when(health.latestInboundAt)}</td></tr>
          </tbody></table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Sender inventory</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Number</th><th>Provider / purpose</th><th>Campaign</th><th>Assignment</th><th>Provisioning</th><th>Inbound</th><th>Webhook</th></tr></thead>
            <tbody>
              {health.senders.length ? health.senders.map((sender) => (
                <tr key={sender.id}>
                  <td><code>{sender.number}</code></td>
                  <td>{sender.provider}<div className={styles.muted}>{sender.purpose}</div></td>
                  <td><code>{sender.campaignId ?? '—'}</code></td>
                  <td>{sender.assignmentState}</td>
                  <td>{sender.provisioningStatus}</td>
                  <td>{sender.inboundReady ? 'Ready' : 'Not ready'}</td>
                  <td style={{ maxWidth: '32ch', overflowWrap: 'anywhere' }}>{sender.inboundWebhookUrl ?? '—'}</td>
                </tr>
              )) : <tr><td colSpan={7} className={styles.muted}>No sender numbers are inventoried.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Operator review</h2>
        {health.openReviews.length ? health.openReviews.map((item) => (
          <article className={styles.panel} key={item.id} style={{ marginTop: '.8rem' }}>
            <strong>{item.reason.replace(/_/g, ' ')}</strong>{' '}
            <span className={styles.muted}>· {item.severity} · {item.provider} · {when(item.createdAt)}</span>
            <p className={styles.muted}>From {maskPhone(item.fromNumber)} to {maskPhone(item.toNumber)}{item.providerStatus ? ` · ${item.providerStatus}` : ''}{item.providerErrorCode ? ` · code ${item.providerErrorCode}` : ''}</p>
            {item.providerEventId ? <p className={styles.muted}>Provider message ID <code>{item.providerEventId}</code></p> : null}
            {item.body ? <p>{item.body}</p> : null}
            {item.reason === 'unmatched_status' ? (
              <>
                <p className={styles.muted}>
                  Match only to an indeterminate delivery after verifying the provider and message in its delivery exception. This records carrier evidence; it never retries or resends.
                </p>
                <form action={reconcileMessagingUnmatchedStatusAction} style={{ display: 'grid', gap: '.55rem', maxWidth: '56rem' }}>
                  <input type="hidden" name="reviewId" value={item.id} />
                  <label>
                    Exact SMS event UUID
                    <input
                      name="smsEventId"
                      required
                      inputMode="text"
                      autoComplete="off"
                      pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
                      placeholder="00000000-0000-4000-8000-000000000000"
                    />
                  </label>
                  <label>Reconciliation note<input name="note" required minLength={3} maxLength={2000} /></label>
                  <button className="button small">Bind status to this event</button>
                </form>
                <form action={resolveMessagingReviewAction} style={{ display: 'grid', gap: '.55rem', maxWidth: '56rem', marginTop: '.75rem' }}>
                  <input type="hidden" name="reviewId" value={item.id} />
                  <input type="hidden" name="resolution" value="dismissed" />
                  <label>Dismissal note<input name="note" required minLength={3} maxLength={2000} /></label>
                  <button className="button small secondary">Dismiss without binding</button>
                </form>
              </>
            ) : (
              <form action={resolveMessagingReviewAction} style={{ display: 'grid', gap: '.55rem', maxWidth: '56rem' }}>
                <input type="hidden" name="reviewId" value={item.id} />
                <label>Resolution note<input name="note" required minLength={3} maxLength={2000} /></label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button className="button small" name="resolution" value="resolved">Resolve</button>
                  <button className="button small secondary" name="resolution" value="dismissed">Dismiss</button>
                </div>
              </form>
            )}
          </article>
        )) : <p className={styles.muted}>No authenticated messaging callback currently needs review.</p>}
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Delivery exceptions</h2>
        <p className={styles.muted}>
          Failed work has a definitive terminal outcome. Indeterminate work may already have reached the carrier and must never be retried until its provider record is reconciled.
        </p>
        {health.deliveryExceptions.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>State</th><th>Destination</th><th>Message</th><th>Provider</th><th>Error</th><th>Updated</th><th>Event</th></tr></thead>
              <tbody>{health.deliveryExceptions.map((item) => (
                <tr key={item.eventId}>
                  <td><strong>{item.taskState}</strong><div className={styles.muted}>{item.deliveryStatus}</div></td>
                  <td>{maskPhone(item.phoneNumber)}</td>
                  <td>{item.messageKind?.replace(/[-_]/g, ' ') ?? 'unknown'}</td>
                  <td>{item.provider ?? '—'}</td>
                  <td><code>{item.errorCode ?? '—'}</code></td>
                  <td>{when(item.updatedAt)}</td>
                  <td><code>{item.eventId}</code><div className={styles.muted}>workspace {item.accountId}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className={styles.muted}>No failed or indeterminate durable deliveries are waiting for inspection.</p>}
      </section>
    </>
  );
}
