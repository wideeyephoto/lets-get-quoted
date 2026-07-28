import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import SmartImport from '@/components/smart-import';
import { financialImportReady } from '@/lib/invoice-import';
import { analyzeInvoicesImport, previewInvoicesImport, commitInvoicesImport } from './actions';

export const dynamic = 'force-dynamic';

export default async function ImportInvoicesPage() {
  const { supabase } = await requireOwnerContext();
  const ready = await financialImportReady(supabase);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Invoices &amp; payments</p>
          <h1 className="workspace-title">Import your invoices</h1>
          <p className="workspace-lead">
            Bring your billing history over from another tool. Each invoice creates a matching job and
            links its customer, so your jobs and client list fill in too. Invoices marked <strong>paid</strong>{' '}
            record a payment as historical — no Stripe, no payout, and it never counts toward your
            platform-fee volume. Upload a CSV or Excel file (or paste it in) and confirm before importing.
          </p>
          <div className="workspace-inline-row">
            <Link href="/dashboard/jobs" className="btn secondary">← Back to jobs</Link>
          </div>
        </div>
      </section>

      {ready ? (
        <SmartImport
          fields={[
            { key: 'clientName', label: 'Customer' },
            { key: 'clientPhone', label: 'Phone' },
            { key: 'clientEmail', label: 'Email' },
            { key: 'address', label: 'Address' },
            { key: 'description', label: 'Description' },
            { key: 'date', label: 'Date' },
            { key: 'total', label: 'Total' },
            { key: 'status', label: 'Status' },
          ]}
          noun={{ one: 'invoice', many: 'invoices' }}
          analyze={analyzeInvoicesImport}
          runPreview={previewInvoicesImport}
          commit={commitInvoicesImport}
          doneHref="/dashboard/jobs"
          doneLabel="View your jobs"
        />
      ) : (
        <section className="panel workspace-section-card" style={{ borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.06)' }}>
          <div className="section-heading workspace-section-heading">
            <p className="eyebrow" style={{ color: '#f59e0b' }}>One-time setup</p>
            <h2>Enable financial import</h2>
          </div>
          <p className="workspace-card-copy">
            Importing invoices &amp; payments needs a quick database update first — it adds a flag that keeps
            imported history out of your platform-fee calculation. Run this once from the project, then reload:
          </p>
          <pre style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '0.9rem 1rem', overflowX: 'auto', fontFamily: 'ui-monospace, monospace' }}>node scripts/deploy-schema.mjs</pre>
          <p className="workspace-card-copy">Clients, services, and jobs imports don&apos;t need this — they work now.</p>
        </section>
      )}

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Format</p>
          <h2>What we read</h2>
        </div>
        <ul className="workspace-card-copy" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>Upload a <strong>.csv</strong> or <strong>Excel</strong> file (<strong>.xlsx</strong>), or paste rows — any column names or order.</li>
          <li>Only the <strong>customer</strong> is required. Phone/email link each invoice to a client (and create the client if new).</li>
          <li>Each invoice creates a <strong>job</strong> (its scope is the description) plus the invoice and a line item. <strong>Status</strong> maps to paid / sent / signed / draft / void.</li>
          <li>Invoices marked <strong>paid</strong> record a historical payment — excluded from Stripe and your fee tier. Unknown statuses are treated as unpaid (we never invent revenue).</li>
          <li>Duplicate invoices (same customer, description, date, and total) are skipped, so re-importing is safe.</li>
        </ul>
      </section>
    </main>
  );
}
