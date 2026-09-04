import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { createAdminSignalDiagnostics, getFailedEmailEvents, getFailedSmsEvents, getUnresolvedWebhookFailures } from '@/lib/admin-alerts';
import { groupEmailFailures, groupSmsFailures, groupWebhookFailures } from '@/lib/admin-failure-groups';
import { loadOutboundWebhookFailures } from '@/lib/admin-public-api';
import { staffCan } from '@/lib/staff';
import { resolveWebhookGroupAction } from './actions';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Delivery failures' };

function fmt(value: string): string {
  return new Date(value).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
}

export default async function AdminFailuresPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const ctx = await requireAdmin();
  const diagnostics = createAdminSignalDiagnostics();
  const [webhooks, sms, emails, outboundDeliveries] = await Promise.all([
    getUnresolvedWebhookFailures(ctx.admin, { limit: 500, diagnostics }),
    getFailedSmsEvents(ctx.admin, { limit: 500, diagnostics }),
    getFailedEmailEvents(ctx.admin, { limit: 500, diagnostics }),
    loadOutboundWebhookFailures(ctx.admin, 100),
  ]);
  const webhookGroups = groupWebhookFailures(webhooks);
  const smsGroups = groupSmsFailures(sms);
  const emailGroups = groupEmailFailures(emails);
  const canResolve = staffCan(ctx.staff, 'ops.manage');

  return <>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Operations</p>
      <h1 className={styles.title}>Delivery &amp; integration failures</h1>
      <p className={styles.lead}>Repeated failures are grouped by source, event, account, and normalized error so one outage reads as one incident instead of dozens of identical rows.</p>
    </header>
    {diagnostics.failed.length ? <div className={`${styles.banner} ${styles.err}`}>Some failure sources are unavailable: {diagnostics.failed.join(', ')}.</div> : null}
    {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>Failure group resolved.</div> : null}
    {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>Enter a reason and try again.</div> : null}

    <section className={styles.panel} id="webhooks">
      <h2 className={styles.panelTitle}>Inbound webhook failures · {webhooks.length} events in {webhookGroups.length} groups</h2>
      {webhookGroups.length === 0 && !diagnostics.failed.includes('webhookFailures') ? <p className={styles.emptyState}>No unresolved inbound webhook failures.</p> : null}
      {webhookGroups.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Source</th><th>Event</th><th>Error</th><th className="num">Occurrences</th><th>First / latest</th><th>Action</th></tr></thead>
        <tbody>{webhookGroups.map((entry) => <tr key={entry.key}>
          <td>{entry.sample.source.replace(/_/g, ' ')}</td><td>{entry.sample.event_type || '—'}</td><td className={styles.muted}>{entry.sample.error_message}</td><td className="num">{entry.count}</td><td className={styles.muted}>{fmt(entry.firstAt)}<br />{fmt(entry.latestAt)}</td>
          <td>{canResolve ? <form action={resolveWebhookGroupAction.bind(null, entry.ids)} className={styles.compactForm}><label className={styles.srOnly} htmlFor={`resolve-${entry.ids[0]}`}>Resolution reason</label><input id={`resolve-${entry.ids[0]}`} className={styles.compactInput} name="reason" required minLength={4} placeholder="Resolution reason" /><button className="btn secondary" type="submit">Resolve group</button></form> : '—'}</td>
        </tr>)}</tbody>
      </table></div> : null}
    </section>

    <section className={styles.panel} id="outbound-webhooks">
      <h2 className={styles.panelTitle}>Outbound webhook delivery failures · {outboundDeliveries.length}</h2>
      {outboundDeliveries.length === 0 ? <p className={styles.emptyState}>No failed outbound webhook deliveries.</p> : null}
      {outboundDeliveries.length ? <div className={styles.tableWrap}><table className={styles.table}>
        <thead><tr><th>Account</th><th>Endpoint</th><th>Status</th><th>Error</th><th className="num">Attempts</th><th>Next retry</th><th>Latest</th></tr></thead>
        <tbody>{outboundDeliveries.map((d) => <tr key={d.id}>
          <td><Link className={styles.rowLink} href={`/admin/accounts/${d.accountId}?tab=api`}>{d.businessName || d.accountId.slice(0, 8)}</Link></td>
          <td><code style={{ fontSize: '.75rem' }}>{d.targetUrl}</code></td>
          <td><span className={`${styles.pill} ${d.status === 'dead_letter' ? styles.bad : styles.warn}`}>{d.status}</span>{d.lastStatusCode ? <span className={styles.muted} style={{ fontSize: '.72rem', marginLeft: '.3rem' }}>HTTP {d.lastStatusCode}</span> : null}</td>
          <td className={styles.muted} style={{ fontSize: '.75rem', maxWidth: '30ch' }}>{d.lastErrorMessage || d.lastErrorCode || '—'}</td>
          <td className="num">{d.attemptCount}</td>
          <td className={styles.muted}>{d.nextRetryAt ? fmt(d.nextRetryAt) : 'None'}</td>
          <td className={styles.muted}>{fmt(d.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div> : null}
    </section>

    <section className={styles.panel} id="texts">
      <h2 className={styles.panelTitle}>Failed texts · {sms.length} events in {smsGroups.length} groups</h2>
      {smsGroups.length === 0 && !diagnostics.failed.includes('failedSms') ? <p className={styles.emptyState}>No failed tracked texts.</p> : null}
      {smsGroups.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Type</th><th>Error</th><th className="num">Occurrences</th><th>Latest</th><th>Account</th></tr></thead><tbody>
        {smsGroups.map((entry) => <tr key={entry.key}><td>{entry.sample.event_type.replace(/_/g, ' ')}</td><td className={styles.muted}>{entry.sample.error_reason || 'Unknown'}</td><td className="num">{entry.count}</td><td>{fmt(entry.latestAt)}</td><td><Link className={styles.rowLink} href={`/admin/accounts/${entry.sample.account_id}`}>Open →</Link></td></tr>)}
      </tbody></table></div> : null}
    </section>

    <section className={styles.panel} id="emails">
      <h2 className={styles.panelTitle}>Failed emails · {emails.length} events in {emailGroups.length} groups</h2>
      {emailGroups.length === 0 && !diagnostics.failed.includes('failedEmails') ? <p className={styles.emptyState}>No bounced or complained emails.</p> : null}
      {emailGroups.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Kind</th><th>Status</th><th>Error</th><th className="num">Occurrences</th><th>Latest</th></tr></thead><tbody>
        {emailGroups.map((entry) => <tr key={entry.key}><td>{entry.sample.kind}</td><td>{entry.sample.status}</td><td className={styles.muted}>{entry.sample.error_reason || '—'}</td><td className="num">{entry.count}</td><td>{fmt(entry.latestAt)}</td></tr>)}
      </tbody></table></div> : null}
    </section>
  </>;
}

