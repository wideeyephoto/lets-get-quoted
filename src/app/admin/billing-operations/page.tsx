import { requireAdmin } from '@/lib/auth';
import {
  loadAdminBillingOperations,
  type BillingOperationsAvailability,
  type BillingOperationsLedger,
} from '@/lib/admin-billing-operations';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing operations' };

const AVAILABILITY: Record<
  BillingOperationsAvailability,
  { label: string; tone: 'good' | 'neutral' | 'bad' }
> = {
  installed: { label: 'Installed', tone: 'good' },
  not_installed: { label: 'Not installed', tone: 'neutral' },
  unavailable: { label: 'Read unavailable', tone: 'bad' },
};

function ageLabel(iso: string | null, now: Date): string {
  if (!iso) return 'None open';
  const elapsed = Math.max(0, now.getTime() - new Date(iso).getTime());
  if (!Number.isFinite(elapsed)) return 'Unavailable';
  if (elapsed < 60_000) return 'Just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function Metrics({ ledger }: { ledger: BillingOperationsLedger }) {
  if (ledger.availability !== 'installed') return <span className={styles.muted}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem .8rem' }}>
      {ledger.metrics.map((metric) => (
        <span key={metric.code} style={{ whiteSpace: 'nowrap' }}>
          <strong>{metric.count.toLocaleString('en-US')}</strong>{' '}
          <span className={styles.muted}>{metric.label.toLowerCase()}</span>
        </span>
      ))}
    </div>
  );
}

function FixedCodes({ ledger }: { ledger: BillingOperationsLedger }) {
  if (ledger.availability !== 'installed') return <span className={styles.muted}>—</span>;
  if (!ledger.fixedErrorCodesSupported) return <span className={styles.muted}>Not exposed</span>;
  if (!ledger.fixedErrorCodes.length) return <span className={styles.muted}>None</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
      {ledger.fixedErrorCodes.map((entry) => (
        <span key={entry.code} className={`${styles.pill} ${styles.neutral}`}>
          <code>{entry.code}</code> × {entry.count}
        </span>
      ))}
      {ledger.fixedErrorCodesTruncated ? (
        <span className={styles.muted} title="Codes summarize the 200 most recently dead-lettered tasks.">
          recent sample
        </span>
      ) : null}
    </div>
  );
}

export default async function AdminBillingOperationsPage() {
  // Layout authorization is repeated intentionally, as on the other admin
  // pages: this binds the cross-workspace service-role read to a current,
  // active staff session at the point where the data is requested.
  const { admin } = await requireAdmin();
  const { ledgers } = await loadAdminBillingOperations(admin);
  const now = new Date();
  const notInstalled = ledgers.filter((ledger) => ledger.availability === 'not_installed').length;
  const unavailable = ledgers.filter((ledger) => ledger.availability === 'unavailable').length;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Read-only readiness</p>
        <h1 className={styles.title}>Billing operations</h1>
        <p className={styles.lead}>
          Coarse operational health for the dark billing ledgers. This page reads counts and ages only; it does not
          activate a webhook or worker, retry work, requeue failures, or expose provider payloads and customer data.
        </p>
      </header>

      {unavailable > 0 ? (
        <div className={`${styles.banner} ${styles.err}`} role="status">
          <strong>{unavailable} {unavailable === 1 ? 'ledger read is' : 'ledger reads are'} unavailable.</strong>{' '}
          Its figures are hidden, not treated as zero. Refresh to retry.
        </div>
      ) : null}
      {notInstalled > 0 ? (
        <div
          className={styles.banner}
          role="status"
          style={{ background: 'rgba(var(--tint), .04)', border: '1px solid var(--edge-t12)' }}
        >
          <strong>{notInstalled} {notInstalled === 1 ? 'ledger is' : 'ledgers are'} not installed.</strong>{' '}
          Required production tables, columns, or summary functions are absent. That is a schema-readiness state, not
          an all-clear and not a zero count.
        </div>
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Ledger readiness</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ledger</th>
                <th>Schema</th>
                <th>Exact counts</th>
                <th>Oldest unresolved</th>
                <th>Fixed terminal codes</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map((ledger) => {
                const availability = AVAILABILITY[ledger.availability];
                return (
                  <tr key={ledger.id}>
                    <td style={{ maxWidth: '31ch' }}>
                      <strong>{ledger.label}</strong>
                      <div className={styles.muted} style={{ fontSize: '.75rem', marginTop: '.2rem' }}>
                        {ledger.description}
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.pill} ${styles[availability.tone]}`}>{availability.label}</span>
                    </td>
                    <td style={{ minWidth: '19rem' }}><Metrics ledger={ledger} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {ledger.availability === 'installed' ? (
                        <span title={ledger.oldestOpenAt ? new Date(ledger.oldestOpenAt).toLocaleString('en-US') : undefined}>
                          {ageLabel(ledger.oldestOpenAt, now)}
                        </span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: '30rem' }}><FixedCodes ledger={ledger} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>How to read this</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '.55rem', fontSize: '.85rem' }}>
          <li><strong>Unresolved</strong> includes received, in-flight, retrying, and terminally failed inbox events. Terminal failures are also called out separately.</li>
          <li><strong>Indeterminate</strong> means a provider submission may have succeeded and must be reconciled before another attempt; it is never safe to infer failure from that state.</li>
          <li><strong>Late-success audit fences</strong> permanently close affected payments to Checkout presentation and new Checkout generations, including after operator release. Active holds also block settlement and ordinary new refunds. A payment is released only after every current signed receipt is covered by an audited resolution; a distinct later paid receipt creates a new active hold.</li>
          <li><strong>Resolution ready</strong> is a read-only eligibility count, not an instruction or an automatic action. Released and active-hold figures count distinct payments; task-state, evidence, and reason figures count signed receipts and can be higher.</li>
          <li><strong>Fixed terminal codes</strong> come from a closed operational allowlist; unknown codes are collapsed before display. Free-form error messages, raw Stripe payloads, object IDs, account IDs, and customer details are never selected.</li>
          <li><strong>Not installed</strong> is reserved for missing required schema objects. Any other database failure is shown as read unavailable.</li>
        </ul>
      </section>
    </>
  );
}
