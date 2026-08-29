import Link from 'next/link';
import { requireOfficeContext } from '@/lib/auth';
import { listJobs } from '@/lib/jobs';
import { listCrew } from '@/lib/crew';
import { listAccountExpenses, getExpenseSummaryMetrics } from '@/lib/expense-ledger';
import ExpensesLedger from './ExpensesLedger';

export const metadata = { title: 'All Expenses Ledger · Let’s Get Quoted' };

export default async function ExpensesPage() {
  const { supabase, accountId } = await requireOfficeContext('reports.read');

  const [{ rows }, metrics, jobs, crew] = await Promise.all([
    listAccountExpenses(supabase, accountId, { limit: 150 }),
    getExpenseSummaryMetrics(supabase, accountId),
    listJobs(supabase, accountId),
    listCrew(supabase, accountId),
  ]);

  const mappedJobs = jobs.map((j) => ({
    id: j.id,
    ref: j.ref,
    clientName: j.client_name,
    status: j.status,
  }));

  const mappedCrew = crew.map((c) => ({
    id: c.id,
    name: c.name,
    role_label: c.role_label,
    hourly_rate: Number(c.hourly_rate) || 0,
  }));

  return (
    <main className="wide-shell workspace-shell">
      <header className="inbox-header" style={{ marginBottom: '1.25rem' }}>
        <div className="inbox-header-copy">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.35rem' }}>💳</span>
            <h1 className="workspace-title" style={{ margin: 0 }}>All Expenses Ledger</h1>
          </div>
          <p className="workspace-lead" style={{ marginTop: '0.35rem' }}>
            Cross-job cost accounting, supplier purchase receipts, loaded crew labor &amp; subcontractor disbursements.
          </p>
        </div>
        <div className="inbox-header-tools" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link className="btn secondary" href="/dashboard/cash-flow">
            📈 Cash Flow Forecast
          </Link>
          <Link className="btn secondary" href="/dashboard/reports">
            📑 Tax &amp; P&amp;L Reports
          </Link>
        </div>
      </header>

      <ExpensesLedger
        initialRows={rows}
        initialMetrics={metrics}
        jobs={mappedJobs}
        crew={mappedCrew}
      />
    </main>
  );
}
