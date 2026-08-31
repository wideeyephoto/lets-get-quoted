import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { searchEverything, type SearchResult, type SearchSection } from '@/lib/admin-search';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search' };

const SECTIONS: { key: SearchSection; label: string }[] = [
  { key: 'accounts', label: 'Accounts' },
  { key: 'clients', label: 'Customers' },
  { key: 'quickStops', label: 'Quick Stops' },
  { key: 'payments', label: 'Payments & disputes' },
];

function ResultTable({ rows }: { rows: SearchResult[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td>
                <Link href={r.href} className={styles.rowLink}>{r.title}</Link>
              </td>
              <td className={styles.muted}>{r.subtitle ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminSearchPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = (await searchParamsPromise) || {};
  const { admin } = await requireAdmin();
  const query = searchParams.q?.trim() ?? '';
  const results = query ? await searchEverything(admin, query, { limit: 25 }) : null;
  const totalCount = results ? SECTIONS.reduce((sum, s) => sum + results[s.key].length, 0) : 0;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Lookup</p>
        <h1 className={styles.title}>Search</h1>
        {/* Split into whose email is whose. This used to read "customer
            name/email/phone" while searching clients.email — the contractors'
            homeowners — so a staff member pasting a CONTRACTOR's address got a
            confident "no results" from a lookup answering a different question.
            Both are searchable now, and the two are named separately. */}
        <p className={styles.lead}>
          Contractors by business name, account #, or the owner&rsquo;s login email. Their customers by name, email or
          phone. Also Quick Stop IDs and Stripe payment/checkout/dispute IDs.
        </p>
      </header>

      <form className={styles.searchRow} method="get">
        <label className={styles.srOnly} htmlFor="full-admin-search">Search accounts, customers, Quick Stops, and payments</label>
        <input id="full-admin-search" className={styles.input} type="search" name="q" defaultValue={query} placeholder="Search everything…" autoFocus />
        <button type="submit" className="btn primary">Search</button>
        {query ? <Link href="/admin/search" className="btn secondary">Clear</Link> : null}
      </form>

      {results?.unavailable.length ? (
        <div className={`${styles.banner} ${styles.err}`} role="status">
          Search is incomplete. {results.unavailable.map((key) => SECTIONS.find((section) => section.key === key)?.label ?? key).join(', ')} could not be searched.
        </div>
      ) : null}

      {!results ? (
        <p className={styles.emptyState}>Start typing to search across accounts, customers, Quick Stops, and payments.</p>
      ) : totalCount === 0 && results.unavailable.length === 0 ? (
        <p className={styles.emptyState}>No results for “{query}”.</p>
      ) : totalCount === 0 ? null : (
        SECTIONS.filter((s) => results[s.key].length > 0).map((s) => (
          <section key={s.key} className={styles.panel} style={{ marginBottom: '1.2rem' }}>
            <h2 className={styles.panelTitle}>{s.label}</h2>
            <ResultTable rows={results[s.key]} />
          </section>
        ))
      )}
    </>
  );
}
