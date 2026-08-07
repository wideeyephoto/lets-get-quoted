import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { listAccountsForAdmin, countAccountsForAdmin, ownerEmailsForAccounts, accountDisplayName, type AdminAccountRow } from '@/lib/admin-accounts';
import {
  ACCOUNT_FILTERS,
  ACCOUNT_FILTER_INFO,
  JOINED_LABEL,
  ONBOARDING_STAGE_INFO,
  connectDashboardUrl,
  isAccountFilter,
  joinedSince as joinedSinceDate,
  onboardingSeverity,
  onboardingStage,
  type AccountFilter,
} from '@/lib/admin-account-filters';
import { isDateRange } from '@/lib/command-center-logic';
import { staffCan } from '@/lib/staff';
import { resendOnboardingFromListAction } from './actions';
import styles from '../admin.module.css';

/**
 * The list every count in the console points at.
 *
 * Its job is no longer just "search accounts". A card saying "Not onboarded
 * (12)" links here with ?filter=not_onboarded, and this page has to answer the
 * three questions that number raises in order: which twelve, what is wrong with
 * each, and what do I do about it. The stage column and the action column are
 * that second and third answer — without them a drill-down is just a shorter
 * list to be confused by.
 */

export const dynamic = 'force-dynamic';

const PAGE_LIMIT = 50;

const DONE: Record<string, string> = {
  onboarding_resent: 'Sign-in link sent.',
};
const ERRORS: Record<string, string> = {
  no_owner: 'That account has no owner email on file, so there is nobody to send a link to.',
};

function connectPill(row: { connect_onboarded: boolean | null; connect_disabled_at: string | null }) {
  if (row.connect_disabled_at) return <span className={`${styles.pill} ${styles.bad}`}>Payouts paused</span>;
  if (row.connect_onboarded) return <span className={`${styles.pill} ${styles.good}`}>Connected</span>;
  return <span className={`${styles.pill} ${styles.neutral}`}>Not connected</span>;
}

/**
 * What is missing, and the thing to do about it.
 *
 * Only rendered on a filtered view. On the unfiltered list it would be a column
 * of blanks for every healthy account, and a column that is usually empty is a
 * column people stop reading.
 */
