import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { queryAdminActions } from '@/lib/admin';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

function summarize(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta ?? {});
  if (!keys.length) return '';
  return keys
    .slice(0, 4)
    .map((k) => `${k}: ${typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k])}`)
    .join(' · ');
}

/**
 * Only the fields that actually MOVED, as "was → now".
 *
 * Dumping both blobs side by side is how a before/after column becomes
 * unreadable and then ignored: on a suspend, four of the five keys are
 * identical and the eye has to find the one that is not.
 */
function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!before && !after) return '';
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const moved = keys.filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
  if (moved.length === 0) return '';
  return moved.slice(0, 3).map((k) => `${k}: ${show(before?.[k])} → ${show(after?.[k])}`).join(' · ');
}

function show(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function dateBoundary(value: string | undefined, endOfDay = false): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export default async function AdminAuditPage({ searchParams }: { searchParams: { actor?: string; action?: string; from?: string; to?: string; page?: string } }) {
  const { admin } = await requireAdmin();
  const actor = searchParams.actor?.trim() ?? '';
  const action = searchParams.action?.trim() ?? '';
  const from = dateBoundary(searchParams.from);
  const to = dateBoundary(searchParams.to, true);
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const result = await queryAdminActions(admin, { actor, action, from, to, page, pageSize: 50 });
  const actions = result.rows;
  const pageCount = Math.max(1, Math.ceil(result.total / 50));
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (actor) params.set('actor', actor);
    if (action) params.set('action', action);
    if (searchParams.from) params.set('from', searchParams.from);
    if (searchParams.to) params.set('to', searchParams.to);
    params.set('page', String(next));
    return `/admin/audit?${params.toString()}`;
  };

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Accountability</p>
        <h1 className={styles.title}>Audit log</h1>
        <p className={styles.lead}>
          Mutating staff actions with actor, permission, origin, and the before/after detail each action recorded.
          High-impact actions require a reason; older and low-impact rows may not have one. Rows are append-only at the database layer.
        </p>
      </header>

      <form className={styles.searchRow} method="get">
        <label className={styles.srOnly} htmlFor="audit-actor">Staff email</label>
        <input id="audit-actor" className={styles.input} name="actor" defaultValue={actor} placeholder="Staff email" />
        <label className={styles.srOnly} htmlFor="audit-action">Action</label>
        <input id="audit-action" className={styles.input} name="action" defaultValue={action} placeholder="Action contains…" />
        <label className={styles.srOnly} htmlFor="audit-from">From date</label>
        <input id="audit-from" className={styles.input} name="from" type="date" defaultValue={searchParams.from ?? ''} style={{ flex: '0 1 160px' }} />
        <label className={styles.srOnly} htmlFor="audit-to">To date</label>
        <input id="audit-to" className={styles.input} name="to" type="date" defaultValue={searchParams.to ?? ''} style={{ flex: '0 1 160px' }} />
        <button className="btn primary" type="submit">Filter</button>
        {actor || action || searchParams.from || searchParams.to ? <Link className="btn secondary" href="/admin/audit">Clear</Link> : null}
      </form>

      {!result.available ? <div className={`${styles.banner} ${styles.err}`}>Audit data is unavailable. No empty history is being inferred.</div> : null}

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>{result.total.toLocaleString('en-US')} actions · page {page} of {pageCount}</h2>
        {actions.length === 0 ? (
          result.available ? <p className={styles.emptyState}>No staff actions match these filters.</p> : null
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>When</th><th>Staff</th><th>Action</th><th>Account</th><th>Why</th><th>Change</th><th>Details</th></tr></thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      {a.admin_email}
                      {/* The authority and the origin sit under the name rather
                          than in their own columns: they are what you check
                          once something already looks wrong. */}
                      <div className={styles.muted} style={{ fontSize: '.72rem' }}>
                        {a.permission ? <code>{a.permission}</code> : null}
                        {a.ip ? <> · {a.ip}</> : null}
                      </div>
                    </td>
                    <td><span className={`${styles.pill} ${styles.neutral}`}>{a.action.replace(/_/g, ' ')}</span></td>
                    <td>{a.account_id ? <Link href={`/admin/accounts/${a.account_id}`} className={styles.rowLink}>account</Link> : <span className={styles.muted}>—</span>}</td>
                    {/* Promoted to its own column. It was buried in meta, which
                        is where a field goes to stop being filled in. */}
                    <td style={{ fontSize: '.82rem' }}>{a.reason || <span className={styles.muted}>—</span>}</td>
                    <td className={styles.muted} style={{ fontSize: '.75rem' }}>{diff(a.before_value, a.after_value)}</td>
                    <td className={styles.muted} style={{ fontSize: '.78rem' }}>{summarize(a.meta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={styles.pagination}>
          {page > 1 ? <Link className="btn secondary" href={pageHref(page - 1)}>← Previous</Link> : <span />}
          {page < pageCount ? <Link className="btn secondary" href={pageHref(page + 1)}>Next →</Link> : null}
        </div>
      </section>
    </>
  );
}
