import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { staffCan } from '@/lib/staff';
import {
  listPlatformPrivacyRequestsPaged,
  STATUTORY_PRIVACY_DEADLINE_DAYS,
  type PrivacyRequestStatus,
  type PrivacyRequestKind,
} from '@/lib/privacy-requests';
import { severityForDeadline, relativeAge } from '@/lib/command-center-logic';
import { resolvePlatformPrivacyRequestAction } from './actions';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy Requests & DSAR Queue' };

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
    return d.toLocaleDateString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function kindBadge(kind: string) {
  const k = kind.toLowerCase();
  let cls = styles.neutral;
  if (k === 'deletion') cls = styles.bad;
  else if (k === 'access') cls = styles.good;
  else if (k === 'correction') cls = styles.warn;
  return <span className={`${styles.pill} ${cls}`}>{kind.toUpperCase()}</span>;
}

function deadlineBadge(deadlineIso: string, now: Date) {
  const deadlineMs = new Date(deadlineIso).getTime();
  const diffMs = deadlineMs - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < 0) {
    return (
      <span className={`${styles.pill} ${styles.bad}`} title={`Deadline was ${fmtDate(deadlineIso)}`}>
        ⚠️ Overdue by {Math.abs(diffDays)}d
      </span>
    );
  }

  if (diffDays <= 7) {
    return (
      <span className={`${styles.pill} ${styles.warn}`} title={`Deadline: ${fmtDate(deadlineIso)}`}>
        ⏱️ {diffDays === 0 ? 'Due today' : `${diffDays}d remaining`}
      </span>
    );
  }

  return (
    <span className={`${styles.pill} ${styles.neutral}`} title={`Deadline: ${fmtDate(deadlineIso)}`}>
      {diffDays}d remaining
    </span>
  );
}

