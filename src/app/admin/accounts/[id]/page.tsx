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
} from './actions';

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

const FEATURE_FLAGS: { key: string; label: string }[] = [
  { key: 'instant_book_enabled', label: 'Instant booking' },
  { key: 'extra_stop_enabled', label: 'Quick Stop' },
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
  const { admin, role } = await requireAdmin();
  const detail = await getAccountAdminDetail(admin, params.id);
  if (!detail || !detail.account) notFound();

  const a = detail.account as Record<string, unknown>;
  const displayName = accountDisplayName({ company_name: detail.site?.company_name ?? null, business_name: (a.business_name as string | null) ?? null });
  const actions = await listAdminActions(admin, { accountId: params.id, limit: 12 });
  const cases = await listSupportCases(admin, { accountId: params.id, limit: 5 });
  const attachmentLinks = await Promise.all(
    detail.attachments.map(async (att) => ({ att, url: await accountAttachmentUrl(att.account_id, att.path) })),
  );

  const suspended = Boolean(a.suspended_at);
  const lockedUntil = a.extra_stop_locked_until && new Date(String(a.extra_stop_locked_until)).getTime() > Date.now() ? String(a.extra_stop_locked_until) : null;
  const paypaused = Boolean(a.connect_disabled_at);
  const connected = bool(a.connect_onboarded);
  const payoutsRestricted = Boolean(a.payouts_restricted_at);

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
          <span className={`${styles.pill} ${styles.neutral}`}>{String(a.plan ?? 'free')}</span>
          {paypaused ? <span className={`${styles.pill} ${styles.bad}`}>Payouts paused</span> : connected ? <span className={`${styles.pill} ${styles.good}`}>Payouts connected</span> : <span className={`${styles.pill} ${styles.neutral}`}>Payouts not set up</span>}
          {payoutsRestricted ? <span className={`${styles.pill} ${styles.bad}`}>Payouts restricted</span> : null}
          {lockedUntil ? <span className={`${styles.pill} ${styles.warn}`}>Quick Stop locked</span> : null}
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

          <section className={styles.panel}>
            <p className={styles.panelTitle}>Login & security history</p>
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
            <p className={styles.panelTitle}>Activity (30 days)</p>
            <dl className={styles.kv}>
              <dt>New leads</dt><dd>{detail.activity.leads30d}</dd>
              <dt>Active jobs</dt><dd>{detail.activity.jobsActive}</dd>
              <dt>Quick Stops (active)</dt><dd>{detail.quickStop.active}</dd>
              <dt>Quick Stops (all-time)</dt><dd>{detail.quickStop.total}</dd>
              <dt>No-shows</dt><dd>{detail.quickStop.noShows > 0 ? <span className={`${styles.pill} ${styles.warn}`}>{detail.quickStop.noShows}</span> : '0'}</dd>
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

          <section className={styles.panel}>
            <p className={styles.panelTitle}>Notes & tags</p>
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
            <p className={styles.panelTitle}>Attachments</p>
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
              <p className={styles.panelTitle} style={{ margin: 0 }}>Support cases</p>
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
            <p className={styles.panelTitle}>Privacy requests</p>
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
                <select name="kind" defaultValue="access" className={styles.input} style={{ minWidth: 0, flex: '0 0 160px' }}>
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
            plan={String(a.plan ?? 'free')}
            payoutsRestricted={payoutsRestricted}
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
  es_locked: 'Quick Stop locked for this account.',
  es_unlocked: 'Quick Stop lock cleared.',
  exported: 'Account data exported.',
  reset_verification: 'Payment verification reset. The owner will need to reconnect.',
  payouts_restricted: 'Payouts restricted for this account.',
  payouts_unrestricted: 'Payout restriction lifted.',
  plan_changed: 'Plan updated.',
  onboarding_resent: 'Onboarding link resent to the owner.',
  signed_out: 'All sessions signed out.',
  noted: 'Note added.',
  tagged: 'Tag added.',
  untagged: 'Tag removed.',
  attached: 'File uploaded.',
  attachment_deleted: 'File deleted.',
  privacy_logged: 'Privacy request logged.',
  privacy_resolved: 'Privacy request resolved.',
};
const ERROR_MESSAGES: Record<string, string> = {
  amount: 'Enter a valid dollar amount.',
  state: 'That action isn’t available right now.',
  confirm: 'Confirmation text didn’t match.',
  plan: 'That isn’t a valid plan.',
  no_owner: 'No owner email found for this account.',
  note: 'Enter some text for the note.',
  tag: 'Enter a tag.',
  attachment: 'That file could not be uploaded.',
  privacy_kind: 'Choose a request type.',
};

function PaymentStatusPill({ status }: { status: string | null }) {
  const s = status ?? 'requested';
  const cls = s === 'paid' ? styles.good : s === 'disputed' ? styles.bad : s === 'refunded' ? styles.warn : s === 'failed' ? styles.bad : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{s}</span>;
}
