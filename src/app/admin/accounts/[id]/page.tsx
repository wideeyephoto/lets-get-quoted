import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getAccountAdminDetail, accountDisplayName } from '@/lib/admin-accounts';
import { listAdminActions } from '@/lib/admin';
import { listSupportCases } from '@/lib/support-cases';
import { accountAttachmentUrl } from '@/lib/account-attachments';
import styles from '../../admin.module.css';
import AccountActions from './AccountActions';
import AccountDetailView, { type AccountTab } from './AccountDetailView';
import {
  addAccountNoteAction,
  addAccountTagAction,
  removeAccountTagAction,
  uploadAccountAttachmentAction,
  deleteAccountAttachmentAction,
  logPrivacyRequestAction,
  resolvePrivacyRequestAction,
  setAccountFlagAction,
} from './actions';
import { ACCOUNT_FLAGS } from '@/lib/account-flags';
import { listAccountMessages, messageFailed, messageKindLabel } from '@/lib/admin-messages';
import { staffCan } from '@/lib/staff';
import { formatPlatformFeeBps } from '@/lib/admin-plan-authority';

export const dynamic = 'force-dynamic';

const DONE_MESSAGES: Record<string, string> = {
  suspended: 'Account suspended. The owner is now blocked from the dashboard.',
  unsuspended: 'Suspension lifted. The owner has access again.',
  credit: 'Account credit issued.',
  es_locked: 'Quick Stop locked for this account.',
  es_unlocked: 'Quick Stop lock cleared.',
  exported: 'Account data exported.',
  reset_verification: 'Payment verification reset. The owner will need to reconnect.',
  payouts_restricted: 'Payouts restricted for this account.',
  payouts_unrestricted: 'Payout restriction lifted.',
  onboarding_resent: 'Onboarding link resent to the owner.',
  signed_out: 'New sign-ins and token refreshes are blocked for 24 hours. Existing short-lived access tokens expire naturally.',
  noted: 'Note added.',
  tagged: 'Tag added.',
  untagged: 'Tag removed.',
  attached: 'File uploaded.',
  attachment_deleted: 'File deleted.',
  privacy_logged: 'Privacy request logged.',
  privacy_resolved: 'Privacy request resolved.',
  flag_changed: 'Setting changed, and recorded against your name.',
  refunded: 'Refund issued.',
  marked_synthetic: 'Account marked synthetic and removed from production reporting.',
  marked_production: 'Account returned to production reporting.',
};

const ERROR_MESSAGES: Record<string, string> = {
  flag: 'That is not a setting this console can change.',
  flag_save: 'Could not save that setting. Try again in a moment.',
  amount: 'Enter a valid dollar amount.',
  state: 'That action isn’t available right now.',
  confirm: 'Confirmation text didn’t match.',
  no_owner: 'No owner email found for this account.',
  note: 'Enter some text for the note.',
  tag: 'Enter a tag.',
  attachment: 'That file could not be uploaded.',
  privacy_kind: 'Choose a request type.',
  reason_required: 'Enter a reason of at least four characters.',
  update_failed: 'The account could not be updated. Try again.',
  partial_signout: 'Some account members were blocked, but at least one update failed. Review the audit entry before retrying.',
  delete_blocked: 'This account has billing or messaging history that cannot be removed automatically — 24 tables hold it under a RESTRICT key, including payments. NOTHING was deleted and no privacy request was scrubbed. Close it out by hand.',
  delete_failed: 'The account could not be deleted. Nothing was removed and no privacy request was scrubbed. Check the server log and try again.',
};

function usd(dollars: unknown): string {
  const n = Number(dollars) || 0;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function usdCents(cents: unknown): string {
  return usd((Number(cents) || 0) / 100);
}
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
    return d.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}
function bool(v: unknown): boolean {
  return v === true;
}
function words(v: unknown): string {
  if (!v || typeof v !== 'string') return '—';
  return v.replace(/_/g, ' ');
}
function initials(name: unknown): string {
  if (!name || typeof name !== 'string') return 'AC';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'AC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function PaymentStatusPill({ status }: { status: string | null }) {
  const s = status ?? 'requested';
  const cls = s === 'paid' ? styles.good : s === 'disputed' ? styles.bad : s === 'refunded' ? styles.warn : s === 'failed' ? styles.bad : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{s}</span>;
}

