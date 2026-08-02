import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listAdminActions } from '@/lib/admin';
import { QUICK_STOP_ACTIVE_STATUSES } from '@/lib/quick-stop';
import styles from './admin.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const { admin } = await requireAdmin();

  const [
    accountsTotal,
    accountsNew,
    onboarded,
    payoutsPaused,
    esActive,
    disputes,
    recentActions,
  ] = await Promise.all([
    admin.from('accounts').select('id', { count: 'exact', head: true }),
    admin.from('accounts').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
    admin.from('accounts').select('id', { count: 'exact', head: true }).eq('connect_onboarded', true),
    admin.from('accounts').select('id', { count: 'exact', head: true }).not('connect_disabled_at', 'is', null),
    admin.from('extra_stop_requests').select('id', { count: 'exact', head: true }).in('status', QUICK_STOP_ACTIVE_STATUSES as unknown as string[]),
    admin.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'disputed'),
    listAdminActions(admin, { limit: 6 }),
  ]);

  const stats: { label: string; value: number; href?: string; tone?: string }[] = [
    { label: 'Accounts', value: accountsTotal.count ?? 0, href: '/admin/accounts' },
    { label: 'New in last 30 days', value: accountsNew.count ?? 0 },
    { label: 'Payouts connected', value: onboarded.count ?? 0 },
    { label: 'Payouts paused', value: payoutsPaused.count ?? 0, tone: (payoutsPaused.count ?? 0) > 0 ? 'warn' : undefined },
    { label: 'Active Quick Stops', value: esActive.count ?? 0, href: '/admin/quick-stops' },
    { label: 'Open disputes', value: disputes.count ?? 0, href: '/admin/money', tone: (disputes.count ?? 0) > 0 ? 'bad' : undefined },
  ];

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Staff console</p>
        <h1 className={styles.title}>Overview</h1>
        <p className={styles.lead}>Cross-account operations for letsgetquoted.com — support lookups, Quick Stop governance, money oversight, and an audit trail of every staff action.</p>
      </header>

      <section className={styles.cardGrid} style={{ marginBottom: '1.4rem' }}>
        {stats.map((s) => {
          const body = (
            <div className={`${styles.panel} ${styles.statCard} ${s.href ? styles.link : ''}`}>
              <span className={styles.statValue} style={s.tone === 'bad' ? { color: '#fca5a5' } : s.tone === 'warn' ? { color: '#ffd166' } : undefined}>
                {s.value.toLocaleString('en-US')}
              </span>
              <span className={styles.statLabel}>{s.label}</span>
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {body}
            </Link>
          ) : (
            <div key={s.label}>{body}</div>
          );
        })}
      </section>

      <section className={styles.panel}>
        <p className={styles.panelTitle}>Recent staff actions</p>
        {recentActions.length === 0 ? (
          <p className={styles.emptyState}>No staff actions recorded yet.</p>
        ) : (
          <ul className={styles.timeline}>
            {recentActions.map((a) => (
              <li key={a.id}>
                <time>{new Date(a.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                <span>
                  <span className={styles.timelineActor}>{a.admin_email}</span> — {a.action.replace(/_/g, ' ')}
                  {a.account_id ? (
                    <>
                      {' · '}
                      <Link href={`/admin/accounts/${a.account_id}`} className={styles.rowLink}>account</Link>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.actionRow}>
          <Link href="/admin/audit" className="btn secondary">View full audit log</Link>
        </div>
      </section>
    </>
  );
}
