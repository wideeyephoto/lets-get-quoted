import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { searchEverything, type SearchResult, type SearchResults } from '@/lib/admin-search';
import styles from '../admin.module.css';

export const dynamic = 'force-dynamic';

const SECTIONS: { key: keyof SearchResults; label: string }[] = [
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

export default async function AdminSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const { admin } = await requireAdmin();
  const query = searchParams.q?.trim() ?? '';
  const results = query ? await searchEverything(admin, query, { limit: 25 }) : null;
  const totalCount = results ? SECTIONS.reduce((sum, s) => sum + results[s.key].length, 0) : 0;

  return (
    <>
      <header className={styles.pageHead}>
        <p className={styles.eyebrow}>Lookup</p>
        <h1 className={styles.title}>Search</h1>
        <p className={styles.lead}>
          Business name, customer name/email/phone, account #, Quick Stop ID, or a Stripe payment/checkout/dispute ID.
        </p>
      </header>

      <form className={styles.searchRow} method="get">
        <input className={styles.input} type="search" name="q" defaultValue={query} placeholder="Search everything…" autoFocus />
        <button type="submit" className="btn primary">Search</button>
        {query ? <Link href="/admin/search" className="btn secondary">Clear</Link> : null}
      </form>

      {!results ? (
        <p className={styles.emptyState}>Start typing to search across accounts, customers, Quick Stops, and payments.</p>
      ) : totalCount === 0 ? (
        <p className={styles.emptyState}>No results for “{query}”.</p>
      ) : (
        SECTIONS.filter((s) => results[s.key].length > 0).map((s) => (
          <section key={s.key} className={styles.panel} style={{ marginBottom: '1.2rem' }}>
            <p className={styles.panelTitle}>{s.label}</p>
            <ResultTable rows={results[s.key]} />
          </section>
        ))
      )}
    </>
  );
}