export default async function AdminAccountDetailPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};
  const ctx = await requireAdmin();
  const { admin, role } = ctx;
  const canFlag = staffCan(ctx.staff, 'account.support');
  const detail = await getAccountAdminDetail(admin, params.id);
  if (!detail || !detail.account) notFound();

  const a = detail.account as Record<string, unknown>;
  const displayName = accountDisplayName({
    company_name: detail.site?.company_name ?? null,
    business_name: (a.business_name as string | null) ?? null,
  });
  const [actions, cases, messages] = await Promise.all([
    listAdminActions(admin, { accountId: params.id, limit: 25 }),
    listSupportCases(admin, { accountId: params.id, limit: 10 }),
    listAccountMessages(admin, params.id, 50),
  ]);
  const attachmentLinks = await Promise.all(
    detail.attachments.map(async (att) => ({
      att,
      url: await accountAttachmentUrl(att.account_id, att.path),
    })),
  );

  const suspended = Boolean(a.suspended_at);
  const lockedUntil =
    a.extra_stop_locked_until && !isNaN(new Date(String(a.extra_stop_locked_until)).getTime()) && new Date(String(a.extra_stop_locked_until)).getTime() > Date.now()
      ? String(a.extra_stop_locked_until)
      : null;
  const paypaused = Boolean(a.connect_disabled_at);
  const connected = bool(a.connect_onboarded);
  const payoutsRestricted = Boolean(a.payouts_restricted_at);
  const entitlement = detail.entitlement;
  const subscription = detail.subscription;
  const doneMessage = searchParams?.done ? DONE_MESSAGES[searchParams.done] : null;

  const tabs: AccountTab[] = [
    { id: 'overview', label: 'Overview', icon: '📑' },
    {
      id: 'billing',
      label: 'Billing & Payments',
      icon: '💳',
      badge: detail.recentPayments.length > 0 ? detail.recentPayments.length : null,
    },
    {
      id: 'messages',
      label: 'Messages & Security',
      icon: '📬',
      badge: messages.length > 0 ? messages.length : null,
    },
    {
      id: 'support',
      label: 'Support & Files',
      icon: '🗂️',
      badge: detail.notes.length + cases.length + detail.attachments.length || null,
    },
    {
      id: 'staff',
      label: 'Staff Hub & Audit',
      icon: '⚡',
      badge: actions.length > 0 ? actions.length : null,
    },
    { id: 'all', label: 'All Sections', icon: '📋' },
  ];

  /* Common reusable section renderers */
  const renderProfilePanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Profile & Contact</h2>
      <dl className={styles.kv}>
        <dt>Owner email</dt>
        <dd>
          {detail.ownerEmail ? (
            <a href={`mailto:${detail.ownerEmail}`} className={styles.rowLink}>
              {detail.ownerEmail}
            </a>
          ) : (
            <span className={styles.muted}>unknown</span>
          )}
        </dd>
        <dt>Customer reply email</dt>
        <dd>
          {a.reply_to_email ? (
            <a href={`mailto:${String(a.reply_to_email)}`} className={styles.rowLink}>
              {String(a.reply_to_email)}
            </a>
          ) : (
            <span className={styles.muted}>Same as owner ({detail.ownerEmail || 'none'})</span>
          )}
        </dd>
        <dt>Phone</dt>
        <dd>
          {detail.site?.phone || String(a.alert_phone || '') ? (
            <a href={`tel:${detail.site?.phone || String(a.alert_phone || '')}`} className={styles.rowLink}>
              {detail.site?.phone || String(a.alert_phone || '')}
            </a>
          ) : (
            <span className={styles.muted}>—</span>
          )}
        </dd>
        <dt>Timezone</dt>
        <dd>{String(a.timezone || '—')}</dd>
        <dt>Mailing address</dt>
        <dd>{String(a.mailing_address || '') || <span className={styles.muted}>—</span>}</dd>
        <dt>Account ID</dt>
        <dd>
          <span className={styles.muted} style={{ fontSize: '0.78rem', userSelect: 'all' }}>
            {params.id}
          </span>
        </dd>
      </dl>
    </section>
  );

  const renderActivityPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Activity & Pipeline</h2>
      <dl className={styles.kv}>
        <dt>New leads (30 days)</dt>
        <dd>
          <strong>{detail.activity.leads30d}</strong>
        </dd>
        <dt>Active jobs</dt>
        <dd>
          <strong>{detail.activity.jobsActive}</strong>
        </dd>
        <dt>Quick Stops (active)</dt>
        <dd>
          {detail.quickStop.active > 0 ? (
            <Link href={`/admin/quick-stops?f=active&account=${params.id}`} className={styles.rowLink}>
              {detail.quickStop.active} active →
            </Link>
          ) : (
            '0'
          )}
        </dd>
        <dt>Quick Stops (all-time)</dt>
        <dd>
          {detail.quickStop.total > 0 ? (
            <Link href={`/admin/quick-stops?f=all&account=${params.id}`} className={styles.rowLink}>
              {detail.quickStop.total} total →
            </Link>
          ) : (
            '0'
          )}
        </dd>
        <dt>No-shows (all-time)</dt>
        <dd>
          {detail.quickStop.noShows > 0 ? (
            <Link href={`/admin/quick-stops?f=no_shows&account=${params.id}`} className={styles.rowLink}>
              <span className={`${styles.pill} ${styles.warn}`}>{detail.quickStop.noShows}</span> See them →
            </Link>
          ) : (
            '0'
          )}
        </dd>
      </dl>
    </section>
  );

  const renderFeatureFlagsPanel = () => (
    <section className={styles.panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0 }}>Feature flags & settings</h2>
        <span className={styles.muted} style={{ fontSize: '0.74rem' }}>
          {canFlag ? 'Operator modifications audited' : 'Read-only for your role'}
        </span>
      </div>
      <p className={styles.muted} style={{ margin: '0 0 0.85rem', fontSize: '0.78rem' }}>
        The account owner can configure these directly in their settings. Changing a flag here records an audit entry with your staff email.
      </p>
      <div className={styles.flagGrid}>
        {ACCOUNT_FLAGS.map((f) => {
          const on = bool(a[f.key]);
          return (
            <div key={f.key} className={styles.flagCard}>
              <div className={styles.flagCardHead}>
                <div className={styles.flagLabel}>{f.label}</div>
                {on ? (
                  <span className={`${styles.pill} ${styles.good}`}>On</span>
                ) : (
                  <span className={`${styles.pill} ${styles.neutral}`}>Off</span>
                )}
              </div>
              <div className={styles.flagHelp}>{f.help}</div>
              {canFlag ? (
                <form action={setAccountFlagAction.bind(null, params.id)} style={{ marginTop: '0.2rem' }}>
                  <input type="hidden" name="flag" value={f.key} />
                  <input type="hidden" name="next" value={on ? 'off' : 'on'} />
                  <button
                    type="submit"
                    className="btn secondary"
                    style={{ width: '100%', fontSize: '0.76rem', padding: '0.35rem 0.6rem' }}
                  >
                    Turn {on ? 'off' : 'on'}
                  </button>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderPlanAuthorityPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Plan & billing authority</h2>
      <p className={styles.muted} style={{ margin: '0 0 0.85rem', fontSize: '0.76rem' }}>
        workspace_entitlements is the effective plan authority. The latest billing_subscriptions row is supporting billing provenance.
        The legacy account fields below are never substituted for a missing entitlement.
      </p>
      {entitlement.kind === 'ready' ? (
        <dl className={styles.kv}>
          <dt>Effective plan</dt>
          <dd>
            <strong>{entitlement.snapshot.planName}</strong>
          </dd>
          <dt>Billing interval</dt>
          <dd>{words(entitlement.snapshot.billingInterval)}</dd>
          <dt>Billing status</dt>
          <dd>{words(entitlement.snapshot.billingStatus)}</dd>
          <dt>Entitlement state</dt>
          <dd>{words(entitlement.snapshot.entitlementState)}</dd>
          <dt>Platform fee</dt>
          <dd>{formatPlatformFeeBps(entitlement.snapshot.platformFeeBps)}</dd>
          <dt>Catalog provenance</dt>
          <dd>
            workspace_entitlements · {entitlement.snapshot.catalogVersion} · snapshot v{entitlement.snapshot.version}
          </dd>
          <dt>Effective at</dt>
          <dd>{fmtDateTime(entitlement.snapshot.effectiveAt)}</dd>
          <dt>Snapshot updated</dt>
          <dd>{fmtDateTime(entitlement.snapshot.updatedAt)}</dd>
          <dt>Entitlement period</dt>
          <dd>
            {entitlement.snapshot.periodStart || entitlement.snapshot.periodEnd
              ? `${fmtDate(entitlement.snapshot.periodStart)} – ${fmtDate(entitlement.snapshot.periodEnd)}`
              : entitlement.snapshot.planCode === 'flex'
                ? 'No billing period (Flex)'
                : 'No period recorded'}
          </dd>
        </dl>
      ) : (
        <p className={styles.emptyState}>
          {entitlement.kind === 'missing'
            ? 'No workspace entitlement snapshot exists. No legacy plan has been substituted.'
            : 'The workspace entitlement snapshot could not be read or validated. No legacy plan has been substituted.'}
        </p>
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1.2rem 0 1rem' }} />

      <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.86rem', fontWeight: 700, color: 'rgba(247,245,239,0.85)' }}>
        Latest billing subscription snapshot
      </h3>
      {subscription.kind === 'ready' ? (
        <dl className={styles.kv}>
          <dt>Subscription plan</dt>
          <dd>
            {subscription.snapshot.planName} · {words(subscription.snapshot.billingInterval)}
          </dd>
          <dt>Subscription status</dt>
          <dd>{words(subscription.snapshot.status)}</dd>
          <dt>Subscription fee</dt>
          <dd>{formatPlatformFeeBps(subscription.snapshot.platformFeeBps)}</dd>
          <dt>Catalog provenance</dt>
          <dd>billing_subscriptions · {subscription.snapshot.catalogVersion}</dd>
          <dt>Snapshot updated</dt>
          <dd>{fmtDateTime(subscription.snapshot.updatedAt)}</dd>
          <dt>Current period</dt>
          <dd>
            {subscription.snapshot.currentPeriodStart || subscription.snapshot.currentPeriodEnd
              ? `${fmtDate(subscription.snapshot.currentPeriodStart)} – ${fmtDate(subscription.snapshot.currentPeriodEnd)}`
              : '—'}
          </dd>
          <dt>Cancellation</dt>
          <dd>
            {subscription.snapshot.cancelAtPeriodEnd
              ? `Scheduled for period end${subscription.snapshot.cancelAt ? ` (${fmtDate(subscription.snapshot.cancelAt)})` : ''}`
              : subscription.snapshot.canceledAt
                ? `Canceled ${fmtDate(subscription.snapshot.canceledAt)}`
                : subscription.snapshot.endedAt
                  ? `Ended ${fmtDate(subscription.snapshot.endedAt)}`
                  : subscription.snapshot.status === 'canceled'
                    ? 'Canceled (no timestamp recorded)'
                    : 'Not scheduled'}
          </dd>
        </dl>
      ) : (
        <p className={styles.emptyState}>
          {subscription.kind === 'unavailable'
            ? 'The latest billing subscription snapshot could not be read or validated.'
            : entitlement.kind === 'ready' && entitlement.snapshot.planCode === 'flex'
              ? 'No paid subscription snapshot (expected for Flex).'
              : 'No billing subscription snapshot is available.'}
        </p>
      )}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1.2rem 0 1rem' }} />

      <dl className={styles.kv}>
        <dt>Legacy account plan (migration diagnostic only)</dt>
        <dd>{String(a.plan ?? 'unset')} · not billing authority</dd>
        <dt>Legacy subscription status (migration diagnostic only)</dt>
        <dd>{String(a.subscription_status || 'unset')} · not billing authority</dd>
      </dl>
    </section>
  );

  const renderPaymentsPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Payments & legacy rail diagnostic</h2>
      <dl className={styles.kv}>
        <dt>Payout status</dt>
        <dd>
          {paypaused ? (
            <span className={`${styles.pill} ${styles.bad}`}>Paused by Stripe</span>
          ) : connected ? (
            <span className={`${styles.pill} ${styles.good}`}>Connected & active</span>
          ) : (
            <span className={`${styles.pill} ${styles.neutral}`}>Not connected</span>
          )}
          {a.connect_disabled_at ? ` (since ${fmtDate(a.connect_disabled_at)})` : ''}
        </dd>
        <dt>Connect ID</dt>
        <dd className={styles.muted}>{String(a.stripe_connect_id || '—')}</dd>
        <dt>Legacy volume tier (not plan authority)</dt>
        <dd>
          Tier {detail.tier.tier} · {(detail.tier.rate * 100).toFixed(2)}%
        </dd>
        <dt>Legacy trailing 12-mo volume</dt>
        <dd>{usd(detail.trailingVolume)}</dd>
        <dt>Paid (30 days)</dt>
        <dd>
          <strong>{usdCents(detail.activity.paidVolume30dCents)}</strong>
        </dd>
        <dt>Open disputes</dt>
        <dd>
          {detail.activity.openDisputes > 0 ? (
            <Link href={`/admin/money?account=${params.id}#disputes`} className={styles.rowLink}>
              <span className={`${styles.pill} ${styles.bad}`}>{detail.activity.openDisputes}</span> See them →
            </Link>
          ) : (
            '0'
          )}
        </dd>
        <dt>Credit balance</dt>
        <dd>
          {detail.creditBalanceCents !== 0 ? (
            <strong>{usdCents(detail.creditBalanceCents)}</strong>
          ) : (
            '$0'
          )}
        </dd>
      </dl>
    </section>
  );

  const renderRecentPaymentsPanel = () => (
    <section className={styles.panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0 }}>Recent payment records</h2>
        <Link href={`/admin/payments?range=30d&account=${params.id}`} className={styles.rowLink} style={{ fontSize: '0.8rem' }}>
          Reconcile in the ledger →
        </Link>
      </div>
      <p className={styles.muted} style={{ margin: '0 0 0.75rem', fontSize: '0.76rem' }}>
        Newest 12 by creation date. The paid total uses settlement date across all payments.
      </p>
      {detail.recentPayments.length === 0 ? (
        <p className={styles.emptyState}>
          {detail.activity.paidVolume30dCents > 0
            ? 'No production payment rows are in the newest-record preview. Use the ledger above to see the settled rows behind the 30-day total.'
            : 'No production payments.'}
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Label</th>
                <th>Kind</th>
                <th className="num">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.recentPayments.map((p) => (
                <tr key={p.id}>
                  <td className={styles.muted}>{fmtDate(p.created_at)}</td>
                  <td>
                    <Link href={`/admin/payments/${p.id}`} className={styles.rowLink}>
                      {p.label || 'Payment'}
                    </Link>
                  </td>
                  <td className={styles.muted}>{p.kind || '—'}</td>
                  <td className={`num ${styles.muted}`} style={{ textAlign: 'right' }}>
                    {usd(p.amount)}
                    {p.refunded_amount ? <span className={styles.muted}> (−{usd(p.refunded_amount)})</span> : null}
                  </td>
                  <td>
                    <PaymentStatusPill status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderMessagesPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Messages sent</h2>
      <p className={styles.muted} style={{ margin: '0 0 0.8rem', fontSize: '0.76rem' }}>
        Emails tagged with this account, plus payment and crew texts. Reminder, arrival and Quick Stop texts are
        not logged anywhere yet, and emails sent without an account tag — magic links, digests, contact replies —
        cannot appear here. A missing row is not proof nothing was sent.
      </p>
      {messages.length === 0 ? (
        <p className={styles.emptyState}>Nothing recorded for this account.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Channel</th>
                <th>Kind</th>
                <th>To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>
                    {fmtDateTime(m.occurredAt)}
                  </td>
                  <td className={styles.muted}>{m.channel === 'sms' ? 'Text' : 'Email'}</td>
                  <td>
                    <div>{messageKindLabel(m.kind)}</div>
                    {m.body ? (
                      <div
                        className={styles.muted}
                        style={{
                          fontSize: '0.72rem',
                          maxWidth: '38ch',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.body}
                      </div>
                    ) : null}
                  </td>
                  <td className={styles.muted} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.recipient}
                  </td>
                  <td>
                    <span
                      className={`${styles.pill} ${
                        messageFailed(m)
                          ? styles.bad
                          : m.status === 'delivered' || m.status === 'sent'
                            ? styles.good
                            : styles.neutral
                      }`}
                    >
                      {m.status}
                    </span>
                    {m.errorReason ? (
                      <div className={styles.muted} style={{ fontSize: '0.7rem' }}>
                        {m.errorReason}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderLoginHistoryPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Login & security history</h2>
      {detail.loginEvents.length === 0 ? (
        <p className={styles.emptyState}>No sign-ins recorded yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>Method</th>
                <th>IP</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              {detail.loginEvents.map((e) => (
                <tr key={e.id}>
                  <td className={styles.muted}>{fmtDateTime(e.created_at)}</td>
                  <td>{e.method}</td>
                  <td className={styles.muted}>{e.ip || '—'}</td>
                  <td
                    className={styles.muted}
                    style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {e.user_agent || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderNotesAndTagsPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Internal notes & tags</h2>
      <div className={styles.actionRow} style={{ marginTop: 0, marginBottom: detail.tags.length ? '0.8rem' : 0 }}>
        {detail.tags.map((t) => (
          <form key={t.id} action={removeAccountTagAction.bind(null, params.id)} style={{ display: 'inline' }}>
            <input type="hidden" name="tag_id" value={t.id} />
            <button
              type="submit"
              className={`${styles.pill} ${styles.accent}`}
              style={{ border: 'none', cursor: 'pointer' }}
              title="Remove tag"
            >
              {t.tag} ×
            </button>
          </form>
        ))}
      </div>
      <form action={addAccountTagAction.bind(null, params.id)} className={styles.searchRow} style={{ margin: '0 0 1rem' }}>
        <input className={styles.input} name="tag" placeholder="Add a tag" style={{ minWidth: 0, flex: '0 0 200px' }} />
        <button type="submit" className="btn secondary">
          Add tag
        </button>
      </form>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

      {detail.notes.length === 0 ? (
        <p className={styles.emptyState}>No notes yet.</p>
      ) : (
        <ul className={styles.timeline}>
          {detail.notes.map((n) => (
            <li key={n.id}>
              <time>{fmtDateTime(n.created_at)}</time>
              <span>
                <span className={styles.timelineActor}>{n.created_by}</span> — {n.body}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={addAccountNoteAction.bind(null, params.id)} className={styles.formStack} style={{ marginTop: '0.9rem' }}>
        <textarea
          className={styles.input}
          name="body"
          rows={2}
          placeholder="Add an internal operator note…"
          style={{ minWidth: 0, width: '100%', resize: 'vertical' }}
        />
        <button type="submit" className="btn secondary">
          Add note
        </button>
      </form>
    </section>
  );

  const renderAttachmentsPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Attachments & Files</h2>
      {attachmentLinks.length === 0 ? (
        <p className={styles.emptyState}>No files uploaded.</p>
      ) : (
        <ul className={styles.timeline}>
          {attachmentLinks.map(({ att, url }) => (
            <li key={att.id}>
              <time>{fmtDateTime(att.created_at)}</time>
              <span>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className={styles.rowLink}>
                    {att.filename}
                  </a>
                ) : (
                  att.filename
                )}
                <span className={styles.muted}>
                  {' '}
                  — {att.uploaded_by}
                  {att.size_bytes ? ` · ${Math.round(att.size_bytes / 1024)} KB` : ''}
                </span>
                <form action={deleteAccountAttachmentAction.bind(null, params.id)} style={{ display: 'inline', marginLeft: '0.5rem' }}>
                  <input type="hidden" name="attachment_id" value={att.id} />
                  <button
                    type="submit"
                    className={styles.rowLink}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--bad)' }}
                  >
                    Delete
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={uploadAccountAttachmentAction.bind(null, params.id)} className={styles.formStack} style={{ marginTop: '0.9rem' }}>
        <input type="file" name="file" className={styles.input} />
        <button type="submit" className="btn secondary">
          Upload file
        </button>
      </form>
    </section>
  );

  const renderSupportCasesPanel = () => (
    <section className={styles.panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
        <h2 className={styles.panelTitle} style={{ margin: 0 }}>Support cases</h2>
        <Link href={`/admin/cases/new?account_id=${params.id}`} className={styles.rowLink}>
          New case →
        </Link>
      </div>
      {cases.length === 0 ? (
        <p className={styles.emptyState}>No cases for this account.</p>
      ) : (
        <ul className={styles.timeline}>
          {cases.map((c) => (
            <li key={c.id}>
              <time>{fmtDate(c.created_at)}</time>
              <span>
                <Link href={`/admin/cases/${c.id}`} className={styles.rowLink}>
                  {c.subject}
                </Link>
                <span className={styles.muted}> — {c.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderPrivacyRequestsPanel = () => (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Privacy & GDPR requests</h2>
      {detail.privacyRequests.length === 0 ? (
        <p className={styles.emptyState}>No privacy requests logged.</p>
      ) : (
        <ul className={styles.timeline}>
          {detail.privacyRequests.map((r) => (
            <li key={r.id}>
              <time>{fmtDateTime(r.created_at)}</time>
              <span>
                <span className={styles.timelineActor}>{r.kind}</span>
                <span className={styles.muted}>
                  {' '}
                  — {r.status}
                  {r.details ? `: ${r.details}` : ''}
                </span>
                {r.status === 'open' ? (
                  <form action={resolvePrivacyRequestAction.bind(null, params.id)} style={{ display: 'inline', marginLeft: '0.5rem' }}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <button type="submit" className={styles.rowLink} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                      Resolve
                    </button>
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form action={logPrivacyRequestAction.bind(null, params.id)} className={styles.formStack} style={{ marginTop: '0.9rem' }}>
        <div className={styles.searchRow} style={{ margin: 0 }}>
          <label htmlFor="privacy-request-kind" className="sr-only">
            Type of privacy request
          </label>
          <select id="privacy-request-kind" name="kind" defaultValue="access" className={styles.input} style={{ minWidth: 0, flex: '0 0 150px' }}>
            <option value="access">Access</option>
            <option value="deletion">Deletion</option>
            <option value="correction">Correction</option>
            <option value="other">Other</option>
          </select>
          <input className={styles.input} name="details" placeholder="Details (optional)" style={{ flex: 1 }} />
        </div>
        <button type="submit" className="btn secondary">
          Log request
        </button>
      </form>
    </section>
  );

  const renderAuditPanel = () => (
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
  );

  return (
    <>
      <Link href="/admin/accounts" className={styles.backLink}>
        ← Accounts
      </Link>

      {/* Hero Header */}
      <header className={styles.accountHero}>
        <div className={styles.accountHeroTop}>
          <div className={styles.accountHeroIdentity}>
            <div className={styles.accountAvatar}>{initials(displayName)}</div>
            <div className={styles.accountTitleGroup}>
              <p className={styles.accountNumberTag}>Account #{String(a.account_number ?? '—')}</p>
              <h1 className={styles.accountMainTitle}>{displayName}</h1>
              <div className={styles.accountMetaBar}>
                {detail.ownerEmail ? (
                  <span className={styles.accountMetaItem}>
                    Owner: <strong>{detail.ownerEmail}</strong>
                  </span>
                ) : null}
                {detail.site?.phone || String(a.alert_phone || '') ? (
                  <span className={styles.accountMetaItem}>
                    Phone: <strong>{detail.site?.phone || String(a.alert_phone || '')}</strong>
                  </span>
                ) : null}
                <span className={styles.accountMetaItem}>
                  Timezone: <strong>{String(a.timezone || '—')}</strong>
                </span>
                <span className={styles.accountMetaItem}>Joined {fmtDate(a.created_at)}</span>
              </div>
            </div>
          </div>

          <div className={styles.quickActionGroup}>
            {detail.ownerEmail ? (
              <a href={`mailto:${detail.ownerEmail}`} className="btn secondary" style={{ fontSize: '0.8rem' }}>
                Email Owner
              </a>
            ) : null}
            <Link href={`/admin/cases/new?account_id=${params.id}`} className="btn secondary" style={{ fontSize: '0.8rem' }}>
              New Case
            </Link>
            <a href="#staff" className="btn primary" style={{ fontSize: '0.8rem' }}>
              Actions Hub
            </a>
          </div>
        </div>

        <div className={styles.actionRow} style={{ marginTop: '0.2rem' }}>
          {suspended ? (
            <span className={`${styles.pill} ${styles.bad}`}>Suspended</span>
          ) : (
            <span className={`${styles.pill} ${styles.good}`}>Active</span>
          )}
          {entitlement.kind === 'ready' ? (
            <span className={`${styles.pill} ${styles.neutral}`}>
              {entitlement.snapshot.planName} · {words(entitlement.snapshot.entitlementState)}
            </span>
          ) : (
            <span className={`${styles.pill} ${styles.warn}`}>Plan snapshot unavailable</span>
          )}
          {paypaused ? (
            <span className={`${styles.pill} ${styles.bad}`}>Payouts paused</span>
          ) : connected ? (
            <span className={`${styles.pill} ${styles.good}`}>Payouts connected</span>
          ) : (
            <span className={`${styles.pill} ${styles.neutral}`}>Payouts not set up</span>
          )}
          {payoutsRestricted ? <span className={`${styles.pill} ${styles.bad}`}>Payouts restricted</span> : null}
          {lockedUntil ? <span className={`${styles.pill} ${styles.warn}`}>Quick Stop locked</span> : null}
          {a.test_marker ? (
            <span className={`${styles.pill} ${styles.warn}`}>Synthetic · excluded from production reporting</span>
          ) : null}
        </div>
      </header>

      {/* Alert Banners */}
      {doneMessage ? <div className={`${styles.banner} ${styles.ok}`}>{doneMessage}</div> : null}
      {searchParams?.error ? (
        <div className={`${styles.banner} ${styles.err}`}>
          {ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}
        </div>
      ) : null}

      {/* Top Metric Summary Cards */}
      <div className={styles.metricsRow}>
        <div className={`${styles.panel} ${styles.statCard} ${styles.accentAmber}`}>
          <div className={styles.statLabel}>Effective Plan</div>
          <div className={styles.statValue} style={{ fontSize: '1.45rem' }}>
            {entitlement.kind === 'ready' ? entitlement.snapshot.planName : 'Unavailable'}
          </div>
          <div className={styles.statDrill}>
            {entitlement.kind === 'ready'
              ? `${words(entitlement.snapshot.billingInterval)} · ${formatPlatformFeeBps(entitlement.snapshot.platformFeeBps)}`
              : 'No entitlement row'}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentEmerald}`}>
          <div className={styles.statLabel}>Paid (30 Days)</div>
          <div className={styles.statValue}>{usdCents(detail.activity.paidVolume30dCents)}</div>
          <Link href={`/admin/payments?range=30d&account=${params.id}`} className={styles.statDrill}>
            Reconcile ledger →
          </Link>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentIndigo}`}>
          <div className={styles.statLabel}>Active Operations</div>
          <div className={styles.statValue} style={{ fontSize: '1.45rem' }}>
            {detail.activity.jobsActive} jobs · {detail.activity.leads30d} leads
          </div>
          <div className={styles.statDrill}>
            {detail.quickStop.active} active Quick Stops ({detail.quickStop.total} total)
          </div>
        </div>

        <div
          className={`${styles.panel} ${styles.statCard} ${
            detail.activity.openDisputes > 0 ? styles.accentRose : styles.accentNeutral
          }`}
        >
          <div className={styles.statLabel}>Risk & Balances</div>
          <div className={styles.statValue} style={{ fontSize: '1.45rem' }}>
            {detail.activity.openDisputes > 0 ? (
              <span style={{ color: '#f87171' }}>{detail.activity.openDisputes} disputes</span>
            ) : (
              '0 disputes'
            )}
          </div>
          <div className={styles.statDrill}>
            Credit balance: {usdCents(detail.creditBalanceCents)}
            {detail.quickStop.noShows > 0 ? ` · ${detail.quickStop.noShows} no-shows` : ''}
          </div>
        </div>
      </div>

      {/* Main Tabbed Detail View */}
      <AccountDetailView
        tabs={tabs}
        defaultTab="overview"
        overviewPanel={
          <div className={styles.detailGrid}>
            <div>
              {renderProfilePanel()}
              {renderActivityPanel()}
            </div>
            <div>
              {renderFeatureFlagsPanel()}
              <section className={styles.panel}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h2 className={styles.panelTitle} style={{ margin: 0 }}>Recent notes</h2>
                  <a href="#support" className={styles.rowLink} style={{ fontSize: '0.78rem' }}>
                    View all ({detail.notes.length}) →
                  </a>
                </div>
                {detail.notes.length === 0 ? (
                  <p className={styles.emptyState}>No notes yet.</p>
                ) : (
                  <ul className={styles.timeline}>
                    {detail.notes.slice(0, 3).map((n) => (
                      <li key={n.id}>
                        <time>{fmtDateTime(n.created_at)}</time>
                        <span>
                          <span className={styles.timelineActor}>{n.created_by}</span> — {n.body}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        }
        billingPanel={
          <div className={styles.detailGrid}>
            <div>
              {renderPlanAuthorityPanel()}
              {renderPaymentsPanel()}
            </div>
            <div>
              {renderRecentPaymentsPanel()}
            </div>
          </div>
        }
        messagesPanel={
          <div className={styles.detailGrid}>
            <div>
              {renderMessagesPanel()}
            </div>
            <div>
              {renderLoginHistoryPanel()}
            </div>
          </div>
        }
        supportPanel={
          <div className={styles.detailGrid}>
            <div>
              {renderNotesAndTagsPanel()}
              {renderSupportCasesPanel()}
            </div>
            <div>
              {renderAttachmentsPanel()}
              {renderPrivacyRequestsPanel()}
            </div>
          </div>
        }
        staffPanel={
          <div className={styles.detailGrid}>
            <div>
              <AccountActions
                role={role}
                accountId={params.id}
                suspended={suspended}
                quickStopLockedUntil={lockedUntil}
                businessName={displayName}
                payoutsRestricted={payoutsRestricted}
                synthetic={Boolean(a.test_marker)}
              />
            </div>
            <div>
              {renderAuditPanel()}
            </div>
          </div>
        }
        allPanel={
          <div className={styles.detailGrid}>
            <div>
              {renderProfilePanel()}
              {renderPlanAuthorityPanel()}
              {renderPaymentsPanel()}
              {renderRecentPaymentsPanel()}
              {renderMessagesPanel()}
              {renderLoginHistoryPanel()}
            </div>
            <div>
              {renderActivityPanel()}
              {renderFeatureFlagsPanel()}
              {renderNotesAndTagsPanel()}
              {renderAttachmentsPanel()}
              {renderSupportCasesPanel()}
              {renderPrivacyRequestsPanel()}
              <AccountActions
                role={role}
                accountId={params.id}
                suspended={suspended}
                quickStopLockedUntil={lockedUntil}
                businessName={displayName}
                payoutsRestricted={payoutsRestricted}
                synthetic={Boolean(a.test_marker)}
              />
              {renderAuditPanel()}
            </div>
          </div>
        }
      />
    </>
  );
}
