import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { importClientsAction } from '../actions';
import SaveButton from '@/components/save-button';

export const dynamic = 'force-dynamic';

export default async function ImportClientsPage({
  searchParams,
}: {
  searchParams: { imported?: string; duplicates?: string; skipped?: string; error?: string };
}) {
  await requireOwnerContext();

  const imported = Number(searchParams.imported);
  const didImport = Number.isFinite(imported) && searchParams.imported !== undefined;
  const duplicates = Number(searchParams.duplicates) || 0;
  const skipped = Number(searchParams.skipped) || 0;

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Clients</p>
          <h1 className="workspace-title">Import your customers</h1>
          <p className="workspace-lead">
            Bring your existing customer list over in one step. Upload a CSV or paste it below — we
            match on phone then email, so importing again never creates duplicates.
          </p>
          <div className="workspace-inline-row">
            <Link href="/dashboard/clients" className="btn secondary">← Back to clients</Link>
          </div>
        </div>
      </section>

      {didImport ? (
        <section className="panel workspace-section-card" style={{ borderColor: '#16a34a', background: 'rgba(22, 163, 74, 0.06)' }}>
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow" style={{ color: '#16a34a' }}>✓ Import complete</p>
            <h2>{imported} customer{imported === 1 ? '' : 's'} added</h2>
          </div>
          <p className="workspace-card-copy">
            {imported} new client{imported === 1 ? '' : 's'} imported
            {duplicates > 0 ? `, ${duplicates} already on file (skipped)` : ''}
            {skipped > 0 ? `, ${skipped} skipped with no phone or email` : ''}.{' '}
            <Link href="/dashboard/clients">View your clients →</Link>
          </p>
        </section>
      ) : null}

      {searchParams.error === 'empty' ? (
        <p className="payment-banner muted">Paste some CSV or choose a file first.</p>
      ) : null}
      {searchParams.error === 'norows' ? (
        <p className="payment-banner muted">We couldn&apos;t find any rows with a name, phone, or email in that file.</p>
      ) : null}

      <form action={importClientsAction} className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Step 1</p>
          <h2>Upload or paste</h2>
        </div>

        <div className="form-grid">
          <div className="field full">
            <label htmlFor="file">CSV file</label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" />
          </div>
          <div className="field full">
            <label htmlFor="csv">…or paste CSV</label>
            <textarea
              id="csv"
              name="csv"
              rows={10}
              placeholder={'name,phone,email,address\nJane Homeowner,(248) 555-0199,jane@email.com,"1418 Maplewood Ave, Royal Oak, MI"\nMike Ross,313-555-0142,mike@email.com,'}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
            />
          </div>
          <div className="field full">
            <SaveButton className="btn primary" pendingLabel="Importing…" savedLabel="Imported ✓">Import customers</SaveButton>
          </div>
        </div>
      </form>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Format</p>
          <h2>What we read</h2>
        </div>
        <ul className="workspace-card-copy" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>A header row is optional. If present, we match columns named <strong>name</strong>, <strong>phone</strong>, <strong>email</strong>, and <strong>address</strong> (in any order).</li>
          <li>No header? We read columns in order: name, phone, email, address.</li>
          <li>Each customer needs a phone or an email — rows with neither are skipped.</li>
          <li>Already-on-file customers (same phone or email) are skipped, so re-importing is safe.</li>
        </ul>
      </section>
    </main>
  );
}
