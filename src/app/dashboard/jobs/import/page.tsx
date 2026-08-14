import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import SmartImport from '@/components/smart-import';
import { analyzeJobsImport, previewJobsImport, commitJobsImport } from './actions';

export const metadata = { title: 'Import jobs' };

export const dynamic = 'force-dynamic';

export default async function ImportJobsPage() {
  await requireOwnerContext();

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Jobs</p>
          <h1 className="workspace-title">Import your jobs</h1>
          <p className="workspace-lead">
            Bring your job history over from another tool. Upload a CSV or Excel file (or paste it in) —
            whatever the column names or order, we match customer, address, scope, status, date, and
            amount, link each job to a client, and show you the result before importing. Each job also
            creates or links its customer, so your client list fills in automatically.
          </p>
          <div className="workspace-inline-row">
            <Link href="/dashboard/jobs" className="btn secondary">← Back to jobs</Link>
          </div>
        </div>
      </section>

      <SmartImport
        fields={[
          { key: 'clientName', label: 'Customer' },
          { key: 'clientPhone', label: 'Phone' },
          { key: 'clientEmail', label: 'Email' },
          { key: 'address', label: 'Address' },
          { key: 'scope', label: 'Job / scope' },
          { key: 'status', label: 'Status' },
          { key: 'scheduledFor', label: 'Date' },
          { key: 'estimatedHours', label: 'Est. hours' },
          { key: 'quotedAmount', label: 'Amount' },
        ]}
        noun={{ one: 'job', many: 'jobs' }}
        analyze={analyzeJobsImport}
        runPreview={previewJobsImport}
        commit={commitJobsImport}
        doneHref="/dashboard/jobs"
        doneLabel="View your jobs"
      />

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Format</p>
          <h2>What we read</h2>
        </div>
        <ul className="workspace-card-copy" style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
          <li>Upload a <strong>.csv</strong> or <strong>Excel</strong> file (<strong>.xlsx</strong>), or paste rows — any column names or order.</li>
          <li>Only the <strong>customer name</strong> is required. Phone/email link each job to a client (matched by phone then email, so no duplicate clients).</li>
          <li><strong>Status</strong> is matched to new / in&nbsp;progress / complete / archived (anything unrecognized becomes complete). <strong>Dates</strong> accept YYYY-MM-DD or M/D/YYYY.</li>
          <li>Job numbers (J-####) are assigned automatically, continuing your existing sequence.</li>
          <li>Duplicate jobs (same customer, scope, date, and amount) are skipped, so re-importing is safe.</li>
        </ul>
      </section>
    </main>
  );
}
