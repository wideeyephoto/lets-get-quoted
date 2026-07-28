import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import ClientImport from './ClientImport';

export const dynamic = 'force-dynamic';

export default async function ImportClientsPage() {
  await requireOwnerContext();

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Clients</p>
          <h1 className="workspace-title">Import your customers</h1>
          <p className="workspace-lead">
            Bring your existing customer list over in one step. Upload a CSV or paste it in — whatever the
            column names or order, we match them to name, phone, email, and address (with AI when needed),
            show you the result, and import only once you confirm. We match on phone then email, so
            importing again never creates duplicates.
          </p>
          <div className="workspace-inline-row">
            <Link href="/dashboard/clients" className="btn secondary">← Back to clients</Link>
          </div>
        </div>
      </section>

      <ClientImport />

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Format</p>
          <h2>What we read</h2>
        </div>
        <ul className="workspace-card-copy" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>Upload a <strong>.csv</strong> or paste rows straight from Excel, Google Sheets, QuickBooks, Jobber, or your phone contacts — commas, tabs, and semicolons all work.</li>
          <li>Columns can be in any order with any headings, in any language. We match <strong>name</strong>, <strong>phone</strong>, <strong>email</strong>, and <strong>address</strong> automatically — even split <em>First</em>/<em>Last</em> name or <em>street/city/state/ZIP</em> address columns.</li>
          <li>You&apos;ll see exactly how each column was matched and can reassign any before importing.</li>
          <li>Each customer needs a phone or an email — rows with neither are skipped.</li>
          <li>Already-on-file customers (same phone or email) are skipped, so re-importing is safe.</li>
        </ul>
      </section>
    </main>
  );
}