function stalledCell(row: AdminAccountRow, now: Date) {
  const stage = onboardingStage(row);
  if (stage === 'done') return <span className={styles.muted}>—</span>;
  const info = ONBOARDING_STAGE_INFO[stage];
  const severity = onboardingSeverity(row.created_at, now);
  return (
    <>
      <span className={`${styles.pill} ${styles[severity]}`}>{info.label}</span>
      <div className={styles.muted} style={{ fontSize: '.75rem', marginTop: '.25rem', maxWidth: '32ch' }}>{info.missing}</div>
    </>
  );
}

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string; joined?: string; done?: string; error?: string; deleted?: string };
}) {
  const ctx = await requireAdmin();
  const query = searchParams.q?.trim() ?? '';
  const filter: AccountFilter | undefined = isAccountFilter(searchParams.filter) ? searchParams.filter : undefined;
  // Carried over from whichever range the Command Center's "New accounts"
  // metric was showing, so the list covers the same window as the number that
  // opened it.
  const joined = isDateRange(searchParams.joined) ? searchParams.joined : undefined;
  const now = new Date();
  const joinedSince = joined ? joinedSinceDate(joined, now) : undefined;

  const [rows, total] = await Promise.all([
    listAccountsForAdmin(ctx.admin, { query, limit: PAGE_LIMIT, filter, joinedSince }),
    // Only meaningful for an unsearched slice: a text search unions three
    // lookups, which no single count query reproduces. Asking for one anyway
    // would print a total that disagrees with the rows underneath it.
    query ? Promise.resolve(null) : countAccountsForAdmin(ctx.admin, { filter, joinedSince }),
  ]);
  // Shown as a column because it is how staff identify an account when a
  // customer writes in, and because a search that matches on something
  // invisible looks broken — you would have no way to see WHY a row matched.
  const ownerEmails = await ownerEmailsForAccounts(ctx.admin, rows.map((r) => r.id));

  const canResend = staffCan(ctx.staff, 'account.support');
  const showStalled = filter === 'not_onboarded' || filter === 'connect_incomplete';
  const back = new URLSearchParams();
  if (filter) back.set('filter', filter);
  if (query) back.set('q', query);
  if (joined) back.set('joined', joined);
  const backValue = back.toString();

  function href(next: AccountFilter | null): string {
    const params = new URLSearchParams();
    if (next) params.set('filter', next);
    if (query) params.set('q', query);
    if (joined) params.set('joined', joined);
    const s = params.toString();
    return s ? `/admin/accounts?${s}` : '/admin/accounts';
  }

  const info = filter ? ACCOUNT_FILTER_INFO[filter] : null;
  const truncated = typeof total === 'number' && total > rows.length;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Support</p>
        <h1 className={styles.title}>{info ? info.label : joined ? 'New accounts' : 'Accounts'}</h1>
        <p className={styles.lead}>
          {info
            ? info.blurb
            : joined
              ? `${JOINED_LABEL[joined]}, newest first.`
              : 'Look up any contractor to see their plan, payout status, and recent activity. Search by business name, account number, or the owner’s login email.'}
          {info && joined ? ` ${JOINED_LABEL[joined]} only.` : ''}
        </p>
      </header>

      {/* Shown as a removable chip rather than folded into the filter row: it
          arrives from another page's range selection, so it needs to be
          visible and undoable, not silently narrowing the list. */}
      {joined ? (
        <div className={styles.filterTabs}>
          <span className={`${styles.filterTab} ${styles.on}`}>
            {JOINED_LABEL[joined]}
            {' · '}
            <Link href={filter ? `/admin/accounts?filter=${filter}` : '/admin/accounts'} className={styles.rowLink}>clear</Link>
          </span>
        </div>
      ) : null}

      {searchParams.deleted ? <div className={`${styles.banner} ${styles.ok}`}>Account deleted.</div> : null}
      {searchParams.done ? <div className={`${styles.banner} ${styles.ok}`}>{DONE[searchParams.done] ?? 'Done.'}</div> : null}
      {searchParams.error ? <div className={`${styles.banner} ${styles.err}`}>{ERRORS[searchParams.error] ?? 'Something went wrong.'}</div> : null}

      {/* The same slices the Command Center and Money pages count, reachable
          directly — so a number is not the only way in, and somebody who wants
          the list without hunting for the card that links to it can just ask. */}
      <div className={styles.filterTabs}>
        <Link href={href(null)} className={`${styles.filterTab} ${!filter ? styles.on : ''}`}>All</Link>
        {ACCOUNT_FILTERS.map((key) => (
          <Link key={key} href={href(key)} className={`${styles.filterTab} ${filter === key ? styles.on : ''}`}>
            {ACCOUNT_FILTER_INFO[key].label}
          </Link>
        ))}
      </div>

      <form className={styles.searchRow} method="get">
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        {joined ? <input type="hidden" name="joined" value={joined} /> : null}
        <input className={styles.input} type="search" name="q" defaultValue={query} placeholder="Business name, account #, or owner email…" autoFocus />
        <button type="submit" className="btn primary">Search</button>
        {query ? <Link href={href(filter ?? null)} className="btn secondary">Clear</Link> : null}
      </form>

      <section className={styles.panel}>
        {/* Says the true size of the slice and admits the cap. A list that
            quietly stops at fifty reads as "there are fifty", which is the
            same lie the dead-end counts told. */}
        <p className={styles.panelTitle}>
          {typeof total === 'number' ? `${total.toLocaleString('en-US')} ${total === 1 ? 'account' : 'accounts'}` : `${rows.length} matching`}
          {truncated ? <span className={styles.muted} style={{ fontWeight: 400 }}> — showing the {rows.length} newest. Search to narrow it.</span> : null}
        </p>
        {rows.length === 0 ? (
          <p className={styles.emptyState}>
            {query
              ? `No accounts match “${query}”${filter ? ` in ${ACCOUNT_FILTER_INFO[filter].label.toLowerCase()}` : ''}.`
              : filter
                ? `Nothing here — no accounts are ${ACCOUNT_FILTER_INFO[filter].label.toLowerCase()}.`
                : 'No accounts yet.'}
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Owner</th>
                  <th>#</th>
                  <th>Plan</th>
                  <th>Payouts</th>
                  <th>Status</th>
                  {showStalled ? <th>What is missing</th> : null}
                  <th>Joined</th>
                  {showStalled ? <th>Next step</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/accounts/${r.id}`} className={styles.rowLink}>
                        {accountDisplayName(r)}
                      </Link>
                    </td>
                    <td className={styles.muted} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ownerEmails.get(r.id) ?? <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.muted}>{r.account_number ?? '—'}</td>
                    <td><span className={`${styles.pill} ${styles.neutral}`}>{r.plan ?? 'free'}</span></td>
                    <td>{connectPill(r)}</td>
                    <td>
                      {r.suspended_at ? (
                        <>
                          <span className={`${styles.pill} ${styles.bad}`}>Suspended</span>
                          {r.suspended_reason ? (
                            <div className={styles.muted} style={{ fontSize: '.72rem' }}>{r.suspended_reason}</div>
                          ) : null}
                        </>
                      ) : (
                        <span className={`${styles.pill} ${styles.good}`}>Active</span>
                      )}
                    </td>
                    {showStalled ? <td>{stalledCell(r, now)}</td> : null}
                    <td className={styles.muted} style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' } as Intl.DateTimeFormatOptions)}
                    </td>
                    {showStalled ? (
                      <td>
                        {/* Both halves of the next step: what Stripe is holding
                            it on, and the nudge. The Connect link only exists
                            once Stripe has an account to show. */}
                        {connectDashboardUrl(r.stripe_connect_id) ? (
                          <div>
                            <a href={connectDashboardUrl(r.stripe_connect_id) as string} target="_blank" rel="noreferrer" className={styles.rowLink}>
                              What Stripe wants →
                            </a>
                          </div>
                        ) : null}
                        {canResend ? (
                          <form action={resendOnboardingFromListAction.bind(null, r.id)}>
                            <input type="hidden" name="back" value={backValue} />
                            <button type="submit" className={styles.rowLink} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                              Resend sign-in link →
                            </button>
                          </form>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
