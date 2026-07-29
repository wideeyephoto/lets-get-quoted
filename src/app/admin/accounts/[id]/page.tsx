import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getAccountAdminDetail } from '@/lib/admin-accounts';
import { listAdminActions } from '@/lib/admin';
import styles from '../../admin.module.css';
import AccountActions from './AccountActions';

export const dynamic = 'force-dynamic';

function usd(dollars: number | null | undefined): string {
  const n = Number(dollars) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function usdCents(cents: number | null | undefined): string {
  return usd((Number(cents) || 0) / 100);
}
function fmtDate(v: unknown): string {
  if (!v || typeof v !== 'string') return '—';
  return new Date(v).toLocaleDateString('en-US', { dateStyle: 'medium' });
}
function bool(v: unknown): boolean {
  return v === true;
}

const FEATURE_FLAGS: { key: string; label: string }[] = [
  { key: 'instant_book_enabled', label: 'Instant booking' },
  { key: 'extra_stop_enabled', label: 'Extra Stop' },
  { key: 'deposit_on_approval', label: 'Deposit on approval' },
  { key: 'quote_followups_enabled', label: 'Quote follow-ups' },
  { key: 'appointment_reminders_enabled', label: 'Appointment reminders' },
  { key: 'daily_digest_enabled', label: 'Daily digest' },
  { key: 'auto_review_request', label: 'Auto review requests' },
];

export default async function AdminAccountDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { done?: string; error?: string };
}) {
  const { admin } = await requireAdmin();
  const detail = await getAccountAdminDetail(admin, params.id);
  if (!detail || !detail.account) notFound();

  const a = detail.account as Record<string, unknown>;
  const actions = await listAdminActions(admin, { accountId: params.id, limit: 12 });

  const suspended = Boolean(a.suspended_at);
  const lockedUntil = a.extra_stop_locked_until && new Date(String(a.extra_stop_locked_until)).getTime() > Date.now() ? String(a.extra_stop_locked_until) : null;
  const paypaused = Boolean(a.connect_disabled_at);
  const connected = bool(a.connect_onboarded);

  return (
    <>
      <Link href="/admin/accounts" className={styles.backLink}>← Accounts</Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Account #{String(a.account_number ?? '—')}</p>
        <h1 className={styles.title}>{String(a.business_name || detail.site?.company_name || 'Untitled business')}</h1>
        <p className={styles.lead}>
          {detail.ownerEmail ? <>Owner: <strong>{detail.ownerEmail}</strong> · </> : null}
          Joined {fmtDate(a.created_at)}
        </p>
        <div className={styles.actionRow} style={{ marginTop: '.6rem' }}>
          {suspended ? <span className={`${styles.pill} ${styles.bad}`}>Suspended</span> : <span className={`${styles.pill} ${styles.good}`}>Active</span>}
          <span className={`${styles.pill} ${styles.neutral}`}>{String(a.plan ?? 'free')}</span>
          {paypaused ? <span className={`${styles.pill} ${styles.bad}`}>Payouts paused</span> : connected ? <span className={`${styles.pill} ${styles.good}`}>Payouts connected</span> : <span className={`${styles.pill} ${styles.neutral}`}>Payouts not set up</span>}
          {lockedUntil ? <span className={`${styles.pill} ${styles.warn}`}>Extra Stop locked</span> : null}
        </div>
      </header>

      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE_MESSAGES[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <p className={styles.panelTitle}>Profile</p>
            <dl className={styles.kv}>
              <dt>Owner email</dt><dd>{detail.ownerEmail ?? <span className={styles.muted}>unknown</span>}</dd>
              <dt>Phone</dt><dd>{detail.site?.phone || String(a.alert_phone || '') || <span className={styles.muted}>—</span>}</dd>
              <dt>Plan</dt><dd>{String(a.plan ?? 'free')}</dd>
              <dt>Subscription</dt><dd>{String(a.subscription_status || '—')}</dd>
              <dt>Timezone</dt><dd>{String(a.timezone || '—')}</dd>
              <dt>Mailing address</dt><dd>{String(a.mailing_address || '') || <span className={styles.muted}>—</span>}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <p className={styles.panelTitle}>Payments & fee tier</p>
            <dl className={styles.kv}>
              <dt>Payout status</dt>
              <dd>{paypaused ? 'Paused by Stripe' : connected ? 'Connected & active' : 'Not connected'}{a.connect_disabled_at ? ` (since ${fmtDate(a.connect_disabled_at)})` : ''}</dd>
              <dt>Connect ID</dt><dd className={styles.muted}>{String(a.stripe_connect_id || '—')}</dd>
              <dt>Fee tier</dt><dd>Tier {detail.tier.tier} · {(detail.tier.rate * 100).toFixed(2)}%</dd>
              <dt>Trailing 12-mo volume</dt><dd>{usd(detail.trailingVolume)}</dd>
              <dt>Paid (30 days)</dt><dd>{usdCents(detail.activity.paidVolume30dCents)}</dd>
              <dt>Open disputes</dt><dd>{detail.activity.openDisputes > 0 ? <span className={`${styles.pill} ${styles.bad}`}>{detail.activity.openDisputes}</span> : '0'}</dd>
              <dt>Credit balance</dt><dd>{detail.creditBalanceCents !== 0 ? <strong>{usdCents(detail.creditBalanceCents)}</strong> : '$0'}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <p className={styles.panelTitle}>Recent payments</p>
            {detail.recentPayments.length === 0 ? (
              <p className={styles.emptyState}>No payments.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Date</th><th>Label</th><th>Kind</th><th className="num">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {detail.recentPayments.map((p) => (
                      <tr key={p.id}>
                        <td className={styles.muted}>{fmtDate(p.created_at)}</td>
                        <td>{p.label || '—'}</td>
                        <td className={styles.muted}>{p.kind || '—'}</td>
                        <td className={`num ${styles.muted}`} style={{ textAlign: 'right' }}>{usd(p.amount)}{p.refunded_amount ? <span className={styles.muted}> (−{usd(p.refunded_amount)})</span> : null}</td>
                        <td><PaymentStatusPill status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div>
          <section className={styles.panel}>
            <p className={styles.panelTitle}>Activity (30 days)</p>
            <dl className={styles.kv}>
              <dt>New leads</dt><dd>{detail.activity.leads30d}</dd>
              <dt>Active jobs</dt><dd>{detail.activity.jobsActive}</dd>
              <dt>Extra Stops (active)</dt><dd>{detail.extraStop.active}</dd>
              <dt>Extra Stops (all-time)</dt><dd>{detail.extraStop.total}</dd>
              <dt>No-shows</dt><dd>{detail.extraStop.noShows > 0 ? <span className={`${styles.pill} ${styles.warn}`}>{detail.extraStop.noShows}</span> : '0'}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <p className={styles.panelTitle}>Feature flags</p>
            <dl className={styles.kv}>
              {FEATURE_FLAGS.map((f) => (
                <div key={f.key} style={{ display: 'contents' }}>
                  <dt>{f.label}</dt>
                  <dd>{bool(a[f.key]) ? <span className={`${styles.pill} ${styles.good}`}>On</span> : <span className={`${styles.pill} ${styles.neutral}`}>Off</span>}</dd>
                </div>
              ))}
            </dl>
          </section>

          <AccountActions
            accountId={params.id}
            suspended={suspended}
            extraStopLockedUntil={lockedUntil}
            businessName={String(a.business_name || 'this account')}
          />

          <section className={styles.panel}>
            <p className={styles.panelTitle}>Staff actions on this account</p>
            {actions.length === 0 ? (
              <p className={styles.emptyState}>None yet.</p>
            ) : (
              <ul className={styles.timeline}>
                {actions.map((ac) => (
                  <li key={ac.id}>
                    <time>{new Date(ac.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</time>
                    <span><span className={styles.timelineActor}>{ac.admin_email}</span> — {ac.action.replace(/_/g, ' ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

const DONE_MESSAGES: Record<string, string> = {
  suspended: 'Account suspended. The owner is now blocked from the dashboard.',
  unsuspended: 'Suspension lifted. The owner has access again.',
  credit: 'Account credit issued.',
  es_locked: 'Extra Stop locked for this account.',
  es_unlocked: 'Extra Stop lock cleared.',
  exported: 'Account data exported.',
};
const ERROR_MESSAGES: Record<string, string> = {
  amount: 'Enter a valid dollar amount.',
  state: 'That action isn’t available right now.',
  confirm: 'Confirmation text didn’t match.',
};

function PaymentStatusPill({ status }: { status: string | null }) {
  const s = status ?? 'requested';
  const cls = s === 'paid' ? styles.good : s === 'disputed' ? styles.bad : s === 'refunded' ? styles.warn : s === 'failed' ? styles.bad : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{s}</span>;
}
