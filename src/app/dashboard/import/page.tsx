import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import MigrationWizard from './MigrationWizard';

export const metadata = { title: 'Move in from another CRM' };

export const dynamic = 'force-dynamic';

export default async function MigratePage() {
  await requireOfficeContext('jobs.write');

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Migrate</p>
          <h1 className="workspace-title">Move in from another CRM</h1>
          <p className="workspace-lead">
            Drop in everything you exported from your old tool — customers, price list, jobs, invoices — in any
            format (CSV, Excel, or phone contacts). We figure out what each file is, match the columns for you,
            and import them in the right order so jobs and invoices link back to the right customers. Nothing is
            written until you confirm.
          </p>
          <div className="workspace-inline-row">
            <Link href="/dashboard/jobs" className="btn secondary">← Back to jobs</Link>
          </div>
        </div>
      </section>

      <MigrationWizard />

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">One at a time</p>
          <h2>Or import a single list</h2>
        </div>
        <p className="workspace-card-copy">Want to review the column matches in detail? Import one type at a time:</p>
        <div className="workspace-inline-row">
          <Link href="/dashboard/clients/import" className="btn secondary">Clients</Link>
          <Link href="/dashboard/services/import" className="btn secondary">Services</Link>
          <Link href="/dashboard/jobs/import" className="btn secondary">Jobs</Link>
          <Link href="/dashboard/jobs/import-invoices" className="btn secondary">Invoices</Link>
        </div>
      </section>
    </main>
  );
}