export default async function AdminPrivacyRequestsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ status?: string; kind?: string; page?: string }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const ctx = await requireAdmin();
  const { admin, staff } = ctx;
  const canManage = staffCan(staff, 'privacy.manage');
  const now = new Date();

  const statusParam = (searchParams.status ?? 'open') as PrivacyRequestStatus | 'all';
  const kindParam = (searchParams.kind ?? 'all') as PrivacyRequestKind | 'all';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const result = await listPlatformPrivacyRequestsPaged(admin, {
    status: statusParam,
    kind: kindParam,
    page,
    pageSize: 50,
  });

  const { rows, total, openCount, overdueCount } = result;

  return (
    <>
      <Link href="/admin" className={styles.backLink}>
        ← Back to Command Center
      </Link>

      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Regulatory & Compliance</p>
        <h1 className={styles.title}>Privacy Requests & DSAR Queue</h1>
        <p className={styles.lead}>
          Platform-wide Subject Access Requests (DSAR), account deletion requests, and data correction orders.
          All open requests are bound by a statutory {STATUTORY_PRIVACY_DEADLINE_DAYS}-day response clock (GDPR Article 12(3) / CCPA).
        </p>
      </header>

      {/* Metrics Row */}
      <div className={styles.metricsRow}>
        <div className={`${styles.panel} ${styles.statCard} ${openCount > 0 ? styles.accentAmber : styles.accentNeutral}`}>
          <div className={styles.statLabel}>Open Requests</div>
          <div className={styles.statValue}>{openCount}</div>
          <div className={styles.statDrill}>
            {openCount > 0 ? 'Statutory clocks active' : 'All requests resolved'}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${overdueCount > 0 ? styles.accentRose : styles.accentNeutral}`}>
          <div className={styles.statLabel}>Overdue Statutory Clock</div>
          <div className={styles.statValue} style={{ color: overdueCount > 0 ? '#f87171' : 'inherit' }}>
            {overdueCount}
          </div>
          <div className={styles.statDrill}>
            {overdueCount > 0 ? 'Exceeded 30-day legal baseline' : '0 overdue'}
          </div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentIndigo}`}>
          <div className={styles.statLabel}>Statutory Baseline</div>
          <div className={styles.statValue} style={{ fontSize: '1.4rem' }}>{STATUTORY_PRIVACY_DEADLINE_DAYS} Days</div>
          <div className={styles.statDrill}>GDPR Art 12(3) · CCPA 45d max</div>
        </div>

        <div className={`${styles.panel} ${styles.statCard} ${styles.accentNeutral}`}>
          <div className={styles.statLabel}>Total History</div>
          <div className={styles.statValue}>{total}</div>
          <div className={styles.statDrill}>Survives account disposal</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>Status:</span>
        <nav className={styles.filterTabs} aria-label="Filter by status">
          {[
            { key: 'open', label: `Open (${openCount})` },
            { key: 'resolved', label: 'Resolved' },
            { key: 'all', label: 'All Requests' },
          ].map((tab) => {
            const active = statusParam === tab.key;
            const href = `/admin/privacy-requests?status=${tab.key}${kindParam !== 'all' ? `&kind=${kindParam}` : ''}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`${styles.filterTab} ${active ? styles.filterTabActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <span className={styles.filterLabel} style={{ marginLeft: '1.5rem' }}>Type:</span>
        <nav className={styles.filterTabs} aria-label="Filter by request kind">
          {[
            { key: 'all', label: 'All types' },
            { key: 'access', label: 'Access (Export)' },
            { key: 'deletion', label: 'Deletion' },
            { key: 'correction', label: 'Correction' },
            { key: 'other', label: 'Other' },
          ].map((tab) => {
            const active = kindParam === tab.key;
            const href = `/admin/privacy-requests?status=${statusParam}${tab.key !== 'all' ? `&kind=${tab.key}` : ''}`;
            return (
              <Link
                key={tab.key}
                href={href}
                className={`${styles.filterTab} ${active ? styles.filterTabActive : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Requests Table */}
      <section className={styles.panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 className={styles.panelTitle} style={{ margin: 0 }}>
            {statusParam === 'open' ? 'Pending Requests' : statusParam === 'resolved' ? 'Resolved History' : 'All Requests'} ({rows.length})
          </h2>
          <span className={styles.muted} style={{ fontSize: '0.85rem' }}>
            Sorted by {statusParam === 'open' ? 'statutory urgency (oldest first)' : 'recency'}
          </span>
        </div>

        {rows.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No privacy requests match the current filters.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Details & Scope</th>
                  <th>Logged By</th>
                  <th>Received</th>
                  <th>Legal Clock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = row.status === 'open';
                  const acctName = row.account_business_name
                    ? `${row.account_business_name} (#${row.account_number ?? '—'})`
                    : `Account ${row.account_id.slice(0, 8)}…`;

                  return (
                    <tr key={row.id}>
                      <td>
                        <div>
                          <Link href={`/admin/accounts/${row.account_id}`} className={styles.rowLink}>
                            {acctName}
                          </Link>
                        </div>
                        <div className={styles.muted} style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                          {row.account_id}
                        </div>
                      </td>
                      <td>{kindBadge(row.kind)}</td>
                      <td style={{ maxWidth: '280px' }}>
                        <div>{row.details || <span className={styles.muted}>No additional details</span>}</div>
                        {row.kind === 'access' ? (
                          <div style={{ marginTop: '0.35rem' }}>
                            <a
                              href={`/admin/accounts/${row.account_id}/export`}
                              className={styles.rowLink}
                              style={{ fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              📦 Download Data Export (JSON) →
                            </a>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={styles.muted} style={{ fontSize: '0.85rem' }}>
                          {row.created_by}
                        </span>
                      </td>
                      <td>
                        <div>{fmtDate(row.created_at)}</div>
                        <div className={styles.muted} style={{ fontSize: '0.75rem' }}>
                          {relativeAge(row.created_at, now)}
                        </div>
                      </td>
                      <td>
                        {isOpen ? (
                          deadlineBadge(row.deadline_at, now)
                        ) : (
                          <span className={styles.muted} style={{ fontSize: '0.85rem' }}>
                            Resolved {fmtDate(row.resolved_at)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.pill} ${isOpen ? styles.warn : styles.good}`}>
                          {isOpen ? 'Open' : 'Resolved'}
                        </span>
                        {row.resolved_by ? (
                          <div className={styles.muted} style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                            by {row.resolved_by}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {isOpen && canManage ? (
                            <form action={resolvePlatformPrivacyRequestAction}>
                              <input type="hidden" name="request_id" value={row.id} />
                              <button type="submit" className="btn secondary" style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}>
                                Resolve
                              </button>
                            </form>
                          ) : null}
                          <Link
                            href={`/admin/accounts/${row.account_id}`}
                            className="btn secondary"
                            style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem' }}
                          >
                            Account →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
