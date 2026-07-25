import Link from 'next/link';
import { requireOwnerContext } from '@/lib/auth';
import { formatMoney } from '@/lib/jobs';
import { getPayrollSummary, PAYROLL_PERIODS, type PayrollPeriod } from '@/lib/payroll';
import PayrollExport from './PayrollExport';

function rangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(new Date(endIso).getTime() - 1); // inclusive end for display
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function PayrollPage({ searchParams }: { searchParams: { period?: string } }) {
  const { supabase, accountId } = await requireOwnerContext();

  const requested = searchParams.period as PayrollPeriod | undefined;
  const period: PayrollPeriod = PAYROLL_PERIODS.some((p) => p.id === requested) ? (requested as PayrollPeriod) : 'this-week';

  const summary = await getPayrollSummary(supabase, accountId, period);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Payroll</p>
          <h1 className="workspace-title">Crew hours &amp; pay</h1>
          <p className="workspace-lead">
            Hours your crew logs from the field (and any labor you enter on a job) roll up here by pay period — so you
            know exactly what to pay, and can export it in a tap.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading rebook-heading">
          <div className="status-tabs workspace-status-tabs">
            {PAYROLL_PERIODS.map((option) => (
              <Link key={option.id} href={`/dashboard/payroll?period=${option.id}`} className={`status-tab${period === option.id ? ' active' : ''}`}>
                {option.label}
              </Link>
            ))}
          </div>
          <PayrollExport rows={summary.rows} label={summary.label} />
        </div>
        <p className="payroll-range">{summary.label} · {rangeLabel(summary.startIso, summary.endIso)}</p>

        {summary.rows.length === 0 ? (
          <p className="empty-state">
            No labor logged in this period. When your crew logs time from the <Link href="/dashboard/crew">field app</Link> — or you add
            labor on a job — it shows up here.
          </p>
        ) : (
          <>
            <div className="payroll-table" role="table">
              <div className="payroll-row payroll-head" role="row">
                <span role="columnheader">Crew member</span>
                <span role="columnheader" className="payroll-num">Hours</span>
                <span role="columnheader" className="payroll-num">Jobs</span>
                <span role="columnheader" className="payroll-num">Pay</span>
              </div>
              {summary.rows.map((row) => (
                <div className="payroll-row" role="row" key={row.crewId ?? 'unassigned'}>
                  <span role="cell">
                    <strong>{row.name}</strong>
                    {row.roleLabel ? <span className="payroll-role">{row.roleLabel}</span> : null}
                  </span>
                  <span role="cell" className="payroll-num">{row.hours}</span>
                  <span role="cell" className="payroll-num">{row.jobCount}</span>
                  <span role="cell" className="payroll-num payroll-pay">{formatMoney(row.pay)}</span>
                </div>
              ))}
              <div className="payroll-row payroll-total" role="row">
                <span role="cell">Total</span>
                <span role="cell" className="payroll-num">{summary.totalHours}</span>
                <span role="cell" className="payroll-num" aria-hidden="true"></span>
                <span role="cell" className="payroll-num payroll-pay">{formatMoney(summary.totalPay)}</span>
              </div>
            </div>
            <p className="payroll-note">Pay is each labor entry&apos;s hours × rate at the time it was logged. Grouped by when it was logged.</p>
          </>
        )}
      </section>
    </main>
  );
}
