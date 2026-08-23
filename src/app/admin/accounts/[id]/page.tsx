import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getAccountAdminDetail, accountDisplayName } from '@/lib/admin-accounts';
import { listAdminActions } from '@/lib/admin';
import { listSupportCases } from '@/lib/support-cases';
import { accountAttachmentUrl } from '@/lib/account-attachments';
import styles from '../../admin.module.css';
import AccountActions from './AccountActions';
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
function fmtDateTime(v: unknown): string {
  if (!v || typeof v !== 'string') return '—';
  return new Date(v).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}
function bool(v: unknown): boolean {
  return v === true;
}
function words(v: string): string {
  return v.replace(/_/g, ' ');
}

// The flag list moved to lib/account-flags.ts, where the server action can
// validate against the same closed set it renders from.

export default async function AdminAccountDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { done?: string; error?: string };
}) {
  const ctx = await requireAdmin();
  const { admin, role } = ctx;
  const canFlag = staffCan(ctx.staff, 'account.support');
  const detail = await getAccountAdminDetail(admin, params.id);
  if (!detail || !detail.account) notFound();

  const a = detail.account as Record<string, unknown>;
  const displayName = accountDisplayName({ company_name: detail.site?.company_name ?? null, business_name: (a.business_name as string | null) ?? null });
  const [actions, cases, messages] = await Promise.all([
    listAdminActions(admin, { accountId: params.id, limit: 12 }),
    listSupportCases(admin, { accountId: params.id, limit: 5 }),
    listAccountMessages(admin, params.id, 40),
  ]);
  const attachmentLinks = await Promise.all(
    detail.attachments.map(async (att) => ({ att, url: await accountAttachmentUrl(att.account_id, att.path) })),
  );

  const suspended = Boolean(a.suspended_at);
  const lockedUntil = a.extra_stop_locked_until && new Date(String(a.extra_stop_locked_until)).getTime() > Date.now() ? String(a.extra_stop_locked_until) : null;
  const paypaused = Boolean(a.connect_disabled_at);
  const connected = bool(a.connect_onboarded);
  const payoutsRestricted = Boolean(a.payouts_restricted_at);
  const entitlement = detail.entitlement;
  const subscription = detail.subscription;
  const doneMessage = searchParams.done ? DONE_MESSAGES[searchParams.done] : null;

  return (
    <>
      <Link href="/admin/accounts" className={styles.backLink}>← Accounts</Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Account #{String(a.account_number ?? '—')}</p>
        <h1 className={styles.title}>{displayName}</h1>
        <p className={styles.lead}>
          {detail.ownerEmail ? <>Owner: <strong>{detail.ownerEmail}</strong> · </> : null}
          Joined {fmtDate(a.created_at)}
        </p>
        <div className={styles.actionRow} style={{ marginTop: '.6rem' }}>
          {suspended ? <span className={`${styles.pill} ${styles.bad}`}>Suspended</span> : <span className={`${styles.pill} ${styles.good}`}>Active</span>}
          {entitlement.kind === 'ready' ? (
            <span className={`${styles.pill} ${styles.neutral}`}>
              {entitlement.snapshot.planName} · {words(entitlement.snapshot.entitlementState)}
            </span>
          ) : (
            <span className={`${styles.pill} ${styles.warn}`}>Plan snapshot unavailable</span>
          )}
          {paypaused ? <span className={`${styles.pill} ${styles.bad}`}>Payouts paused</span> : connected ? <span className={`${styles.pill} ${styles.good}`}>Payouts connected</span> : <span className={`${styles.pill} ${styles.neutral}`}>Payouts not set up</span>}
          {payoutsRestricted ? <span className={`${styles.pill} ${styles.bad}`}>Payouts restricted</span> : null}
          {lockedUntil ? <span className={`${styles.pill} ${styles.warn}`}>Quick Stop locked</span> : null}
          {a.test_marker ? <span className={`${styles.pill} ${styles.warn}`}>Synthetic · excluded from production reporting</span> : null}
        </div>
      </header>

      {doneMessage ? <div className={`${styles.banner} ${styles.ok}`}>{doneMessage}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      <div className={styles.detailGrid}>
        <div>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Profile</h2>
            <dl className={styles.kv}>
              <dt>Owner email</dt><dd>{detail.ownerEmail ?? <span className={styles.muted}>unknown</span>}</dd>
              <dt>Phone</dt><dd>{detail.site?.phone || String(a.alert_phone || '') || <span className={styles.muted}>—</span>}</dd>
              <dt>Timezone</dt><dd>{String(a.timezone || '—')}</dd>
              <dt>Mailing address</dt><dd>{String(a.mailing_address || '') || <span className={styles.muted}>—</span>}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Plan & billing authority</h2>
            <p className={styles.muted} style={{ margin: '0 0 .7rem', fontSize: '.75rem' }}>
              workspace_entitlements is the effective plan authority. The latest billing_subscriptions row is supporting billing provenance.
              The legacy account fields below are never substituted for a missing entitlement.
            </p>
            {entitlement.kind === 'ready' ? (
              <dl className={styles.kv}>
                <dt>Effective plan</dt><dd><strong>{entitlement.snapshot.planName}</strong></dd>
                <dt>Billing interval</dt><dd>{words(entitlement.snapshot.billingInterval)}</dd>
                <dt>Billing status</dt><dd>{words(entitlement.snapshot.billingStatus)}</dd>
                <dt>Entitlement state</dt><dd>{words(entitlement.snapshot.entitlementState)}</dd>
                <dt>Platform fee</dt><dd>{formatPlatformFeeBps(entitlement.snapshot.platformFeeBps)}</dd>
                <dt>Catalog provenance</dt>
                <dd>workspace_entitlements · {entitlement.snapshot.catalogVersion} · snapshot v{entitlement.snapshot.version}</dd>
                <dt>Effective at</dt><dd>{fmtDateTime(entitlement.snapshot.effectiveAt)}</dd>
                <dt>Snapshot updated</dt><dd>{fmtDateTime(entitlement.snapshot.updatedAt)}</dd>
                <dt>Entitlement period</dt>
                <dd>{entitlement.snapshot.periodStart || entitlement.snapshot.periodEnd
                  ? `${fmtDate(entitlement.snapshot.periodStart)} – ${fmtDate(entitlement.snapshot.periodEnd)}`
                  : entitlement.snapshot.planCode === 'flex'
                    ? 'No billing period (Flex)'
                    : 'No period recorded'}</dd>
              </dl>
            ) : (
              <p className={styles.emptyState}>
                {entitlement.kind === 'missing'
                  ? 'No workspace entitlement snapshot exists. No legacy plan has been substituted.'
                  : 'The workspace entitlement snapshot could not be read or validated. No legacy plan has been substituted.'}
              </p>
            )}

            <h3 style={{ margin: '1rem 0 .5rem', fontSize: '.88rem' }}>Latest billing subscription snapshot</h3>
            {subscription.kind === 'ready' ? (
              <dl className={styles.kv}>
                <dt>Subscription plan</dt><dd>{subscription.snapshot.planName} · {words(subscription.snapshot.billingInterval)}</dd>
                <dt>Subscription status</dt><dd>{words(subscription.snapshot.status)}</dd>
                <dt>Subscription fee</dt><dd>{formatPlatformFeeBps(subscription.snapshot.platformFeeBps)}</dd>
                <dt>Catalog provenance</dt><dd>billing_subscriptions · {subscription.snapshot.catalogVersion}</dd>
                <dt>Snapshot updated</dt><dd>{fmtDateTime(subscription.snapshot.updatedAt)}</dd>
                <dt>Current period</dt>
                <dd>{subscription.snapshot.currentPeriodStart || subscription.snapshot.currentPeriodEnd
                  ? `${fmtDate(subscription.snapshot.currentPeriodStart)} – ${fmtDate(subscription.snapshot.currentPeriodEnd)}`
                  : '—'}</dd>
                <dt>Cancellation</dt>
                <dd>{subscription.snapshot.cancelAtPeriodEnd
                  ? `Scheduled for period end${subscription.snapshot.cancelAt ? ` (${fmtDate(subscription.snapshot.cancelAt)})` : ''}`
                  : subscription.snapshot.canceledAt
                    ? `Canceled ${fmtDate(subscription.snapshot.canceledAt)}`
                    : subscription.snapshot.endedAt
                      ? `Ended ${fmtDate(subscription.snapshot.endedAt)}`
                      : subscription.snapshot.status === 'canceled'
                        ? 'Canceled (no timestamp recorded)'
                        : 'Not scheduled'}</dd>
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

            <dl className={styles.kv} style={{ marginTop: '1rem' }}>
              <dt>Legacy account plan (migration diagnostic only)</dt><dd>{String(a.plan ?? 'unset')} · not billing authority</dd>
              <dt>Legacy subscription status (migration diagnostic only)</dt><dd>{String(a.subscription_status || 'unset')} · not billing authority</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Payments & legacy rail diagnostic</h2>
            <dl className={styles.kv}>
              <dt>Payout status</dt>
              <dd>{paypaused ? 'Paused by Stripe' : connected ? 'Connected & active' : 'Not connected'}{a.connect_disabled_at ? ` (since ${fmtDate(a.connect_disabled_at)})` : ''}</dd>
              <dt>Connect ID</dt><dd className={styles.muted}>{String(a.stripe_connect_id || '—')}</dd>
              <dt>Legacy volume tier (not plan authority)</dt><dd>Tier {detail.tier.tier} · {(detail.tier.rate * 100).toFixed(2)}%</dd>
              <dt>Legacy trailing 12-mo volume</dt><dd>{usd(detail.trailingVolume)}</dd>
              <dt>Paid (30 days)</dt><dd>{usdCents(detail.activity.paidVolume30dCents)}</dd>
              {/* A red count with nothing behind it was the sharpest dead end
                  on the page: everything needed to act on a dispute — reason,
                  respond-by date, the Stripe deep link — is already fetched and
                  rendered on the Money page, which just could not be scoped to
                  one account. Now it can. */}
              <dt>Open disputes</dt>
              <dd>
                {detail.activity.openDisputes > 0 ? (
                  <Link href={`/admin/money?account=${params.id}#disputes`} className={styles.rowLink}>
                    <span className={`${styles.pill} ${styles.bad}`}>{detail.activity.openDisputes}</span> See them →
                  </Link>
                ) : '0'}
              </dd>
              <dt>Credit balance</dt><dd>{detail.creditBalanceCents !== 0 ? <strong>{usdCents(detail.creditBalanceCents)}</strong> : '$0'}</dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Recent payment records</h2>
            <p className={styles.muted} style={{ margin: '0 0 .6rem', fontSize: '.75rem' }}>Newest 12 by creation date. The paid total above uses settlement date across every payment. <Link href={`/admin/payments?range=30d&account=${params.id}`} className={styles.rowLink}>Reconcile in the ledger →</Link></p>
            {detail.recentPayments.length === 0 ? (
              <p className={styles.emptyState}>{detail.activity.paidVolume30dCents > 0 ? 'No production payment rows are in the newest-record preview. Use the ledger above to see the settled rows behind the 30-day total.' : 'No production payments.'}</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Date</th><th>Label</th><th>Kind</th><th className="num">Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {detail.recentPayments.map((p) => (
                      <tr key={p.id}>
                        <td className={styles.muted}>{fmtDate(p.created_at)}</td>
                        <td><Link href={`/admin/payments/${p.id}`} className={styles.rowLink}>{p.label || 'Payment'}</Link></td>
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

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Messages sent</h2>
            {/* The coverage note is not a disclaimer, it is the point. Staff
                read an absent row as "we never sent it" and tell the customer
                so — and for reminder texts, and for any email sent without an
                account tag, an absent row means nothing of the kind. */}
            <p className={styles.muted} style={{ margin: '0 0 .7rem', fontSize: '.76rem' }}>
              Emails tagged with this account, plus payment and crew texts. Reminder, arrival and Quick Stop texts are
              not logged anywhere yet, and emails sent without an account tag — magic links, digests, contact replies —
              cannot appear here. A missing row is not proof nothing was sent.
            </p>
            {messages.length === 0 ? (
              <p className={styles.emptyState}>Nothing recorded for this account.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>When</th><th>Channel</th><th>Kind</th><th>To</th><th>Status</th></tr></thead>
                  <tbody>
                    {messages.map((m) => (
                      <tr key={m.id}>
                        <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(m.occurredAt)}</td>
                        <td className={styles.muted}>{m.channel === 'sms' ? 'Text' : 'Email'}</td>
                        <td>
                          {messageKindLabel(m.kind)}
                          {m.body ? (
                            <div className={styles.muted} style={{ fontSize: '.72rem', maxWidth: '40ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</div>
                          ) : null}
                        </td>
                        <td className={styles.muted} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.recipient}</td>
                        <td>
                          <span className={`${styles.pill} ${messageFailed(m) ? styles.bad : m.status === 'delivered' || m.status === 'sent' ? styles.good : styles.neutral}`}>
                            {m.status}
                          </span>
                          {m.errorReason ? <div className={styles.muted} style={{ fontSize: '.7rem' }}>{m.errorReason}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Login & security history</h2>
            {detail.loginEvents.length === 0 ? (
              <p className={styles.emptyState}>No sign-ins recorded yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>When</th><th>Method</th><th>IP</th><th>Device</th></tr></thead>
                  <tbody>
                    {detail.loginEvents.map((e) => (
                      <tr key={e.id}>
                        <td className={styles.muted}>{fmtDateTime(e.created_at)}</td>
                        <td>{e.method}</td>
                        <td className={styles.muted}>{e.ip || '—'}</td>
                        <td className={styles.muted} style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.user_agent || '—'}</td>
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
            {/* Retitled. Two of the five rows below are all-time and say so, so
                a panel headed "Activity (30 days)" was labelling the no-show
                count — the one staff act on when applying a lock — as a 30-day
                figure when its query has no date filter at all. */}
            <h2 className={styles.panelTitle}>Activity</h2>
            <dl className={styles.kv}>
              <dt>New leads (30 days)</dt><dd>{detail.activity.leads30d}</dd>
              <dt>Active jobs</dt><dd>{detail.activity.jobsActive}</dd>
              <dt>Quick Stops (active)</dt>
              <dd>
                {detail.quickStop.active > 0 ? (
                  <Link href={`/admin/quick-stops?f=active&account=${params.id}`} className={styles.rowLink}>{detail.quickStop.active} →</Link>
                ) : '0'}
              </dd>
              <dt>Quick Stops (all-time)</dt>
              <dd>
                {detail.quickStop.total > 0 ? (
                  <Link href={`/admin/quick-stops?f=all&account=${params.id}`} className={styles.rowLink}>{detail.quickStop.total} →</Link>
                ) : '0'}
              </dd>
              {/* The number the Quick Stop lock decision is made on, so it has
                  to open the requests it counts — the lock form is six inches
                  away in the next column and captures no evidence of its own. */}
              <dt>No-shows (all-time)</dt>
              <dd>
                {detail.quickStop.noShows > 0 ? (
                  <Link href={`/admin/quick-stops?f=no_shows&account=${params.id}`} className={styles.rowLink}>
                    <span className={`${styles.pill} ${styles.warn}`}>{detail.quickStop.noShows}</span> See them →
                  </Link>
                ) : '0'}
              </dd>
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Feature flags</h2>
            {/* Toggles now, not pills. These are the owner's own settings —
                writable from their settings page all along — so the console
                showing which switch the customer is asking about and offering
                no way to move it meant "flip that for them" was done in the
                Supabase table editor, with no audit row and no reason. */}
            <p className={styles.muted} style={{ margin: '0 0 .8rem', fontSize: '.78rem' }}>
              {canFlag
                ? 'The owner can change these themselves. Changing one here is recorded with your name against it.'
                : 'Read-only for your role.'}
            </p>
            <dl className={styles.kv}>
              {ACCOUNT_FLAGS.map((f) => {
                const on = bool(a[f.key]);
                return (
                  <div key={f.key} style={{ display: 'contents' }}>
                    <dt>
                      {f.label}
                      <div className={styles.muted} style={{ fontSize: '.7rem', fontWeight: 400 }}>{f.help}</div>
                    </dt>
                    <dd>
                      {on ? <span className={`${styles.pill} ${styles.good}`}>On</span> : <span className={`${styles.pill} ${styles.neutral}`}>Off</span>}
                      {canFlag ? (
                        <form action={setAccountFlagAction.bind(null, params.id)} style={{ display: 'inline' }}>
                          <input type="hidden" name="flag" value={f.key} />
                          <input type="hidden" name="next" value={on ? 'off' : 'on'} />
                          <button
                            type="submit"
                            className={styles.rowLink}
                            style={{ background: 'none', border: 'none', padding: 0, marginLeft: '.5rem', font: 'inherit', cursor: 'pointer' }}
                          >
                            Turn {on ? 'off' : 'on'}
                          </button>
                        </form>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Notes & tags</h2>
            <div className={styles.actionRow} style={{ marginTop: 0, marginBottom: detail.tags.length ? '0.8rem' : 0 }}>
              {detail.tags.map((t) => (
                <form key={t.id} action={removeAccountTagAction.bind(null, params.id)} style={{ display: 'inline' }}>
                  <input type="hidden" name="tag_id" value={t.id} />
                  <button type="submit" className={`${styles.pill} ${styles.accent}`} style={{ border: 'none', cursor: 'pointer' }} title="Remove tag">{t.tag} ×</button>
                </form>
              ))}
            </div>
            <form action={addAccountTagAction.bind(null, params.id)} className={styles.searchRow} style={{ margin: '0 0 1rem' }}>
              <input className={styles.input} name="tag" placeholder="Add a tag" style={{ minWidth: 0, flex: '0 0 200px' }} />
              <button type="submit" className="btn secondary">Add tag</button>
            </form>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '1rem 0' }} />

            {detail.notes.length === 0 ? (
              <p className={styles.emptyState}>No notes yet.</p>
            ) : (
              <ul className={styles.timeline}>
                {detail.notes.map((n) => (
                  <li key={n.id}>
                    <time>{fmtDateTime(n.created_at)}</time>
                    <span><span className={styles.timelineActor}>{n.created_by}</span> — {n.body}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={addAccountNoteAction.bind(null, params.id)} className={styles.formStack} style={{ marginTop: '0.8rem' }}>
              <textarea className={styles.input} name="body" rows={2} placeholder="Add an internal note…" style={{ minWidth: 0, width: '100%', resize: 'vertical' }} />
              <button type="submit" className="btn secondary">Add note</button>
            </form>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Attachments</h2>
            {attachmentLinks.length === 0 ? (
              <p className={styles.emptyState}>No files uploaded.</p>
            ) : (
              <ul className={styles.timeline}>
                {attachmentLinks.map(({ att, url }) => (
                  <li key={att.id}>
                    <time>{fmtDateTime(att.created_at)}</time>
                    <span>
                      {url ? <a href={url} target="_blank" rel="noreferrer" className={styles.rowLink}>{att.filename}</a> : att.filename}
                      <span className={styles.muted}> — {att.uploaded_by}{att.size_bytes ? ` · ${Math.round(att.size_bytes / 1024)} KB` : ''}</span>
                      <form action={deleteAccountAttachmentAction.bind(null, params.id)} style={{ display: 'inline', marginLeft: '0.5rem' }}>
                        <input type="hidden" name="attachment_id" value={att.id} />
                        <button type="submit" className={styles.rowLink} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--bad)' }}>Delete</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {/* No encType: React sets multipart itself for a form whose action
                is a server function, and specifying it logs a warning on every
                render of this page saying it will be overridden. The file still
                arrives as a File in the FormData — the attribute was doing
                nothing except making the upload look like it depended on it. */}
            <form action={uploadAccountAttachmentAction.bind(null, params.id)} className={styles.formStack} style={{ marginTop: '0.8rem' }}>
              <input type="file" name="file" className={styles.input} />
              <button type="submit" className="btn secondary">Upload file</button>
            </form>
          </section>

          <section className={styles.panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.7rem' }}>
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>Support cases</h2>
              <Link href={`/admin/cases/new?account_id=${params.id}`} className={styles.rowLink}>New case →</Link>
            </div>
            {cases.length === 0 ? (
              <p className={styles.emptyState}>No cases for this account.</p>
            ) : (
              <ul className={styles.timeline}>
                {cases.map((c) => (
                  <li key={c.id}>
                    <time>{new Date(c.created_at).toLocaleDateString('en-US', { dateStyle: 'short' })}</time>
                    <span>
                      <Link href={`/admin/cases/${c.id}`} className={styles.rowLink}>{c.subject}</Link>
                      <span className={styles.muted}> — {c.status}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Privacy requests</h2>
            {detail.privacyRequests.length === 0 ? (
              <p className={styles.emptyState}>No privacy requests logged.</p>
            ) : (
              <ul className={styles.timeline}>
                {detail.privacyRequests.map((r) => (
                  <li key={r.id}>
                    <time>{fmtDateTime(r.created_at)}</time>
                    <span>
                      <span className={styles.timelineActor}>{r.kind}</span>
                      <span className={styles.muted}> — {r.status}{r.details ? `: ${r.details}` : ''}</span>
                      {r.status === 'open' ? (
                        <form action={resolvePrivacyRequestAction.bind(null, params.id)} style={{ display: 'inline', marginLeft: '0.5rem' }}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <button type="submit" className={styles.rowLink} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>Resolve</button>
                        </form>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={logPrivacyRequestAction.bind(null, params.id)} className={styles.formStack} style={{ marginTop: '0.8rem' }}>
              <div className={styles.searchRow} style={{ margin: 0 }}>
                {/* The one on this page with no visible label at all — the
                    others had a <label> that simply pointed at nothing. Both
                    kinds of unlabelled read the same to a screen reader. */}
                <label htmlFor="privacy-request-kind" className="sr-only">Type of privacy request</label>
                <select id="privacy-request-kind" name="kind" defaultValue="access" className={styles.input} style={{ minWidth: 0, flex: '0 0 160px' }}>
                  <option value="access">Access</option>
                  <option value="deletion">Deletion</option>
                  <option value="correction">Correction</option>
                  <option value="other">Other</option>
                </select>
                <input className={styles.input} name="details" placeholder="Details (optional)" />
              </div>
              <button type="submit" className="btn secondary">Log request</button>
            </form>
          </section>

          <AccountActions
            role={role}
            accountId={params.id}
            suspended={suspended}
            quickStopLockedUntil={lockedUntil}
            businessName={displayName}
            payoutsRestricted={payoutsRestricted}
            synthetic={Boolean(a.test_marker)}
          />

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>Staff actions on this account</h2>
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
  // The delete used to fire without reading its error and redirect deleted=1,
  // so a GDPR erasure was reported as done while every row of personal data
  // remained. These two say what actually happened.
  delete_blocked: 'This account has billing or messaging history that cannot be removed automatically — 24 tables hold it under a RESTRICT key, including payments. NOTHING was deleted and no privacy request was scrubbed. Close it out by hand.',
  delete_failed: 'The account could not be deleted. Nothing was removed and no privacy request was scrubbed. Check the server log and try again.',
};

function PaymentStatusPill({ status }: { status: string | null }) {
  const s = status ?? 'requested';
  const cls = s === 'paid' ? styles.good : s === 'disputed' ? styles.bad : s === 'refunded' ? styles.warn : s === 'failed' ? styles.bad : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{s}</span>;
}
