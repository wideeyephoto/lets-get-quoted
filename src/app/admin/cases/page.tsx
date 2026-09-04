import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listSupportCasesPaged, type CaseStatus } from '@/lib/support-cases';
import { accountDisplayName } from '@/lib/admin-accounts';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cases' };

const PAGE_SIZE = 50;

const FILTERS: { key: string; label: string; statuses?: CaseStatus[] }[] = [
  { key: 'open', label: 'Open', statuses: ['open', 'pending'] },
  { key: 'resolved', label: 'Resolved / closed', statuses: ['resolved', 'closed'] },
  { key: 'all', label: 'All' },
];

function statusPill(status: string) {
  const cls = status === 'open' ? styles.warn : status === 'pending' ? styles.neutral : styles.good;
  return <span className={`${styles.pill} ${cls}`}>{status}</span>;
}
function priorityPill(priority: string) {
  const cls = priority === 'urgent' ? styles.bad : priority === 'high' ? styles.warn : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{priority}</span>;
}

export default async function AdminCasesPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ f?: string; page?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const { admin } = await requireAdmin();
  const active = FILTERS.find((f) => f.key === searchParams.f) ?? FILTERS[0];
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  let available = true;
  let namesAvailable = true;
  const { rows: cases, total } = await listSupportCasesPaged(admin, {
    statuses: active.statuses,
    page,
    pageSize: PAGE_SIZE,
    onError: () => { available = false; },
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function paramsFor(next: Record<string, string | undefined>): string {
    const p = new URLSearchParams();
    if (active.key !== 'open') p.set('f', active.key);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return qs ? `/admin/cases?${qs}` : '/admin/cases';
  }

  const acctIds = [...new Set(cases.map((c) => c.account_id).filter((id): id is string => Boolean(id)))];
  const nameMap = new Map<string, { business_name: string | null; account_number: number | null }>();
  if (acctIds.length) {
    const { data: acctRows, error } = await admin.from('accounts').select('id, business_name, account_number').in('id', acctIds);
    if (error) {
      namesAvailable = false;
      console.error('cases account name lookup failed:', error);
    }
    for (const a of (acctRows ?? []) as { id: string; business_name: string | null; account_number: number | null }[]) {
      nameMap.set(a.id, a);
    }
  }

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>Cases</h1>
        <p className={styles.lead}>Internal support-case log — open a case for anything that needs staff follow-up, thread notes on it, and track it to resolution.</p>
        <div className={styles.actionRow} style={{ marginTop: '.6rem' }}>
          <Link href="/admin/cases/new" className="btn primary">New case</Link>
        </div>
      </header>

      <div className={styles.filterTabs}>
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/cases?f=${f.key}`} className={`${styles.filterTab} ${f.key === active.key ? styles.on : ''}`}>
            {f.label}
          </Link>
        ))}
      </div>
      {!available || !namesAvailable ? <div className={`${styles.banner} ${styles.err}`}>Case data is incomplete. A blank list or missing account names are not being treated as clear.</div> : null}

      <section className={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.8rem', flexWrap: 'wrap', gap: '.5rem' }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            {total.toLocaleString('en-US')} cases{pageCount > 1 ? ` · page ${page} of ${pageCount}` : ''}
          </h2>
        </div>
        {available && cases.length === 0 ? (
          <p className={styles.emptyState}>No cases in this view.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Opened</th>
                  <th>Subject</th>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assigned</th>
                  <th>SLA due</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className={styles.muted}>{new Date(c.created_at).toLocaleDateString('en-US', { dateStyle: 'short' })}</td>
                    <td><Link href={`/admin/cases/${c.id}`} className={styles.rowLink}>{c.subject}</Link></td>
                    <td>
                      {c.account_id ? (
                        <Link href={`/admin/accounts/${c.account_id}`} className={styles.rowLink}>{accountDisplayName(nameMap.get(c.account_id) ?? {})}</Link>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td>{statusPill(c.status)}</td>
                    <td>{priorityPill(c.priority)}</td>
                    <td>{c.assigned_to || <span className={styles.muted}>Unassigned</span>}</td>
                    <td className={styles.muted}>{c.sla_due_at ? new Date(c.sla_due_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 ? (
          <div className={styles.pagination}>
            {page > 1 ? <Link className="btn secondary" href={paramsFor({ page: String(page - 1) })}>← Previous</Link> : <span />}
            {page < pageCount ? <Link className="btn secondary" href={paramsFor({ page: String(page + 1) })}>Next →</Link> : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
